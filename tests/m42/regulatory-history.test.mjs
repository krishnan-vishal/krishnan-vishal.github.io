import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicIntelligenceHandler } from '../../supabase/functions/gpir-public-intelligence/handler.mjs';

test('validated date-only OFAC evidence appears in history and entitled ASK only', async () => {
  const source = { source_id: 'OFAC-US-001', source_name: 'OFAC', trust_tier: 'T1', source_status: 'GREEN' };
  const notice = {
    id: 'reference', source_id: source.source_id, document_kind: 'OFAC_RECENT_ACTION',
    canonical_url: 'https://www.govinfo.gov/content/pkg/FR-2025-10-02/html/2025-19347.htm',
    publication_date: '2025-10-02', published_at: null, publication_precision: 'DATE_ONLY',
    content_sha256: 'a'.repeat(64), validation_state: 'VALIDATED',
    metadata: { reader_reference: true, title: 'OFAC sanctions action', summary: 'Official notice.' }
  };
  const handler = createPublicIntelligenceHandler({
    env: {}, now: () => Date.parse('2026-11-23'),
    entitlement: async ({ accessToken }) => ({ decision: accessToken ? 'ALLOW' : 'DENY' }),
    loadRows: async () => ({
      announcements: [], sources: [source],
      regulatoryDocuments: [notice, { ...notice, id: 'spoof', canonical_url: 'https://example.com/notice' }]
    })
  });
  const get = async (path, headers) =>
    (await handler(new Request('https://fintechoisis.com/?' + path, { headers }))).json();
  const history = await get('scope=history');
  assert.deepEqual(history.records.map(record => record.id), ['reference']);
  assert.equal(history.records[0].publishedAt, null);
  assert.equal(history.records[0].tickerEligible, false);
  assert.equal((await get('scope=history&collection=announcements')).total, 0);
  assert.equal((await get('view=relay')).total, 0);
  assert.equal((await get('view=ask')).total, 0);
  assert.equal((await get('view=ask', { Authorization: 'Bearer subscriber' })).total, 1);
});
