import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createPayPalCreateSubscriptionHandler }
  from '../../supabase/functions/gpir-paypal-create-subscription/handler.mjs';
import { createPayPalVerifySubscriptionHandler }
  from '../../supabase/functions/gpir-paypal-verify-subscription/handler.mjs';
import { createPayPalWebhookHandler }
  from '../../supabase/functions/gpir-paypal-webhook/handler.mjs';
import { GPIR_SUPABASE_PROJECTS, PAYPAL_PRODUCTION_BASE, PAYPAL_SANDBOX_BASE,
  paymentConfiguration } from '../../supabase/functions/_shared/gpir-paypal.mjs';
import { createSubscription, validSubscriptionConfig, verifySubscription }
  from '../../assets/js/gpir-paypal-subscription.mjs';

const origin = 'https://fintechoisis.com';
const userId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const localSubscriptionId = '55555555-5555-4555-8555-555555555555';
const paypalPlanId = 'P-PLAN12345678';
const paypalSubscriptionId = 'I-SUBSCRIPTION123';

const sandboxEnv = Object.freeze({
  SUPABASE_URL: `https://${GPIR_SUPABASE_PROJECTS.sandbox}.supabase.co`,
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: 'server_secret_fixture',
  GPIR_PAYPAL_ALLOWED_ORIGINS: origin,
  PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_CLIENT_ID: 'sandbox_client_fixture',
  PAYPAL_CLIENT_SECRET: 'sandbox_secret_fixture',
  PAYPAL_WEBHOOK_ID: 'WH-SANDBOX-FIXTURE'
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status,
    headers: { 'content-type': 'application/json' } });
}

function request(pathname, body) {
  return new Request(`https://${GPIR_SUPABASE_PROJECTS.sandbox}.supabase.co${pathname}`, {
    method: 'POST', headers: { origin, authorization: 'Bearer reader_session_fixture',
      'content-type': 'application/json' }, body: JSON.stringify(body)
  });
}

function subscriptionRow(overrides = {}) {
  return { local_subscription_id: localSubscriptionId, paypal_subscription_id: null,
    provider_request_id: `gpir-sub-sandbox-${localSubscriptionId}`,
    paypal_plan_id: paypalPlanId, subscription_status: 'APPROVAL_PENDING', ...overrides };
}

test('environment map rejects cross-project and disabled production configuration', () => {
  const sandbox = paymentConfiguration(sandboxEnv);
  assert.equal(sandbox.PAYPAL_BASE_URL, PAYPAL_SANDBOX_BASE);
  assert.equal(sandbox.PAYMENT_ENVIRONMENT, 'SANDBOX');
  assert.equal(paymentConfiguration({ ...sandboxEnv,
    SUPABASE_URL: `https://${GPIR_SUPABASE_PROJECTS.production}.supabase.co` }), null);
  const production = { ...sandboxEnv, PAYPAL_ENVIRONMENT: 'production',
    SUPABASE_URL: `https://${GPIR_SUPABASE_PROJECTS.production}.supabase.co` };
  assert.equal(paymentConfiguration(production), null);
  const enabled = paymentConfiguration({ ...production, GPIR_PAYPAL_PRODUCTION_ENABLED: 'true' });
  assert.equal(enabled.PAYPAL_BASE_URL, PAYPAL_PRODUCTION_BASE);
  assert.equal(enabled.ACTIVE_OFFER_STATUS, 'LIVE_ACTIVE');
});

test('sandbox checkout artifact contains no production project or endpoint', () => {
  const html = fs.readFileSync(path.join(process.cwd(),
    'artifacts/m37-b/paypal-sandbox-checkout.html'), 'utf8');
  assert.doesNotMatch(html, /qlnvhfapctcpzqyuhhth|functions\/v1\/gpir-paypal-(create|capture)-order/);
  assert.match(html, /gpir-paypal-sandbox-config\.js/);
});

test('browser subscription adapter enforces one environment and refreshes only after verification', async () => {
  const supabaseUrl = `https://${GPIR_SUPABASE_PROJECTS.sandbox}.supabase.co`;
  const config = { enabled: true, environment: 'sandbox', planId,
    supabaseUrl,
    createSubscriptionEndpoint: `${supabaseUrl}/functions/v1/gpir-paypal-create-subscription`,
    verifySubscriptionEndpoint: `${supabaseUrl}/functions/v1/gpir-paypal-verify-subscription` };
  assert.equal(validSubscriptionConfig(config), true);
  assert.equal(validSubscriptionConfig({ ...config, environment: 'production' }), false);
  const supabase = { auth: { getSession: async () => ({ data: {
    session: { access_token: 'reader_session_fixture' } } }) } };
  const created = await createSubscription({ config, supabase, clientRequestId: requestId,
    fetchImpl: async () => json({ environment: 'sandbox', status: 'APPROVAL_PENDING',
      subscriptionId: paypalSubscriptionId }) });
  assert.equal(created.subscriptionId, paypalSubscriptionId);
  let dispatched = null;
  const verified = await verifySubscription({ config, supabase,
    subscriptionId: paypalSubscriptionId,
    eventTarget: { dispatchEvent(event) { dispatched = event.type; } },
    fetchImpl: async () => json({ environment: 'sandbox', status: 'ACTIVE',
      entitlement: 'SERVER_VERIFIED', subscriptionId: paypalSubscriptionId }) });
  assert.equal(verified.entitlement, 'SERVER_VERIFIED');
  assert.equal(dispatched, 'gpir:paypal-payment-verified');
});

test('subscription creation is server-authoritative and environment-scoped', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url); calls.push({ value, options });
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_prepare_paypal_subscription_v2'))
      return json([subscriptionRow()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/billing/subscriptions'))
      return json({ id: paypalSubscriptionId, status: 'APPROVAL_PENDING' }, 201);
    if (value.endsWith('/rpc/gpir_attach_paypal_subscription_v2')) return json(true);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const response = await createPayPalCreateSubscriptionHandler({ env: sandboxEnv, fetchImpl })(
    request('/functions/v1/gpir-paypal-create-subscription',
      { planId, clientRequestId: requestId, paypalPlanId: 'ATTACKER_PLAN' }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).subscriptionId, paypalSubscriptionId);
  const provider = calls.find(call => call.value.endsWith('/v1/billing/subscriptions'));
  assert.equal(JSON.parse(provider.options.body).plan_id, paypalPlanId);
  const prepared = calls.find(call => call.value.endsWith('/rpc/gpir_prepare_paypal_subscription_v2'));
  assert.equal(JSON.parse(prepared.options.body).p_environment, 'SANDBOX');
});

test('subscription verification grants status only after an authoritative ACTIVE read', async () => {
  const rpcBodies = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_get_paypal_subscription_v2'))
      return json([subscriptionRow({ paypal_subscription_id: paypalSubscriptionId })]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v1/billing/subscriptions/${paypalSubscriptionId}`))
      return json({ id: paypalSubscriptionId, custom_id: localSubscriptionId,
        plan_id: paypalPlanId, status: 'ACTIVE', start_time: '2026-10-15T00:00:00Z',
        billing_info: { next_billing_time: '2026-11-15T00:00:00Z' } });
    if (value.endsWith('/rpc/gpir_finalize_paypal_subscription_v2')) {
      rpcBodies.push(JSON.parse(options.body)); return json(true);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const response = await createPayPalVerifySubscriptionHandler({ env: sandboxEnv, fetchImpl })(
    request('/functions/v1/gpir-paypal-verify-subscription',
      { subscriptionId: paypalSubscriptionId }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entitlement, 'SERVER_VERIFIED');
  assert.equal(rpcBodies[0].p_status, 'ACTIVE');
  assert.equal(rpcBodies[0].p_environment, 'SANDBOX');
});

test('verified subscription webhook reconciles the environment-scoped lifecycle', async () => {
  const rpcNames = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.endsWith(`/v1/billing/subscriptions/${paypalSubscriptionId}`))
      return json({ id: paypalSubscriptionId, custom_id: localSubscriptionId,
        plan_id: paypalPlanId, status: 'ACTIVE', start_time: '2026-10-15T00:00:00Z' });
    if (value.includes('/rest/v1/rpc/')) {
      const name = value.split('/').at(-1); rpcNames.push(name);
      if (name === 'gpir_claim_paypal_webhook_event_v2') return json('CLAIMED');
      if (name === 'gpir_get_paypal_subscription_for_webhook_v2')
        return json([subscriptionRow({ paypal_subscription_id: paypalSubscriptionId })]);
      return json(true);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const webhook = new Request(`https://${GPIR_SUPABASE_PROJECTS.sandbox}.supabase.co/functions/v1/gpir-paypal-webhook`, {
    method: 'POST', headers: { 'paypal-transmission-id': 'tx-subscription',
      'paypal-transmission-time': '2026-10-15T00:00:01Z',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature' },
    body: JSON.stringify({ id: 'WH-SUBSCRIPTION-1',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      create_time: '2026-10-15T00:00:00Z', resource: { id: paypalSubscriptionId } })
  });
  const response = await createPayPalWebhookHandler({ env: sandboxEnv, fetchImpl })(webhook);
  assert.equal(response.status, 200);
  assert.deepEqual(rpcNames, ['gpir_claim_paypal_webhook_event_v2',
    'gpir_get_paypal_subscription_for_webhook_v2',
    'gpir_finalize_paypal_subscription_v2', 'gpir_finish_paypal_webhook_event_v2']);
});

test('M39 migration is append-only, environment-scoped and production-inert', () => {
  const migration = fs.readFileSync(path.join(process.cwd(),
    'supabase/migrations/20261015000000_m39_paypal_environment_boundary.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(process.cwd(),
    'supabase/rollback/20261015000000_m39_paypal_environment_boundary.rollback.sql'), 'utf8');
  assert.match(migration, /gpir_subscription_plans/);
  assert.match(migration, /gpir_paypal_subscriptions/);
  assert.match(migration, /LIVE_ACTIVE/);
  assert.doesNotMatch(migration, /INSERT INTO public\.gpir_subscription_plans/);
  assert.doesNotMatch(migration, /INSERT INTO public\.gpir_payment_offers/);
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*PUBLIC, anon, authenticated/);
  assert.match(rollback, /M39_ROLLBACK_REFUSED_PAYMENT_STATE_EXISTS/);
});
