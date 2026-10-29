import assert from 'node:assert/strict';
import test from 'node:test';
import { createReaderSummaryHandler }
  from '../../supabase/functions/gpir-reader-summary/handler.mjs';

const origin = 'https://fintechoisis.com';
const sandboxUrl = 'https://hoewtptllwkcqrgryazu.supabase.co';
const userId = '11111111-1111-4111-8111-111111111111';
const allowedRecordId = '22222222-2222-4222-8222-222222222222';
const deniedRecordId = '33333333-3333-4333-8333-333333333333';
const paymentId = '44444444-4444-4444-8444-444444444444';
const subscriptionId = '55555555-5555-4555-8555-555555555555';
const planId = '66666666-6666-4666-8666-666666666666';
const allowedPublicationId = 'VK-GPIR-P-M39-ALLOW';
const deniedPublicationId = 'VK-GPIR-P-M39-DENY';
const readerToken = 'reader-session-sensitive-fixture';
const serviceKey = 'server-sensitive-fixture';
const readerEmail = 'reader-sensitive@example.test';

const env = Object.freeze({ SUPABASE_URL: sandboxUrl,
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: serviceKey, GPIR_ALLOWED_ORIGINS: origin,
  GPIR_PAYMENT_ENVIRONMENT: 'sandbox' });

const candidates = Object.freeze([
  Object.freeze({ publication_id: allowedPublicationId,
    supabase_record_id: allowedRecordId }),
  Object.freeze({ publication_id: deniedPublicationId,
    supabase_record_id: deniedRecordId })
]);

const payment = Object.freeze({ id: paymentId, publication_id: allowedPublicationId,
  supabase_record_id: allowedRecordId, currency: 'USD', expected_amount_minor: 1200,
  captured_amount_minor: 1200, status: 'CAPTURED',
  created_at: '2026-10-28T00:00:00Z', captured_at: '2026-10-28T00:01:00Z' });

const subscription = Object.freeze({ id: subscriptionId, status: 'ACTIVE',
  effective_from: '2026-10-28T00:00:00Z', effective_until: '2026-11-28T00:00:00Z' });

const plan = Object.freeze({ id: planId, display_name: 'Sandbox reader plan',
  currency: 'USD', unit_amount_minor: 1200, billing_interval: 'MONTH' });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status,
    headers: { 'content-type': 'application/json' } });
}

function readerRequest() {
  return new Request(`${sandboxUrl}/functions/v1/gpir-reader-summary`, { method: 'GET',
    headers: { origin, authorization: `Bearer ${readerToken}` } });
}

function fixture({ primary = json(candidates), fallback = json(candidates),
  fallbackExpected = false, fallbackCandidates = candidates } = {}) {
  const calls = [];
  const diagnostics = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url);
    calls.push({ value, options });
    if (value.endsWith('/auth/v1/user')) return json({ id: userId, email: readerEmail,
      email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
      user_metadata: { display_name: 'M39 Reader' } });
    if (value.endsWith('/rpc/gpir_list_entitlement_candidates_v2')) return primary;
    if (value.includes('/gpir_publication_access_policies?')) {
      assert.equal(fallbackExpected, true);
      return fallbackCandidates === candidates ? fallback : json(fallbackCandidates);
    }
    if (value.includes('/gpir_payment_offers?')) return json([]);
    if (value.includes('/gpir_payment_orders?')) return json([payment]);
    if (value.includes('/gpir_publication_purchase_entitlements?')) return json([]);
    if (value.includes('/gpir_paypal_subscriptions?')) return json([subscription]);
    if (value.includes('/gpir_subscription_plans?')) return json([plan]);
    if (value.endsWith('/rpc/resolve_publication_entitlement')) {
      const body = JSON.parse(options.body);
      return json([{ decision: body.p_publication_id === allowedPublicationId
        ? 'ALLOW' : 'DENY' }]);
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
  return { calls, diagnostics, fetchImpl };
}

async function invoke(options = {}) {
  const current = fixture(options);
  const response = await createReaderSummaryHandler({ env,
    fetchImpl: current.fetchImpl, now: () => Date.parse('2026-10-29T00:00:00Z'),
    logger: { error: (...args) => current.diagnostics.push(args) } })(readerRequest());
  return { ...current, response, body: await response.json() };
}

function resolverCalls(result) {
  return result.calls.filter(call => call.value.endsWith(
    '/rpc/resolve_publication_entitlement'));
}

test('primary candidate RPC success authorizes each candidate without fallback', async () => {
  const result = await invoke();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.availability.profile, 'AVAILABLE');
  assert.equal(result.body.availability.library, 'AVAILABLE');
  assert.deepEqual(result.body.library.map(item => item.publicationId),
    [allowedPublicationId]);
  assert.equal(result.body.summary.libraryCount, 1);
  assert.equal(result.body.payments.length, 1);
  assert.equal(result.body.plan.billingStatus, 'ACTIVE');
  assert.equal(result.calls.some(call => call.value.includes(
    '/gpir_publication_access_policies?')), false);
  assert.equal(resolverCalls(result).length, candidates.length);
});

test('PGRST202 uses the restricted policy fallback and still requires resolver ALLOW', async () => {
  const result = await invoke({ primary: json({ code: 'PGRST202',
    message: 'Function unavailable' }, 404), fallbackExpected: true });
  assert.equal(result.response.status, 200);
  const fallbackCall = result.calls.find(call => call.value.includes(
    '/gpir_publication_access_policies?'));
  assert.ok(fallbackCall);
  const fallbackUrl = new URL(fallbackCall.value);
  assert.equal(fallbackUrl.searchParams.get('select'),
    'publication_id,supabase_record_id');
  assert.equal(fallbackUrl.searchParams.get('status'), 'eq.ACTIVE');
  assert.equal(fallbackUrl.searchParams.get('access_class'), 'eq.ENTITLED');
  assert.equal(fallbackUrl.searchParams.get('order'), 'publication_id.asc');
  assert.equal(fallbackUrl.searchParams.get('limit'), '500');
  assert.equal(resolverCalls(result).length, candidates.length);
  assert.deepEqual(result.body.library.map(item => item.publicationId),
    [allowedPublicationId]);
  assert.equal(result.body.library.some(item =>
    item.publicationId === deniedPublicationId), false);
});

test('PGRST202 fallback rejects malformed candidate identifiers before resolution', async () => {
  const result = await invoke({ primary: json({ code: 'PGRST202' }, 404),
    fallbackExpected: true, fallbackCandidates: [...candidates,
      { publication_id: 'VK-GPIR-P-M39-INVALID', supabase_record_id: 'not-a-uuid' }] });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.availability.library, 'UNAVAILABLE');
  assert.deepEqual(result.body.library, []);
  assert.equal(result.body.summary.libraryCount, null);
  assert.equal(resolverCalls(result).length, 0);
});

test('primary and fallback failure preserve profile, payments and subscription', async () => {
  const sensitiveMessage = `fallback failed ${serviceKey} ${readerToken} ${readerEmail}`;
  const result = await invoke({ primary: json({ code: 'PGRST202',
    message: 'Function unavailable' }, 404), fallback: json({ code: 'PGRST503',
    message: sensitiveMessage }, 503), fallbackExpected: true });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.availability.profile, 'AVAILABLE');
  assert.equal(result.body.availability.library, 'UNAVAILABLE');
  assert.deepEqual(result.body.library, []);
  assert.equal(result.body.summary.libraryCount, null);
  assert.equal(result.body.availability.payments, 'AVAILABLE');
  assert.equal(result.body.payments.length, 1);
  assert.equal(result.body.availability.plan, 'AVAILABLE');
  assert.equal(result.body.plan.status, 'ACTIVE');
  assert.equal(result.body.plan.billingStatus, 'ACTIVE');
  assert.equal(result.body.subscriptionOffer.id, planId);
  assert.equal(resolverCalls(result).length, 0);
  assert.ok(result.diagnostics.length >= 1);
  assert.equal(result.diagnostics[0][0], 'gpir-reader-summary dependency failure');
  assert.equal(result.diagnostics[0][1].status, 503);
  assert.equal(result.diagnostics[0][1].code, 'PGRST503');
  const diagnostics = JSON.stringify(result.diagnostics);
  assert.doesNotMatch(diagnostics, new RegExp(serviceKey));
  assert.doesNotMatch(diagnostics, new RegExp(readerToken));
  assert.doesNotMatch(diagnostics, new RegExp(readerEmail));
});
