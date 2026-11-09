import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateEditorialEntry } from '../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { AUTO_PUBLICATION_THRESHOLDS, T3_AUTOMATIC_PUBLICATION, validateCandidateSource }
  from '../supabase/functions/_shared/gpir-intelligence-validation.mjs';
import { createRestPublicationRepository, processCandidate }
  from '../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { normalizeRepositoryRows } from '../supabase/functions/gpir-public-intelligence/handler.mjs';
import { eligibleLiveRecords, normalizeLiveAlerts, normalizeSmartRecords } from '../assets/js/smart-intelligence.mjs';
import { buildTopicContext } from '../assets/js/gpir-topic-intelligence.mjs';

const NOW = Date.parse('2026-11-09T12:00:00.000Z');
const HOUR = 3600000;
const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const URL_A = 'https://www.pymnts.com/news/payments/2026/instant-payments-network-expands/';
const T3 = Object.freeze({ source_id: 'PYMNTS-GLOBAL-004', source_name: 'PYMNTS', official_url: 'https://www.pymnts.com',
  trust_tier: 'T3', source_status: 'GREEN', country: 'Global', region_tags: ['Global'], category: 'Payments News' });

function candidate(overrides = {}) {
  return { id: CANDIDATE_ID, source_id: T3.source_id, canonical_url: URL_A,
    title: 'Instant payments network expands cross-border settlement',
    published_at: new Date(NOW - 2 * HOUR).toISOString(), category: 'Payments', confidence_score: 96,
    candidate_status: 'PENDING', content_fingerprint: 'a'.repeat(64), ...overrides };
}

const FULL_BODY = [
  'The payments network announced that instant settlement will extend to additional cross-border corridors for banks, wallets and merchants across several markets.',
  'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the expanded real-time payment rail.',
  'Executives explained that the rollout will be phased and that card, wallet and bank transfer flows will share common reconciliation and reporting standards.',
  'The company also described governance arrangements for remittance partners, regulators and fintech participants supporting the new payment infrastructure.',
  'A published timetable sets out onboarding windows for acquiring banks and merchant processors, with settlement reporting required from every participant.',
  'Regulators in each market will receive monthly reports covering transaction volumes, dispute handling and operational incidents during the phased expansion programme.',
  'The operator added that independent auditors will review the controls before each corridor is enabled for general availability to regulated payment institutions.'
].join(' ');
// Meets the T1/T1.5/T2 evidence minimums (600 characters, two sentences) but not the stricter T3 profile.
const SHORT_BODY = FULL_BODY.split('. ').slice(0, 4).join('. ') + '.';
const LOW_RELEVANCE_BODY = [
  'The network announced that corridors will extend to additional markets for several participants across the region during the coming operating period.',
  'The operator said participating organisations must complete certification and testing before connecting to the expanded network service this year.',
  'Executives explained that the rollout will be phased and that all flows will share common reconciliation and reporting standards for members.',
  'The company also described governance arrangements for partners and regulators supporting the new service, including a published onboarding timetable.',
  'A published timetable sets out onboarding windows for every participant, with periodic reporting required throughout the rollout programme.',
  'Independent reviewers will assess operating results at each stage and publish their findings for members before any further corridors are enabled.',
  'The operator confirmed that the programme timetable will be reviewed quarterly and that members will be consulted before material changes take effect.'
].join(' ');

function page(item, { body = FULL_BODY, canonical = item.canonical_url, timestamp = item.published_at } = {}) {
  const stamp = timestamp ? `<meta property="article:published_time" content="${timestamp}">` : '';
  const ld = timestamp ? { '@type': 'NewsArticle', datePublished: timestamp, articleBody: body } : { '@type': 'NewsArticle', articleBody: body };
  return `<!doctype html><html><head><link rel="canonical" href="${canonical}">${stamp}
    <script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><article><p>${body}</p></article></body></html>`;
}

const fetchPage = (item, options) => async () => ({ ok: true, status: 200, url: item.canonical_url,
  headers: new Headers({ 'content-type': 'text/html' }), text: async () => page(item, options) });

function store({ source = T3, duplicate = false } = {}) {
  const records = [];
  const published = [];
  return { records, published,
    async start() {}, async source() { return source; }, async duplicate() { return duplicate; },
    async record(_item, validation) { records.push(validation); },
    async publish(_item, validation) { published.push(validation); return '22222222-2222-4222-8222-222222222222'; } };
}

const run = (item, repository, fetchImpl = fetchPage(item)) =>
  processCandidate({ candidate: item, repository, fetchImpl, now: () => NOW });

test('a verified, high-confidence T3 article publishes automatically with its original timestamp and no Contentful entry', async () => {
  const item = candidate();
  const repository = store();
  const outcome = await run(item, repository);
  assert.equal(outcome.decision, 'PUBLISHED');
  assert.equal(repository.published.length, 1);
  assert.equal(repository.records.length, 0);
  const [validation] = repository.published;
  assert.equal(validation.t3Automatic, true);
  assert.equal(validation.editorial, false);
  assert.equal(validation.sourcePublishedAt, item.published_at);
  assert.equal(validation.canonicalUrl, URL_A);
  for (const flag of ['source_verified', 'canonical_verified', 'timestamp_verified', 'content_verified',
    'relevance_verified', 'summary_grounded', 't3_auto_verified'])
    assert.equal(validation.validationPayload[flag], true, flag);
  assert.equal(validation.validationPayload.editorial_verified, undefined);
  assert.ok(validation.summary.length >= 120);
});

test('the confidence threshold is explicit; evidence is verified first and confidence is never raised by a fetch', async () => {
  assert.equal(T3_AUTOMATIC_PUBLICATION.minConfidence, 95);
  for (const confidence of [0, 40, 94.9, null, undefined, 'abc']) {
    const item = candidate({ confidence_score: confidence });
    const repository = store();
    const outcome = await run(item, repository);
    assert.equal(outcome.decision, 'REVIEW', String(confidence));
    assert.equal(outcome.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET');
    assert.deepEqual(outcome.evidenceVerification, { attempted: true, status: 'SUCCEEDED', reason: null });
    assert.equal(outcome.validationPayload.confidence_score, Number(confidence));
    assert.equal(repository.published.length, 0);
    assert.equal(repository.records.length, 1);
  }
  const atThreshold = await validateCandidateSource({ candidate: candidate({ confidence_score: 95 }), source: T3,
    fetchImpl: fetchPage(candidate()), now: () => NOW });
  assert.equal(atThreshold.decision, 'PUBLISHED');
  assert.deepEqual(atThreshold.evidenceVerification, { attempted: true, status: 'SUCCEEDED', reason: null });
  // High confidence cannot rescue a failed verification.
  const unverified = await run(candidate({ confidence_score: 100 }), store(),
    fetchPage(candidate(), { canonical: 'https://www.pymnts.com/news/payments/2026/another-article/' }));
  assert.equal(unverified.decision, 'REVIEW');
  assert.equal(unverified.evidenceVerification.status, 'FAILED');
});

test('an unattempted fetch is never recorded as a failed verification', async () => {
  const old = candidate({ confidence_score: 40, published_at: new Date(NOW - 20 * HOUR).toISOString() });
  let fetched = false;
  const outcome = await run(old, store(), async () => { fetched = true; throw new Error('no fetch'); });
  assert.equal(fetched, false);
  assert.deepEqual(outcome.validationPayload.evidence_verification,
    { attempted: false, status: 'NOT_ATTEMPTED', reason: 'OUTSIDE_LIVE_WINDOW' });
  const notEligible = await run(candidate({ confidence_score: 99 }), store({ source: { ...T3, trust_tier: 'T4' } }));
  assert.equal(notEligible.evidenceVerification.status, 'NOT_ATTEMPTED');
  assert.equal(notEligible.evidenceVerification.reason, 'SOURCE_TIER_NOT_ELIGIBLE');
  const unapproved = await run(candidate(), store({ source: { ...T3, source_status: 'AMBER' } }));
  assert.equal(unapproved.evidenceVerification.attempted, false);
  // An attempted fetch that fails is FAILED and carries the failure reason.
  const failed = await run(candidate(), store(), async () => ({ ok: false, status: 403, url: URL_A, headers: new Headers(), text: async () => '' }));
  assert.deepEqual(failed.evidenceVerification, { attempted: true, status: 'FAILED', reason: 'SOURCE_HTTP_403' });
  const timeout = await run(candidate(), store(), async () => { throw new Error('network'); });
  assert.deepEqual(timeout.evidenceVerification, { attempted: true, status: 'FAILED', reason: 'SOURCE_FETCH_FAILED' });
});

test('an unverified source, foreign domain, canonical mismatch or off-domain redirect never publishes', async () => {
  const item = candidate();
  for (const source of [{ ...T3, source_status: 'AMBER' }, { ...T3, source_status: 'RED' }, { ...T3, official_url: null }, null]) {
    const repository = store({ source });
    const outcome = await run(item, repository);
    assert.equal(outcome.decision, 'REVIEW');
    assert.equal(outcome.reasonCode, 'SOURCE_NOT_APPROVED');
    assert.equal(repository.published.length, 0);
  }
  for (const canonical_url of ['https://evil.example/news/payments/2026/a/', 'https://www.pymnts.com.evil.example/a/',
    'http://www.pymnts.com/news/a/']) {
    const repository = store();
    const outcome = await run(candidate({ canonical_url }), repository);
    assert.equal(outcome.decision, 'REJECTED', canonical_url);
    assert.equal(outcome.reasonCode, 'CANDIDATE_SOURCE_DOMAIN_MISMATCH');
    assert.equal(repository.published.length, 0);
  }
  const mismatch = store();
  const canonicalOutcome = await run(item, mismatch, fetchPage(item, { canonical: 'https://www.pymnts.com/news/payments/2026/other/' }));
  assert.equal(canonicalOutcome.decision, 'REVIEW');
  assert.equal(canonicalOutcome.reasonCode, 'CANONICAL_URL_NOT_VERIFIED');
  const offDomainCanonical = store();
  const offDomain = await run(item, offDomainCanonical, fetchPage(item, { canonical: 'https://evil.example/a' }));
  assert.equal(offDomain.reasonCode, 'CANONICAL_URL_NOT_VERIFIED');
  const redirect = store();
  const redirected = await run(item, redirect, async () => ({ ok: false, status: 302, url: URL_A,
    headers: new Headers({ location: 'https://evil.example/landing' }), text: async () => '' }));
  assert.equal(redirected.decision, 'REJECTED');
  assert.equal(redirected.reasonCode, 'SOURCE_REDIRECT_DOMAIN_MISMATCH');
  for (const repository of [mismatch, offDomainCanonical, redirect]) assert.equal(repository.published.length, 0);
});

test('a missing source timestamp, thin evidence or weak relevance stays in review with a recorded reason', async () => {
  const item = candidate();
  const cases = [
    ['SOURCE_TIMESTAMP_MISSING', fetchPage(item, { timestamp: null })],
    ['INSUFFICIENT_SOURCE_EVIDENCE', fetchPage(item, { body: 'Payment update.' })],
    ['INSUFFICIENT_SOURCE_EVIDENCE', fetchPage(item, { body: SHORT_BODY })],
    ['INSUFFICIENT_PAYMENTS_RELEVANCE', fetchPage(item, { body: LOW_RELEVANCE_BODY }), { title: 'Network expands services to additional regions' }],
    ['SOURCE_TIMESTAMP_MISMATCH', fetchPage(item, { timestamp: new Date(NOW - 60 * HOUR).toISOString() })]
  ];
  for (const [reasonCode, fetchImpl, overrides] of cases) {
    const repository = store();
    const outcome = await run(overrides ? candidate(overrides) : item, repository, fetchImpl);
    assert.equal(outcome.decision, 'REVIEW', reasonCode);
    assert.equal(outcome.reasonCode, reasonCode);
    assert.equal(repository.published.length, 0, reasonCode);
    assert.equal(repository.records[0].reasonCode, reasonCode);
  }
  // The stricter T3 evidence minimums do not change the T1 route for the same article.
  const t1 = await validateCandidateSource({ candidate: candidate({ confidence_score: 75 }), source: { ...T3, trust_tier: 'T1' },
    fetchImpl: fetchPage(item, { body: SHORT_BODY }), now: () => NOW });
  assert.equal(t1.decision, 'PUBLISHED');
  assert.equal(t1.t3Automatic, false);
});

test('an inaccessible T3 article is never published and stays retryable review', async () => {
  const item = candidate();
  for (const [reasonCode, fetchImpl] of [
    ['SOURCE_HTTP_403', async () => ({ ok: false, status: 403, url: URL_A, headers: new Headers(), text: async () => '' })],
    ['SOURCE_HTTP_503', async () => ({ ok: false, status: 503, url: URL_A, headers: new Headers(), text: async () => '' })],
    ['SOURCE_FETCH_FAILED', async () => { throw new Error('network'); }],
    ['UNSUPPORTED_SOURCE_CONTENT_TYPE', async () => ({ ok: true, status: 200, url: URL_A,
      headers: new Headers({ 'content-type': 'application/pdf' }), text: async () => '%PDF' })]
  ]) {
    const repository = store();
    const outcome = await run(item, repository, fetchImpl);
    assert.equal(outcome.decision, 'REVIEW', reasonCode);
    assert.equal(outcome.reasonCode, reasonCode);
    assert.equal(repository.published.length, 0);
  }
});

test('a duplicate T3 article is recorded as a duplicate and never published twice', async () => {
  const repository = store({ duplicate: true });
  const outcome = await run(candidate(), repository);
  assert.equal(outcome.decision, 'DUPLICATE');
  assert.equal(outcome.reasonCode, 'DUPLICATE_PUBLICATION');
  assert.equal(repository.published.length, 0);
  assert.equal(repository.records[0].decision, 'DUPLICATE');
});

test('the duplicate check consults both the canonical URL and the content fingerprint', async () => {
  const requests = [];
  const repository = createRestPublicationRepository({ config: { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'k' },
    fetchImpl: async url => { const request = new URL(url); requests.push(request);
      return { ok: true, json: async () => (request.pathname.endsWith('/global_announcements') ? [{ id: 'x' }] : []) }; } });
  assert.equal(await repository.duplicate(candidate(), { canonicalUrl: URL_A, contentFingerprint: 'b'.repeat(64) }), true);
  assert.deepEqual(requests.map(request => request.pathname).sort(),
    ['/rest/v1/global_announcements', '/rest/v1/intelligence_publication_audits']);
});

test('T1, T1.5 and T2 automatic publication is unchanged and never uses the T3 route', async () => {
  assert.deepEqual({ ...AUTO_PUBLICATION_THRESHOLDS }, { T1: 70, 'T1.5': 80, T2: 90 });
  for (const [tier, passing, failing] of [['T1', 70, 69], ['T1.5', 80, 79], ['T2', 90, 89]]) {
    const source = { ...T3, trust_tier: tier };
    const pass = store({ source });
    const passed = await run(candidate({ confidence_score: passing }), pass);
    assert.equal(passed.decision, 'PUBLISHED', tier);
    assert.equal(pass.published[0].t3Automatic, false, tier);
    assert.equal(pass.published[0].validationPayload.t3_auto_verified, undefined, tier);
    const fail = store({ source });
    const failed = await run(candidate({ confidence_score: failing }), fail);
    assert.equal(failed.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET', tier);
    assert.equal(fail.published.length, 0, tier);
  }
  // A T2 confidence that would satisfy the T3 profile must not change T2 thresholds either way.
  const t2 = await validateCandidateSource({ candidate: candidate({ confidence_score: 99 }), source: { ...T3, trust_tier: 'T2' },
    fetchImpl: fetchPage(candidate()), now: () => NOW });
  assert.equal(t2.t3Automatic, false);
  for (const tier of ['T4', undefined, null]) {
    const outcome = await validateCandidateSource({ candidate: candidate({ confidence_score: 100 }),
      source: { ...T3, trust_tier: tier }, fetchImpl: fetchPage(candidate()), now: () => NOW });
    assert.equal(outcome.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET', String(tier));
  }
});

test('publication RPC routing: T3 automatic, Contentful editorial and T1/T1.5/T2 use distinct service-role functions', async () => {
  const calls = [];
  const repository = createRestPublicationRepository({ config: { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'k' },
    fetchImpl: async (url, init) => { calls.push({ path: new URL(url).pathname, auth: init.headers.get('authorization') });
      return { ok: true, json: async () => 'id' }; } });
  const base = { sourcePublishedAt: candidate().published_at, summary: 's', contentFingerprint: 'a'.repeat(64),
    validationPayload: {}, relevanceTerms: ['payment'] };
  await repository.publish(candidate(), { ...base, t3Automatic: true }, T3);
  await repository.publish(candidate(), { ...base, editorial: true }, T3);
  await repository.publish(candidate(), { ...base, editorial: true, t3Automatic: false }, T3);
  await repository.publish(candidate(), { ...base, t3Automatic: false, editorial: false }, { ...T3, trust_tier: 'T1' });
  assert.deepEqual(calls.map(call => call.path), [
    '/rest/v1/rpc/gpir_publish_t3_automatic_candidate',
    '/rest/v1/rpc/gpir_publish_t3_editorial_candidate',
    '/rest/v1/rpc/gpir_publish_t3_editorial_candidate',
    '/rest/v1/rpc/gpir_publish_consolidated_candidate']);
  assert.ok(calls.every(call => call.auth === 'Bearer k'), 'every call is made with the service-role key');
});

test('the Contentful editorial route is preserved, takes precedence and still publishes low-confidence T3 articles', async () => {
  for (const confidence of [40, 99]) {
    const item = candidate({ confidence_score: confidence });
    const entry = { entryId: 'entry-1', updatedAt: new Date(NOW - 600000).toISOString(), fields: {
      gpirPublicationId: 'VK-GPIR-MEDIA-000001', supabaseRecordId: CANDIDATE_ID, legacySourceUrl: URL_A,
      publicationStatus: 'CURRENT', validationStatus: 'PASS',
      sourceValidationSummary: 'Editor verified the PYMNTS article against the original page and payments scope.' } };
    assert.equal(evaluateEditorialEntry({ entry, candidate: item, source: T3 }).approved, true);
    const repository = store();
    const outcome = await processCandidate({ candidate: item, repository, fetchImpl: fetchPage(item), now: () => NOW,
      editorial: { entries: [entry], ambiguous: new Set() } });
    assert.equal(outcome.decision, 'PUBLISHED', String(confidence));
    assert.equal(repository.published[0].editorial, true);
    assert.equal(repository.published[0].t3Automatic, false);
    assert.equal(repository.published[0].validationPayload.editorial_entry_id, 'entry-1');
    assert.equal(repository.published[0].validationPayload.t3_auto_verified, undefined);
  }
  // A caller-supplied or forged approval cannot create either route.
  const forged = await validateCandidateSource({ candidate: candidate({ confidence_score: 40 }), source: T3,
    fetchImpl: fetchPage(candidate()), now: () => NOW,
    editorialApproval: { approved: true, entryId: 'e', publicationId: 'VK-GPIR-A-1', sourceUrl: URL_A } });
  assert.equal(forged.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET');
});

function retryStore(rows, audits, source = T3, requests = []) {
  return createRestPublicationRepository({ config: { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'k' },
    fetchImpl: async url => {
      const request = new URL(url);
      requests.push(request);
      if (request.pathname.endsWith('/intelligence_publication_audits')) return { ok: true, json: async () => audits };
      if (request.pathname.endsWith('/source_registry')) return { ok: true, json: async () => [source] };
      const status = request.searchParams.get('candidate_status').replace(/^(in|eq)\.\(?|\)$/g, '').split(',');
      const offset = Number(request.searchParams.get('offset') || 0);
      const bounds = request.searchParams.getAll('published_at');
      return { ok: true, json: async () => rows.filter(row => status.includes(row.candidate_status) && bounds.every(bound => {
        const time = Date.parse(bound.slice(bound.indexOf('.') + 1));
        return bound.startsWith('gte.') ? Date.parse(row.published_at) >= time : Date.parse(row.published_at) < time;
      })).slice(offset, offset + 50) };
    } });
}

test('a recent T3 threshold review made without an evidence fetch is reconsidered once, within bounds', async () => {
  const completed = new Date(NOW - HOUR).toISOString();
  const row = (digit, overrides = {}) => candidate({ id: `33333333-3333-4333-8333-33333333333${digit}`,
    candidate_status: 'REVIEW', confidence_score: 40, ...overrides });
  const legacy = row(1);
  const attempted = row(2);
  const notAttempted = row(3);
  const stale = row(4, { published_at: new Date(NOW - 20 * HOUR).toISOString() });
  const audit = (item, payload) => ({ candidate_id: item.id, decision: 'REVIEW', reason_code: 'AUTO_PUBLICATION_THRESHOLD_NOT_MET',
    completed_at: completed, validation_payload: payload });
  const audits = [audit(legacy, { source_verified: false }),
    audit(attempted, { evidence_verification: { attempted: true, status: 'SUCCEEDED' } }),
    audit(notAttempted, { evidence_verification: { attempted: false, status: 'NOT_ATTEMPTED' } }),
    audit(stale, { source_verified: false })];
  const requests = [];
  const selected = await retryStore([legacy, attempted, notAttempted, stale], audits, T3, requests).candidates({ limit: 5, now: NOW });
  assert.deepEqual(selected.map(item => item.id), [legacy.id, notAttempted.id],
    'confidence is irrelevant; only an unattempted fetch inside the live window qualifies');
  assert.match(requests.find(request => request.pathname.endsWith('/intelligence_publication_audits')).searchParams.get('select'), /validation_payload/);
  const recent = audits.map(item => ({ ...item, completed_at: new Date(NOW - 5 * 60000).toISOString() }));
  assert.deepEqual(await retryStore([legacy], recent).candidates({ limit: 5, now: NOW }), [], '30-minute backoff applies');
  assert.deepEqual(await retryStore([legacy], audits, { ...T3, trust_tier: 'T2' }).candidates({ limit: 5, now: NOW }), [],
    'only T3 candidates are reconsidered');
  assert.deepEqual(await retryStore([legacy], audits, { ...T3, source_status: 'AMBER' }).candidates({ limit: 5, now: NOW }), []);
  assert.equal((await retryStore([legacy, notAttempted], audits).candidates({ limit: 1, now: NOW })).length, 1, 'batch limit bounds the run');
});

test('a reconsidered T3 candidate publishes only after every governance check passes', async () => {
  const good = candidate({ confidence_score: 97, candidate_status: 'REVIEW' });
  const published = store();
  assert.equal((await run(good, published)).decision, 'PUBLISHED');
  const lowConfidence = store();
  const low = await run(candidate({ confidence_score: 60, candidate_status: 'REVIEW' }), lowConfidence);
  assert.equal(low.decision, 'REVIEW');
  assert.equal(lowConfidence.published.length, 0);
  assert.equal(lowConfidence.records[0].evidenceVerification.status, 'SUCCEEDED');
  const duplicate = store({ duplicate: true });
  assert.equal((await run(good, duplicate)).decision, 'DUPLICATE');
});

test('a published T3 article reaches both tickers, the Smart Intelligence view and the permanent repository', () => {
  const summary = 'PYMNTS reports: The payments network announced that instant settlement will extend to additional cross-border corridors for banks, wallets and merchants. ' +
    'The operator said participating payment providers must complete certification and settlement testing before connecting.';
  // Exactly what gpir_publish_t3_automatic_candidate writes to global_announcements.
  const row = (id, hoursAgo, url, title = `Instant payments network expands cross-border settlement ${id}`) => ({ id, source_id: T3.source_id, title,
    summary_narration: summary, canonical_url: url, published_at: new Date(NOW - hoursAgo * HOUR).toISOString(),
    ticker_eligible: hoursAgo <= 12, topic_headers: ['Payments'], publication_status: 'approved' });
  const live = row('a-live', 2, URL_A);
  const older = row('a-old', 40, 'https://www.pymnts.com/news/payments/2026/earlier-corridor-pilot/', 'Earlier cross-border corridor pilot concluded for regional banks');
  const archived = row('a-archive', 13 * 24, 'https://www.pymnts.com/news/payments/2026/older-cross-border-settlement/');
  const records = normalizeRepositoryRows({ now: NOW, sources: [T3], announcements: [live, older, archived] });
  const byId = Object.fromEntries(records.map(record => [record.id, record]));

  // Global Alerts ticker contract: approved, ticker eligible, inside the 12-hour window.
  assert.equal(byId['a-live'].lifecycleStatus, 'LIVE');
  assert.equal(byId['a-live'].tickerEligible, true);
  assert.equal(byId['a-live'].source.trustTier, 'T3');
  assert.equal(byId['a-live'].canonicalUrl, URL_A);

  // Smart Intelligence ticker: the same governed record passes the shared alert gates.
  const smart = normalizeSmartRecords({ status: 'OK', records });
  const alerts = normalizeLiveAlerts({ alerts: [{ ...byId['a-live'], publicationStatus: 'approved', sourceVerified: true }] }, smart);
  assert.deepEqual(alerts.map(alert => alert.id), ['a-live']);
  assert.deepEqual(eligibleLiveRecords(alerts, NOW).map(alert => alert.id), ['a-live']);

  // Permanent repository: older records are retained and never ticker eligible.
  assert.equal(byId['a-old'].lifecycleStatus, 'HISTORICAL');
  assert.equal(byId['a-old'].tickerEligible, false);
  assert.equal(byId['a-archive'].tickerEligible, false);
  assert.ok(smart.some(record => record.id === 'a-old'));

  // Selecting the alert opens the Smart Intelligence topic view with historical context.
  const alert = smart.find(record => record.id === 'a-live');
  const context = buildTopicContext(alert, smart, NOW);
  assert.ok(context.topic.topicIds.includes('cross-border'));
  const related = [...context.current, ...context.historical].map(record => record.id);
  assert.ok(related.includes('a-old'));

  // After the 12-hour window the article leaves the tickers but stays in the repository.
  const later = NOW + 11 * HOUR;
  const expired = normalizeRepositoryRows({ now: later, sources: [T3], announcements: [live] });
  assert.equal(expired[0].lifecycleStatus, 'HISTORICAL');
  assert.equal(expired[0].tickerEligible, false);
  assert.equal(expired[0].publishedAt, live.published_at);
  assert.deepEqual(eligibleLiveRecords(normalizeSmartRecords({ status: 'OK', records: expired }), later), []);
});
