import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  HYPERSWITCH_SOURCE_ID,
  MOJALOOP_SOURCE_ID,
  createPublicIntelligenceHandler,
  normalizeRepositoryRows,
  normalizeTechnicalReferenceRows
} from '../../supabase/functions/gpir-public-intelligence/handler.mjs';
import { normalizeSmartRecords } from '../../assets/js/smart-intelligence.mjs';

const sources = [
  { source_id: MOJALOOP_SOURCE_ID, source_name: 'Mojaloop official repositories',
    official_url: 'https://github.com/mojaloop/helm', source_status: 'GREEN',
    category: 'Technical Reference', trust_tier: 'T2' },
  { source_id: HYPERSWITCH_SOURCE_ID, source_name: 'Hyperswitch official repository',
    official_url: 'https://github.com/juspay/hyperswitch', source_status: 'GREEN',
    category: 'Technical Reference', trust_tier: 'T2' }
];

const mojaloop = {
  id: '11111111-1111-4111-8111-111111111111', source_id: MOJALOOP_SOURCE_ID,
  raw_title: 'Mojaloop v17.2.0 release', ingestion_status: 'PROCESSED',
  canonical_url: 'https://github.com/mojaloop/helm/releases/tag/v17.2.0',
  source_published_at: '2026-05-04T16:06:41Z',
  metadata: { provider: 'MOJALOOP', data_class: 'TECHNICAL_REFERENCE',
    record_type: 'SOFTWARE_RELEASE', topic: 'Payment infrastructure',
    repository: 'mojaloop/helm', publication_eligible: false, alert_eligible: false,
    settlement_telemetry: false }
};

const hyperswitch = {
  id: '22222222-2222-4222-8222-222222222222', source_id: HYPERSWITCH_SOURCE_ID,
  raw_title: 'Hyperswitch change 2e1e7bd63a86', ingestion_status: 'PROCESSED',
  canonical_url: 'https://github.com/juspay/hyperswitch/commit/2e1e7bd63a8614fce68fbd1f0780dd83b79c703f',
  source_published_at: null,
  metadata: { provider: 'HYPERSWITCH', data_class: 'TECHNICAL_REFERENCE',
    record_type: 'TECHNICAL_CHANGE', topic: 'Payment orchestration',
    repository: 'juspay/hyperswitch', commit_timestamp: '2026-03-28T12:02:30Z',
    publication_eligible: false, alert_eligible: false, settlement_telemetry: false }
};

test('verified technical records enter historical reference views but never Global Alerts', () => {
  const records = normalizeTechnicalReferenceRows({ rows: [mojaloop, hyperswitch], sources });
  assert.equal(records.length, 2);
  assert.ok(records.every(record => record.dataClass === 'TECHNICAL_REFERENCE'));
  assert.ok(records.every(record => record.displayLifecycleStatus === 'ARCHIVED'));
  assert.ok(records.every(record => record.tickerEligible === false));
  assert.ok(records.every(record => record.alertEligible === false));
  assert.ok(records.every(record => record.settlementTelemetry === false));
  assert.match(records[0].summary, /not live settlement telemetry/i);
  const cards = normalizeSmartRecords({ status: 'OK', records });
  assert.equal(cards.length, 2);
  assert.ok(cards.some(card => card.topicIds.includes('infrastructure')));
  assert.ok(cards.every(card => !card.topicIds.includes('regulatory')));
  assert.ok(cards.every(card => card.topicIds.length === 1));
  assert.ok(cards.every(card => card.dataClass === 'TECHNICAL_REFERENCE'));
});

test('technical references require the explicit reference history view', () => {
  const records = normalizeRepositoryRows({ announcements: [], sources,
    statisticalObservations: [mojaloop, hyperswitch], now: Date.parse('2026-11-08T08:00:00Z'),
    windowDays: null });
  assert.deepEqual(records, []);
  const references = normalizeRepositoryRows({ announcements: [], sources,
    statisticalObservations: [mojaloop, hyperswitch], now: Date.parse('2026-11-08T08:00:00Z'),
    windowDays: null, includeReferences: true });
  assert.deepEqual(references.map(record => record.id), [mojaloop.id, hyperswitch.id]);
});

test('archive and relay exclude raw reference history while reference view preserves it', async () => {
  const announcement = {
    id: 'legitimate-hyperswitch-development',
    source_id: HYPERSWITCH_SOURCE_ID,
    title: 'Hyperswitch payment infrastructure development',
    summary_narration: 'An independently reviewed payments-sector development with source-backed context and editorial approval.',
    canonical_url: 'https://github.com/juspay/hyperswitch/releases/tag/v17.2.0',
    published_at: '2026-11-08T04:00:00Z',
    ticker_eligible: true,
    publication_status: 'approved',
    topic_headers: ['Payment infrastructure']
  };
  const candidate = { id: '33333333-3333-4333-8333-333333333333', source_id: announcement.source_id, title: announcement.title,
    canonical_url: announcement.canonical_url, published_at: announcement.published_at };
  const authority = [{ row: { candidate_id: candidate.id, record_id: 'publication-record',
    publication_id: 'governed-publication', entry_reference: 'space/master/approved-entry' },
    entry: { entryId: 'approved-entry', fields: { publicationType: 'Intelligence Brief',
      useCasePaymentCategory: 'B2B', publicationTitle: announcement.title, executiveSummary: announcement.summary_narration,
      legacySourceUrl: candidate.canonical_url } } }];
  const publicationAudits = [{ candidate_id: candidate.id, announcement_id: announcement.id,
    decision: 'PUBLISHED', validation_payload: { source_verified: true, canonical_verified: true,
      timestamp_verified: true, content_verified: true, relevance_verified: true, summary_grounded: true, editorial_verified: true,
      editorial_entry_reference: authority[0].row.entry_reference, editorial_entry_id: 'approved-entry',
      editorial_publication_id: 'governed-publication', editorial_supabase_record_id: 'publication-record',
      editorial_source_url: candidate.canonical_url } }];
  const handler = createPublicIntelligenceHandler({
    env: {},
    now: () => Date.parse('2026-11-08T08:00:00Z'),
    loadAuthority: async () => authority,
    loadRows: async () => ({ announcements: [announcement], sources, candidates: [candidate],
      publicationAudits, statisticalObservations: [mojaloop, hyperswitch] })
  });
  const archive = await (await handler(new Request('https://example.test/?scope=history'))).json();
  assert.equal(archive.total, 1);
  assert.equal(archive.records[0].id, announcement.id);
  assert.equal(archive.source, 'global_announcements');
  const relay = await (await handler(new Request('https://example.test/?view=relay'))).json();
  assert.equal(relay.total, 1);
  const references = await (await handler(new Request('https://example.test/?view=references'))).json();
  assert.equal(references.source, 'verified_reference_history');
  assert.deepEqual(references.records.map(record => record.id), [mojaloop.id, hyperswitch.id]);
  assert.ok(references.records.every(record => record.tickerEligible === false));
});

test('publication-eligible, telemetry-shaped and off-repository lookalikes fail closed', () => {
  const invalid = [
    { ...mojaloop, metadata: { ...mojaloop.metadata, publication_eligible: true } },
    { ...mojaloop, id: 'two', metadata: { ...mojaloop.metadata, settlement_telemetry: true } },
    { ...hyperswitch, id: 'three', canonical_url: 'https://example.org/commit/2e1e7bd63a8614fce68fbd1f0780dd83b79c703f' }
  ];
  assert.deepEqual(normalizeTechnicalReferenceRows({ rows: invalid, sources }), []);
});

test('history query requests all verified reference sources through the existing endpoint', () => {
  const handler = fs.readFileSync(new URL('../../supabase/functions/gpir-public-intelligence/handler.mjs', import.meta.url), 'utf8');
  assert.match(handler, /source_id:\s*`in\.\(\$\{REFERENCE_SOURCE_IDS\.join\(','\)\}\)`/);
  assert.doesNotMatch(handler, /TECHNICAL_REFERENCE[\s\S]{0,400}tickerEligible:\s*true/);
});
