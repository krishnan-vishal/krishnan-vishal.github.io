import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReaderSummaryHandler } from '../../supabase/functions/gpir-reader-summary/handler.mjs';
import { createPreviewServer, previewConfiguration, sandboxProjectUrl }
  from '../../scripts/m38/serve-my-gpir-preview.mjs';
import { formatDate, formatMoney, normalizeReaderSummary,
  initializeReaderDashboard, requestReaderSummary } from '../../assets/js/gpir-reader-dashboard.mjs';
import { activeSection, syncMyGpirNavigation } from '../../assets/js/my-gpir-navigation.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const userId = '22222222-2222-4222-8222-222222222222';
const recordId = '66666666-6666-4666-8666-666666666666';
const paymentId = '55555555-5555-4555-8555-555555555555';
const publicationId = 'VK-GPIR-P-000000000018-2';
const now = Date.parse('2026-10-11T12:00:00.000Z');
const env = Object.freeze({ SUPABASE_URL: 'https://project.supabase.co',
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: 'sb_secret_fixture',
  GPIR_ALLOWED_ORIGINS: 'https://fintechoisis.com' });

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status,
    headers: { 'content-type': 'application/json' } });
}

function fetchPlan({ decision = 'DENY', payments = [], purchases = [],
  offers = [{ supabase_record_id: recordId, publication_id: publicationId }], fail = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const value = String(url); calls.push({ url: value, init });
    if (fail && value.includes(fail)) return json({ code: 'provider-failed' }, 503);
    if (value.endsWith('/auth/v1/user')) return json({ id: userId, email: 'reader@example.test',
      email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z',
      user_metadata: { display_name: 'GPIR Reader' } });
    if (value.includes('/gpir_payment_offers?')) return json(offers);
    if (value.includes('/gpir_payment_orders?')) return json(payments);
    if (value.includes('/gpir_publication_purchase_entitlements?')) return json(purchases);
    if (value.endsWith('/rpc/resolve_publication_entitlement')) return json([{ decision }]);
    throw new Error(`Unexpected URL ${value}`);
  };
  return { calls, fetchImpl };
}

function request({ token = 'reader.session.token', origin = 'https://fintechoisis.com', method = 'GET' } = {}) {
  const headers = { origin }; if (token) headers.authorization = `Bearer ${token}`;
  return new Request('https://project.supabase.co/functions/v1/gpir-reader-summary', { method, headers });
}

async function invoke(options = {}, requestOptions = {}) {
  const plan = fetchPlan(options);
  const result = await createReaderSummaryHandler({ env, fetchImpl: plan.fetchImpl,
    now: () => now })(request(requestOptions));
  return { result, body: result.status === 204 ? null : await result.json(), calls: plan.calls };
}

test('anonymous and cross-origin requests are rejected before protected providers', async () => {
  const anonymous = await invoke({}, { token: null });
  assert.equal(anonymous.result.status, 401); assert.equal(anonymous.calls.length, 0);
  const crossOrigin = await invoke({}, { origin: 'https://attacker.example' });
  assert.equal(crossOrigin.result.status, 403); assert.equal(crossOrigin.calls.length, 0);
});

test('empty account summary is accurate and entitlement decisions remain authoritative', async () => {
  const { result, body, calls } = await invoke();
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.deepEqual(body.library, []); assert.deepEqual(body.payments, []);
  assert.equal(body.plan.status, 'NOT_ENROLLED'); assert.equal(body.plan.billingStatus, 'NOT_ACTIVE');
  assert.equal(body.profile.email, 'reader@example.test'); assert.equal(body.profile.emailVerified, true);
  const resolver = calls.find(call => call.url.endsWith('/rpc/resolve_publication_entitlement'));
  assert.ok(resolver); assert.equal(resolver.init.headers.authorization, 'Bearer reader.session.token');
  assert.deepEqual(JSON.parse(resolver.init.body), { p_publication_id: publicationId,
    p_supabase_record_id: recordId });
});

test('verified purchase appears in library and payment output excludes provider identifiers', async () => {
  const payment = { id: paymentId, publication_id: publicationId, supabase_record_id: recordId,
    currency: 'USD', expected_amount_minor: 1250, captured_amount_minor: 1250,
    status: 'CAPTURED', created_at: '2026-10-11T10:00:00Z', captured_at: '2026-10-11T10:01:00Z',
    paypal_order_id: 'MUST_NOT_LEAK', paypal_capture_id: 'MUST_NOT_LEAK' };
  const purchase = { publication_id: publicationId, supabase_record_id: recordId,
    status: 'ACTIVE', effective_from: '2026-10-11T10:01:00Z', revoked_at: null };
  const { body, calls } = await invoke({ decision: 'ALLOW', payments: [payment], purchases: [purchase] });
  assert.equal(body.library[0].accessSource, 'ONE_TIME_PURCHASE');
  assert.equal(body.payments[0].status, 'CAPTURED'); assert.equal(body.summary.activePurchaseCount, 1);
  assert.doesNotMatch(JSON.stringify(body), /MUST_NOT_LEAK|paypal_order_id|paypal_capture_id|sb_secret_fixture/);
  const protectedCalls = calls.filter(call => /gpir_(payment_orders|publication_purchase_entitlements)/.test(call.url));
  assert.equal(protectedCalls.length, 2);
  assert.ok(protectedCalls.every(call => call.init.headers.authorization === 'Bearer sb_secret_fixture'));
});

test('resolver-authorized access without a purchase is reported as plan access without billing claims', async () => {
  const { body } = await invoke({ decision: 'ALLOW' });
  assert.equal(body.library[0].accessSource, 'PLAN'); assert.equal(body.plan.status, 'ACTIVE');
  assert.equal(body.plan.billingStatus, 'NOT_ACTIVE');
});

test('provider and malformed entitlement results fail closed', async () => {
  const failed = await invoke({ fail: '/gpir_payment_orders?' });
  assert.equal(failed.result.status, 503); assert.equal(failed.body.code, 'READER_SUMMARY_UNAVAILABLE');
  const malformed = await invoke({ decision: 'MAYBE' });
  assert.equal(malformed.result.status, 503);
  assert.equal(malformed.body.code, 'ENTITLEMENT_RESOLUTION_UNAVAILABLE');
});

test('browser client accepts only sanitized summaries and formats reader-safe values', async () => {
  const result = await requestReaderSummary({ endpoint: 'https://project.supabase.co/functions/v1/gpir-reader-summary',
    token: 'reader.session.token', fetchImpl: async () => json({ status: 'OK',
      profile: { email: 'reader@example.test', displayName: null, memberSince: null, emailVerified: true },
      library: [], payments: [], plan: { status: 'NOT_ENROLLED', billingStatus: 'NOT_ACTIVE' },
      summary: { activePurchaseCount: 0 } }) });
  assert.equal(result.status, 'OK'); assert.equal(result.summary.library.length, 0);
  assert.equal(formatMoney(1250), '$12.50'); assert.equal(formatMoney(-1), '—');
  assert.equal(formatDate(null), 'Not available');
  assert.equal(normalizeReaderSummary({ status: 'OK' }), null);
});

test('dashboard route preserves its destination and redirects readers without a session', async () => {
  const root = { dataset: {} }; let remembered = null; let assigned = null;
  const document = { querySelector: selector => selector === '[data-reader-dashboard]' ? root : null };
  const global = { document, location: { pathname: '/reader/my-gpir/', search: '', hash: '#library',
    assign: value => { assigned = value; } },
  GPIR_SUPABASE_CLIENT: { auth: { getSession: async () => ({ data: { session: null } }) } },
  GPIRReaderAuth: { rememberReturnTo: value => { remembered = value; } } };
  assert.equal(await initializeReaderDashboard({ global, document }), false);
  assert.equal(remembered, '/reader/my-gpir/#library');
  assert.equal(assigned, '/reader/sign-in/?returnTo=%2Freader%2Fmy-gpir%2F%23library');
});

test('dashboard routes, empty states, responsive navigation and refresh-only payment signal exist', () => {
  const dashboard = fs.readFileSync(path.join(repo, 'reader/my-gpir/index.html'), 'utf8');
  const client = fs.readFileSync(path.join(repo, 'assets/js/gpir-reader-dashboard.mjs'), 'utf8');
  const css = fs.readFileSync(path.join(repo, 'assets/css/my-gpir.css'), 'utf8');
  for (const section of ['Profile', 'My Library', 'Payment History', 'Subscription &amp; Plan'])
    assert.match(dashboard, new RegExp(section));
  for (const route of ['profile', 'library', 'payments', 'plan'])
    assert.ok(fs.existsSync(path.join(repo, `reader/${route}/index.html`)));
  assert.match(dashboard, /No billing action is taken/);
  assert.match(client, /gpir:paypal-sandbox-captured[\s\S]*refresh/);
  assert.doesNotMatch(client, /gpir_payment_orders|gpir_publication_purchase_entitlements|GPIR_SUPABASE_SECRET_KEY/);
  assert.match(css, /@media\(max-width:900px\)/); assert.match(css, /@media\(max-width:600px\)/);
});

test('account navigation is a full-width vertical list with regular Arial labels and no horizontal scroll', () => {
  const dashboard = fs.readFileSync(path.join(repo, 'reader/my-gpir/index.html'), 'utf8');
  const preview = fs.readFileSync(path.join(repo, 'artifacts/m38/my-gpir-empty-state-preview.html'), 'utf8');
  const css = fs.readFileSync(path.join(repo, 'assets/css/my-gpir.css'), 'utf8');
  assert.ok(dashboard.indexOf('data-my-gpir-navigation') < dashboard.indexOf('my-gpir-grid'));
  assert.equal((dashboard.match(/data-gpir-section=/g) || []).length, 5);
  assert.match(dashboard, /my-gpir-nav__icon/); assert.match(dashboard, /my-gpir-nav__description/);
  assert.match(dashboard, /my-gpir-nav__chevron/);
  assert.match(css, /\.my-gpir-nav ul\{display:grid/);
  assert.match(css, /\.my-gpir-nav__label\{[^}]*font:400[^}]*Arial/);
  assert.doesNotMatch(css, /\.my-gpir-nav[^}]*overflow-x/);
  assert.doesNotMatch(dashboard, /M38|preview/i); assert.doesNotMatch(preview, /M38|preview/i);
});

test('section hashes update the accessible navigation active state', () => {
  const links = ['overview', 'profile', 'library', 'payments', 'plan'].map(section => ({
    dataset: { gpirSection: section }, current: false,
    setAttribute(name, value) { if (name === 'aria-current' && value === 'page') this.current = true; },
    removeAttribute(name) { if (name === 'aria-current') this.current = false; }
  }));
  const navigation = { querySelectorAll: () => links };
  const document = { querySelector: () => navigation };
  assert.equal(activeSection('#payments'), 'payments'); assert.equal(activeSection('#unknown'), 'overview');
  assert.equal(syncMyGpirNavigation(document, '#library'), true);
  assert.deepEqual(links.filter(link => link.current).map(link => link.dataset.gpirSection), ['library']);
});

test('server endpoint is the only browser-to-payment-table boundary and emits no secrets', () => {
  const handler = fs.readFileSync(path.join(repo,
    'supabase/functions/gpir-reader-summary/handler.mjs'), 'utf8');
  const index = fs.readFileSync(path.join(repo,
    'supabase/functions/gpir-reader-summary/index.ts'), 'utf8');
  assert.match(handler, /resolve_publication_entitlement/);
  assert.match(handler, /gpir_payment_offers/);
  assert.match(handler, /gpir_payment_orders/);
  assert.match(handler, /gpir_publication_purchase_entitlements/);
  assert.doesNotMatch(handler, /gpir_publication_access_policies|gpir_user_access_profiles/);
  assert.match(index, /GPIR_SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(fs.readFileSync(path.join(repo, 'reader/my-gpir/index.html'), 'utf8'),
    /sb_secret_|service_role|GPIR_SUPABASE_SECRET_KEY/);
});

test('Codespaces preview serves the dashboard with a fixed Sandbox-only browser config', async () => {
  const env = { GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview_fixture' };
  const config = previewConfiguration(env);
  assert.deepEqual(config, { url: sandboxProjectUrl,
    publishableKey: 'sb_publishable_preview_fixture' });
  assert.equal(previewConfiguration({ GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY: '' }), null);
  assert.equal(previewConfiguration({ GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY: 'service_role' }), null);

  const server = createPreviewServer({ env });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const [dashboard, publicConfig] = await Promise.all([
      fetch(base), fetch(`${base}/assets/js/gpir-supabase-public-config.js`)
    ]);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /data-reader-dashboard/);
    assert.equal(publicConfig.status, 200);
    assert.equal(publicConfig.headers.get('cache-control'), 'no-store');
    const source = await publicConfig.text();
    assert.match(source, /hoewtptllwkcqrgryazu\.supabase\.co/);
    assert.match(source, /sb_publishable_preview_fixture/);
    assert.doesNotMatch(source, /qlnvhfapctcpzqyuhhth|GPIR_SUPABASE_SECRET_KEY/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('Codespaces preview refuses configuration without a Sandbox publishable key', async () => {
  const server = createPreviewServer({ env: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}` +
      '/assets/js/gpir-supabase-public-config.js');
    assert.equal(response.status, 503);
    assert.match(await response.text(), /GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
