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
import { createReaderSummaryHandler }
  from '../../supabase/functions/gpir-reader-summary/handler.mjs';
import { createSubscription, subscriptionConfig, validSubscriptionConfig }
  from '../../assets/js/gpir-paypal-subscription.mjs';
import { clearReaderDashboard, normalizeReaderSummary }
  from '../../assets/js/gpir-reader-dashboard.mjs';

const origin = 'https://fintechoisis.com';
const sandboxUrl = 'https://hoewtptllwkcqrgryazu.supabase.co';
const userA = '22222222-2222-4222-8222-222222222222';
const userB = '33333333-3333-4333-8333-333333333333';
const planId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const localSubscriptionId = '66666666-6666-4666-8666-666666666666';
const recordId = '77777777-7777-4777-8777-777777777777';
const paymentId = '88888888-8888-4888-8888-888888888888';
const publicationId = 'VK-GPIR-P-TEST-1';
const paypalPlanId = 'P-SANDBOXPLAN123';
const paypalSubscriptionId = 'I-SANDBOXSUB123';
const approvalUrl = `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=fixture`;

const summaryEnv = Object.freeze({ SUPABASE_URL: sandboxUrl,
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: 'server_fixture', GPIR_ALLOWED_ORIGINS: origin,
  GPIR_PAYMENT_ENVIRONMENT: 'sandbox' });
const paymentEnv = Object.freeze({ SUPABASE_URL: sandboxUrl,
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: 'server_fixture', GPIR_PAYPAL_ALLOWED_ORIGINS: origin,
  PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_CLIENT_ID: 'sandbox_client_fixture',
  PAYPAL_CLIENT_SECRET: 'sandbox_secret_fixture', PAYPAL_WEBHOOK_ID: 'WH-FIXTURE' });

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status,
    headers: { 'content-type': 'application/json' } });
}

function summaryRequest(token = 'reader-session-fixture') {
  return new Request(`${sandboxUrl}/functions/v1/gpir-reader-summary`, { method: 'GET',
    headers: { origin, authorization: `Bearer ${token}` } });
}

function summaryFixture({ userId = userA, email = 'reader-a@example.test',
  candidateFailure = false, decision = 'DENY', payments = [], purchases = [],
  subscriptions = [], candidates = [{ publication_id: publicationId,
    supabase_record_id: recordId }], plans = [{ id: planId, display_name: 'Sandbox reader plan',
    currency: 'USD', unit_amount_minor: 1200, billing_interval: 'MONTH' }] } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url); calls.push({ value, options });
    if (value.endsWith('/auth/v1/user')) return json({ id: userId, email,
      email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
      user_metadata: { display_name: userId === userA ? 'Reader A' : 'Reader B' } });
    if (value.endsWith('/rpc/gpir_list_entitlement_candidates_v2'))
      return candidateFailure ? json({ code: 'PGRST202', message: 'Function unavailable' }, 404)
        : json(candidates);
    if (value.includes('/gpir_payment_offers?')) return json(candidates);
    if (value.includes('/gpir_payment_orders?')) return json(payments);
    if (value.includes('/gpir_publication_purchase_entitlements?')) return json(purchases);
    if (value.includes('/gpir_paypal_subscriptions?')) return json(subscriptions);
    if (value.includes('/gpir_subscription_plans?')) return json(plans);
    if (value.endsWith('/rpc/resolve_publication_entitlement')) return json([{ decision }]);
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { calls, fetchImpl };
}

async function invokeSummary(options = {}) {
  const fixture = summaryFixture(options); const diagnostics = [];
  const response = await createReaderSummaryHandler({ env: summaryEnv,
    fetchImpl: fixture.fetchImpl, now: () => Date.parse('2026-10-17T00:00:00Z'),
    logger: { error: (...args) => diagnostics.push(args) } })(summaryRequest());
  return { response, body: await response.json(), calls: fixture.calls, diagnostics };
}

test('candidate dependency failure preserves identity and billing while Library fails closed', async () => {
  const result = await invokeSummary({ candidateFailure: true,
    payments: [{ id: paymentId, publication_id: publicationId, supabase_record_id: recordId,
      currency: 'USD', expected_amount_minor: 1200, captured_amount_minor: 1200,
      status: 'CAPTURED', created_at: '2026-10-17T00:00:00Z',
      captured_at: '2026-10-17T00:01:00Z' }],
    purchases: [{ publication_id: publicationId, supabase_record_id: recordId,
      status: 'ACTIVE', effective_from: '2026-10-17T00:01:00Z', revoked_at: null }],
    subscriptions: [{ id: localSubscriptionId, status: 'ACTIVE',
      effective_from: '2026-10-17T00:00:00Z', effective_until: '2026-11-17T00:00:00Z' }] });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.profile.email, 'reader-a@example.test');
  assert.equal(result.body.availability.library, 'UNAVAILABLE');
  assert.deepEqual(result.body.library, []);
  assert.equal(result.body.payments.length, 1);
  assert.equal(result.body.plan.billingStatus, 'ACTIVE');
  assert.equal(result.body.plan.accessClass, null);
  assert.equal(result.calls.some(call => call.value.endsWith(
    '/rpc/resolve_publication_entitlement')), false);
  assert.equal(result.diagnostics[0][1].dependency, 'gpir_list_entitlement_candidates_v2');
  assert.equal(result.diagnostics[0][1].code, 'PGRST202');
  const normalized = normalizeReaderSummary(result.body);
  assert.equal(normalized.availability.library, 'UNAVAILABLE');
  assert.deepEqual(normalized.library, []);
});

test('Reader A and Reader B summaries remain isolated by authenticated user id', async () => {
  const payment = { id: paymentId, publication_id: publicationId, supabase_record_id: recordId,
    currency: 'USD', expected_amount_minor: 1200, captured_amount_minor: 1200,
    status: 'CAPTURED', created_at: '2026-10-17T00:00:00Z',
    captured_at: '2026-10-17T00:01:00Z' };
  const purchase = { publication_id: publicationId, supabase_record_id: recordId,
    status: 'ACTIVE', effective_from: '2026-10-17T00:01:00Z', revoked_at: null };
  const a = await invokeSummary({ userId: userA, decision: 'ALLOW', payments: [payment],
    purchases: [purchase], subscriptions: [{ id: localSubscriptionId, status: 'ACTIVE',
      effective_from: '2026-10-17T00:00:00Z', effective_until: null }] });
  const b = await invokeSummary({ userId: userB, email: 'reader-b@example.test',
    decision: 'DENY', payments: [], purchases: [], subscriptions: [] });
  assert.equal(a.body.library.length, 1); assert.equal(a.body.payments.length, 1);
  assert.equal(b.body.library.length, 0); assert.equal(b.body.payments.length, 0);
  assert.equal(b.body.profile.email, 'reader-b@example.test');
  for (const call of a.calls.filter(call => /gpir_(payment_orders|publication_purchase_entitlements|paypal_subscriptions)\?/.test(call.value))) {
    assert.match(call.value, new RegExp(`user_id=eq\\.${userA}`));
    assert.doesNotMatch(call.value, new RegExp(userB));
  }
  for (const call of b.calls.filter(call => /gpir_(payment_orders|publication_purchase_entitlements|paypal_subscriptions)\?/.test(call.value))) {
    assert.match(call.value, new RegExp(`user_id=eq\\.${userB}`));
    assert.doesNotMatch(call.value, new RegExp(userA));
  }
});

test('incomplete payment and pending subscription never grant publication entitlement', async () => {
  const result = await invokeSummary({ decision: 'DENY', payments: [{ id: paymentId,
    publication_id: publicationId, supabase_record_id: recordId, currency: 'USD',
    expected_amount_minor: 1200, captured_amount_minor: null, status: 'CREATED',
    created_at: '2026-10-17T00:00:00Z', captured_at: null }], purchases: [],
  subscriptions: [{ id: localSubscriptionId, status: 'APPROVAL_PENDING',
    effective_from: null, effective_until: null }] });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.library, []);
  assert.equal(result.body.plan.accessClass, null);
  assert.equal(result.body.plan.billingStatus, 'APPROVAL_PENDING');
  assert.equal(result.body.summary.activePurchaseCount, 0);
});

function paymentRequest(pathname, body, token = 'reader-a-session') {
  return new Request(`${sandboxUrl}${pathname}`, { method: 'POST', headers: { origin,
    authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(body) });
}

function subscriptionRow(overrides = {}) {
  return { local_subscription_id: localSubscriptionId, paypal_subscription_id: null,
    provider_request_id: `gpir-sub-sandbox-${localSubscriptionId}`,
    paypal_plan_id: paypalPlanId, subscription_status: 'APPROVAL_PENDING', ...overrides };
}

test('Reader A sandbox subscription is server-created, approved and verified without crossing users', async () => {
  const createCalls = [];
  const createFetch = async (url, options = {}) => {
    const value = String(url); createCalls.push({ value, options });
    if (value.endsWith('/auth/v1/user')) return json({ id: userA });
    if (value.endsWith('/rpc/gpir_prepare_paypal_subscription_v2'))
      return json([subscriptionRow()]);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/billing/subscriptions')) return json({ id: paypalSubscriptionId,
      status: 'APPROVAL_PENDING', custom_id: localSubscriptionId, plan_id: paypalPlanId,
      links: [{ rel: 'approve', href: approvalUrl }] }, 201);
    if (value.endsWith('/rpc/gpir_attach_paypal_subscription_v2')) return json(true);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const createdResponse = await createPayPalCreateSubscriptionHandler({ env: paymentEnv,
    fetchImpl: createFetch })(paymentRequest('/functions/v1/gpir-paypal-create-subscription',
      { planId, clientRequestId: requestId }));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.approvalUrl, approvalUrl);
  const prepared = createCalls.find(call => call.value.endsWith(
    '/rpc/gpir_prepare_paypal_subscription_v2'));
  assert.equal(JSON.parse(prepared.options.body).p_user_id, userA);
  const provider = createCalls.find(call => call.value.endsWith('/v1/billing/subscriptions'));
  const providerBody = JSON.parse(provider.options.body);
  assert.equal(providerBody.application_context.return_url,
    `${origin}/reader/my-gpir/?paypal-subscription=approved`);

  let finalized = false;
  const verifyFetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userA });
    if (value.endsWith('/rpc/gpir_get_paypal_subscription_v2')) {
      assert.equal(JSON.parse(options.body).p_user_id, userA);
      return json([subscriptionRow({ paypal_subscription_id: paypalSubscriptionId })]);
    }
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith(`/v1/billing/subscriptions/${paypalSubscriptionId}`))
      return json({ id: paypalSubscriptionId, custom_id: localSubscriptionId,
        plan_id: paypalPlanId, status: 'ACTIVE', start_time: '2026-10-17T00:00:00Z',
        billing_info: { next_billing_time: '2026-11-17T00:00:00Z' } });
    if (value.endsWith('/rpc/gpir_finalize_paypal_subscription_v2')) {
      finalized = true; return json(true);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const verifiedResponse = await createPayPalVerifySubscriptionHandler({ env: paymentEnv,
    fetchImpl: verifyFetch })(paymentRequest('/functions/v1/gpir-paypal-verify-subscription',
      { subscriptionId: paypalSubscriptionId }));
  assert.equal(verifiedResponse.status, 200);
  assert.equal((await verifiedResponse.json()).entitlement, 'SERVER_VERIFIED');
  assert.equal(finalized, true);

  let readerBFinalized = false;
  const readerBFetch = async url => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json({ id: userB });
    if (value.endsWith('/rpc/gpir_get_paypal_subscription_v2')) return json([]);
    if (value.endsWith('/rpc/gpir_finalize_paypal_subscription_v2')) {
      readerBFinalized = true; return json(true);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const readerBResponse = await createPayPalVerifySubscriptionHandler({ env: paymentEnv,
    fetchImpl: readerBFetch })(paymentRequest('/functions/v1/gpir-paypal-verify-subscription',
      { subscriptionId: paypalSubscriptionId }, 'reader-b-session'));
  assert.equal(readerBResponse.status, 404);
  assert.equal(readerBFinalized, false);
});

test('verified subscription webhook reconciles only the stored sandbox subscription', async () => {
  const rpcNames = [];
  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith('/v1/oauth2/token')) return json({ access_token: 'oauth_fixture' });
    if (value.endsWith('/v1/notifications/verify-webhook-signature'))
      return json({ verification_status: 'SUCCESS' });
    if (value.endsWith(`/v1/billing/subscriptions/${paypalSubscriptionId}`))
      return json({ id: paypalSubscriptionId, custom_id: localSubscriptionId,
        plan_id: paypalPlanId, status: 'ACTIVE', start_time: '2026-10-17T00:00:00Z' });
    if (value.includes('/rest/v1/rpc/')) {
      const name = value.split('/').at(-1); rpcNames.push(name);
      if (name === 'gpir_claim_paypal_webhook_event_v2') return json('CLAIMED');
      if (name === 'gpir_get_paypal_subscription_for_webhook_v2')
        return json([subscriptionRow({ paypal_subscription_id: paypalSubscriptionId })]);
      return json(true);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const webhook = new Request(`${sandboxUrl}/functions/v1/gpir-paypal-webhook`, {
    method: 'POST', headers: { 'paypal-transmission-id': 'tx-subscription',
      'paypal-transmission-time': '2026-10-17T00:00:01Z',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature' },
    body: JSON.stringify({ id: 'WH-SUBSCRIPTION-1',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      create_time: '2026-10-17T00:00:00Z', resource: { id: paypalSubscriptionId } })
  });
  const response = await createPayPalWebhookHandler({ env: paymentEnv, fetchImpl })(webhook);
  assert.equal(response.status, 200);
  assert.deepEqual(rpcNames, ['gpir_claim_paypal_webhook_event_v2',
    'gpir_get_paypal_subscription_for_webhook_v2',
    'gpir_finalize_paypal_subscription_v2', 'gpir_finish_paypal_webhook_event_v2']);
});

test('browser subscription adapter is sandbox-only and accepts only approved server output', async () => {
  const summary = normalizeReaderSummary({ status: 'OK', environment: 'sandbox',
    profile: { email: 'reader-a@example.test', displayName: 'Reader A', memberSince: null,
      emailVerified: true }, library: [], payments: [],
    plan: { status: 'NOT_ENROLLED', billingStatus: 'NOT_ACTIVE' },
    subscriptionOffer: { id: planId, displayName: 'Sandbox reader plan', currency: 'USD',
      unitAmountMinor: 1200, billingInterval: 'MONTH' },
    availability: { profile: 'AVAILABLE', library: 'AVAILABLE', payments: 'AVAILABLE',
      plan: 'AVAILABLE', subscriptionCheckout: 'AVAILABLE' }, summary: {} });
  const global = { GPIR_SUPABASE_PUBLIC_CONFIG: { url: sandboxUrl },
    location: { hostname: 'gpir-m37-4192.app.github.dev' } };
  const config = subscriptionConfig(global, summary);
  assert.equal(validSubscriptionConfig(config), true);
  assert.equal(subscriptionConfig(global, { ...summary, environment: 'production' }), null);
  const supabase = { auth: { getSession: async () => ({ data: {
    session: { access_token: 'reader-session-fixture' } } }) } };
  const created = await createSubscription({ config, supabase, clientRequestId: requestId,
    fetchImpl: async () => json({ environment: 'sandbox', status: 'APPROVAL_PENDING',
      subscriptionId: paypalSubscriptionId, approvalUrl }) });
  assert.equal(created.approvalUrl, approvalUrl);
  const unsafe = await createSubscription({ config, supabase, clientRequestId: requestId,
    fetchImpl: async () => json({ environment: 'sandbox', status: 'APPROVAL_PENDING',
      subscriptionId: paypalSubscriptionId, approvalUrl: 'https://example.com/approve' }) });
  assert.equal(unsafe, null);
});

test('sign-out clears protected dashboard fields before reload', () => {
  const protectedTargets = ['profile', 'library', 'payments', 'plan'].map(name => ({
    name, children: ['protected'], replaceChildren(...children) { this.children = children; }
  }));
  const metrics = ['library', 'payments', 'purchases'].map(name => ({ name, textContent: '1' }));
  const subscription = { hidden: false };
  const document = { querySelector(selector) {
    const protectedMatch = selector.match(/^\[data-reader-(profile|library|payments|plan)\]$/);
    if (protectedMatch) return protectedTargets.find(target => target.name === protectedMatch[1]);
    const metricMatch = selector.match(/^\[data-reader-metric="(library|payments|purchases)"\]$/);
    if (metricMatch) return metrics.find(target => target.name === metricMatch[1]);
    return selector === '[data-gpir-paypal-subscription]' ? subscription : null;
  } };
  clearReaderDashboard(document);
  assert.ok(protectedTargets.every(target => target.children.length === 0));
  assert.ok(metrics.every(target => target.textContent === '—'));
  assert.equal(subscription.hidden, true);
  const auth = fs.readFileSync(path.join(process.cwd(), 'assets/js/gpir-reader-auth.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(process.cwd(),
    'assets/js/gpir-reader-dashboard.mjs'), 'utf8');
  assert.match(auth, /gpir:reader-signed-out/);
  assert.match(dashboard, /gpir:reader-signed-out[\s\S]*clearReaderDashboard/);
});
