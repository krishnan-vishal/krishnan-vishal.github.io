import assert from 'node:assert/strict';
import test from 'node:test';
import { createRestPublicationRepository, processCandidate } from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { normalizeRepositoryRows, PUBLIC_REPOSITORY_WINDOW_DAYS } from '../../supabase/functions/gpir-public-intelligence/handler.mjs';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const SOURCE = Object.freeze({
  source_id: 'CB-TEST-001',
  source_name: 'Example Central Bank',
  official_url: 'https://centralbank.example',
  trust_tier: 'T1',
  source_status: 'GREEN'
});

function candidate(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    source_id: SOURCE.source_id,
    canonical_url: 'https://centralbank.example/notices/instant-payments',
    title: 'Central bank publishes verified instant-payment operating rules',
    published_at: new Date(NOW - 60 * 60 * 1000).toISOString(),
    category: 'PAYMENT_INFRASTRUCTURE',
    confidence_score: 95,
    candidate_status: 'PENDING',
    content_fingerprint: 'a'.repeat(64),
    ...overrides
  };
}

function articleHtml(item) {
  const body = [
    'The central bank states that the instant payment system will introduce verified settlement controls, participant testing, operational monitoring and documented contingency procedures for regulated payment providers.',
    'The published payment rules require banks and fintech participants to complete certification, maintain fraud controls and report material service incidents before connecting to the real-time payment infrastructure.',
    'The authority explains that the implementation schedule applies to settlement participants and that compliance evidence must be retained throughout the launch and subsequent operating period.',
    'The notice also describes governance expectations for cross-border payment messages, liquidity management and customer-protection processes used by participating institutions.'
  ].join(' ');
  return `<!doctype html><html><head>
    <link rel="canonical" href="${item.canonical_url}">
    <meta property="article:published_time" content="${item.published_at}">
    <script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle',
      datePublished: item.published_at, articleBody: body })}</script>
  </head><body><article><h1>${item.title}</h1><p>${body}</p></article></body></html>`;
}

function sourceFetch(item, { insufficient = false } = {}) {
  const html = insufficient
    ? `<html><head><link rel="canonical" href="${item.canonical_url}"><meta property="article:published_time" content="${item.published_at}"></head><body><article>Payment update.</article></body></html>`
    : articleHtml(item);
  return async () => ({
    ok: true,
    status: 200,
    url: item.canonical_url,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => html
  });
}

function repository({ duplicate = false } = {}) {
  const events = [];
  return {
    events,
    async start(item) { events.push(['start', item.id]); },
    async source() { return SOURCE; },
    async duplicate() { return duplicate; },
    async record(item, validation) { events.push(['record', item.id, validation.decision, validation.reasonCode]); },
    async publish(item, validation) {
      events.push(['publish', item.id, validation.sourcePublishedAt, validation.summary]);
      return '22222222-2222-4222-8222-222222222222';
    }
  };
}

function announcement(item, overrides = {}) {
  return {
    id: item.id,
    source_id: item.source_id,
    title: item.title,
    summary_narration: 'Verified payment intelligence remains available as historical intelligence after the live alert period expires.',
    canonical_url: item.canonical_url,
    published_at: item.published_at,
    ticker_eligible: true,
    topic_headers: [item.category],
    publication_status: 'approved',
    ...overrides
  };
}

test('valid source evidence produces one governed publication', async () => {
  const item = candidate();
  const store = repository();
  const outcome = await processCandidate({ candidate: item, repository: store,
    fetchImpl: sourceFetch(item), now: () => NOW });
  assert.equal(outcome.decision, 'PUBLISHED');
  assert.equal(outcome.sourcePublishedAt, item.published_at);
  assert.match(outcome.summary, /^Example Central Bank reports:/);
  assert.ok(outcome.summary.length > item.title.length);
  assert.equal(store.events.filter(event => event[0] === 'publish').length, 1);
});

test('canonical or content duplicate is rejected before publication', async () => {
  const item = candidate({ id: '33333333-3333-4333-8333-333333333333' });
  const store = repository({ duplicate: true });
  const outcome = await processCandidate({ candidate: item, repository: store,
    fetchImpl: sourceFetch(item), now: () => NOW });
  assert.equal(outcome.decision, 'DUPLICATE');
  assert.equal(outcome.reasonCode, 'DUPLICATE_PUBLICATION');
  assert.equal(store.events.some(event => event[0] === 'publish'), false);
  assert.equal(store.events.some(event => event[0] === 'record' && event[2] === 'DUPLICATE'), true);
});

test('headline-only or insufficient source evidence remains awaiting review', async () => {
  const item = candidate({ id: '44444444-4444-4444-8444-444444444444' });
  const store = repository();
  const outcome = await processCandidate({ candidate: item, repository: store,
    fetchImpl: sourceFetch(item, { insufficient: true }), now: () => NOW });
  assert.equal(outcome.decision, 'REVIEW');
  assert.equal(outcome.reasonCode, 'INSUFFICIENT_SOURCE_EVIDENCE');
  assert.equal(store.events.some(event => event[0] === 'publish'), false);
});

test('candidate below its governed threshold is held for review without a source request', async () => {
  const item = candidate({
    id: '99999999-9999-4999-8999-999999999999',
    confidence_score: 60
  });
  const store = repository();
  let sourceRequests = 0;
  const outcome = await processCandidate({
    candidate: item,
    repository: store,
    fetchImpl: async () => {
      sourceRequests += 1;
      throw new Error('source request should not run');
    },
    now: () => NOW
  });
  assert.equal(outcome.decision, 'REVIEW');
  assert.equal(outcome.reasonCode, 'AUTO_PUBLICATION_THRESHOLD_NOT_MET');
  assert.equal(outcome.validationPayload.source_verified, false);
  assert.equal(sourceRequests, 0);
});

test('candidate selection pages audit lookups instead of building one oversized URL', async () => {
  const candidates = Array.from({ length: 120 }, (_value, index) => ({
    ...candidate(),
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    published_at: new Date(NOW - (120 - index) * 60000).toISOString()
  }));
  const requestedAuditUrls = [];
  const fetchImpl = async url => {
    const requestUrl = new URL(url);
    if (requestUrl.pathname.endsWith('/intelligence_candidates')) {
      const offset = Number(requestUrl.searchParams.get('offset') || 0);
      const limit = Number(requestUrl.searchParams.get('limit') || 50);
      return { ok: true, json: async () => candidates.slice(offset, offset + limit) };
    }
    if (requestUrl.pathname.endsWith('/intelligence_publication_audits')) {
      requestedAuditUrls.push(requestUrl.href);
      const ids = (requestUrl.searchParams.get('candidate_id') || '')
        .replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
      return {
        ok: true,
        json: async () => ids.slice(0, Math.max(0, 100 - Number(ids[0].slice(-12)) + 1))
          .map(candidateId => ({ candidate_id: candidateId, decision: 'REVIEW' }))
      };
    }
    throw new Error(`Unexpected request: ${requestUrl.href}`);
  };
  const store = createRestPublicationRepository({
    config: { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'service-role-test' },
    fetchImpl
  });
  const selected = await store.candidates({ limit: 5, from: null, to: null });
  assert.deepEqual(selected.map(item => Number(item.id.slice(-12))), [101, 102, 103, 104, 105]);
  assert.equal(requestedAuditUrls.length, 3);
  assert.ok(requestedAuditUrls.every(url => url.length < 3000));
});

test('publication older than 12 hours is retained by the repository but not live', async () => {
  const item = candidate({
    id: '55555555-5555-4555-8555-555555555555',
    published_at: new Date(NOW - 13 * 60 * 60 * 1000).toISOString()
  });
  const store = repository();
  const outcome = await processCandidate({ candidate: item, repository: store,
    fetchImpl: sourceFetch(item), now: () => NOW });
  assert.equal(outcome.decision, 'PUBLISHED');
  const records = normalizeRepositoryRows({
    now: NOW,
    sources: [SOURCE],
    announcements: [{
      id: outcome.announcementId,
      source_id: item.source_id,
      title: item.title,
      summary_narration: outcome.summary,
      canonical_url: item.canonical_url,
      published_at: outcome.sourcePublishedAt,
      ticker_eligible: true,
      topic_headers: [item.category],
      publication_status: 'approved'
    }]
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].lifecycleStatus, 'HISTORICAL');
  assert.equal(records[0].tickerEligible, false);
});

test('public repository includes the 15-day boundary and excludes older retained records', () => {
  const boundary = candidate({
    id: '66666666-6666-4666-8666-666666666666',
    published_at: new Date(NOW - PUBLIC_REPOSITORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  });
  const outside = candidate({
    id: '77777777-7777-4777-8777-777777777777',
    published_at: new Date(Date.parse(boundary.published_at) - 1).toISOString()
  });
  const inside = candidate({
    id: '88888888-8888-4888-8888-888888888888',
    published_at: new Date(NOW - 14 * 24 * 60 * 60 * 1000).toISOString()
  });
  const records = normalizeRepositoryRows({
    now: NOW,
    sources: [SOURCE],
    announcements: [announcement(boundary), announcement(outside), announcement(inside)]
  });
  assert.deepEqual(records.map(record => record.id), [boundary.id, inside.id]);
  assert.ok(records.every(record => record.lifecycleStatus === 'HISTORICAL'));
});
