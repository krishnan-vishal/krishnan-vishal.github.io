import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { countryFlagMarkup, resolveEventGeography } from '../../assets/js/gpir-geography.mjs';
import { normalizeSmartRecords } from '../../assets/js/smart-intelligence.mjs';
import { buildTimelineEvents, matchesGeography } from '../../assets/js/smart-presentation.mjs';
import { timelineMarkup } from '../../assets/js/smart-executive.mjs';
import { createPublicIntelligenceHandler, normalizeRepositoryRows }
  from '../../supabase/functions/gpir-public-intelligence/handler.mjs';

const countries = JSON.parse(await readFile(new URL('../../assets/data/country-intelligence.json', import.meta.url))).records;
const source = { source_id: 'publisher', source_name: 'Publisher', official_url: 'https://example.com/',
  source_status: 'GREEN', country: 'Singapore', region_tags: ['APAC'] };
const announcement = { id: 'announcement', source_id: source.source_id, publication_status: 'approved',
  title: 'A source-backed payments development', summary_narration: 'The source reports a payments development with sufficient context for a governed intelligence record.',
  canonical_url: 'https://example.com/report', published_at: '2024-05-04T10:00:00Z', ticker_eligible: false };
const audit = { announcement_id: announcement.id, candidate_id: 'candidate', decision: 'PUBLISHED' };
const candidate = { id: 'candidate', source_id: source.source_id, canonical_url: announcement.canonical_url };
const normalize = (event, auditRows = [audit]) => normalizeRepositoryRows({
  announcements: [announcement], sources: [source], publicationAudits: auditRows,
  candidates: [{ ...candidate, ...event }], now: Date.parse('2026-11-10T00:00:00Z'), windowDays: null
})[0];

test('only publication-linked event geography is used, never publisher headquarters', () => {
  const missing = normalize({}, []);
  assert.deepEqual(missing.eventGeography, { countryCode: null, region: null });
  assert.equal(missing.country, null);
  assert.equal(missing.region, null);
  assert.equal(normalize({ country_code: 'IN', source_id: 'different' }).countryCode, null);
  assert.equal(normalize({ country_code: 'IN', canonical_url: 'https://example.com/other' }).countryCode, null);
});

test('India and Singapore resolve using the authoritative registry and accessible local flags', () => {
  for (const [code, name] of [['IN', 'India'], ['SG', 'Singapore']]) {
    const raw = normalize({ country_code: code });
    const [record] = normalizeSmartRecords({ status: 'OK', records: [raw] }, countries);
    assert.equal(record.country, name);
    assert.equal(record.region, 'APAC');
    assert.equal(matchesGeography(record, 'apac'), true);
    assert.match(record.countryFlagUrl, new RegExp(`/flags/${code.toLowerCase()}\\.svg$`));
    const markup = timelineMarkup(buildTimelineEvents([record]));
    assert.ok(markup.includes(name));
    assert.match(markup, /<img[^>]+alt=""/);
    assert.match(markup, new RegExp(`/flags/${code.toLowerCase()}\\.svg`));
  }
});

test('explicit global and unknown geography remain distinct without invented countries', () => {
  const global = resolveEventGeography(normalize({ region: 'Global' }).eventGeography, countries);
  assert.deepEqual(global, { country: '', countryCode: '', region: 'Global', flagUrl: '' });
  const unknown = resolveEventGeography(normalize({ country_code: 'ZZ' }).eventGeography, countries);
  assert.deepEqual(unknown, { country: '', countryCode: '', region: '', flagUrl: '' });
  assert.equal(countryFlagMarkup(unknown.flagUrl), '');
  assert.throws(() => countryFlagMarkup('https://untrusted.example/assets/icons/flags/in.svg'), /INVALID_COUNTRY_FLAG_URL/);
});

test('public API loads only published-audit-linked approved event geography', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const candidateId = '22222222-2222-4222-8222-222222222222';
  const authority = [{ row: { candidate_id: candidateId, record_id: 'publication-record',
    publication_id: 'governed-publication', entry_reference: 'space/master/approved-entry' },
    entry: { entryId: 'approved-entry', fields: { legacySourceUrl: candidate.canonical_url } } }];
  const seen = [];
  const rows = {
    global_announcements: [{ ...announcement, id }],
    source_registry: [source],
    gpir_intelligence_topics: [],
    gpir_intelligence_developments: [],
    gpir_intelligence_topic_sources: [],
    intelligence_publication_audits: [{ ...audit, candidate_id: candidateId, announcement_id: id,
      validation_payload: { editorial_verified: true, editorial_entry_reference: authority[0].row.entry_reference,
        editorial_entry_id: 'approved-entry', editorial_publication_id: 'governed-publication',
        editorial_supabase_record_id: 'publication-record', editorial_source_url: candidate.canonical_url } }],
    intelligence_candidates: [{ ...candidate, id: candidateId, published_at: announcement.published_at, country_code: 'IN' }]
  };
  const handler = createPublicIntelligenceHandler({
    env: { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' },
    now: () => Date.parse('2026-11-10T00:00:00Z'),
    loadAuthority: async () => authority,
    fetchImpl: async url => {
      const request = new URL(url);
      seen.push(request);
      const table = request.pathname.split('/').pop();
      assert.ok(Object.hasOwn(rows, table), table);
      return new Response(JSON.stringify(rows[table]), { status: 200 });
    }
  });
  const response = await handler(new Request('https://example.test/?scope=history'));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.records[0].eventGeography.countryCode, 'IN');
  assert.equal(seen.find(url => url.pathname.endsWith('/intelligence_candidates')).searchParams.get('candidate_status'), 'in.(APPROVED,DUPLICATE)');
  assert.equal(seen.find(url => url.pathname.endsWith('/intelligence_publication_audits')).searchParams.get('decision'), 'eq.PUBLISHED');
});
