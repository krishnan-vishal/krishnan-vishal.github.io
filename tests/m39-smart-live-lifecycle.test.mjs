import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleLiveRecords, SMART_TOPICS } from '../assets/js/smart-intelligence.mjs';

test('strict 12-hour live retirement, without deleting historical records', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  const records = [
    { id: 'fresh', publishedAt: new Date(now - 11 * 3600000).toISOString() },
    { id: 'boundary', publishedAt: new Date(now - 12 * 3600000).toISOString() },
    { id: 'future', publishedAt: new Date(now + 1000).toISOString() },
    { id: 'archive', publishedAt: '2026-01-01T00:00:00Z' }
  ];
  assert.deepEqual(eligibleLiveRecords(records, now).map(r => r.id), ['fresh']);
  assert.equal(records.length, 4);
});

test('topic registry is unique and includes approved payments classifications', () => {
  assert.equal(new Set(SMART_TOPICS.map(t => t.id)).size, SMART_TOPICS.length);
  for (const id of ['remittances', 'cross-border', 'payments', 'fintech', 'pass', 'taas', 'saas', 'caas', 'baas', 'pobo', 'cobo', 'payments-licensing', 'fintech-licensing', 'aml', 'fraud', 'bnpl', 'apm', 'payment-gateways']) {
    assert.ok(SMART_TOPICS.some(t => t.id === id), id);
  }
});
