import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSubscriptionAdjustment, saleTransactionIdForAdjustment }
  from '../../supabase/functions/gpir-paypal-webhook/recurring-adjustment.mjs';
import { createPayPalWebhookHandler }
  from '../../supabase/functions/gpir-paypal-webhook/handler.mjs';

const base = 'https://hoewtptllwkcqrgryazu.supabase.co';
const local = '66666666-6666-4666-8666-666666666666';
const readerA = '22222222-2222-4222-8222-222222222222';
const readerB = '33333333-3333-4333-8333-333333333333';
const subscription = 'I-674CH86A89ES';
const transaction = '7UC82239V8074274K';
const refund = '9AA11111BB222222C';
const plan = 'P-SANDBOXPLAN123';
const completedAt = '2026-10-18T12:46:46.000Z';
const eventTime = new Date(Date.now() - 60000).toISOString();
const config = { SUPABASE_URL: base, GPIR_SUPABASE_SECRET_KEY: 'fixture_secret',
  PAYMENT_ENVIRONMENT: 'SANDBOX', PAYPAL_BASE_URL: 'https://api-m.sandbox.paypal.com' };
const env = { SUPABASE_URL: base, GPIR_SUPABASE_PUBLISHABLE_KEY: 'fixture',
  GPIR_SUPABASE_SECRET_KEY: 'fixture_secret', PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_CLIENT_ID: 'fixture', PAYPAL_CLIENT_SECRET: 'fixture',
  PAYPAL_WEBHOOK_ID: 'WH-FIXTURE' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function adjustmentEvent(type = 'PAYMENT.SALE.REFUNDED') {
  return { id: `WH-${type.endsWith('REFUNDED') ? 'REFUND' : 'REVERSAL'}`,
    event_type: type, create_time: eventTime,
    resource: type.endsWith('REFUNDED')
      ? { id: refund, sale_id: transaction }
      : { id: transaction, billing_agreement_id: subscription } };
}

function fixture({ type = 'PAYMENT.SALE.REFUNDED', transactionStatus = 'PARTIALLY_REFUNDED',
  amount = '9.99', currency = 'USD', owner = readerA, lookup = true,
  providerCustomId = local, providerPlan = plan, pages = 1,
  writer = 'RECORDED', writerStatus = 200, signature = 'SUCCESS',
  claim = 'CLAIMED' } = {}) {
  const event = adjustmentEvent(type); const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url); calls.push({ url: value, body: options.body });
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'fixture_token' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: signature });
    if (value.endsWith('/rpc/gpir_claim_paypal_webhook_event_v2')) return json(claim);
    if (value.endsWith('/rpc/gpir_get_subscription_payment_for_webhook_v1'))
      return json(lookup ? [{ local_subscription_id: local, user_id: owner,
        paypal_subscription_id: subscription, paypal_plan_id: plan,
        paypal_transaction_id: transaction, currency: 'USD', gross_amount_minor: 999,
        provider_status: 'COMPLETED', provider_completed_at: completedAt }] : []);
    if (value.endsWith(`/v1/billing/subscriptions/${subscription}`))
      return json({ id: subscription, custom_id: providerCustomId,
        plan_id: providerPlan, status: 'ACTIVE' });
    if (value.includes('/transactions?')) return json({ total_pages: pages,
      transactions: [{ id: transaction, status: transactionStatus, time: completedAt,
        amount_with_breakdown: { gross_amount: { currency_code: currency,
          value: amount } } }] });
    if (value.endsWith('/rpc/gpir_record_subscription_payment_adjustment_v1'))
      return json(writer, writerStatus);
    if (value.endsWith('/rpc/gpir_finish_paypal_webhook_event_v2')) return json(true);
    throw new Error(`Unexpected request ${value}`);
  };
  return { event, calls, fetchImpl };
}

async function run(options) {
  const value = fixture(options);
  const result = await reconcileSubscriptionAdjustment({ event: value.event, config,
    accessToken: 'fixture_token', fetchImpl: value.fetchImpl });
  return { ...value, result,
    write: value.calls.find(call => call.url.endsWith(
      '/rpc/gpir_record_subscription_payment_adjustment_v1')) };
}

test('refund and reversal resource mappings identify the original sale', () => {
  assert.equal(saleTransactionIdForAdjustment(adjustmentEvent()), transaction);
  assert.equal(saleTransactionIdForAdjustment(
    adjustmentEvent('PAYMENT.SALE.REVERSED')), transaction);
  assert.equal(saleTransactionIdForAdjustment({ event_type: 'PAYMENT.SALE.REFUNDED',
    resource: { id: refund } }), null);
});

test('provider-verified partial refund records audit without creating a payment', async () => {
  const result = await run();
  assert.deepEqual(result.result, { ok: true, status: 'RECORDED',
    adjustmentStatus: 'PARTIALLY_REFUNDED' });
  const body = JSON.parse(result.write.body);
  assert.equal(body.p_reader_user_id, readerA);
  assert.equal(body.p_paypal_transaction_id, transaction);
  assert.equal(body.p_resulting_payment_status, 'PARTIALLY_REFUNDED');
  assert.equal(result.calls.some(call => call.url.includes(
    'gpir_record_verified_subscription_payment_v1')), false);
});

test('provider-verified full refund and reversal produce ineligible payment states', async () => {
  const refunded = await run({ transactionStatus: 'REFUNDED' });
  assert.equal(refunded.result.adjustmentStatus, 'REFUNDED');
  const reversed = await run({ type: 'PAYMENT.SALE.REVERSED',
    transactionStatus: 'REFUNDED' });
  assert.equal(reversed.result.adjustmentStatus, 'REVERSED');
  assert.equal(JSON.parse(reversed.write.body).p_adjustment_type, 'REVERSAL');
});

test('duplicate refund is acknowledged without a second payment or audit conflict', async () => {
  const result = await run({ writer: 'DUPLICATE' });
  assert.equal(result.result.status, 'DUPLICATE');
  assert.equal(result.calls.filter(call => call.url.includes(
    'gpir_record_verified_subscription_payment_v1')).length, 0);
});

for (const [name, options] of [
  ['missing payment evidence', { lookup: false }],
  ['wrong subscription owner mapping', { providerCustomId:
    '77777777-7777-4777-8777-777777777777' }],
  ['wrong subscription plan', { providerPlan: 'P-OTHERPLAN123' }],
  ['pending adjustment', { transactionStatus: 'PENDING' }],
  ['incorrect amount', { amount: '1.00' }],
  ['incorrect currency', { currency: 'EUR' }],
  ['ambiguous provider pages', { pages: 2 }],
  ['malformed provider transaction', { transactionStatus: null }],
  ['missing adjustment RPC', { writerStatus: 404 }],
  ['writer conflict', { writer: 'CONFLICT' }]
]) test(`${name} fails closed without cross-reader mutation`, async () => {
  const result = await run(options);
  assert.equal(result.result.ok, false);
  if (!['missing adjustment RPC', 'writer conflict'].includes(name))
    assert.equal(result.write, undefined);
});

test('authoritative lookup scopes the adjustment to Reader A, never Reader B', async () => {
  const result = await run({ owner: readerA });
  const body = JSON.parse(result.write.body);
  assert.equal(body.p_reader_user_id, readerA);
  assert.notEqual(body.p_reader_user_id, readerB);
});

test('signature-verified refund completes the claimed webhook event', async () => {
  const value = fixture({ transactionStatus: 'REFUNDED' });
  const headers = { 'paypal-transmission-id': 'fixture',
    'paypal-transmission-time': eventTime,
    'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'fixture' };
  const request = new Request(`${base}/functions/v1/gpir-paypal-webhook`, {
    method: 'POST', headers, body: JSON.stringify(value.event) });
  const response = await createPayPalWebhookHandler({ env,
    fetchImpl: value.fetchImpl })(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'RECORDED',
    adjustmentStatus: 'REFUNDED' });
  assert.ok(value.calls.some(call => call.url.endsWith(
    '/rpc/gpir_finish_paypal_webhook_event_v2')));
});

test('invalid signature rejects a refund before any reconciliation RPC', async () => {
  const value = fixture({ signature: 'FAILURE' });
  const headers = { 'paypal-transmission-id': 'fixture',
    'paypal-transmission-time': eventTime,
    'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'fixture' };
  const request = new Request(`${base}/functions/v1/gpir-paypal-webhook`, {
    method: 'POST', headers, body: JSON.stringify(value.event) });
  const response = await createPayPalWebhookHandler({ env,
    fetchImpl: value.fetchImpl })(request);
  assert.equal(response.status, 401);
  assert.equal(value.calls.some(call => call.url.includes('/rpc/')), false);
});

test('duplicate provider event is ignored before adjustment processing', async () => {
  const value = fixture({ claim: 'DUPLICATE' });
  const headers = { 'paypal-transmission-id': 'fixture',
    'paypal-transmission-time': eventTime,
    'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'fixture' };
  const request = new Request(`${base}/functions/v1/gpir-paypal-webhook`, {
    method: 'POST', headers, body: JSON.stringify(value.event) });
  const response = await createPayPalWebhookHandler({ env,
    fetchImpl: value.fetchImpl })(request);
  assert.equal(response.status, 200);
  assert.equal(value.calls.some(call => call.url.endsWith(
    '/rpc/gpir_record_subscription_payment_adjustment_v1')), false);
});
