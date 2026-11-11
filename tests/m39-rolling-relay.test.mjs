import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fetchTopicIntelligence, findAlert, normalizeLiveAlerts, normalizeSmartRecords, SMART_TOPICS }
  from '../assets/js/smart-intelligence.mjs';
import { buildTopicContext, classifyDevelopment, groupRelayItems, TOPIC_TAXONOMY }
  from '../assets/js/gpir-topic-intelligence.mjs';
import { isActiveSubscription, paymentEnvironment, resolveSubscriberAccess }
  from '../supabase/functions/_shared/gpir-reader-entitlement.mjs';
import { createPublicIntelligenceHandler, normalizeRepositoryRows }
  from '../supabase/functions/gpir-public-intelligence/handler.mjs';
import { createPublicationHandler, createRestPublicationRepository, processCandidate }
  from '../supabase/functions/gpir-intelligence-publish/handler.mjs';

const NOW = Date.parse('2026-11-09T12:00:00.000Z');
const HOUR = 3600000;
const PRODUCTION_URL = 'https://qlnvhfapctcpzqyuhhth.supabase.co';
const USER_ID = '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const T3 = Object.freeze({ source_id: 'PYMNTS-GLOBAL-004', source_name: 'PYMNTS', official_url: 'https://www.pymnts.com',
  trust_tier: 'T3', source_status: 'GREEN', country: 'Global', region_tags: ['Global'], category: 'Payments News' });
const T1 = Object.freeze({ source_id: 'MAS-SG-001', source_name: 'Monetary Authority of Singapore', official_url: 'https://www.mas.gov.sg',
  trust_tier: 'T1', source_status: 'GREEN', country: 'Singapore', region_tags: ['APAC'], category: 'Central Bank' });

const SUMMARY = 'The network announced instant settlement for cross-border corridors, with banks, wallets and merchants completing certification and fraud controls first.';

function announcement(id, title, hoursAgo, overrides = {}) {
  return { id, source_id: T3.source_id, title, summary_narration: SUMMARY,
    canonical_url: `https://www.pymnts.com/news/payments/2026/${id}/`,
    published_at: new Date(NOW - hoursAgo * HOUR).toISOString(), ticker_eligible: hoursAgo <= 12,
    topic_headers: ['Cross-Border Payments'], publication_status: 'approved', ...overrides };
}

const ANNOUNCEMENTS = [
  announcement('a-first', 'Instant payments network expands cross-border settlement corridors', 5),
  announcement('a-second', 'Instant payments network expands cross-border settlement corridors for banks', 2,
    { source_id: T1.source_id, canonical_url: 'https://www.mas.gov.sg/news/instant-payments-network-expands' }),
  announcement('a-other', 'Regulator fines wallet provider over anti-money laundering failures', 1, { topic_headers: ['AML'] }),
  announcement('a-expired', 'Stablecoin issuer receives licence for digital asset payments', 14),
  announcement('a-archive', 'Earlier cross-border payment pilot concluded in Asia', 24 * 40)
];

function repositoryRows(announcements = ANNOUNCEMENTS) {
  const candidates = announcements.map(item => ({ id: `candidate-${item.id}`, source_id: item.source_id,
    canonical_url: item.canonical_url, published_at: item.published_at }));
  const publicationAudits = announcements.map((item, index) => {
    const candidateId = candidates[index].id;
    return { candidate_id: candidateId, announcement_id: item.id, decision: 'PUBLISHED',
      validation_payload: { editorial_verified: true, editorial_entry_reference: `space/master/${item.id}`,
        editorial_entry_id: item.id, editorial_publication_id: `publication-${item.id}`,
        editorial_supabase_record_id: `record-${item.id}`, editorial_source_url: item.canonical_url } };
  });
  return { announcements, sources: [T3, T1], candidates, publicationAudits, topics: [], developments: [],
    topicSources: [], statisticalObservations: [] };
}

function publicHandler(extra = {}) {
  let loaded = 0;
  const authority = ANNOUNCEMENTS.map(item => ({
    row: { candidate_id: `candidate-${item.id}`, record_id: `record-${item.id}`,
      publication_id: `publication-${item.id}`, entry_reference: `space/master/${item.id}` },
    entry: { entryId: item.id, fields: { legacySourceUrl: item.canonical_url } }
  }));
  const handler = createPublicIntelligenceHandler({
    env: { SUPABASE_URL: PRODUCTION_URL, SUPABASE_SERVICE_ROLE_KEY: 'service' },
    loadRows: async () => { loaded += 1; return repositoryRows(); },
    loadAuthority: async () => authority, now: () => NOW, ...extra });
  return { handler, loads: () => loaded };
}

const get = (handler, query, headers = {}) =>
  handler(new Request(`https://x.test/?${query}`, { method: 'GET', headers: { origin: 'https://fintechoisis.com', ...headers } }));

test('overlapping articles collapse into one topic-level item that keeps the original timestamp and every source', () => {
  const records = normalizeRepositoryRows({ now: NOW, ...repositoryRows() });
  const items = groupRelayItems(records.map(record => ({ ...record, topic: classifyDevelopment(record) })));
  const merged = items.find(item => item.memberIds.includes('a-first'));
  assert.deepEqual([...merged.memberIds].sort(), ['a-first', 'a-second']);
  assert.equal(merged.publishedAt, ANNOUNCEMENTS[0].published_at, 'earliest report is the original');
  assert.equal(merged.corroboratingReports, 1);
  assert.deepEqual(merged.supportingSources.map(source => source.name).sort(), ['Monetary Authority of Singapore', 'PYMNTS']);
  assert.ok(merged.supportingSources.every(source => source.url.startsWith('https://')));
  assert.equal(items.length, records.length - 1, 'only the overlapping pair merged');
  assert.ok(items.some(item => item.id === 'a-other' && item.memberIds.length === 1));
});

test('distinct developments, countries, corridors and themes are never merged', () => {
  const base = { id: 'x', title: 'Instant payments network expands cross-border settlement corridors', summary: SUMMARY,
    category: 'Cross-Border Payments', publishedAt: new Date(NOW - HOUR).toISOString(), country: 'Singapore', keywords: [] };
  const grouped = items => groupRelayItems(items).length;
  assert.equal(grouped([base, { ...base, id: 'y', country: 'India' }]), 2, 'different countries');
  assert.equal(grouped([base, { ...base, id: 'y', publishedAt: new Date(NOW - 5 * 24 * HOUR).toISOString() }]), 2, 'similar headlines days apart are separate developments');
  assert.equal(grouped([{ ...base, title: 'Singapore – India corridor expands cross-border settlement instant payments network' },
    { ...base, id: 'y', title: 'Singapore – Malaysia corridor expands cross-border settlement instant payments network' }]), 2, 'different corridors');
  assert.equal(grouped([base, { ...base, id: 'y', title: 'Regulator fines wallet provider over anti-money laundering failures',
    summary: 'The regulator imposed a penalty for compliance failures.' }]), 2, 'different developments');
  assert.equal(grouped([base, { ...base, id: 'y', eventId: 'e1' }, { ...base, id: 'z', eventId: 'e1', title: 'Completely reworded headline about settlement' }]), 1, 'server-verified event identity groups differently worded reports');
});

test('developments are categorised by topic, keywords, country, corridor and payment theme', () => {
  const descriptor = classifyDevelopment({ title: 'Singapore to India remittance corridor adds instant settlement', summary: SUMMARY,
    category: 'Remittances', country: 'Singapore', region: 'APAC', keywords: ['payment', 'remittance', 'payment'] });
  assert.ok(descriptor.topicIds.includes('remittances'));
  assert.equal(descriptor.country, 'Singapore');
  assert.equal(descriptor.corridor, 'Singapore → India');
  assert.deepEqual(descriptor.keywords, ['payment', 'remittance']);
  assert.ok(descriptor.theme && descriptor.primaryTopicId);
  assert.equal(classifyDevelopment({ title: 'Network update', summary: 'General notice.', category: 'Payments', country: 'Global' }).country, null);
  assert.equal(classifyDevelopment({ dataClass: 'TECHNICAL_REFERENCE', title: 'x', summary: 'not a regulatory event' }).topicIds[0], 'infrastructure');
});

test('browser and Edge copies of the topic module are identical and the Smart taxonomy is the shared taxonomy', () => {
  const browser = readFileSync(new URL('../assets/js/gpir-topic-intelligence.mjs', import.meta.url), 'utf8');
  const edge = readFileSync(new URL('../supabase/functions/_shared/gpir-topic-intelligence.mjs', import.meta.url), 'utf8');
  assert.equal(edge, browser);
  assert.equal(SMART_TOPICS, TOPIC_TAXONOMY);
  assert.ok(SMART_TOPICS.length >= 35 && SMART_TOPICS.some(topic => topic.id === 'cross-border'));
});

test('the public relay lists only live items, groups them and keeps expired and archived items out', async () => {
  const { handler } = publicHandler();
  const response = await get(handler, 'view=relay');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /public/);
  const body = await response.json();
  assert.equal(body.windowHours, 12);
  assert.deepEqual(body.items.map(item => item.id).sort(), ['a-first', 'a-other']);
  assert.equal(body.items.find(item => item.id === 'a-first').supportingSources.length, 2);
  assert.ok(body.items.every(item => Date.parse(item.publishedAt) > NOW - 12 * HOUR));
});

test('live eligibility expires at 12 hours while the item stays in the permanent repository', async () => {
  const live = id => normalizeRepositoryRows({ now: NOW, ...repositoryRows() }).find(record => record.id === id);
  assert.equal(live('a-first').displayLifecycleStatus, 'LIVE');
  assert.equal(live('a-expired').displayLifecycleStatus, 'ARCHIVED');
  assert.equal(live('a-expired').tickerEligible, false);
  const justInside = normalizeRepositoryRows({ now: NOW, ...repositoryRows([announcement('edge', 'Edge boundary instant payment announcement', 11.99)]) });
  const justOutside = normalizeRepositoryRows({ now: NOW, ...repositoryRows([announcement('edge', 'Edge boundary instant payment announcement', 12.01)]) });
  assert.equal(justInside[0].displayLifecycleStatus, 'LIVE');
  assert.equal(justOutside[0].displayLifecycleStatus, 'ARCHIVED');
  // The expired and older records remain discoverable through the repository history, with original timestamps.
  const { handler } = publicHandler();
  const history = await (await get(handler, 'scope=history&limit=100')).json();
  const ids = history.records.map(record => record.id);
  for (const id of ['a-first', 'a-expired', 'a-archive']) assert.ok(ids.includes(id), id);
  assert.equal(history.records.find(record => record.id === 'a-archive').publishedAt, ANNOUNCEMENTS[4].published_at);
  assert.equal(history.records.find(record => record.id === 'a-expired').tickerEligible, false);
  // Later in time the live item expires from the relay but is still in history.
  const later = publicHandler({ now: () => NOW + 8 * HOUR });
  const relay = await (await get(later.handler, 'view=relay')).json();
  assert.deepEqual(relay.items.map(item => item.id), ['a-other'],
    'the topic expires 12 hours after its original report; later corroboration does not extend it');
  const archived = await (await get(later.handler, 'scope=history&limit=100')).json();
  assert.ok(archived.records.some(record => record.id === 'a-first'));
});

test('the 12-hour backfill preserves source timestamps and awaits CMS approval', async () => {
  const body = 'The payments network announced that instant settlement will extend to additional cross-border corridors for banks, wallets and merchants across several markets. ' +
    'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the expanded real-time payment rail. ' +
    'Executives explained that the rollout will be phased and that card, wallet and bank transfer flows will share common reconciliation and reporting standards. ' +
    'The company also described governance arrangements for remittance partners, regulators and fintech participants supporting the new payment infrastructure. ' +
    'A published timetable sets out onboarding windows for acquiring banks and merchant processors, with settlement reporting required from every participant. ' +
    'Regulators in each market will receive monthly reports covering transaction volumes, dispute handling and operational incidents during the phased expansion programme. ' +
    'The operator added that independent auditors will review the controls before each corridor is enabled for general availability to regulated payment institutions.';
  const make = (index, hoursAgo, confidence = 97) => ({ id: `00000000-0000-4000-8000-00000000000${index}`, source_id: T3.source_id,
    canonical_url: `https://www.pymnts.com/news/payments/2026/article-${index}/`, title: `Cross-border settlement corridor article ${index}`,
    published_at: new Date(NOW - hoursAgo * HOUR).toISOString(), category: 'Payments', confidence_score: confidence,
    candidate_status: 'REVIEW', content_fingerprint: String(index).repeat(64).slice(0, 64) });
  const candidates = [make(1, 11.5), make(2, 8), make(3, 3), make(4, 6, 40), make(5, 14)];
  const published = [];
  const records = [];
  const repository = { async start() {}, async source() { return T3; }, async duplicate() { return false; },
    async record(item, validation) { records.push({ id: item.id, validation }); },
    async publish(item, validation) { published.push({ id: item.id, validation }); return `announcement-${item.id}`; } };
  const fetchFor = item => async () => ({ ok: true, status: 200, url: item.canonical_url,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => `<html><head><link rel="canonical" href="${item.canonical_url}"><meta property="article:published_time" content="${item.published_at}"></head><body><article><p>${body}</p></article></body></html>` });
  for (const item of candidates) await processCandidate({ candidate: item, repository, fetchImpl: fetchFor(item), now: () => NOW });
  assert.deepEqual(published, []);
  for (const entry of records.filter(entry => entry.id !== candidates[3].id)) {
    const source = candidates.find(item => item.id === entry.id);
    assert.equal(entry.validation.sourcePublishedAt, source.published_at, 'original publication time is preserved');
    assert.equal(entry.validation.reasonCode, 'CONTENTFUL_APPROVAL_REQUIRED');
  }
  const low = records.find(entry => entry.id === candidates[3].id).validation;
  assert.equal(low.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET');
  assert.equal(low.evidenceVerification.status, 'SUCCEEDED');
  assert.equal(low.validationPayload.confidence_score, 40, 'a fetched article never raises its confidence');
  // An existing older approved article remains outside the live window.
  assert.equal(records.find(entry => entry.id === candidates[4].id).validation.sourcePublishedAt, candidates[4].published_at);
  assert.equal(normalizeRepositoryRows({ now: NOW, sources: [T3], announcements: [announcement('old-one', 'Cross-border settlement corridor article 5', 14)] })[0].tickerEligible, false);
});

test('the scheduled publisher continues through the existing handler: bounded batch, budget and no duplicate publication', async () => {
  const candidate = { id: '00000000-0000-4000-8000-000000000001', source_id: T3.source_id, canonical_url: 'https://www.pymnts.com/news/a/',
    title: 'Cross-border settlement corridor article', published_at: new Date(NOW - HOUR).toISOString(), confidence_score: 40 };
  const recorded = [];
  const handler = createPublicationHandler({ env: { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' },
    now: () => NOW, logger: { error() {} }, fetchImpl: async () => { throw new Error('offline'); },
    repository: { async candidates({ limit }) { assert.equal(limit, 5); return [candidate, candidate]; }, async start() {},
      async source() { return T3; }, async duplicate() { return true; },
      async record(_item, validation) { recorded.push(validation.reasonCode); },
      async publish() { throw new Error('must not publish'); } } });
  const body = await (await handler(new Request('https://x.test', { method: 'POST', body: JSON.stringify({ batchSize: 5 }) }))).json();
  assert.equal(body.published, 0);
  assert.equal(body.status, 'OK');
  assert.ok(recorded.every(reason => reason === 'SOURCE_FETCH_FAILED'));
});

test('the cron request keeps the existing 10-minute schedule and batch size', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261031134116_g1_automated_intelligence_publication.sql', import.meta.url), 'utf8');
  assert.match(migration, /'\*\/10 \* \* \* \*'/);
  assert.match(migration, /jsonb_build_object\('batchSize', 5\)/);
});

test('subscriber entitlement is decided on the server from the existing subscription record and fails closed', async () => {
  assert.equal(paymentEnvironment(PRODUCTION_URL), 'PRODUCTION');
  assert.equal(paymentEnvironment('https://abcdefghijklmnopqrst.supabase.co'), null);
  const active = { status: 'ACTIVE', effective_from: new Date(NOW - 24 * HOUR).toISOString(), effective_until: new Date(NOW + 24 * HOUR).toISOString() };
  assert.equal(isActiveSubscription(active, NOW), true);
  assert.equal(isActiveSubscription({ ...active, effective_until: null }, NOW), true);
  for (const row of [undefined, { ...active, status: 'SUSPENDED' }, { ...active, status: 'CANCELLED' }, { ...active, status: 'PAYMENT_FAILED' },
    { ...active, status: 'APPROVAL_PENDING' }, { ...active, effective_until: new Date(NOW - HOUR).toISOString() },
    { ...active, effective_from: new Date(NOW + HOUR).toISOString() }, { ...active, effective_until: 'garbage' }])
    assert.equal(isActiveSubscription(row, NOW), false, JSON.stringify(row));
  const run = (subscriptions, userStatus = 200) => resolveSubscriberAccess({ supabaseUrl: PRODUCTION_URL, serviceKey: 'svc', accessToken: 'jwt', now: NOW,
    fetchImpl: async url => {
      if (String(url).includes('/auth/v1/user')) return { ok: userStatus === 200, status: userStatus, json: async () => ({ id: USER_ID }) };
      assert.match(String(url), /gpir_paypal_subscriptions\?.*user_id=eq\.0b1f2c3d.*environment=eq\.PRODUCTION/);
      return subscriptions instanceof Error ? (() => { throw subscriptions; })() : { ok: Array.isArray(subscriptions), status: 200, json: async () => subscriptions };
    } });
  assert.equal((await run([active])).decision, 'ALLOW');
  assert.equal((await run([])).decision, 'DENY');
  assert.equal((await run([{ ...active, status: 'EXPIRED' }])).decision, 'DENY');
  assert.equal((await run([active], 401)).decision, 'UNAUTHENTICATED');
  assert.equal((await run([active], 500)).decision, 'ERROR');
  assert.equal((await run(new Error('down'))).decision, 'ERROR');
  assert.equal((await resolveSubscriberAccess({ supabaseUrl: PRODUCTION_URL, serviceKey: 'svc', accessToken: null, now: NOW, fetchImpl: async () => { throw new Error('no call'); } })).decision, 'UNAUTHENTICATED');
  assert.equal((await resolveSubscriberAccess({ supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co', serviceKey: 'svc', accessToken: 'jwt', fetchImpl: async () => { throw new Error('no call'); } })).decision, 'ERROR');
});

test('topic intelligence is subscriber-only: anonymous and unentitled requests receive no topic data', async () => {
  for (const [decision, status] of [['UNAUTHENTICATED', 401], ['DENY', 403], ['ERROR', 503]]) {
    const { handler, loads } = publicHandler({ entitlement: async () => ({ decision, reason: 'X' }) });
    const response = await get(handler, 'topicContext=a-first', { authorization: 'Bearer token' });
    assert.equal(response.status, status, decision);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const text = await response.text();
    assert.equal(loads(), 0, 'no repository data is read before entitlement is granted');
    assert.doesNotMatch(text, /supportingSources|a-first|Instant payments/);
  }
  // Without an injected entitlement the real check runs and an absent session is refused.
  const real = createPublicIntelligenceHandler({ env: { SUPABASE_URL: PRODUCTION_URL, SUPABASE_SERVICE_ROLE_KEY: 'svc' },
    loadRows: async () => { throw new Error('must not load'); }, now: () => NOW,
    fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal((await get(real, 'topicContext=a-first')).status, 401);
  assert.equal((await get(real, 'topicContext=bad id!', {})).status, 400);
  // A request body or query claim can never grant access.
  const claimed = await get(real, 'topicContext=a-first&entitled=true&plan=ACTIVE', { 'x-gpir-entitled': 'true' });
  assert.equal(claimed.status, 401);
});

test('an entitled subscriber receives topic intelligence privately, including after the alert has expired from the live relay', async () => {
  const subscriber = { entitlement: async ({ accessToken }) => accessToken === 'good' ? { decision: 'ALLOW', userId: USER_ID } : { decision: 'UNAUTHENTICATED' } };
  for (const clock of [NOW, NOW + 30 * HOUR]) {
    const { handler, loads } = publicHandler({ ...subscriber, now: () => clock });
    const response = await get(handler, 'topicContext=a-first', { authorization: 'Bearer good' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    const { context } = await response.json();
    assert.equal(loads(), 1);
    assert.equal(context.alert.publishedAt, ANNOUNCEMENTS[0].published_at);
    assert.equal(context.supportingSources.length, 2);
    assert.ok(context.topic.topicIds.includes('cross-border'));
    assert.ok(context.topic.theme);
    const related = [...context.current, ...context.historical].map(item => item.id);
    assert.ok(related.includes('a-archive'), 'historical repository context is included');
    assert.ok(!related.includes('a-first') && !related.includes('a-second'), 'the alert is not its own context');
  }
  const { handler } = publicHandler(subscriber);
  assert.equal((await get(handler, 'topicContext=missing', { authorization: 'Bearer good' })).status, 404);
  assert.equal((await get(handler, 'topicContext=a-first', { authorization: 'Bearer stale' })).status, 401);
});

test('the free Global Alerts relay and public repository are unchanged and require no entitlement', async () => {
  const { handler } = publicHandler({ entitlement: async () => { throw new Error('entitlement must not be consulted'); } });
  assert.equal((await get(handler, 'lifecycle=LIVE')).status, 200);
  assert.equal((await get(handler, 'scope=history&limit=100')).status, 200);
  assert.equal((await get(handler, 'view=relay')).status, 200);
});

test('browser: topic intelligence is requested with the reader session and denial shows no topic data', async () => {
  const calls = [];
  const respond = status => async (url, init) => { calls.push({ url: String(url), headers: init.headers });
    return { ok: status === 200, status, json: async () => ({ status: 'OK', context: { topic: {}, current: [], historical: [] } }) }; };
  assert.equal((await fetchTopicIntelligence(respond(200), PRODUCTION_URL, 'jwt', 'a-first')).status, 'OK');
  assert.equal(calls[0].url, `${PRODUCTION_URL}/functions/v1/gpir-public-intelligence?topicContext=a-first`);
  assert.equal(calls[0].headers.authorization, 'Bearer jwt');
  assert.equal((await fetchTopicIntelligence(respond(403), PRODUCTION_URL, 'jwt', 'a-first')).status, 'DENIED');
  assert.equal((await fetchTopicIntelligence(respond(401), PRODUCTION_URL, 'jwt', 'a-first')).status, 'SESSION_EXPIRED',
    'an expired session is not presented as a missing subscription');
  assert.equal((await fetchTopicIntelligence(respond(404), PRODUCTION_URL, 'jwt', 'a-first')).status, 'NOT_FOUND');
  assert.equal((await fetchTopicIntelligence(respond(503), PRODUCTION_URL, 'jwt', 'a-first')).status, 'UNAVAILABLE');
  assert.equal((await fetchTopicIntelligence(async () => { throw new Error('x'); }, PRODUCTION_URL, 'jwt', 'a')).status, 'UNAVAILABLE');
  const denied = await fetchTopicIntelligence(respond(403), PRODUCTION_URL, 'jwt', 'a-first');
  assert.equal(denied.context, undefined);
});

test('browser: the Smart ribbon shows topic-level relay items and a collapsed report opens its topic', () => {
  const alert = (id, title, hoursAgo, name, url) => ({ id, headline: title, summary: SUMMARY, publishedAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
    category: 'Cross-Border Payments', country: 'Singapore', sourceName: name, sourceUrl: url, publicationStatus: 'approved', tickerEligible: true, sourceVerified: true });
  const live = normalizeLiveAlerts({ alerts: [
    alert('r2', 'Instant payments network expands cross-border settlement corridors for banks', 1, 'Trade Press', 'https://trade.example/a'),
    alert('r1', 'Instant payments network expands cross-border settlement corridors', 4, 'Authority', 'https://authority.example/a'),
    alert('r3', 'Regulator fines wallet provider over anti-money laundering failures', 2, 'Authority', 'https://authority.example/b')] }, []);
  assert.equal(live.length, 2);
  const topic = live.find(item => item.id === 'r1');
  assert.deepEqual([...topic.memberIds].sort(), ['r1', 'r2']);
  assert.equal(topic.supportingSources.length, 2);
  assert.equal(findAlert('r2', live, []).id, 'r1', 'a collapsed report resolves to its topic item');
  const records = normalizeSmartRecords({ status: 'OK', records: [] });
  assert.equal(findAlert('unknown', live, records), null);
  const context = buildTopicContext(topic, live, Date.now());
  assert.ok(context && context.supportingSources.length === 2);
});

test('the working FX Intelligence experience is untouched and carries no new paid gating', () => {
  const reader = readFileSync(new URL('../supabase/functions/gpir-reader-summary/handler.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(reader, /gpir-reader-entitlement|topicContext|SUBSCRIPTION_REQUIRED/);
  const dashboard = readFileSync(new URL('../assets/js/gpir-reader-dashboard.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(dashboard, /topicContext|fetchTopicIntelligence/);
  const page = readFileSync(new URL('../pages/intelligence/smart.html', import.meta.url), 'utf8');
  assert.match(page, /NO PAID PLAN REQUIRED/);
  assert.match(page, /smi-intelligence-lanes/);
  const css = readFileSync(new URL('../assets/css/smart-intelligence.css', import.meta.url), 'utf8');
  assert.match(css, /--smi-gold/);
});

test('relay publication cannot bypass Contentful approval', async () => {
  const calls = [];
  const repository = createRestPublicationRepository({ config: { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'k' },
    fetchImpl: async url => { calls.push(new URL(url).pathname); return { ok: true, json: async () => 'id' }; } });
  const base = { sourcePublishedAt: new Date(NOW).toISOString(), summary: 's', contentFingerprint: 'a'.repeat(64), validationPayload: {}, relevanceTerms: ['payment'] };
  const item = { id: '00000000-0000-4000-8000-000000000001', title: 'Instant payments network expands settlement', source_id: 'x', event_type: 'u' };
  await assert.rejects(repository.publish(item, { ...base, t3Automatic: true }, T3), /CONTENTFUL_APPROVAL_REQUIRED/);
  await assert.rejects(repository.publish(item, { ...base, editorial: true }, T3), /CONTENTFUL_APPROVAL_REQUIRED/);
  await assert.rejects(repository.publish(item, base, T1), /CONTENTFUL_APPROVAL_REQUIRED/);
  assert.deepEqual(calls, []);
});
