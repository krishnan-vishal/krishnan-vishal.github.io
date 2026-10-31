import assert from 'node:assert/strict';
import test from 'node:test';
import { processCandidate } from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { normalizeRepositoryRows } from '../../supabase/functions/gpir-public-intelligence/handler.mjs';

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
