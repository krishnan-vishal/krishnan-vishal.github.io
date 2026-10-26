import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createOnetimeCreateOrderHandler, validInput as validCreateInput }
  from '../../supabase/functions/gpir-onetime-create-order/handler.mjs';
import { createOnetimeCaptureOrderHandler }
  from '../../supabase/functions/gpir-onetime-capture-order/handler.mjs';
import { createOnetimeWebhookHandler, verificationBody }
  from '../../supabase/functions/gpir-onetime-webhook/handler.mjs';
import { onetimeConfiguration, verifiedCapture }
  from '../../supabase/functions/_shared/gpir-onetime-sandbox.mjs';

const origin = 'https://gpir-m37-4192.app.github.dev';
const userId = '22222222-2222-4222-8222-222222222222';
const offerId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const localOrderId = '55555555-5555-4555-8555-555555555555';
const paypalOrderId = 'ORDER-12345678';
const captureId = 'CAPTURE-12345678';
const passId = 'GPIR_PREMIUM_LIBRARY_30D';
const publicationId = 'PREMIUM_LIBRARY';
const effectiveUntil = '2026-11-24T12:00:00.000Z';

const env = Object.freeze({
  SUPABASE_URL: 'https://hoewtptllwkcqrgryazu.supabase.co',
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: 'server_secret_fixture',
  GPIR_ONETIME_ALLOWED_ORIGINS: origin,
  ONETIME_CHECKOUT_ENABLED: 'true',
  PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_CLIENT_ID: 'sandbox_client_fixture',
  PAYPAL_CLIENT_SECRET: 'sandbox_secret_fixture',
  ONETIME_PAYPAL_WEBHOOK_ID: 'WH-ONETIME-SANDBOX-FIXTURE'
});

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json', ...headers } });
}

function request(url, body, token = 'reader_session_fixture') {
  return new Request(url, { method: 'POST', headers: { origin,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function offerRow(currency = 'USD', amount = 1234) {
  return { offer_id: offerId, pass_id: passId, publication_id: publicationId,
    supabase_record_id: null, display_name: 'GPIR Premium Library - 30 Day Pass', currency,
    unit_amount_minor: amount, access_duration_days: 30 };
}

function preparedRow(overrides = {}) {
  return { local_order_id: localOrderId, paypal_order_id: null,
    provider_request_id: `gpir-onetime-${localOrderId}`, offer_id: offerId,
    pass_id: passId, publication_id: publicationId,
    supabase_record_id: null, sku: passId,
    display_name: 'GPIR Premium Library - 30 Day Pass', currency: 'USD',
    expected_amount_minor: 1234, access_duration_days: 30,
    order_status: 'CREATED', ...overrides };
}

function storedRow(overrides = {}) {
  return { local_order_id: localOrderId, paypal_order_id: paypalOrderId,
    paypal_capture_id: null, publication_id: publicationId,
    supabase_record_id: null, currency: 'USD', expected_amount_minor: 1234,
    access_duration_days: 30, order_status: 'CREATED', effective_until: null,
    ...overrides };
}

function completedOrder({ currency = 'USD', amount = '12.34', status = 'COMPLETED' } = {}) {
  return { id: paypalOrderId, status: status === 'COMPLETED' ? 'COMPLETED' : 'APPROVED',
    purchase_units: [{ custom_id: localOrderId, payments: { captures: [{ id: captureId,
      status, amount: { currency_code: currency, value: amount } }] } }] };
}

test('Sandbox configuration is feature-flagged and cannot target Production', () => {
  assert.equal(onetimeConfiguration(env).PAYPAL_ENVIRONMENT, 'sandbox');
  assert.equal(onetimeConfiguration({ ...env, ONETIME_CHECKOUT_ENABLED: 'false' }), null);
  assert.equal(onetimeConfiguration({ ...env, PAYPAL_ENVIRONMENT: 'production' }), null);
  assert.equal(onetimeConfiguration({ ...env,
    SUPABASE_URL: 'https://qlnvhfapctcpzqyuhhth.supabase.co' }), null);
  assert.equal(onetimeConfiguration({ ...env,
    PAYPAL_BASE_URL: 'https://api-m.paypal.com' }), null);
});

test('browser preflight allows the publishable-key request headers', async () => {
  const response = await createOnetimeCreateOrderHandler({ env })(new Request(
    'https://sandbox/functions/v1/gpir-onetime-create-order', {
      method: 'OPTIONS',
      headers: { origin }
    }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-headers'),
    'authorization, apikey, content-type');
});

test('create request accepts only the seven supported currencies', () => {
  for (const currency of ['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'JPY', 'CAD'])
    assert.equal(validCreateInput({ passId, currency, requestId }), true);
  assert.equal(validCreateInput({ passId, currency: 'INR', requestId }), false);
});

test('offer catalog requires an authenticated reader and exposes only server offers', async () => {
  const handler = createOnetimeCreateOrderHandler({ env, fetchImpl: async url => {
    if (String(url).endsWith('/auth/v1/user')) return json({ id: userId });
    if (String(url).endsWith('/rpc/gpir_list_onetime_offers'))
      return json([offerRow('USD', 1234), offerRow('JPY', 1500)]);
    throw new Error(`Unexpected URL ${url}`);
  } });
  const good = await handler(new Request('https://sandbox/functions/v1/gpir-onetime-create-order',
    { method: 'GET', headers: { origin, authorization: 'Bearer session' } }));
  assert.equal(good.status, 200);
  const body = await good.json();
  assert.deepEqual(body.offers.map(value => [value.currency, value.amount]),
    [['USD', '12.34'], ['JPY', '1500']]);
  const denied = await handler(new Request('https://sandbox/functions/v1/gpir-onetime-create-order',
    { method: 'GET', headers: { origin } }));
  assert.equal(denied.status, 401);
});

test('create-order ignores browser price tampering and uses the server-controlled amount', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return json({ id: userId });
    if (String(url).endsWith('/rpc/gpir_prepare_onetime_order')) return json([preparedRow()]);
    if (String(url).endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (String(url).endsWith('/v2/checkout/orders'))
      return json({ id: paypalOrderId, status: 'CREATED' }, 201);
    if (String(url).endsWith('/rpc/gpir_attach_onetime_order')) return json(true);
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeCreateOrderHandler({ env, fetchImpl })(request(
    'https://sandbox/functions/v1/gpir-onetime-create-order',
    { passId, currency: 'USD', requestId, amount: '0.01' }));
  assert.equal(response.status, 201);
  const provider = calls.find(call => call.url.endsWith('/v2/checkout/orders'));
  const providerBody = JSON.parse(provider.options.body);
  assert.equal(providerBody.purchase_units[0].amount.value, '12.34');
  assert.equal(providerBody.purchase_units[0].amount.currency_code, 'USD');
  assert.equal(provider.options.headers['paypal-request-id'], `gpir-onetime-${localOrderId}`);
});

test('duplicate create returns the existing provider order without a second PayPal call', async () => {
  let paypalCalled = false;
  const fetchImpl = async url => {
    if (String(url).endsWith('/auth/v1/user')) return json({ id: userId });
    if (String(url).endsWith('/rpc/gpir_prepare_onetime_order'))
      return json([preparedRow({ paypal_order_id: paypalOrderId })]);
    if (String(url).includes('paypal.com')) paypalCalled = true;
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeCreateOrderHandler({ env, fetchImpl })(request(
    'https://sandbox/functions/v1/gpir-onetime-create-order',
    { passId, currency: 'USD', requestId }));
  assert.equal(response.status, 200); assert.equal(paypalCalled, false);
});

test('successful capture creates a verified expiring entitlement', async () => {
  const rpc = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_get_onetime_order')) return json([storedRow()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`))
      return json(completedOrder(), 201);
    if (value.endsWith('/rpc/gpir_finalize_onetime_capture')) {
      rpc.push(JSON.parse(options.body));
      return json([{ finalized: true, effective_until: effectiveUntil }]);
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(request(
    'https://sandbox/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'CAPTURED', environment: 'sandbox',
    orderId: paypalOrderId, entitlement: 'SERVER_VERIFIED', effectiveUntil });
  assert.equal(rpc[0].p_paypal_capture_id, captureId);
});

test('duplicate capture returns stored verification without calling PayPal again', async () => {
  let paypalCalled = false;
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_get_onetime_order')) return json([storedRow({
      order_status: 'CAPTURED', paypal_capture_id: captureId, effective_until: effectiveUntil })]);
    if (value.includes('paypal.com')) paypalCalled = true;
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(request(
    'https://sandbox/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, 200); assert.equal(paypalCalled, false);
});

test('wrong amount or currency never reaches entitlement finalization', () => {
  assert.equal(verifiedCapture(completedOrder({ amount: '12.35' }), storedRow()), null);
  assert.equal(verifiedCapture(completedOrder({ currency: 'EUR' }), storedRow()), null);
});

test('pending capture records pending state and grants no entitlement', async () => {
  const rpcNames = [];
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_get_onetime_order')) return json([storedRow()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`))
      return json(completedOrder({ status: 'PENDING' }), 201);
    if (value.includes('/rest/v1/rpc/')) { rpcNames.push(value.split('/').at(-1)); return json(true); }
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(request(
    'https://sandbox/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, 202);
  assert.deepEqual(rpcNames, ['gpir_mark_onetime_order_status']);
});

test('denied capture grants no entitlement', async () => {
  const rpcNames = [];
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_get_onetime_order')) return json([storedRow()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`))
      return json(completedOrder({ status: 'DENIED' }), 201);
    if (value.includes('/rest/v1/rpc/')) { rpcNames.push(value.split('/').at(-1)); return json(true); }
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeCaptureOrderHandler({ env, fetchImpl })(request(
    'https://sandbox/functions/v1/gpir-onetime-capture-order', { orderId: paypalOrderId }));
  assert.equal(response.status, 409);
  assert.deepEqual(rpcNames, ['gpir_mark_onetime_order_status']);
});

function webhookRequest(event) {
  return new Request('https://sandbox/functions/v1/gpir-onetime-webhook', { method: 'POST',
    headers: { 'paypal-transmission-id': 'tx-1',
      'paypal-transmission-time': '2026-10-25T10:00:01Z',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature' },
    body: JSON.stringify(event) });
}

test('invalid webhook signature is rejected before the idempotency ledger', async () => {
  let rpcCalled = false;
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'FAILURE' });
    if (value.includes('/rpc/')) rpcCalled = true;
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeWebhookHandler({ env, fetchImpl })(webhookRequest({
    id: 'WH-EVENT-BAD', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: captureId } }));
  assert.equal(response.status, 401); assert.equal(rpcCalled, false);
});

test('duplicate verified webhook delivery is ignored', async () => {
  const event = { id: 'WH-EVENT-DUP', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: captureId } };
  const raw = JSON.stringify(event);
  assert.match(verificationBody({ 'paypal-transmission-id': 'tx-1',
    'paypal-transmission-time': 'time', 'paypal-cert-url': 'url',
    'paypal-auth-algo': 'algo', 'paypal-transmission-sig': 'sig' }, raw,
  env.ONETIME_PAYPAL_WEBHOOK_ID), /"webhook_event":/);
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.endsWith('/rpc/gpir_claim_onetime_webhook_event')) return json('DUPLICATE');
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeWebhookHandler({ env, fetchImpl })(webhookRequest(event));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'DUPLICATE_IGNORED');
});

test('verified refund revokes only the capture-backed one-time entitlement', async () => {
  const rpcNames = [];
  const event = { id: 'WH-EVENT-REFUND', event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: { id: 'REFUND-12345678',
      supplementary_data: { related_ids: { capture_id: captureId } } } };
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.includes('/rest/v1/rpc/')) {
      const name = value.split('/').at(-1); rpcNames.push(name);
      if (name === 'gpir_claim_onetime_webhook_event') return json('CLAIMED');
      return json(true);
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = await createOnetimeWebhookHandler({ env, fetchImpl })(webhookRequest(event));
  assert.equal(response.status, 200);
  assert.deepEqual(rpcNames, ['gpir_claim_onetime_webhook_event',
    'gpir_reverse_onetime_capture', 'gpir_finish_onetime_webhook_event']);
});

test('migration enforces RLS, expiry, refund isolation and seeds no commercial price', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations',
    '20261025000200_m37_onetime_multicurrency_sandbox.sql'), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /effective_until > CURRENT_TIMESTAMP/);
  assert.match(sql, /WHERE source_order_id = selected_order\.id AND status = 'ACTIVE'/);
  assert.match(sql, /status = 'SANDBOX_ACTIVE'/);
  assert.doesNotMatch(sql, /INSERT INTO public\.gpir_onetime_offers[\s\S]*VALUES\s*\(/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.resolve_publication_entitlement/);
});

test('standalone UI uses a PayPal namespace and renders only SDK-eligible funding sources', () => {
  const script = fs.readFileSync(path.join(process.cwd(),
    'assets/js/gpir-payonce-multicurrency.mjs'), 'utf8');
  const page = fs.readFileSync(path.join(process.cwd(), 'reader/pay-once/index.html'), 'utf8');
  assert.match(script, /data.*namespace|dataset\.namespace/);
  assert.match(script, /buttons\.isEligible\(\)/);
  assert.match(script, /entitlement !== 'SERVER_VERIFIED'/);
  assert.match(page, /This is a one-time purchase/);
  assert.doesNotMatch(script + page, /PAYPAL_CLIENT_SECRET|GPIR_SUPABASE_SECRET_KEY/);
});

test('new checkout modules do not import or mutate recurring subscription code', () => {
  const files = ['supabase/functions/gpir-onetime-create-order/handler.mjs',
    'supabase/functions/gpir-onetime-capture-order/handler.mjs',
    'supabase/functions/gpir-onetime-webhook/handler.mjs',
    'assets/js/gpir-payonce-multicurrency.mjs'];
  const source = files.map(file => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /gpir-paypal-subscription|BILLING\.SUBSCRIPTION|PAYPAL_PLAN_ID/);
});
