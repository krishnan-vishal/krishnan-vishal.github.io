import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBisReferenceRows } from '../supabase/functions/gpir-public-intelligence/handler.mjs';
import { normalizeSmartRecords } from '../assets/js/smart-intelligence.mjs';

const source = {
  source_id: 'BIS-GLOBAL-001', source_name: 'Bank for International Settlements',
  official_url: 'https://data.bis.org/', source_status: 'GREEN', trust_tier: 'T1',
  category: 'Statistical Authority'
};
const row = {
  id: '11111111-1111-4111-8111-111111111111', source_id: 'BIS-GLOBAL-001',
  raw_title: 'India - Volume of cashless payments, credit transfers', ingestion_status: 'PROCESSED',
  metadata: {
    provider: 'BIS', data_class: 'STATISTICAL_REFERENCE', publication_eligible: false,
    alert_eligible: false, dataflow: 'WS_CPMI_CASHLESS', topic: 'Payments',
    observation_period: '2024', observation_date: '2024-12-31',
    provider_release_date: '2026-04-27', country_code: 'IN', value: 123.45,
    unit_measure: '373', unit_multiplier: '6',
    source_url: 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CPMI_CASHLESS/1.0/*?c%5BREP_CTY%5D=IN',
    dimensions: { FREQ: 'A', REP_CTY: 'IN' }
  }
};

test('BIS observations are historical statistical references, never alerts', () => {
  const [record] = normalizeBisReferenceRows({ rows: [row], sources: [source] });
  assert.equal(record.dataClass, 'STATISTICAL_REFERENCE');
  assert.equal(record.lifecycleStatus, 'HISTORICAL');
  assert.equal(record.tickerEligible, false);
  assert.equal(record.observationPeriod, '2024');
  assert.equal(record.providerReleaseDate, '2026-04-27');
  assert.equal(record.statisticalValue, 123.45);
  const [card] = normalizeSmartRecords({ status: 'OK', records: [record] });
  assert.equal(card.dataClass, 'STATISTICAL_REFERENCE');
  assert.equal(card.observationPeriod, '2024');
  assert.ok(card.topicIds.includes('payments'));
});

test('unverified or publication-eligible lookalikes cannot enter BIS reader records', () => {
  assert.deepEqual(normalizeBisReferenceRows({ rows: [
    { ...row, metadata: { ...row.metadata, publication_eligible: true } },
    { ...row, id: 'two', ingestion_status: 'RAW' },
    { ...row, id: 'three', metadata: { ...row.metadata, source_url: 'https://example.org/data' } }
  ], sources: [source] }), []);
});
