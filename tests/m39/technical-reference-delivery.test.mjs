import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  HYPERSWITCH_SOURCE_ID,
  MOJALOOP_SOURCE_ID,
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
  assert.ok(cards.every(card => card.dataClass === 'TECHNICAL_REFERENCE'));
});

test('technical references share the existing governed history response with announcements', () => {
  const records = normalizeRepositoryRows({ announcements: [], sources,
    statisticalObservations: [mojaloop, hyperswitch], now: Date.parse('2026-11-08T08:00:00Z'),
    windowDays: null });
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(record => record.id), [mojaloop.id, hyperswitch.id]);
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

