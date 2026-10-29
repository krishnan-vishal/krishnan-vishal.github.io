import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { initializeReaderDashboard, readerDashboardStatus }
  from '../../assets/js/gpir-reader-dashboard.mjs';
import { initializeMyGpirNavigation } from '../../assets/js/my-gpir-navigation.mjs';

const authScript = await readFile(new URL(
  '../../assets/js/gpir-reader-auth.js', import.meta.url), 'utf8');

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName; this.dataset = {}; this.children = [];
    this.listeners = new Map(); this.textContent = ''; this.className = '';
  }
  addEventListener(name, listener) {
    const values = this.listeners.get(name) || []; values.push(listener);
    this.listeners.set(name, values);
  }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(selector) {
    if (selector !== '[data-reader-auth-action]') return [];
    return this.children.filter(child => child.dataset?.readerAuthAction);
  }
}

function loadAuth(client) {
  let sessionCalls = 0;
  const wrappedClient = { auth: { ...client.auth,
    getSession: async () => { sessionCalls += 1; return client.auth.getSession(); } } };
  const window = { GPIR_SUPABASE_CLIENT: wrappedClient,
    location: Object.assign(new URL('https://fintechoisis.com/reader/my-gpir/'), {
      reload() {} }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {} };
  const document = { readyState: 'loading', head: { append() {} },
    createElement: tag => new MockElement(tag), addEventListener() {}, querySelectorAll: () => [],
    querySelector: selector => selector.startsWith('link[') ? new MockElement('link') : null };
  vm.runInNewContext(authScript, { window, document, URL, URLSearchParams,
    FormData: class {} });
  return { api: window.GPIRReaderAuth, document, sessionCalls: () => sessionCalls };
}

test('initial HTML provides styled signed-out controls without identity or Supabase readiness', async () => {
  const [home, dashboard] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../reader/my-gpir/index.html', import.meta.url), 'utf8')
  ]);
  for (const html of [home, dashboard]) {
    assert.match(html, /data-reader-auth-state="fallback"/);
    assert.match(html, /data-reader-auth-action="sign-in"[^>]*>Sign in</);
    assert.match(html, /data-reader-auth-action="create-account"[^>]*>Create account</);
    assert.doesNotMatch(html, /data-reader-auth-state="fallback"[^>]*>[\s\S]{0,500}(?:reader@example|access_token|user[_-]?id)/i);
  }
  assert.match(home, /reader-auth\.css\?v=3/);
  assert.match(home, /gpir-reader-auth\.js\?v=20261029c/);
  assert.match(dashboard, /gpir-reader-dashboard\.mjs\?v=20261029c/);
});

test('auth resolution is shared and replaces fallback controls without duplication', async () => {
  const session = { user: { id: 'private-reader-id' }, access_token: 'private-session-token' };
  const { api, document, sessionCalls } = loadAuth({ auth: {
    getSession: async () => ({ data: { session } }), signOut: async () => ({ error: null }) } });
  assert.equal(await api.sessionReady, session);
  assert.equal(sessionCalls(), 1);

  const container = new MockElement();
  const signIn = document.createElement('a'); signIn.dataset.readerAuthAction = 'sign-in';
  const create = document.createElement('a'); create.dataset.readerAuthAction = 'create-account';
  container.children = [signIn, create];
  api.renderGuestActions(container, '/reader/my-gpir/');
  assert.deepEqual(container.children, [signIn, create]);
  assert.equal(container.children.length, 2);
  api.renderAuthenticatedActions(container, { auth: { signOut: async () => ({ error: null }) } });
  assert.equal(container.children.length, 3);
  assert.deepEqual(container.children.map(child => child.textContent), ['Reader', 'My GPIR', 'Sign out']);
  assert.doesNotMatch(container.children.map(child => child.textContent).join(' '),
    /private-reader-id|private-session-token/);
});

function dashboardHarness() {
  const root = new MockElement(); root.dataset.state = 'loading';
  const status = new MockElement('p'); status.className = 'my-gpir-status';
  const refresh = new MockElement('button'); refresh.textContent = 'Refresh account';
  const protectedTargets = new Map(['profile', 'library', 'payments', 'plan']
    .map(name => [name, Object.assign(new MockElement(), { children: ['protected'] })]));
  const metrics = new Map(['library', 'payments', 'purchases', 'account']
    .map(name => [name, Object.assign(new MockElement(), { textContent: 'private' })]));
  const subscription = Object.assign(new MockElement(), { hidden: false });
  const onetime = Object.assign(new MockElement(), { hidden: false });
  const document = { querySelector(selector) {
    if (selector === '[data-reader-dashboard]') return root;
    if (selector === '[data-reader-dashboard-status]') return status;
    if (selector === '[data-reader-refresh]') return refresh;
    const protectedMatch = selector.match(/^\[data-reader-(profile|library|payments|plan)\]$/);
    if (protectedMatch) return protectedTargets.get(protectedMatch[1]);
    const metricMatch = selector.match(/^\[data-reader-metric="(library|payments|purchases|account)"\]$/);
    if (metricMatch) return metrics.get(metricMatch[1]);
    if (selector === '[data-gpir-paypal-subscription]') return subscription;
    if (selector === '[data-gpir-paypal-onetime]') return onetime;
    return null;
  } };
  const listeners = new Map(); let clientSessionCalls = 0;
  const global = { document, location: { pathname: '/reader/my-gpir/', search: '', hash: '',
    assign() {} }, GPIR_SUPABASE_CLIENT: { auth: { getSession: async () => {
      clientSessionCalls += 1; return { data: { session: null } };
    } } }, GPIRReaderAuth: { sessionReady: Promise.resolve({ user: { id: 'reader' },
    access_token: 'reader-session' }) },
  GPIR_READER_DASHBOARD_CONFIG: { endpoint: 'https://example.supabase.co/functions/v1/gpir-reader-summary' },
  addEventListener(name, listener) {
    const values = listeners.get(name) || []; values.push(listener); listeners.set(name, values);
  } };
  return { root, status, refresh, protectedTargets, metrics, subscription, onetime,
    document, global, listeners, clientSessionCalls: () => clientSessionCalls };
}

test('dashboard initialization and concurrent refresh are deduplicated with user-only retry', async () => {
  const harness = dashboardHarness(); let fetchCalls = 0; let releaseFirst;
  const fetchImpl = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) await new Promise(resolve => { releaseFirst = resolve; });
    return { ok: false, status: 503, json: async () => ({ code: 'DEPENDENCY_UNAVAILABLE' }) };
  };
  const first = initializeReaderDashboard({ global: harness.global,
    document: harness.document, fetchImpl });
  const duplicate = initializeReaderDashboard({ global: harness.global,
    document: harness.document, fetchImpl });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchCalls, 1);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, duplicate]), [false, false]);
  assert.equal(harness.clientSessionCalls(), 0);
  assert.equal(harness.root.dataset.state, 'unavailable');
  assert.equal(harness.refresh.textContent, 'Retry account load');
  assert.match(harness.status.textContent, /Protected information remains hidden/);
  assert.equal(harness.refresh.listeners.get('click').length, 1);
  for (const name of ['gpir:paypal-payment-verified', 'gpir:onetime-payment-verified',
    'gpir:paypal-sandbox-captured', 'gpir:reader-signed-out'])
    assert.equal(harness.listeners.get(name).length, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchCalls, 1);
  harness.refresh.listeners.get('click')[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchCalls, 2);
});

test('sign-out clears all protected fields and disables subsequent refreshes', async () => {
  const harness = dashboardHarness(); let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return { ok: false, status: 503, json: async () => ({}) };
  };
  await initializeReaderDashboard({ global: harness.global,
    document: harness.document, fetchImpl });
  harness.listeners.get('gpir:reader-signed-out')[0]();
  assert.equal(harness.root.dataset.state, 'signed-out');
  assert.ok([...harness.protectedTargets.values()].every(target => target.children.length === 0));
  assert.ok([...harness.metrics.values()].every(target => target.textContent === '—'));
  assert.equal(harness.subscription.hidden, true);
  assert.equal(harness.onetime.hidden, true);
  harness.refresh.listeners.get('click')[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchCalls, 1);
});

test('partial availability messaging is explicit and does not infer protected data', () => {
  const presentation = readerDashboardStatus({ availability: { profile: 'AVAILABLE',
    library: 'UNAVAILABLE', payments: 'AVAILABLE', plan: 'AVAILABLE',
    libraryPass: 'AVAILABLE' } });
  assert.match(presentation.message, /temporarily unavailable/);
  assert.match(presentation.message, /Unverified information remains hidden/);
  assert.equal(presentation.className, 'my-gpir-status my-gpir-warning');
});

test('navigation initialization is idempotent and hash changes never request account data', () => {
  const links = ['overview', 'profile', 'library', 'payments', 'plan'].map(section => ({
    dataset: { gpirSection: section }, setAttribute() {}, removeAttribute() {}, focus() {} }));
  const navigation = { dataset: {}, listeners: new Map(), querySelectorAll: () => links,
    addEventListener(name, listener) { this.listeners.set(name, listener); } };
  const grid = { dataset: {} }; const root = { dataset: {} };
  const document = { querySelector(selector) {
    if (selector === '[data-my-gpir-navigation]') return navigation;
    if (selector === '[data-reader-view]') return grid;
    if (selector === '[data-reader-dashboard]') return root;
    return null;
  } };
  const listeners = new Map(); let summaryRequests = 0;
  const global = { location: { hash: '' }, addEventListener(name, listener) {
    const values = listeners.get(name) || []; values.push(listener); listeners.set(name, values);
  }, fetch() { summaryRequests += 1; } };
  assert.equal(initializeMyGpirNavigation(global, document), true);
  assert.equal(initializeMyGpirNavigation(global, document), false);
  assert.equal(listeners.get('hashchange').length, 1);
  global.location.hash = '#library'; listeners.get('hashchange')[0]();
  assert.equal(grid.dataset.readerView, 'library');
  assert.equal(summaryRequests, 0);
});
