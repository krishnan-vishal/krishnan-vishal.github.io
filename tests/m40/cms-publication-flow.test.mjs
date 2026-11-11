import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchEditorialEntriesForCandidate, fetchPublishedEditorialEntries }
  from '../../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { processEditorialApprovals } from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { createPublicIntelligenceHandler } from '../../supabase/functions/gpir-public-intelligence/handler.mjs';
import { createProtectedPublicationHandler } from '../../supabase/functions/gpir-protected-publication/handler.mjs';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const id = '11111111-1111-4111-8111-111111111111';
const recordId = '44444444-4444-4444-8444-444444444444';
const publicationId = 'VK-GPIR-P-000000000001-8';
const lineageId = 'VK-GPIR-LINEAGE-000001';
const url = 'https://www.pymnts.com/news/payments/verified-initiative/';
const candidate = {
  id, source_id: 'PYMNTS-GLOBAL-004', canonical_url: url, candidate_status: 'REVIEW',
  title: 'Payments network expands cross-border settlement',
  published_at: '2026-11-10T10:00:00.000Z', confidence_score: 40, category: 'Payments'
};
const source = { source_id: candidate.source_id, source_name: 'PYMNTS', official_url: 'https://www.pymnts.com',
  source_status: 'GREEN', trust_tier: 'T3' };
const article = [
  'The payments network announced that instant settlement will extend to additional cross-border corridors for banks, wallets and merchants across several markets.',
  'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the expanded real-time payment rail.',
  'Executives explained that the rollout will be phased and that card, wallet and bank transfer flows will share common reconciliation and reporting standards.',
  'The company also described governance arrangements for remittance partners, regulators and fintech participants supporting the new payment infrastructure.'
].join(' ');

function fixture(status) {
  const config = { spaceId: 'space', environment: 'master', token: 'delivery-fixture' };
  const entry = { sys: { id: `gpir-t3-${id}`, updatedAt: '2026-11-10T11:00:00Z' }, fields: {
    gpirPublicationId: publicationId, supabaseRecordId: recordId, editionLineageId: lineageId,
    publicationType: 'Intelligence', legacySourceUrl: url,
    publicationStatus: 'CURRENT', validationStatus: status,
    sourceValidationSummary: 'Editor checked the original source and its payments-sector relevance.'
  } };
  const identity = { supabaseRecordId: recordId, gpirPublicationId: publicationId,
    editionLineageId: lineageId, candidateId: id, entryReference: `space/master/${entry.sys.id}` };
  const announcements = [];
  let audit = null;
  const fetchImpl = async requestUrl => {
    const target = new URL(requestUrl);
    if (target.hostname === 'cdn.contentful.com')
      return Response.json({ total: 1, items: [entry] });
    if (target.href === url)
      return new Response(`<link rel="canonical" href="${url}"><meta property="article:published_time" content="${candidate.published_at}"><article>${article}</article>`,
        { headers: { 'content-type': 'text/html' } });
    throw new Error(`Unexpected fixture request: ${target.hostname}`);
  };
  const repository = {
    editorialEntries: () => fetchPublishedEditorialEntries({ config, fetchImpl }),
    freshEditorialEntry: async () => (await fetchPublishedEditorialEntries({ config, fetchImpl }))[0],
    editorialEntriesFor: item => fetchEditorialEntriesForCandidate({ config, fetchImpl, candidate: item, recordId }),
    registerEditorialIdentity: async () => identity,
    candidate: async candidateId => candidateId === id ? candidate : null,
    source: async () => source,
    audit: async () => audit,
    start: async () => {},
    duplicate: async () => false,
    record: async (_candidate, validation) => { audit = { candidate_id: id, decision: validation.decision,
      reason_code: validation.reasonCode, validation_payload: validation.validationPayload }; },
    publish: async (_candidate, validation) => {
      audit = { candidate_id: id, announcement_id: '22222222-2222-4222-8222-222222222222',
        decision: 'PUBLISHED', reason_code: validation.reasonCode, validation_payload: validation.validationPayload };
      announcements.push({
        id: '22222222-2222-4222-8222-222222222222', source_id: source.source_id,
        title: candidate.title, summary_narration: validation.summary, canonical_url: validation.canonicalUrl,
        published_at: validation.sourcePublishedAt, ticker_eligible: true,
        topic_headers: ['Payments'], publication_status: 'approved'
      });
      return announcements[0].id;
    }
  };
  return { repository, fetchImpl, announcements, identity, entry, getAudit: () => audit };
}

async function publicRecords(state, now = NOW) {
  const handler = createPublicIntelligenceHandler({ env: {}, now: () => now,
    loadAuthority: async () => [{ row: { record_id: recordId, publication_id: publicationId,
      candidate_id: id, entry_reference: state.identity.entryReference },
      entry: { entryId: state.entry.sys.id, fields: state.entry.fields } }],
    loadRows: async () => ({ announcements: state.announcements, sources: [source],
      candidates: [candidate], publicationAudits: state.getAudit() ? [state.getAudit()] : [] }) });
  const response = await handler(new Request('https://example.test/?scope=history'));
  assert.equal(response.status, 200);
  return (await response.json()).records;
}

test('published, approved CMS entry passes source validation into the existing reader API', async () => {
  const state = fixture('PASS');
  const result = await processEditorialApprovals({ repository: state.repository, fetchImpl: state.fetchImpl, now: () => NOW });
  assert.equal(result.published, 1);
  assert.equal((await processEditorialApprovals({ repository: state.repository, fetchImpl: state.fetchImpl, now: () => NOW })).published, 0);
  const records = await publicRecords(state);
  assert.equal(records.length, 1);
  assert.equal(records[0].publishedAt, candidate.published_at);
  assert.equal(records[0].tickerEligible, true);
  assert.equal((await publicRecords(state, NOW + 11 * 3600000))[0].tickerEligible, false);
});

test('a CMS entry without explicit editorial approval never reaches the reader API', async () => {
  const state = fixture('Pending');
  const result = await processEditorialApprovals({ repository: state.repository, fetchImpl: state.fetchImpl, now: () => NOW });
  assert.equal(result.published, 0);
  assert.equal(result.outcomes[0].reasonCode, 'EDITORIAL_IDENTITY_REVIEW_REQUIRED');
  assert.deepEqual(await publicRecords(state), []);
});

test('owner-authored published Contentful content is available through the existing entitled publication API', async () => {
  const calls = [];
  const env = { SUPABASE_URL: 'https://example.supabase.co', GPIR_SUPABASE_PUBLISHABLE_KEY: 'test-key',
    CONTENTFUL_SPACE_ID: 'space', CONTENTFUL_ENVIRONMENT: 'master', CONTENTFUL_DELIVERY_TOKEN: 'delivery-fixture' };
  const fetchImpl = async requestUrl => {
    const target = String(requestUrl);
    calls.push(target);
    if (target.includes('/auth/v1/user'))
      return Response.json({ id: '33333333-3333-4333-8333-333333333333' });
    if (target.includes('/rpc/resolve_publication_entitlement')) return Response.json([{ decision: 'ALLOW' }]);
    if (target.startsWith('https://cdn.contentful.com/')) return Response.json({ items: [{
      sys: { id: 'owner-entry' }, fields: { gpirPublicationId: publicationId, supabaseRecordId: id,
        publicationTitle: 'Owner-authored payments research', publicationType: 'Research Chapter',
        executiveSummary: 'Owner editorial summary', sourceValidationSummary: 'Owner-verified source evidence.' }
    }] });
    throw new Error('Unexpected owner fixture request');
  };
  const handler = createProtectedPublicationHandler({ env, fetchImpl });
  const response = await handler(new Request('https://example.test/', {
    method: 'POST', headers: { authorization: 'Bearer fixture-token', 'content-type': 'application/json' },
    body: JSON.stringify({ publicationId, supabaseRecordId: id })
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.publication.title, 'Owner-authored payments research');
  assert.ok(calls.every(call => !call.includes('intelligence_candidates')));
});
