import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(directory,
  '../../supabase/migrations/20261025000100_m37_g103_recurring_adjustments.sql'), 'utf8');
const handler = fs.readFileSync(path.join(directory,
  '../../supabase/functions/gpir-paypal-webhook/handler.mjs'), 'utf8');

test('webhook v3 contract adds authoritative user_id without replacing v2', () => {
  assert.match(migration,
    /gpir_get_paypal_subscription_for_webhook_v3[\s\S]*returns table\([\s\S]*user_id uuid/i);
  assert.match(migration,
    /subscription\.status, subscription\.user_id[\s\S]*subscription\.id = p_local_subscription_id/i);
  assert.doesNotMatch(migration, /drop function[\s\S]*webhook_v2/i);
});

test('adjustment audit is environment-scoped, idempotent and inaccessible to readers', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration,
    /unique \(environment, provider_event_id\)[\s\S]*unique \(environment, adjustment_type, paypal_adjustment_id\)/i);
  assert.match(migration,
    /revoke all on table public\.gpir_subscription_payment_adjustments[\s\S]*from public, anon, authenticated/i);
  assert.match(migration,
    /gpir_record_subscription_payment_adjustment_v1[\s\S]*to service_role/i);
});

test('partial refund preserves entitlement period while latest full loss expires it', () => {
  assert.match(migration,
    /if p_resulting_payment_status in \('REFUNDED', 'REVERSED'\)[\s\S]*not exists[\s\S]*newer\.provider_completed_at > selected_evidence\.provider_completed_at/i);
  assert.match(migration,
    /set effective_until = least\(coalesce\(effective_until, now\(\)\), now\(\)\)/i);
  assert.doesNotMatch(migration,
    /p_resulting_payment_status = 'PARTIALLY_REFUNDED'[\s\S]{0,160}set effective_until/i);
});

test('sale completion and adjustments are distinct webhook paths', () => {
  assert.match(handler, /event\.event_type === 'PAYMENT\.SALE\.COMPLETED'/);
  assert.match(handler, /'PAYMENT\.SALE\.REFUNDED', 'PAYMENT\.SALE\.REVERSED'/);
  assert.match(handler, /reconcileSubscriptionAdjustment/);
});
