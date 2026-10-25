import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createPayPalCreateOrderHandler } from '../../supabase/functions/gpir-paypal-create-order/handler.mjs';
import { createPayPalCaptureOrderHandler } from '../../supabase/functions/gpir-paypal-capture-order/handler.mjs';
import { createPayPalWebhookHandler, verificationBody } from '../../supabase/functions/gpir-paypal-webhook/handler.mjs';
import { PAYPAL_SANDBOX_BASE, paymentConfiguration, verifiedCapture } from '../../supabase/functions/_shared/gpir-paypal.mjs';
import { captureSandboxOrder, createSandboxOrder, initializePayPalSandboxCheckout,
  sandboxCheckoutConfig, validSandboxConfig }
  from '../../assets/js/gpir-paypal-sandbox-checkout.mjs';

const origin = 'https://fintechoisis.com';
const userId = '22222222-2222-4222-8222-222222222222';
const offerId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const localOrderId = '55555555-5555-4555-8555-555555555555';
const recordId = '66666666-6666-4666-8666-666666666666';
const paypalOrderId = 'ORDER12345678';
const captureId = 'CAPTURE12345678';
const publicationId = 'VK-GPIR-P-000000000018-2';

const env = Object.freeze({
  SUPABASE_URL: 'https://hoewtptllwkcqrgryazu.supabase.co',
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: 'server_secret_fixture',
  GPIR_PAYPAL_ALLOWED_ORIGINS: origin,
  PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_CLIENT_ID: 'sandbox_client_fixture',
  PAYPAL_CLIENT_SECRET: 'sandbox_secret_fixture',
  PAYPAL_WEBHOOK_ID: 'WH-SANDBOX-FIXTURE'
});

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json', ...headers } });
}

function browserRequest(url, body) {
  return new Request(url, { method: 'POST', headers: { origin,
    authorization: 'Bearer reader_session_fixture', 'content-type': 'application/json' },
    body: JSON.stringify(body) });
}

function preparedRow(overrides = {}) {
  return { local_order_id: localOrderId, paypal_order_id: null,
    provider_request_id: `gpir-${localOrderId}`, publication_id: publicationId,
    supabase_record_id: recordId, sku: 'GPIR-PUB-018', display_name: 'GPIR publication',
    currency: 'USD', expected_amount_minor: 1234, order_status: 'CREATED', ...overrides };
}

function storedRow(overrides = {}) {
  return { local_order_id: localOrderId, paypal_order_id: paypalOrderId,
    provider_request_id: `gpir-${localOrderId}`, publication_id: publicationId,
    supabase_record_id: recordId, currency: 'USD', expected_amount_minor: 1234,
    order_status: 'CREATED', paypal_capture_id: null, ...overrides };
}

function completedOrder(amount = '12.34') {
  return { id: paypalOrderId, status: 'COMPLETED', purchase_units: [{
    custom_id: localOrderId, payments: { captures: [{ id: captureId,
      status: 'COMPLETED', amount: { currency_code: 'USD', value: amount } }] } }] };
}

test('configuration fixes the sandbox provider and fails closed for production', () => {
  assert.equal(paymentConfiguration(env).PAYPAL_BASE_URL, PAYPAL_SANDBOX_BASE);
  assert.equal(paymentConfiguration({ ...env, PAYPAL_ENVIRONMENT: 'production',
    SUPABASE_URL: 'https://qlnvhfapctcpzqyuhhth.supabase.co' }), null);
  assert.equal(paymentConfiguration({ ...env, PAYPAL_CLIENT_SECRET: '' }), null);
});

test('create-order authenticates the reader and uses only the server offer amount', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return json({ id: userId });
    if (String(url).endsWith('/rpc/gpir_prepare_paypal_order_v2')) return json([preparedRow()]);
    if (String(url).endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (String(url).endsWith('/v2/checkout/orders'))
      return json({ id: paypalOrderId, status: 'CREATED' }, 201,
        { 'paypal-debug-id': 'debug-create' });
    if (String(url).endsWith('/rpc/gpir_attach_paypal_order_v2')) return json(true);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const handler = createPayPalCreateOrderHandler({ env, fetchImpl });
  const response = await handler(browserRequest(
    'https://project.supabase.co/functions/v1/gpir-paypal-create-order',
    { offerId, clientRequestId: requestId, amount: '0.01', currency: 'EUR' }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { status: 'CREATED', environment: 'sandbox',
    orderId: paypalOrderId });
  const providerCall = calls.find(call => call.url.endsWith('/v2/checkout/orders'));
  const providerBody = JSON.parse(providerCall.options.body);
  assert.equal(providerBody.purchase_units[0].amount.value, '12.34');
  assert.equal(providerBody.purchase_units[0].amount.currency_code, 'USD');
  assert.equal(providerBody.purchase_units[0].custom_id, localOrderId);
  assert.equal(providerCall.options.headers['paypal-request-id'], `gpir-${localOrderId}`);
});

test('capture grants access only after exact completed server verification', async () => {
  const rpcNames = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.includes('/rest/v1/rpc/')) {
      const name = value.split('/').at(-1); rpcNames.push(name);
      if (name === 'gpir_get_paypal_order_v2') return json([storedRow()]);
      if (name === 'gpir_finalize_paypal_capture_v2') {
        const body = JSON.parse(options.body);
        assert.equal(body.p_paypal_capture_id, captureId);
        assert.equal(body.p_captured_amount_minor, 1234);
        return json(true);
      }
    }
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`))
      return json(completedOrder(), 201, { 'paypal-debug-id': 'debug-capture' });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const response = await createPayPalCaptureOrderHandler({ env, fetchImpl })(browserRequest(
    'https://project.supabase.co/functions/v1/gpir-paypal-capture-order',
    { orderId: paypalOrderId }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'CAPTURED', environment: 'sandbox',
    orderId: paypalOrderId, entitlement: 'SERVER_VERIFIED' });
  assert.deepEqual(rpcNames, ['gpir_get_paypal_order_v2', 'gpir_finalize_paypal_capture_v2']);
});

test('amount mismatch fails closed before entitlement finalization', async () => {
  let finalized = false;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_get_paypal_order_v2')) return json([storedRow()]);
    if (value.endsWith('/rpc/gpir_finalize_paypal_capture_v2')) { finalized = true; return json(true); }
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}/capture`))
      return json(completedOrder('12.35'), 201);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const response = await createPayPalCaptureOrderHandler({ env, fetchImpl })(browserRequest(
    'https://project.supabase.co/functions/v1/gpir-paypal-capture-order',
    { orderId: paypalOrderId }));
  assert.equal(response.status, 409);
  assert.equal(finalized, false);
});

test('webhook preserves raw event during signature verification and suppresses duplicates', async () => {
  const event = { id: 'WH-EVENT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    create_time: '2026-10-11T10:00:00Z', resource: { id: captureId } };
  const raw = JSON.stringify(event, null, 2);
  const headers = { 'paypal-transmission-id': 'tx-1',
    'paypal-transmission-time': '2026-10-11T10:00:01Z',
    'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature' };
  assert.match(verificationBody(headers, raw, env.PAYPAL_WEBHOOK_ID),
    new RegExp(`"webhook_event":${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  let providerOrderFetched = false;
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature')) {
      assert.ok(options.body.includes(`"webhook_event":${raw}`));
      return json({ verification_status: 'SUCCESS' });
    }
    if (value.endsWith('/rpc/gpir_claim_paypal_webhook_event_v2')) return json('DUPLICATE');
    if (value.includes('/v2/checkout/orders/')) { providerOrderFetched = true; return json({}); }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const request = new Request('https://project.supabase.co/functions/v1/gpir-paypal-webhook',
    { method: 'POST', headers, body: raw });
  const response = await createPayPalWebhookHandler({ env, fetchImpl })(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'DUPLICATE_IGNORED');
  assert.equal(providerOrderFetched, false);
});

test('invalid webhook signature is rejected before the idempotency ledger', async () => {
  let rpcCalled = false;
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'FAILURE' });
    if (value.includes('/rest/v1/rpc/')) { rpcCalled = true; return json('CLAIMED'); }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const request = new Request('https://project.supabase.co/functions/v1/gpir-paypal-webhook', {
    method: 'POST', headers: { 'paypal-transmission-id': 'tx-bad',
      'paypal-transmission-time': '2026-10-11T10:00:01Z',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'bad-signature' },
    body: JSON.stringify({ id: 'WH-BAD', event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: captureId } }) });
  const response = await createPayPalWebhookHandler({ env, fetchImpl })(request);
  assert.equal(response.status, 401);
  assert.equal(rpcCalled, false);
});

test('verified completed webhook independently fetches and finalizes the capture', async () => {
  const event = { id: 'WH-EVENT-2', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    create_time: '2026-10-11T10:00:00Z', resource: { id: captureId,
      supplementary_data: { related_ids: { order_id: paypalOrderId } } } };
  const rpcNames = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.endsWith(`/v2/checkout/orders/${paypalOrderId}`)) return json(completedOrder());
    if (value.includes('/rest/v1/rpc/')) {
      const name = value.split('/').at(-1); rpcNames.push(name);
      if (name === 'gpir_claim_paypal_webhook_event_v2') return json('CLAIMED');
      if (name === 'gpir_get_paypal_order_for_webhook_v2') return json([storedRow()]);
      if (name === 'gpir_finalize_paypal_capture_v2') return json(true);
      if (name === 'gpir_finish_paypal_webhook_event_v2') return json(true);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const request = new Request('https://project.supabase.co/functions/v1/gpir-paypal-webhook', {
    method: 'POST', headers: { 'paypal-transmission-id': 'tx-2',
      'paypal-transmission-time': '2026-10-11T10:00:01Z',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature' },
    body: JSON.stringify(event) });
  const response = await createPayPalWebhookHandler({ env, fetchImpl })(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'PROCESSED');
  assert.deepEqual(rpcNames, ['gpir_claim_paypal_webhook_event_v2',
    'gpir_get_paypal_order_for_webhook_v2', 'gpir_finalize_paypal_capture_v2',
    'gpir_finish_paypal_webhook_event_v2']);
});

test('verified refund webhook uses the known capture reversal path', async () => {
  const event = { id: 'WH-EVENT-3', event_type: 'PAYMENT.CAPTURE.REFUNDED',
    create_time: '2026-10-11T11:00:00Z', resource: { id: 'REFUND12345678',
      supplementary_data: { related_ids: { capture_id: captureId } } } };
  const rpcBodies = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.includes('/rest/v1/rpc/')) {
      const name = value.split('/').at(-1); const body = JSON.parse(options.body);
      rpcBodies.push({ name, body });
      if (name === 'gpir_claim_paypal_webhook_event_v2') return json('CLAIMED');
      return json(true);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const request = new Request('https://project.supabase.co/functions/v1/gpir-paypal-webhook', {
    method: 'POST', headers: { 'paypal-transmission-id': 'tx-3',
      'paypal-transmission-time': '2026-10-11T11:00:01Z',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature' },
    body: JSON.stringify(event) });
  const response = await createPayPalWebhookHandler({ env, fetchImpl })(request);
  assert.equal(response.status, 200);
  const reversal = rpcBodies.find(call => call.name === 'gpir_reverse_paypal_capture_v2');
  assert.equal(reversal.body.p_paypal_capture_id, captureId);
  assert.equal(reversal.body.p_reversal_status, 'REFUNDED');
});

test('browser checkout requires sandbox config and trusts only SERVER_VERIFIED capture', async () => {
  const config = { enabled: true, environment: 'sandbox',
    clientId: 'sandbox-client-public-123', currency: 'USD', intent: 'CAPTURE',
    recurrence: 'NONE', offers: [{ id: offerId, displayName: 'GPIR publication',
      currency: 'USD', unitAmountMinor: 1234 }],
    supabaseUrl: 'https://hoewtptllwkcqrgryazu.supabase.co',
    createOrderEndpoint: 'https://hoewtptllwkcqrgryazu.supabase.co/functions/v1/gpir-paypal-create-order',
    captureOrderEndpoint: 'https://hoewtptllwkcqrgryazu.supabase.co/functions/v1/gpir-paypal-capture-order' };
  const supabase = { auth: { async getSession() { return { data: { session: {
    user: { id: userId }, access_token: 'session_fixture' } } }; } } };
  assert.equal(validSandboxConfig(config), true);
  assert.equal(validSandboxConfig({ ...config, environment: 'live' }), false);
  assert.equal(validSandboxConfig({ ...config, recurrence: 'SUBSCRIPTION' }), false);
  assert.equal(validSandboxConfig({ ...config, offers: [{ ...config.offers[0],
    currency: 'EUR' }] }), false);
  const created = await createSandboxOrder({ config, offerId, supabase, requestId,
    fetchImpl: async () => json({ status: 'CREATED', environment: 'sandbox',
      orderId: paypalOrderId }) });
  assert.equal(created, paypalOrderId);
  const redirectOnly = await captureSandboxOrder({ config, supabase, orderId: paypalOrderId,
    fetchImpl: async () => json({ status: 'CAPTURED', environment: 'sandbox' }) });
  assert.equal(redirectOnly, null);
  const verified = await captureSandboxOrder({ config, supabase, orderId: paypalOrderId,
    fetchImpl: async () => json({ status: 'CAPTURED', environment: 'sandbox',
      entitlement: 'SERVER_VERIFIED', orderId: paypalOrderId }) });
  assert.equal(verified.entitlement, 'SERVER_VERIFIED');
});

test('pay-once config is sandbox-only and cannot be promoted to recurring collection', () => {
  const summary = { environment: 'sandbox',
    availability: { oneTimeCheckout: 'AVAILABLE' },
    paymentCheckout: { provider: 'PAYPAL_ORDERS', clientId: 'sandbox-client-public-123',
      currency: 'USD', intent: 'CAPTURE', recurrence: 'NONE' },
    purchaseOffers: [{ id: offerId, displayName: 'GPIR publication',
      currency: 'USD', unitAmountMinor: 1234 }] };
  const global = { location: { hostname: 'localhost' },
    GPIR_SUPABASE_PUBLIC_CONFIG: { url: 'https://hoewtptllwkcqrgryazu.supabase.co' } };
  assert.equal(validSandboxConfig(sandboxCheckoutConfig(global, summary)), true);
  assert.equal(sandboxCheckoutConfig(global, { ...summary, environment: 'production' }), null);
  assert.equal(sandboxCheckoutConfig(global, { ...summary,
    paymentCheckout: { ...summary.paymentCheckout, recurrence: 'SUBSCRIPTION' } }), null);
});

test('Sandbox checkout renders only PayPal-eligible one-time buttons for the selected offer', async () => {
  const summary = { environment: 'sandbox',
    availability: { oneTimeCheckout: 'AVAILABLE' },
    paymentCheckout: { provider: 'PAYPAL_ORDERS', clientId: 'sandbox-client-public-123',
      currency: 'USD', intent: 'CAPTURE', recurrence: 'NONE' },
    purchaseOffers: [{ id: offerId, displayName: 'GPIR publication',
      currency: 'USD', unitAmountMinor: 1234 }] };
  const select = { value: '', onchange: null, replaceChildren(...children) {
    this.children = children; this.value = children[0]?.value || '';
  } };
  const price = { textContent: '' }; const status = { textContent: '', dataset: {} };
  const container = { children: [], replaceChildren(...children) { this.children = children; } };
  const root = { hidden: true, querySelector(selector) {
    return ({ '[data-paypal-offer]': select, '[data-paypal-offer-price]': price,
      '[data-paypal-buttons]': container, '[data-paypal-status]': status })[selector] || null;
  }, dispatchEvent() {} };
  const document = { querySelector(selector) {
    return selector === '[data-gpir-paypal-checkout="sandbox"]' ? root : null;
  }, createElement() { return { value: '', textContent: '', dataset: {} }; },
  head: { append() {} } };
  let buttonOptions = null; let rendered = false; let requestBody = null;
  const global = { document, location: { hostname: 'localhost' },
    GPIR_SUPABASE_PUBLIC_CONFIG: { url: 'https://hoewtptllwkcqrgryazu.supabase.co' },
    paypal: { Buttons(options) { buttonOptions = options; return {
      isEligible: () => true, render: async target => { rendered = target === container; }
    }; } } };
  const supabase = { auth: { async getSession() { return { data: { session: {
    user: { id: userId }, access_token: 'session_fixture' } } }; } } };
  const config = sandboxCheckoutConfig(global, summary);
  const ready = await initializePayPalSandboxCheckout({ global, document, config, supabase,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return json({ status: 'CREATED', environment: 'sandbox', orderId: paypalOrderId });
    } });
  assert.equal(ready, true); assert.equal(root.hidden, false); assert.equal(rendered, true);
  assert.equal(select.children.length, 1); assert.match(price.textContent, /No automatic renewal/);
  assert.equal(await buttonOptions.createOrder(), paypalOrderId);
  assert.equal(requestBody.offerId, offerId);

  let ineligibleRendered = false;
  global.paypal.Buttons = () => ({ isEligible: () => false,
    render: async () => { ineligibleRendered = true; } });
  assert.equal(await initializePayPalSandboxCheckout({ global, document, config, supabase }), false);
  assert.equal(ineligibleRendered, false);
});

test('browser payment adapters contain no secrets and retain server verification', () => {
  const repo = process.cwd();
  const frontend = fs.readFileSync(path.join(repo,
    'assets/js/gpir-paypal-sandbox-checkout.mjs'), 'utf8');
  const subscription = fs.readFileSync(path.join(repo,
    'assets/js/gpir-paypal-subscription.mjs'), 'utf8');
  assert.doesNotMatch(frontend, /PAYPAL_CLIENT_SECRET|GPIR_SUPABASE_SECRET_KEY|sb_secret_/);
  assert.doesNotMatch(subscription, /PAYPAL_CLIENT_SECRET|GPIR_SUPABASE_SECRET_KEY|sb_secret_/);
  assert.doesNotMatch(frontend, /resolve_publication_entitlement|publication_purchase_entitlements/);
  assert.doesNotMatch(subscription, /resolve_publication_entitlement|publication_purchase_entitlements/);
  assert.match(frontend, /currency=USD&intent=capture&components=buttons,funding-eligibility/);
  assert.doesNotMatch(frontend, /vault=true|intent=subscription|createSubscription/);
  assert.equal(verifiedCapture(completedOrder(), storedRow()).captureId, captureId);
});
