import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnetimeCreateOrderHandler }
  from '../../supabase/functions/gpir-onetime-create-order/handler.mjs';
import { createOnetimeCaptureOrderHandler }
  from '../../supabase/functions/gpir-onetime-capture-order/handler.mjs';
import { createOnetimeWebhookHandler }
  from '../../supabase/functions/gpir-onetime-webhook/handler.mjs';
import { createReaderSummaryHandler }
  from '../../supabase/functions/gpir-reader-summary/handler.mjs';
import { sha256Hex } from '../../supabase/functions/_shared/gpir-onetime-production.mjs';
import { normalizeReaderSummary }
  from '../../assets/js/gpir-reader-dashboard.mjs';

const origin = 'https://fintechoisis.com';
const supabaseUrl = 'https://qlnvhfapctcpzqyuhhth.supabase.co';
const userId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const orderUuid = '33333333-3333-4333-8333-333333333333';
const offerUuid = '44444444-4444-4444-8444-444444444444';
const recordUuid = '55555555-5555-4555-8555-555555555555';
const entitlementUuid = '66666666-6666-4666-8666-666666666666';
const paypalOrderId = 'PAYPAL-ORDER-123';
const captureId = 'PAYPAL-CAPTURE-123';
const effectiveFrom = '2026-10-28T00:00:00.000Z';
const effectiveUntil = '2026-11-27T00:00:00.000Z';
const env = Object.freeze({ SUPABASE_URL: supabaseUrl,
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: 'sb_secret_fixture',
  GPIR_ONETIME_ALLOWED_ORIGINS: origin, ONETIME_CHECKOUT_ENABLED: 'true',
  PAYPAL_ENVIRONMENT: 'live', PAYPAL_BASE_URL: 'https://api-m.paypal.com',
  PAYPAL_CLIENT_ID: 'live-client-fixture', PAYPAL_CLIENT_SECRET: 'live-secret-fixture',
  ONETIME_PAYPAL_WEBHOOK_ID: 'WH-ONETIME-FIXTURE' });

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status,
    headers: { 'content-type': 'application/json', ...headers } });
}

function browserRequest(pathname, body) {
  return new Request(`${supabaseUrl}${pathname}`, { method: 'POST', headers: {
    origin, authorization: 'Bearer reader-session-fixture', 'content-type': 'application/json'
  }, body: JSON.stringify(body) });
}

function preparedOrder(overrides = {}) {
  return { local_order_id: orderUuid, offer_id: offerUuid,
    pass_id: 'GPIR_PREMIUM_LIBRARY_30D', publication_id: 'PREMIUM_LIBRARY',
    supabase_record_id: null, display_name: 'GPIR Premium Library - 30 Day Pass',
    currency: 'EUR', expected_amount_minor: 999, access_duration_days: 30,
    paypal_order_id: null, provider_request_id: `gpir-m37-${orderUuid}`,
    sku: 'GPIR_PREMIUM_LIBRARY_30D', ...overrides };
}

function readerOrder(overrides = {}) {
  return { local_order_id: orderUuid, paypal_order_id: paypalOrderId,
    order_status: 'CREATED', paypal_capture_id: null, currency: 'EUR',
    expected_amount_minor: 999, effective_until: null,
    publication_id: 'PREMIUM_LIBRARY', supabase_record_id: null,
    access_duration_days: 30, ...overrides };
}

function productionOrder(overrides = {}) {
  return { id: orderUuid, paypal_order_id: paypalOrderId, paypal_capture_id: null,
    currency: 'EUR', amount_minor: 999, duration_days: 30, status: 'CREATED',
    ...overrides };
}

function completedProviderOrder(overrides = {}) {
  return { id: paypalOrderId, status: 'COMPLETED', purchase_units: [{
    custom_id: orderUuid, payments: { captures: [{ id: captureId, status: 'COMPLETED',
      amount: { currency_code: 'EUR', value: '9.99' } }] }
  }], ...overrides };
}

function webhookRequest(event) {
  const raw = JSON.stringify(event);
  return { raw, request: new Request(`${supabaseUrl}/functions/v1/gpir-onetime-webhook`, {
    method: 'POST', headers: { 'paypal-transmission-id': 'transmission-fixture',
      'paypal-transmission-time': '2026-10-28T00:00:01Z',
      'paypal-cert-url': 'https://api-m.paypal.com/cert-fixture',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature-fixture' },
    body: raw
  }) };
}

test('create handler uses only the server-selected Production offer and exact attachment RPC', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url); calls.push({ value, options });
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_m37_prepare_order')) return json([preparedOrder()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith('/v2/checkout/orders')) return json({ id: paypalOrderId,
      status: 'CREATED' }, 201);
    if (value.endsWith('/rpc/gpir_m37_attach_order')) return json(true);
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeCreateOrderHandler({ env, fetchImpl })(browserRequest(
    '/functions/v1/gpir-onetime-create-order', {
      passId: 'GPIR_PREMIUM_LIBRARY_30D', currency: 'EUR', requestId,
      amount: '0.01', amountMinor: 1
    }));
  assert.equal(response.status, 201);
  const prepared = calls.find(call => call.value.endsWith('/rpc/gpir_m37_prepare_order'));
  assert.deepEqual(JSON.parse(prepared.options.body), { p_user_id: userId,
    p_currency: 'EUR', p_client_request_id: requestId });
  const provider = calls.find(call => call.value.endsWith('/v2/checkout/orders'));
  const purchase = JSON.parse(provider.options.body).purchase_units[0];
  assert.equal(purchase.amount.currency_code, 'EUR');
  assert.equal(purchase.amount.value, '9.99');
  assert.equal(purchase.custom_id, orderUuid);
  const attached = calls.find(call => call.value.endsWith('/rpc/gpir_m37_attach_order'));
  assert.deepEqual(JSON.parse(attached.options.body), {
    p_local_order_id: orderUuid, p_paypal_order_id: paypalOrderId });
});

test('capture recovers an already-completed provider order after a delayed capture response', async () => {
  const rpcBodies = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_m37_get_reader_order')) return json([readerOrder()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`))
      return json({ name: 'UNPROCESSABLE_ENTITY' }, 422);
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}`))
      return json(completedProviderOrder());
    if (value.endsWith('/rpc/gpir_m37_finalize_verified_capture')) {
      rpcBodies.push(JSON.parse(options.body));
      return json([{ finalized: true, effective_until: effectiveUntil }]);
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(browserRequest(
    '/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).effectiveUntil, effectiveUntil);
  assert.deepEqual(rpcBodies, [{ p_order_id: orderUuid, p_paypal_order_id: paypalOrderId,
    p_paypal_capture_id: captureId, p_currency: 'EUR', p_amount_minor: 999 }]);
});

test('wrong capture amount never calls the entitlement finalizer', async () => {
  let finalized = false;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_m37_get_reader_order')) return json([readerOrder()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`)) {
      const order = completedProviderOrder();
      order.purchase_units[0].payments.captures[0].amount.value = '8.99';
      return json(order);
    }
    if (value.endsWith('/rpc/gpir_m37_finalize_verified_capture')) {
      finalized = true; return json([{ finalized: true, effective_until: effectiveUntil }]);
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(browserRequest(
    '/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, 409);
  assert.equal(finalized, false);
});

for (const [providerStatus, expectedHttp] of [
  ['PENDING', 202], ['DENIED', 409], ['CANCELLED', 409]
]) test(`${providerStatus.toLowerCase()} capture state never grants an entitlement`, async () => {
  let finalized = false;
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_m37_get_reader_order')) return json([readerOrder()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`)) {
      if (providerStatus === 'CANCELLED') return json({ id: paypalOrderId,
        status: providerStatus, purchase_units: [{ custom_id: orderUuid }] });
      const order = completedProviderOrder({ status: providerStatus });
      order.purchase_units[0].payments.captures[0].status = providerStatus;
      return json(order);
    }
    if (value.endsWith('/rpc/gpir_m37_finalize_verified_capture')) {
      finalized = true; return json([{ finalized: true, effective_until: effectiveUntil }]);
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(browserRequest(
    '/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, expectedHttp);
  assert.equal(finalized, false);
});

test('duplicate captured order returns stored verification without another PayPal call', async () => {
  let paypalCalled = false;
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_m37_get_reader_order')) return json([readerOrder({
      order_status: 'CAPTURED', paypal_capture_id: captureId, effective_until: effectiveUntil })]);
    paypalCalled = true; throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(browserRequest(
    '/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).effectiveUntil, effectiveUntil);
  assert.equal(paypalCalled, false);
});

test('verified completed webhook securely attaches, verifies and finalizes the Production order', async () => {
  const event = { id: 'WH-EVENT-COMPLETED-1', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    create_time: '2026-10-28T00:00:00Z', resource: { id: captureId,
      supplementary_data: { related_ids: { order_id: paypalOrderId } } } };
  const { request } = webhookRequest(event);
  const rpcCalls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.includes('/gpir_m37_onetime_webhook_events?on_conflict='))
      return json([{ provider_event_id: event.id }], 201);
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}`))
      return json(completedProviderOrder());
    if (value.includes('/gpir_m37_onetime_orders?select='))
      return json([productionOrder({ paypal_order_id: null })]);
    if (value.includes('/rest/v1/rpc/')) {
      const name = value.split('/').at(-1); rpcCalls.push({ name, body: JSON.parse(options.body) });
      if (name === 'gpir_m37_attach_order') return json(true);
      if (name === 'gpir_m37_finalize_verified_capture')
        return json([{ finalized: true, effective_until: effectiveUntil }]);
    }
    if (value.includes('/gpir_m37_onetime_webhook_events?provider_event_id='))
      return json([{ provider_event_id: event.id }]);
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeWebhookHandler({ env, fetchImpl,
    now: () => Date.parse('2026-10-28T00:00:02Z') })(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'PROCESSED');
  assert.deepEqual(rpcCalls, [
    { name: 'gpir_m37_attach_order', body: {
      p_local_order_id: orderUuid, p_paypal_order_id: paypalOrderId } },
    { name: 'gpir_m37_finalize_verified_capture', body: {
      p_order_id: orderUuid, p_paypal_order_id: paypalOrderId,
      p_paypal_capture_id: captureId, p_currency: 'EUR', p_amount_minor: 999 } }
  ]);
});

test('duplicate verified webhook is ignored by the provider-event uniqueness record', async () => {
  const event = { id: 'WH-EVENT-DUPLICATE-1', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: captureId, supplementary_data: { related_ids: {
      order_id: paypalOrderId } } } };
  const fixture = webhookRequest(event);
  const payloadSha256 = await sha256Hex(fixture.raw);
  let providerOrderRead = false;
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.includes('/gpir_m37_onetime_webhook_events?on_conflict=')) return json([]);
    if (value.includes('?select=event_type,payload_sha256,status&provider_event_id='))
      return json([{ event_type: event.event_type, payload_sha256: payloadSha256,
        status: 'PROCESSED' }]);
    if (value.includes('/v2/checkout/orders/')) providerOrderRead = true;
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeWebhookHandler({ env, fetchImpl })(fixture.request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'DUPLICATE_IGNORED');
  assert.equal(providerOrderRead, false);
});

test('unverified webhook cannot write an event or grant access', async () => {
  const fixture = webhookRequest({ id: 'WH-EVENT-INVALID-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: captureId } });
  let databaseCalled = false;
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'FAILURE' });
    if (value.includes('/rest/v1/')) databaseCalled = true;
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeWebhookHandler({ env, fetchImpl })(fixture.request);
  assert.equal(response.status, 401);
  assert.equal(databaseCalled, false);
});

test('verified refund webhook uses the Production revocation contract', async () => {
  const event = { id: 'WH-EVENT-REFUND-1', event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: { id: 'PAYPAL-REFUND-123', supplementary_data: {
      related_ids: { capture_id: captureId } } } };
  const fixture = webhookRequest(event);
  const rpcCalls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth-fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.includes('/gpir_m37_onetime_webhook_events?on_conflict='))
      return json([{ provider_event_id: event.id }], 201);
    if (value.endsWith('/rpc/gpir_m37_revoke_verified_capture')) {
      rpcCalls.push(JSON.parse(options.body)); return json(true);
    }
    if (value.includes('/gpir_m37_onetime_webhook_events?provider_event_id='))
      return json([{ provider_event_id: event.id }]);
    throw new Error(`Unexpected URL: ${value}`);
  };
  const response = await createOnetimeWebhookHandler({ env, fetchImpl,
    now: () => Date.parse('2026-10-28T00:00:02Z') })(fixture.request);
  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls, [{ p_paypal_capture_id: captureId, p_status: 'REFUNDED' }]);
});

test('My GPIR reports six-currency pass payment, active access and exact expiry separately from billing', async () => {
  const summaryEnv = { SUPABASE_URL: supabaseUrl,
    GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    GPIR_SUPABASE_SECRET_KEY: 'sb_secret_fixture', GPIR_ALLOWED_ORIGINS: origin,
    GPIR_PAYMENT_ENVIRONMENT: 'production' };
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId,
      email: 'reader@example.test', created_at: '2026-01-01T00:00:00Z',
      email_confirmed_at: '2026-01-01T00:00:00Z' });
    if (value.endsWith('/rpc/gpir_list_entitlement_candidates_v2'))
      return json([{ publication_id: 'VK-GPIR-P-TEST', supabase_record_id: recordUuid }]);
    if (value.includes('/gpir_payment_offers?')) return json([]);
    if (value.includes('/gpir_payment_orders?')) return json([]);
    if (value.includes('/gpir_publication_purchase_entitlements?')) return json([]);
    if (value.includes('/gpir_paypal_subscriptions?')) return json([]);
    if (value.includes('/gpir_subscription_plans?')) return json([]);
    if (value.includes('/gpir_m37_onetime_orders?')) return json([{ id: orderUuid,
      currency: 'CAD', amount_minor: 999, status: 'CAPTURED',
      created_at: effectiveFrom, captured_at: effectiveFrom }]);
    if (value.includes('/gpir_m37_library_entitlements?')) return json([{
      id: entitlementUuid, source_order_id: orderUuid, status: 'ACTIVE',
      effective_from: effectiveFrom, effective_until: effectiveUntil, revoked_at: null }]);
    if (value.endsWith('/rpc/resolve_publication_entitlement'))
      return json([{ decision: 'ALLOW' }]);
    throw new Error(`Unexpected URL: ${value}`);
  };
  const request = new Request(`${supabaseUrl}/functions/v1/gpir-reader-summary`, {
    method: 'GET', headers: { origin, authorization: 'Bearer reader-session-fixture' } });
  const response = await createReaderSummaryHandler({ env: summaryEnv, fetchImpl,
    now: () => Date.parse('2026-10-29T00:00:00Z') })(request);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.payments[0].currency, 'CAD');
  assert.equal(body.payments[0].expectedAmountMinor, 999);
  assert.equal(body.libraryPass.status, 'ACTIVE');
  assert.equal(body.libraryPass.effectiveUntil, effectiveUntil);
  assert.equal(Date.parse(effectiveUntil) - Date.parse(effectiveFrom), 30 * 24 * 60 * 60 * 1000);
  assert.equal(body.plan.billingStatus, 'NOT_ACTIVE');
  assert.equal(body.library[0].accessSource, 'PREMIUM_LIBRARY_PASS');
  const normalized = normalizeReaderSummary(body);
  assert.equal(normalized.libraryPass.status, 'ACTIVE');
  assert.equal(normalized.payments[0].currency, 'CAD');
});
