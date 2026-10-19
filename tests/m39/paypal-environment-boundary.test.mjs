import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createPayPalCreateSubscriptionHandler }
  from '../../supabase/functions/gpir-paypal-create-subscription/handler.mjs';
import { createPayPalVerifySubscriptionHandler }
  from '../../supabase/functions/gpir-paypal-verify-subscription/handler.mjs';
import { createPayPalWebhookHandler, subscriptionStatusForEvent }
  from '../../supabase/functions/gpir-paypal-webhook/handler.mjs';
import { GPIR_SUPABASE_PROJECTS, PAYPAL_PRODUCTION_BASE, PAYPAL_SANDBOX_BASE,
  paymentConfiguration } from '../../supabase/functions/_shared/gpir-paypal.mjs';
import { createSubscription, validSubscriptionConfig, verifySubscription }
  from '../../assets/js/gpir-paypal-subscription.mjs';
import { localSandboxPreview, renderSubscriptionJourney }
  from '../../assets/js/gpir-paypal-subscription-ui.mjs';
import { sandboxSubscriptionConfiguration }
  from '../../scripts/m38/serve-my-gpir-preview.mjs';

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
  GPIR_PAYPAL_SUBSCRIPTION_PLAN_ID: planId,
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
      subscriptionId: paypalSubscriptionId,
      approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=fixture' }) });
  assert.equal(created.subscriptionId, paypalSubscriptionId);
  assert.equal(await createSubscription({ config, supabase, clientRequestId: requestId,
    fetchImpl: async () => json({ environment: 'sandbox', status: 'APPROVAL_PENDING',
      subscriptionId: paypalSubscriptionId,
      approvalUrl: 'https://paypal.attacker.example/approve' }) }), null);
  let dispatched = null;
  const verified = await verifySubscription({ config, supabase,
    subscriptionId: paypalSubscriptionId,
    eventTarget: { dispatchEvent(event) { dispatched = event.type; } },
    fetchImpl: async () => json({ environment: 'sandbox', status: 'ACTIVE',
      verification: 'SERVER_VERIFIED', paymentConfirmed: true,
      publicationAccess: 'PUBLICATION_SCOPED', subscriptionId: paypalSubscriptionId }) });
  assert.equal(verified.verification, 'SERVER_VERIFIED');
  assert.equal(dispatched, 'gpir:paypal-payment-verified');
});

test('subscription preview configuration is disabled by default and local-only', () => {
  const liveConfig = fs.readFileSync(path.join(process.cwd(),
    'assets/js/gpir-subscription-preview-config.js'), 'utf8');
  assert.match(liveConfig, /enabled:\s*false/);
  assert.match(liveConfig, /localPreview:\s*false/);
  const previewEnv = { GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
  assert.equal(sandboxSubscriptionConfiguration(previewEnv).enabled, false);
  assert.equal(sandboxSubscriptionConfiguration({ ...previewEnv,
    GPIR_SANDBOX_SUBSCRIPTION_PREVIEW_ENABLED: 'true' }).enabled, true);
  assert.equal(localSandboxPreview({ enabled: true, localPreview: true, environment: 'sandbox',
    supabaseUrl: `https://${GPIR_SUPABASE_PROJECTS.sandbox}.supabase.co` },
  { hostname: '127.0.0.1' }), true);
  assert.equal(localSandboxPreview({ enabled: true, localPreview: true, environment: 'sandbox',
    supabaseUrl: `https://${GPIR_SUPABASE_PROJECTS.sandbox}.supabase.co` },
  { hostname: 'fintechoisis.com' }), false);
});

test('Plan UI presents recurring terms, pending and active states without implying publication access', () => {
  class Node {
    children = [];
    attributes = {};
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes[name] = value; }
    replaceChildren(...children) { this.children = children; }
  }
  const document = { createElement: () => new Node() };
  const target = new Node();
  const button = renderSubscriptionJourney(document, target, {
    enabled: true, billingStatus: 'APPROVAL_PENDING'
  });
  const pendingText = JSON.stringify(target.children);
  assert.match(pendingText, /USD 9\.99 \/ month/);
  assert.match(pendingText, /Recurring monthly billing/);
  assert.match(pendingText, /No trial period or setup fee/);
  assert.match(pendingText, /No publication access is granted/);
  assert.equal(button.disabled, true);
  renderSubscriptionJourney(document, target, { enabled: true, billingStatus: 'ACTIVE' });
  assert.match(JSON.stringify(target.children), /individually controlled/);
  renderSubscriptionJourney(document, target, { enabled: true, billingStatus: 'CANCELLED',
    message: 'PayPal approval was canceled. No publication access was changed.' });
  assert.match(JSON.stringify(target.children), /PayPal approval was canceled/);
  renderSubscriptionJourney(document, target, { enabled: true, billingStatus: 'NOT_ACTIVE',
    message: 'Subscription could not be started. No access changes were made.' });
  assert.match(JSON.stringify(target.children), /No access changes were made/);
  renderSubscriptionJourney(document, target, { enabled: false, billingStatus: 'NOT_ACTIVE' });
  assert.equal(target.children[0].children.at(-1).disabled, true);
});

test('subscription creation is server-authoritative and environment-scoped', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url); calls.push({ value, options });
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.includes('/rest/v1/gpir_paypal_subscriptions?')) return json([]);
    if (value.endsWith('/rpc/gpir_prepare_paypal_subscription_v2'))
      return json([subscriptionRow()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/billing/subscriptions'))
      return json({ id: paypalSubscriptionId, status: 'APPROVAL_PENDING',
        custom_id: localSubscriptionId, plan_id: paypalPlanId,
        links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=fixture' }] }, 201);
    if (value.endsWith('/rpc/gpir_attach_paypal_subscription_v2')) return json(true);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const response = await createPayPalCreateSubscriptionHandler({ env: sandboxEnv, fetchImpl })(
    request('/functions/v1/gpir-paypal-create-subscription',
      { planId, clientRequestId: requestId, paypalPlanId: 'ATTACKER_PLAN' }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.subscriptionId, paypalSubscriptionId);
  assert.equal(body.approvalUrl, 'https://www.sandbox.paypal.com/checkoutnow?token=fixture');
  const provider = calls.find(call => call.value.endsWith('/v1/billing/subscriptions'));
  assert.equal(JSON.parse(provider.options.body).plan_id, paypalPlanId);
  assert.equal(JSON.parse(provider.options.body).application_context.return_url,
    `${origin}/reader/my-gpir/?subscription=return#plan`);
  assert.equal(JSON.parse(provider.options.body).application_context.cancel_url,
    `${origin}/reader/my-gpir/?subscription=cancelled#plan`);
  assert.equal(provider.options.headers['paypal-request-id'],
    `gpir-sub-sandbox-${localSubscriptionId}`);
  const prepared = calls.find(call => call.value.endsWith('/rpc/gpir_prepare_paypal_subscription_v2'));
  assert.equal(JSON.parse(prepared.options.body).p_environment, 'SANDBOX');
  assert.equal(JSON.parse(prepared.options.body).p_user_id, userId);
});

test('subscription creation rejects plan substitution and duplicate active reader subscriptions', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_prepare_paypal_subscription_v2'))
      return json({ code: 'P0001' }, 409);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const handler = createPayPalCreateSubscriptionHandler({ env: sandboxEnv, fetchImpl });
  const duplicate = await handler(request('/functions/v1/gpir-paypal-create-subscription',
    { planId, clientRequestId: requestId }));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'SUBSCRIPTION_PLAN_OR_REQUEST_UNAVAILABLE');
  assert.equal(calls, 2);
  calls = 0;
  const substituted = await handler(request('/functions/v1/gpir-paypal-create-subscription',
    { planId: '66666666-6666-4666-8666-666666666666', clientRequestId: requestId }));
  assert.equal(substituted.status, 409);
  assert.equal((await substituted.json()).code, 'SUBSCRIPTION_PLAN_OR_REQUEST_UNAVAILABLE');
  assert.equal(calls, 2);
});

test('subscription verification finalizes only the authenticated PayPal-verified subscription', async () => {
  const rpcBodies = [];
  const confirmationBodies = [];
  const ownershipLookups = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId });
    if (value.endsWith('/rpc/gpir_get_paypal_subscription_v2')) {
      ownershipLookups.push(JSON.parse(options.body));
      return json([subscriptionRow({ paypal_subscription_id: paypalSubscriptionId })]);
    }
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v1/billing/subscriptions/${paypalSubscriptionId}`))
      return json({ id: paypalSubscriptionId, custom_id: localSubscriptionId,
        plan_id: paypalPlanId, status: 'ACTIVE', start_time: '2026-10-15T00:00:00Z',
        billing_info: { next_billing_time: '2026-11-15T00:00:00Z' } });
    if (value.endsWith('/rpc/gpir_finalize_paypal_subscription_v2')) {
      rpcBodies.push(JSON.parse(options.body)); return json(true);
    }
    if (value.endsWith('/rpc/gpir_subscription_payment_confirmed_v2')) {
      confirmationBodies.push(JSON.parse(options.body)); return json(false);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const response = await createPayPalVerifySubscriptionHandler({ env: sandboxEnv, fetchImpl })(
    request('/functions/v1/gpir-paypal-verify-subscription',
      { subscriptionId: paypalSubscriptionId }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.verification, 'SERVER_VERIFIED');
  assert.equal(result.paymentConfirmed, false);
  assert.equal(Object.hasOwn(result, 'entitlement'), false);
  assert.equal(result.publicationAccess, 'PAYMENT_CONFIRMATION_PENDING');
  assert.deepEqual(rpcBodies, [{
    p_local_subscription_id: localSubscriptionId,
    p_paypal_subscription_id: paypalSubscriptionId,
    p_status: 'ACTIVE',
    p_effective_from: '2026-10-15T00:00:00Z',
    p_effective_until: '2026-11-15T00:00:00Z',
    p_environment: 'SANDBOX'
  }]);
  assert.deepEqual(ownershipLookups, [{ p_user_id: userId,
    p_paypal_subscription_id: paypalSubscriptionId, p_environment: 'SANDBOX' }]);
  assert.deepEqual(confirmationBodies, [{ p_user_id: userId,
    p_paypal_subscription_id: paypalSubscriptionId, p_environment: 'SANDBOX' }]);
});

test('subscription lifecycle maps only supported provider-confirmed states', () => {
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.ACTIVATED', 'ACTIVE'), 'ACTIVE');
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.PAYMENT.COMPLETED', 'ACTIVE'), null);
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.PAYMENT.COMPLETED',
    'APPROVAL_PENDING'), null);
  assert.equal(subscriptionStatusForEvent('PAYMENT.SALE.COMPLETED', 'ACTIVE'), null);
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'ACTIVE'),
    'PAYMENT_FAILED');
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.SUSPENDED', 'SUSPENDED'),
    'SUSPENDED');
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.CANCELLED', 'CANCELLED'),
    'CANCELLED');
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.EXPIRED', 'EXPIRED'), 'EXPIRED');
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.CREATED', 'APPROVAL_PENDING'), null);
  assert.equal(subscriptionStatusForEvent('BILLING.SUBSCRIPTION.ACTIVATED', 'CANCELLED'), null);
});

test('verified subscription webhook finalizes the environment-scoped lifecycle', async () => {
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
  assert.deepEqual(await response.json(), { status: 'PROCESSED' });
  assert.deepEqual(rpcNames, ['gpir_claim_paypal_webhook_event_v2',
    'gpir_get_paypal_subscription_for_webhook_v2',
    'gpir_finalize_paypal_subscription_v2',
    'gpir_finish_paypal_webhook_event_v2']);
});

test('webhook signature verification fails closed before any reconciliation RPC', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url); calls.push(value);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'FAILURE' });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const webhook = new Request(`https://${GPIR_SUPABASE_PROJECTS.sandbox}.supabase.co/functions/v1/gpir-paypal-webhook`, {
    method: 'POST', headers: { 'paypal-transmission-id': 'tx-invalid',
      'paypal-transmission-time': '2026-10-15T00:00:01Z',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'invalid' },
    body: JSON.stringify({ id: 'WH-INVALID-SIGNATURE',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: paypalSubscriptionId } })
  });
  const response = await createPayPalWebhookHandler({ env: sandboxEnv, fetchImpl })(webhook);
  assert.equal(response.status, 401);
  assert.deepEqual(calls, [`${PAYPAL_SANDBOX_BASE}/v1/oauth2/token`,
    `${PAYPAL_SANDBOX_BASE}/v1/notifications/verify-webhook-signature`]);
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

test('P2 migration scopes Premium access and serializes per-reader plan registration', () => {
  const migration = fs.readFileSync(path.join(process.cwd(),
    'supabase/migrations/20261018062000_p2_subscription_security_closure.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(process.cwd(),
    'supabase/rollback/20261018062000_p2_subscription_security_closure.rollback.sql'), 'utf8');
  const resolver = migration.split('CREATE OR REPLACE FUNCTION public.resolve_publication_entitlement')[1];
  const prepare = migration.split('CREATE OR REPLACE FUNCTION public.gpir_prepare_paypal_subscription_v2')[1]
    .split('CREATE OR REPLACE FUNCTION public.resolve_publication_entitlement')[0];
  assert.match(migration, /ADD COLUMN premium_plan_id uuid/);
  assert.match(migration, /FOREIGN KEY \(premium_plan_id\)[\s\S]*REFERENCES public\.gpir_subscription_plans\(id\)/);
  assert.doesNotMatch(migration, /UPDATE public\.gpir_publication_access_policies/);
  assert.match(resolver, /policy\.access_class = 'PUBLIC'.*'ALLOW'/s);
  assert.match(resolver, /purchase\.supabase_record_id = policy\.supabase_record_id/);
  assert.match(resolver, /purchase\.user_id = caller/);
  assert.match(resolver, /purchase\.status = 'ACTIVE'/);
  assert.match(resolver, /policy\.premium_plan_id IS NOT NULL/);
  assert.match(resolver, /subscription\.plan_id = policy\.premium_plan_id/);
  assert.match(resolver, /subscription\.user_id = caller/);
  assert.match(resolver, /plan\.environment = subscription\.environment/);
  assert.match(resolver, /plan\.plan_code = 'GPIR_PREMIUM_MONTHLY'/);
  assert.match(resolver, /subscription\.status = 'ACTIVE'/);
  assert.match(resolver, /subscription\.effective_from <= CURRENT_TIMESTAMP/);
  assert.match(migration, /ON public\.gpir_paypal_subscriptions \(environment, user_id, plan_id\)\s+WHERE status IN \('APPROVAL_PENDING', 'ACTIVE', 'SUSPENDED'\)/);
  assert.match(prepare, /pg_advisory_xact_lock/);
  assert.ok(prepare.indexOf('pg_advisory_xact_lock') < prepare.indexOf('INSERT INTO public.gpir_paypal_subscriptions'));
  assert.match(prepare, /selected_subscription\.plan_id <> p_plan_id/);
  assert.match(prepare, /SUBSCRIPTION_ALREADY_EXISTS/);
  assert.ok(prepare.indexOf('client_request_id = p_client_request_id') <
    prepare.indexOf('SUBSCRIPTION_ALREADY_EXISTS'));
  assert.match(rollback, /P2_ROLLBACK_REFUSED_PREMIUM_ASSIGNMENTS_EXIST/);
  assert.match(rollback, /P2_ROLLBACK_REFUSED_NONTERMINAL_SUBSCRIPTIONS_EXIST/);
});
