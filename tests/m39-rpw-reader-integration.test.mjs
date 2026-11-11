import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRpwReferenceRows, createPublicIntelligenceHandler } from '../supabase/functions/gpir-public-intelligence/handler.mjs';
import { normalizeSmartRecords, evidenceKind, fetchHistory } from '../assets/js/smart-intelligence.mjs';

const catalog = 'https://datacatalog.worldbank.org/search/dataset/0037898/remittance-prices-worldwide';
const workbook = 'https://datacatalogfiles.worldbank.org/ddh-published/0037898/DR0095523/rpw_dataset_2011_2025_q3.xlsx';
const source = {
  source_id: 'WORLD-BANK-RPW-001', source_name: 'World Bank Remittance Prices Worldwide',
  source_status: 'GREEN', trust_tier: 'T1', official_url: catalog,
  category: 'Statistical Authority'
};
const row = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', source_id: 'WORLD-BANK-RPW-001',
  raw_title: 'RPW Angola → Namibia — 2021-Q4 average $200 transfer cost',
  canonical_url: catalog, ingestion_status: 'PROCESSED',
  metadata: {
    provider: 'WORLD_BANK_RPW', data_class: 'STATISTICAL_REFERENCE',
    record_type: 'RPW_CORRIDOR_QUARTER', publication_eligible: false, alert_eligible: false,
    source_url: workbook, catalog_url: catalog, topic: 'Remittances & Diaspora',
    observation_period: '2021-Q4', observation_date: '2021-12-31',
    sending_country_code: 'AGO', sending_country: 'Angola',
    receiving_country_code: 'NAM', receiving_country: 'Namibia',
    source_region: 'Sub-Saharan Africa', destination_region: 'Sub-Saharan Africa',
    value: 14.5, quote_count: 1
  }
};

test('World Bank RPW historical rows become verified non-alert reader references', () => {
  const records = normalizeRpwReferenceRows({ rows: [row], sources: [source] });
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.recordType, 'RPW_CORRIDOR_QUARTER');
  assert.equal(record.dataClass, 'STATISTICAL_REFERENCE');
  assert.equal(record.displayLifecycleStatus, 'ARCHIVED');
  assert.equal(record.tickerEligible, false);
  assert.equal(record.observationPeriod, '2021-Q4');
  assert.equal(record.observationDate, '2021-12-31');
  assert.equal(record.providerReleaseDate, null);
  assert.equal(record.statisticalValue, 14.5);
  assert.match(record.summary, /not an actual survey or publication date/);
  const [card] = normalizeSmartRecords({ status: 'OK', records });
  assert.equal(card.statisticalValue, 14.5);
  assert.equal(card.dataClass, 'STATISTICAL_REFERENCE');
  assert.match(evidenceKind(card).label, /World Bank RPW/);
  assert.doesNotMatch(evidenceKind(card).note, /BIS/);
});

test('Fail closed on unauthorized, false-dated or nonofficial RPW lookalikes', () => {
  assert.deepEqual(normalizeRpwReferenceRows({ rows: [
    { ...row, ingestion_status: 'RAW' },
    { ...row, metadata: { ...row.metadata, publication_eligible: true } },
    { ...row, metadata: { ...row.metadata, source_url: 'https://example.org/spoofed.xlsx' } },
    { ...row, metadata: { ...row.metadata, observation_date: '2021-11-15' } }
  ], sources: [source] }), []);
  assert.deepEqual(normalizeRpwReferenceRows({ rows: [row], sources: [
    { ...source, source_status: 'AMBER' }
  ] }), []);
});

test('Existing history API search returns RPW references without promoting them to LIVE', async () => {
  const loadRows = async () => ({
    announcements: [], sources: [source], topics: [], developments: [], topicSources: [],
    statisticalObservations: [row]
  });
  const handler = createPublicIntelligenceHandler({ env: {}, loadRows, now: () => Date.parse('2026-11-11T12:00:00Z') });
  const response = await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?scope=history&q=Angola&limit=100'));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.total, 1);
  assert.equal(result.records[0].recordType, 'RPW_CORRIDOR_QUARTER');
  assert.equal(result.records[0].tickerEligible, false);
  const relay = await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=relay'));
  assert.equal(relay.status, 200);
  assert.equal((await relay.json()).items.length, 0);
});


test('Smart history paginates the complete RPW and BIS repository past 5,000 records', async () => {
  const total = 6174;
  const all = Array.from({ length: total }, (_, i) => ({
    id: String(i), title: 'GPIR verified historical statistical reference ' + i,
    summary: 'Official historical statistical reference, not a contemporary publication or news alert.',
    publishedAt: '2025-09-30T00:00:00.000Z', canonicalUrl: catalog,
    dataClass: 'STATISTICAL_REFERENCE', recordType: 'RPW_CORRIDOR_QUARTER',
    category: 'Remittances & Diaspora',
    source: { name: 'World Bank Remittance Prices Worldwide', trustTier: 'T1' }
  }));
  const offsets = [];
  const fetchImpl = async url => {
    const u = new URL(url);
    const offset = Number(u.searchParams.get('offset'));
    const limit = Number(u.searchParams.get('limit'));
    offsets.push(offset);
    assert.equal(limit, 1000);
    return { ok: true, json: async () => ({
      status: 'OK', total, records: all.slice(offset, offset + limit)
    }) };
  };
  const result = await fetchHistory(fetchImpl, 'https://qlnvhfapctcpzqyuhhth.supabase.co');
  assert.equal(result.length, total);
  assert.deepEqual(offsets, [0, 1000, 2000, 3000, 4000, 5000, 6000]);
});
