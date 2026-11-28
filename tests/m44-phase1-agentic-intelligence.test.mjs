import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadLiveRelayRows } from '../supabase/functions/gpir-public-intelligence/handler.mjs';
import { buildFxSnapshot, clearFxSnapshotCache, createFxSnapshotHandler }
  from '../supabase/functions/gpir-fx-snapshot/handler.mjs';

const NOW = Date.parse('2026-11-28T00:00:00.000Z');
const CONFIG = { url: 'https://qlnvhfapctcpzqyuhhth.supabase.co', key: 'service-fixture' };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'content-type': 'application/json' } });

test('live relay reads only ticker-eligible rows in the preceding 12 hours and stops on an empty set', async () => {
  const calls = [];
  const rows = await loadLiveRelayRows({ config: CONFIG, now: NOW, fetchImpl: async input => {
    calls.push(new URL(String(input)));
    return json([]);
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/rest/v1/global_announcements');
  assert.equal(calls[0].searchParams.get('ticker_eligible'), 'eq.true');
  assert.deepEqual(calls[0].searchParams.getAll('published_at'), [
    'gte.2026-11-27T12:00:00.000Z', 'lte.2026-11-28T00:00:00.000Z'
  ]);
  assert.deepEqual(rows.announcements, []);
});

test('live relay scopes evidence reads to the selected announcements and topics', async () => {
  const calls = [];
  const fixtures = {
    global_announcements: [{ id: 'announcement-1', source_id: 'SOURCE-1', title: 'Payments update',
      summary_narration: 'A validated payments development with complete source evidence.',
      canonical_url: 'https://authority.example/update', published_at: '2026-11-27T20:00:00.000Z',
      ticker_eligible: true, topic_headers: ['Payments'], publication_status: 'approved' }],
    source_registry: [{ source_id: 'SOURCE-1', source_name: 'Authority', official_url: 'https://authority.example',
      source_status: 'GREEN', trust_tier: 'T1' }],
    gpir_intelligence_topics: [{ id: 'topic-1', announcement_id: 'announcement-1', keywords: [],
      outcome_status: 'CURRENT', geography: 'Global' }],
    gpir_intelligence_developments: [],
    gpir_intelligence_topic_sources: []
  };
  const rows = await loadLiveRelayRows({ config: CONFIG, now: NOW, fetchImpl: async input => {
    const url = new URL(String(input));
    calls.push(url);
    return json(fixtures[url.pathname.split('/').at(-1)] || []);
  } });
  assert.equal(calls.length, 5);
  assert.equal(calls.find(call => call.pathname.endsWith('/source_registry'))
    .searchParams.get('source_id'), 'in.(SOURCE-1)');
  assert.equal(calls.find(call => call.pathname.endsWith('/gpir_intelligence_topics'))
    .searchParams.get('announcement_id'), 'in.(announcement-1)');
  assert.ok(calls.filter(call => call.searchParams.get('topic_id') === 'in.(topic-1)').length === 2);
  assert.equal(rows.announcements.length, 1);
});

function fxRows() {
  return Array.from({ length: 6 }, (_, index) => ({
    base_currency: 'USD', target_currency: 'INR',
    observation_date: `2026-11-${String(20 + index).padStart(2, '0')}`,
    rate: 90 + index, region: 'SOUTH ASIA / APAC', source: 'reference-open-er-api',
    rate_method: index % 2 ? 'derived-cross' : 'provider-native',
    captured_at: `2026-11-${String(20 + index).padStart(2, '0')}T04:00:00.000Z`
  }));
}

test('public FX snapshot exposes validated latest and previous rates without protected analytics', () => {
  const snapshot = buildFxSnapshot(fxRows(), '2026-11-28T00:00:00.000Z');
  assert.equal(snapshot.status, 'OK');
  assert.equal(snapshot.pairs[0].pair, 'USD/INR');
  assert.equal(snapshot.pairs[0].mid, 95);
  assert.equal(snapshot.pairs[0].previousBusinessClose, 94);
  assert.equal(snapshot.pairs[0].previousBusinessDate, '2026-11-24');
  assert.equal(snapshot.pairs[0].validationStatus, 'VALIDATED');
  assert.equal(Object.hasOwn(snapshot.pairs[0], 'trend'), false);
  assert.equal(Object.hasOwn(snapshot, 'historicalObservationCount'), false);
});

test('FX snapshot handler reuses the ten-minute cache and marks its deterministic operating mode', async () => {
  clearFxSnapshotCache();
  let reads = 0;
  const handler = createFxSnapshotHandler({ env: {}, now: () => NOW,
    loadRows: async () => { reads += 1; return fxRows(); } });
  const request = () => new Request('https://example.test/functions/v1/gpir-fx-snapshot',
    { headers: { origin: 'https://fintechoisis.com' } });
  const first = await handler(request());
  const second = await handler(request());
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(reads, 1);
  assert.equal((await first.json()).cacheStatus, 'MISS');
  assert.equal((await second.json()).cacheStatus, 'HIT');
  assert.equal(second.headers.get('x-gpir-operational-mode'), 'deterministic-no-llm');
  assert.match(second.headers.get('cache-control'), /max-age=600/);
  const preflight = await handler(new Request('https://example.test/functions/v1/gpir-fx-snapshot', {
    method: 'OPTIONS', headers: { origin: 'https://fintechoisis.com' }
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
});

test('LangGraph OSS is pinned, self-hosted in the existing Edge path and has no model dependency', () => {
  const graph = readFileSync(new URL('../supabase/functions/_shared/gpir-operational-graph.ts', import.meta.url), 'utf8');
  const publisher = readFileSync(new URL('../supabase/functions/gpir-intelligence-publish/index.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20261128120000_m44_fx_snapshot_projection.sql', import.meta.url), 'utf8');
  const schedule = readFileSync(new URL('../supabase/migrations/20261031134116_g1_automated_intelligence_publication.sql', import.meta.url), 'utf8');
  assert.match(graph, /npm:\@langchain\/langgraph@1\.7\.5/);
  for (const node of ['observe', 'curator', 'validateAndPublish', 'interpret', 'indexAndEvidence'])
    assert.match(graph, new RegExp(`addNode\\("${node}"`));
  assert.doesNotMatch(graph, /openai|anthropic|gemini|model\.invoke|Chat[A-Z]/i);
  assert.match(publisher, /createOperationalPublicationHandler\(publicationHandler\)/);
  assert.match(schedule, /'\*\/10 \* \* \* \*'/);
  assert.doesNotMatch(migration, /cron\.schedule|create table/i);
  assert.match(migration, /grant execute[^;]+service_role/i);
});

test('existing Smart Cards are enriched without markup or design replacement', () => {
  const ticker = readFileSync(new URL('../assets/js/fx-ticker.js', import.meta.url), 'utf8');
  const fxCard = readFileSync(new URL('../assets/js/fx-intelligence.mjs', import.meta.url), 'utf8');
  const smart = readFileSync(new URL('../assets/js/smart-intelligence.mjs', import.meta.url), 'utf8');
  assert.match(ticker, /mergeLiveFxSnapshot/);
  assert.match(ticker, /gpir-fx-snapshot/);
  assert.match(ticker, /const liveRequest = liveUrl[\s\S]+fxSnapshotCache = await response\.json\(\);[\s\S]+renderTicker\(\);[\s\S]+await liveRequest/);
  assert.match(fxCard, /Promise\.all\(\[\s*loadHistory\(globalThis, pair\),\s*loadPublishedFxEditorial\(\)/);
  assert.match(fxCard, /function sampleVolatility\(returns\)/);
  assert.match(smart, /const livePromise = fetchImpl/);
  assert.match(smart, /void livePromise\.then/);
});
