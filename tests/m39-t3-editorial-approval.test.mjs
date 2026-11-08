import assert from 'node:assert/strict';
import test from 'node:test';
import { ambiguousEditorialKeys, contentfulEditorialConfig, evaluateEditorialEntry,
  fetchPublishedEditorialEntries } from '../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { validateCandidateSource } from '../supabase/functions/_shared/gpir-intelligence-validation.mjs';
import { createRestPublicationRepository, createPublicationHandler, processCandidate,
  processEditorialApprovals } from '../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { normalizeRepositoryRows } from '../supabase/functions/gpir-public-intelligence/handler.mjs';

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const URL_A = 'https://www.pymnts.com/news/payments/2026/instant-payments-network-expands/';
const T3 = Object.freeze({ source_id: 'PYMNTS-GLOBAL-004', source_name: 'PYMNTS', official_url: 'https://www.pymnts.com',
  trust_tier: 'T3', source_status: 'GREEN', country: 'Global', region_tags: ['Global'], category: 'Payments News' });

function candidate(overrides = {}) {
  return { id: CANDIDATE_ID, source_id: T3.source_id, canonical_url: URL_A,
    title: 'Instant payments network expands cross-border settlement',
    published_at: new Date(NOW - 2 * 3600 * 1000).toISOString(), category: 'Payments', confidence_score: 40,
    candidate_status: 'REVIEW', content_fingerprint: 'a'.repeat(64), ...overrides };
}

function entry(overrides = {}, fields = {}) {
  return { entryId: 'entry-1', updatedAt: new Date(NOW - 600000).toISOString(), fields: {
    gpirPublicationId: 'VK-GPIR-MEDIA-000001', supabaseRecordId: CANDIDATE_ID, legacySourceUrl: URL_A,
    publicationStatus: 'CURRENT', validationStatus: 'VALIDATED',
    sourceValidationSummary: 'Editor verified the PYMNTS article against the original page and payments scope.',
    ...fields }, ...overrides };
}

function page(item) {
  const body = [
    'The payments network announced that instant settlement will extend to additional cross-border corridors for banks, wallets and merchants across several markets.',
    'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the expanded real-time payment rail.',
    'Executives explained that the rollout will be phased and that card, wallet and bank transfer flows will share common reconciliation and reporting standards.',
    'The company also described governance arrangements for remittance partners, regulators and fintech participants supporting the new payment infrastructure.'
  ].join(' ');
  return `<!doctype html><html><head><link rel="canonical" href="${item.canonical_url}">
    <meta property="article:published_time" content="${item.published_at}">
    <script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', datePublished: item.published_at, articleBody: body })}</script>
    </head><body><article><p>${body}</p></article></body></html>`;
}

const fetchPage = item => async () => ({ ok: true, status: 200, url: item.canonical_url,
  headers: new Headers({ 'content-type': 'text/html' }), text: async () => page(item) });

function store({ audit = null, entries = [], published = [] } = {}) {
  const events = [];
  return { events, published,
    async editorialEntries() { return entries; },
    async candidate(id) { return id === CANDIDATE_ID ? candidate() : null; },
    async audit() { return audit; },
    async start() { events.push('start'); },
    async source() { return T3; },
    async duplicate() { return false; },
    async record(_item, validation) { events.push(`record:${validation.reasonCode}`); },
    async publish(_item, validation) { published.push(validation); return '22222222-2222-4222-8222-222222222222'; } };
}

test('an explicitly approved, published, matching Contentful entry is accepted', () => {
  const approval = evaluateEditorialEntry({ entry: entry(), candidate: candidate(), source: T3 });
  assert.equal(approval.approved, true);
  assert.equal(approval.publicationId, 'VK-GPIR-MEDIA-000001');
});

test('editorial approval is denied for every identity, source, status and evidence mismatch', () => {
  const cases = {
    EDITORIAL_IDENTITY_MISMATCH: entry({}, { supabaseRecordId: '99999999-9999-4999-8999-999999999999' }),
    EDITORIAL_SOURCE_URL_MISMATCH: entry({}, { legacySourceUrl: 'https://www.pymnts.com/news/other/2026/different-article/' }),
    EDITORIAL_APPROVAL_NOT_EXPLICIT: entry({}, { validationStatus: 'AWAITING_HUMAN_VALIDATION' }),
    EDITORIAL_PUBLICATION_ID_INVALID: entry({}, { gpirPublicationId: 'draft-1' }),
    EDITORIAL_EVIDENCE_MISSING: entry({}, { sourceValidationSummary: ' ' })
  };
  for (const [reason, item] of Object.entries(cases))
    assert.equal(evaluateEditorialEntry({ entry: item, candidate: candidate(), source: T3 }).reasonCode, reason, reason);
  assert.equal(evaluateEditorialEntry({ entry: entry({}, { publicationStatus: 'HISTORICAL' }), candidate: candidate(), source: T3 }).reasonCode,
    'EDITORIAL_APPROVAL_NOT_EXPLICIT');
  assert.equal(evaluateEditorialEntry({ entry: entry({}, { legacySourceUrl: 'https://evil.example/news/payments/2026/a' }),
    candidate: candidate({ canonical_url: 'https://evil.example/news/payments/2026/a' }), source: T3 }).reasonCode,
  'EDITORIAL_SOURCE_URL_MISMATCH');
  assert.equal(evaluateEditorialEntry({ entry: entry(), candidate: candidate(), source: { ...T3, trust_tier: 'T2' } }).reasonCode,
    'EDITORIAL_SOURCE_NOT_T3');
});

test('duplicate Contentful entries for one candidate or URL are ambiguous and never approve', () => {
  const entries = [entry(), entry({ entryId: 'entry-2' })];
  const ambiguous = ambiguousEditorialKeys(entries);
  assert.equal(evaluateEditorialEntry({ entry: entries[0], candidate: candidate(), source: T3, ambiguous }).reasonCode,
    'EDITORIAL_ENTRY_AMBIGUOUS');
});

test('T3 without editorial approval stays awaiting review; automated tier behavior is unchanged', async () => {
  const item = candidate();
  const unapproved = await validateCandidateSource({ candidate: item, source: T3, fetchImpl: fetchPage(item), now: () => NOW });
  assert.equal(unapproved.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET');
  const forged = await validateCandidateSource({ candidate: item, source: T3, fetchImpl: fetchPage(item), now: () => NOW,
    editorialApproval: { approved: false } });
  assert.equal(forged.decision, 'REVIEW');
  const t2Low = await validateCandidateSource({ candidate: item, source: { ...T3, trust_tier: 'T2' }, fetchImpl: fetchPage(item), now: () => NOW,
    editorialApproval: { approved: true, sourceUrl: 'x', entryId: 'e', publicationId: 'VK-GPIR-A-1' } });
  assert.equal(t2Low.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET');
});

test('approved T3 is revalidated against the live source before release and keeps the source timestamp', async () => {
  const item = candidate();
  const approval = evaluateEditorialEntry({ entry: entry(), candidate: item, source: T3 });
  const events = store();
  const outcome = await processCandidate({ candidate: item, repository: events, fetchImpl: fetchPage(item), now: () => NOW,
    editorial: { entry: entry(), ambiguous: new Set() } });
  assert.equal(approval.approved, true);
  assert.equal(outcome.decision, 'PUBLISHED');
  assert.equal(outcome.sourcePublishedAt, item.published_at);
  assert.equal(events.published[0].editorial, true);
  assert.equal(events.published[0].validationPayload.editorial_entry_id, 'entry-1');
  assert.equal(events.published[0].validationPayload.editorial_supabase_record_id, CANDIDATE_ID);

  const stale = candidate({ id: '22222222-2222-4222-8222-222222222222', canonical_url: URL_A });
  const bad = await validateCandidateSource({ candidate: stale, source: T3, now: () => NOW,
    fetchImpl: async () => ({ ok: true, status: 200, url: URL_A, headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => page({ canonical_url: URL_A, published_at: new Date(NOW - 50 * 3600 * 1000).toISOString() }) }),
    editorialApproval: approval });
  assert.equal(bad.reasonCode, 'SOURCE_TIMESTAMP_MISMATCH');

  const wrongPage = await validateCandidateSource({ candidate: item, source: T3, now: () => NOW,
    fetchImpl: fetchPage({ ...item, canonical_url: 'https://www.pymnts.com/news/payments/2026/other/' }),
    editorialApproval: approval });
  assert.notEqual(wrongPage.decision, 'PUBLISHED');
});

test('editorial pass publishes only candidates with a matching entry and respects terminal decisions', async () => {
  const published = store({ entries: [entry()] });
  const result = await processEditorialApprovals({ repository: published, fetchImpl: fetchPage(candidate()), now: () => NOW });
  assert.equal(result.published, 1);

  const none = store({ entries: [] });
  assert.equal((await processEditorialApprovals({ repository: none, fetchImpl: fetchPage(candidate()), now: () => NOW })).published, 0);
  assert.equal(none.published.length, 0);

  for (const decision of ['PUBLISHED', 'REJECTED', 'DUPLICATE']) {
    const terminal = store({ entries: [entry()], audit: { decision, reason_code: 'X', completed_at: new Date(NOW - 1000).toISOString() } });
    const outcome = await processEditorialApprovals({ repository: terminal, fetchImpl: fetchPage(candidate()), now: () => NOW });
    assert.equal(outcome.published, 0, decision);
    assert.equal(terminal.published.length, 0, decision);
  }

  const denied = store({ entries: [entry({}, { validationStatus: 'AWAITING_HUMAN_VALIDATION' })] });
  const deniedResult = await processEditorialApprovals({ repository: denied, fetchImpl: fetchPage(candidate()), now: () => NOW });
  assert.equal(deniedResult.published, 0);
  assert.deepEqual(denied.events.filter(event => event.startsWith('record')), ['record:EDITORIAL_APPROVAL_NOT_EXPLICIT']);
});

test('a prior non-transient review reopens only after the editor updates the entry', async () => {
  const review = { decision: 'REVIEW', reason_code: 'EDITORIAL_EVIDENCE_MISSING', completed_at: new Date(NOW - 60000).toISOString() };
  const unchanged = store({ entries: [entry({ updatedAt: new Date(NOW - 3600000).toISOString() })], audit: review });
  assert.equal((await processEditorialApprovals({ repository: unchanged, fetchImpl: fetchPage(candidate()), now: () => NOW })).skipped, 1);
  const changed = store({ entries: [entry({ updatedAt: new Date(NOW - 1000).toISOString() })], audit: review });
  assert.equal((await processEditorialApprovals({ repository: changed, fetchImpl: fetchPage(candidate()), now: () => NOW })).published, 1);
  const threshold = store({ entries: [entry({ updatedAt: new Date(NOW - 3600000).toISOString() })],
    audit: { decision: 'REVIEW', reason_code: 'AUTO_PUBLICATION_THRESHOLD_NOT_MET', completed_at: new Date(NOW - 60000).toISOString() } });
  assert.equal((await processEditorialApprovals({ repository: threshold, fetchImpl: fetchPage(candidate()), now: () => NOW })).published, 1);
});

test('only the published Delivery API is used and a management token is refused', async () => {
  assert.equal(contentfulEditorialConfig({ CONTENTFUL_SPACE_ID: 's', CONTENTFUL_ENVIRONMENT: 'e', CONTENTFUL_DELIVERY_TOKEN: 't',
    CONTENTFUL_MANAGEMENT_TOKEN: 't' }), null);
  assert.equal(contentfulEditorialConfig({ CONTENTFUL_SPACE_ID: 's', CONTENTFUL_ENVIRONMENT: 'e' }), null);
  const config = contentfulEditorialConfig({ CONTENTFUL_SPACE_ID: 's', CONTENTFUL_ENVIRONMENT: 'master', CONTENTFUL_DELIVERY_TOKEN: 'delivery' });
  let request;
  const entries = await fetchPublishedEditorialEntries({ config, fetchImpl: async (url, init) => {
    request = { url: new URL(url), init };
    return { ok: true, json: async () => ({ items: [{ sys: { id: 'e1', updatedAt: '2026-11-08T11:00:00Z' }, fields: { supabaseRecordId: CANDIDATE_ID } }] }) };
  } });
  assert.equal(request.url.hostname, 'cdn.contentful.com');
  assert.equal(request.url.searchParams.get('content_type'), 'gpirPublication');
  assert.equal(request.init.headers.Authorization, 'Bearer delivery');
  assert.equal(entries[0].entryId, 'e1');
});

test('the T3 publication RPC is used only for editorial publications', async () => {
  const calls = [];
  const repository = createRestPublicationRepository({ config: { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'k' },
    fetchImpl: async url => { calls.push(new URL(url).pathname); return { ok: true, json: async () => 'id' }; } });
  const validation = { sourcePublishedAt: candidate().published_at, summary: 's', contentFingerprint: 'a'.repeat(64),
    validationPayload: {}, relevanceTerms: ['payment'] };
  await repository.publish(candidate(), { ...validation, editorial: true }, T3);
  await repository.publish(candidate(), validation, T3);
  assert.deepEqual(calls, ['/rest/v1/rpc/gpir_publish_t3_editorial_candidate', '/rest/v1/rpc/gpir_publish_consolidated_candidate']);
});

test('handler reports editorial availability without affecting the automated batch', async () => {
  const handler = createPublicationHandler({ env: { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' },
    repository: { async candidates() { return []; }, async editorialEntries() { throw new Error('CONTENTFUL_HTTP_500'); } },
    logger: { error() {} } });
  const body = await (await handler(new Request('https://x.test', { method: 'POST', body: '{}' }))).json();
  assert.equal(body.status, 'OK');
  assert.equal(body.editorial.status, 'UNAVAILABLE');
});

test('an approved T3 article older than 12 hours is archived with its original timestamp and never live', () => {
  const publishedAt = new Date(NOW - 13 * 3600 * 1000).toISOString();
  const [record] = normalizeRepositoryRows({ now: NOW, sources: [T3], announcements: [{ id: 'a1', source_id: T3.source_id,
    title: candidate().title, summary_narration: 'PYMNTS reports that the payments network expanded instant settlement to additional corridors for regulated providers.',
    canonical_url: URL_A, published_at: publishedAt, ticker_eligible: false, topic_headers: ['Payments'], publication_status: 'approved' }] });
  assert.equal(record.lifecycleStatus, 'HISTORICAL');
  assert.equal(record.tickerEligible, false);
  assert.equal(record.publishedAt, publishedAt);
});

test('the editorial queue is read-only, lists only T3 candidates and flags existing Contentful entries', async () => {
  const { buildEditorialQueue } = await import('../scripts/m39/list-t3-editorial-queue.mjs');
  const requests = [];
  const linked = candidate();
  const open = candidate({ id: '33333333-3333-4333-8333-333333333333', canonical_url: 'https://www.pymnts.com/news/payments/2026/second/' });
  const queue = await buildEditorialQueue({ now: NOW, env: { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k', CONTENTFUL_SPACE_ID: 's', CONTENTFUL_ENVIRONMENT: 'master', CONTENTFUL_DELIVERY_TOKEN: 'd' },
  fetchImpl: async (url, init = {}) => {
    const parsed = new URL(url); requests.push(init.method || 'GET');
    if (parsed.hostname === 'cdn.contentful.com') return { ok: true, json: async () => ({ items: [{ sys: { id: 'entry-1' }, fields: entry().fields }] }) };
    if (parsed.pathname.endsWith('/source_registry')) return { ok: true, json: async () => [T3] };
    return { ok: true, json: async () => [linked, open] };
  } });
  assert.deepEqual(new Set(requests), new Set(['GET']));
  assert.equal(queue.approved[0].contentfulEntryId, 'entry-1');
  assert.equal(queue.awaiting.length, 1);
  assert.equal(queue.awaiting[0].contentfulDraftFields.supabaseRecordId, open.id);
});
