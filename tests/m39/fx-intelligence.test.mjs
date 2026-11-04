import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { calculateMetrics, comparableRateObservation, normalizeFxPair,
  pointsForPeriod, previousPeriodPoints, selectionFromSearch,
  fxIntelligenceReturnTo, accessMarkup } from '../../assets/js/fx-intelligence.mjs';
import { rememberFxIntelligenceReturn, consumeFxIntelligenceReturn, verifySubscription }
  from '../../assets/js/gpir-paypal-subscription.mjs';
import { createReaderSummaryHandler }
  from '../../supabase/functions/gpir-reader-summary/handler.mjs';

const origin = 'https://fintechoisis.com';
const projectUrl = 'https://hoewtptllwkcqrgryazu.supabase.co';
const userId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const serviceKey = 'fixture-service-secret';
const currentTime = Date.parse('2026-11-04T00:00:00.000Z');
const readerAuthSource = await readFile(new URL('../../assets/js/gpir-reader-auth.js',
  import.meta.url), 'utf8');
const env = Object.freeze({ SUPABASE_URL: projectUrl,
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  GPIR_SUPABASE_SECRET_KEY: serviceKey,
  GPIR_ALLOWED_ORIGINS: origin, GPIR_PAYMENT_ENVIRONMENT: 'sandbox' });
const catalog = Object.freeze(['USD', 'JPY', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'SGD']
  .map(iso_code => Object.freeze({ iso_code, name: `${iso_code} Currency`,
    start_date: '1999-01-04', end_date: null })));
const fixes = Object.freeze([
  { date: '1998-12-31', base: 'USD', quote: 'JPY', rate: 800 },
  { date: '2026-11-02', base: 'USD', quote: 'JPY', rate: 154.1 },
  { date: '2026-11-03', base: 'USD', quote: 'JPY', rate: 155.2 },
  { date: '2026-11-04', base: 'USD', quote: 'JPY', rate: 156.4 },
  { date: '2026-11-05', base: 'USD', quote: 'JPY', rate: 900 }
]);
const activeSubscription = Object.freeze({ id: subscriptionId, status: 'ACTIVE',
  effective_from: '2026-10-01T00:00:00.000Z',
  effective_until: '2026-12-01T00:00:00.000Z' });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status,
    headers: { 'content-type': 'application/json' } });
}

function request(pair, token = 'reader.fixture.token') {
  return new Request(`${projectUrl}/functions/v1/gpir-reader-summary?fxPair=${encodeURIComponent(pair)}`,
    { headers: { origin, authorization: token ? `Bearer ${token}` : '' } });
}

function mockFetch({ subscription = activeSubscription, subscriptionFailure = false,
  sourceFailure = false,
  archive = [], currencies = catalog } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === '/auth/v1/user') return json({ id: userId });
    if (url.pathname === '/rest/v1/gpir_paypal_subscriptions') {
      if (subscriptionFailure) return json({ message: 'unavailable' }, 503);
      assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${serviceKey}`);
      return json(subscription ? [subscription] : []);
    }
    if (url.pathname === '/v2/currencies') return json(currencies);
    if (url.pathname === '/v2/providers/ecb/rates') {
      if (sourceFailure && url.searchParams.get('from') === '1999-01-04' &&
          url.searchParams.get('to') !== url.searchParams.get('from'))
        throw new Error('Frankfurter fixture unavailable');
      if (url.searchParams.get('base') === 'EUR') {
        const date = url.searchParams.get('from');
        if (date !== url.searchParams.get('to')) return json([
          { date: '2026-11-02', base: 'EUR', quote: 'JPY', rate: 177.1 },
          { date: '2026-11-03', base: 'EUR', quote: 'JPY', rate: 178.3 }
        ]);
        return json([{ date, base: 'EUR', quote: 'USD', rate: 1.15 },
          { date, base: 'EUR', quote: 'JPY', rate: 178.3 },
          { date, base: 'EUR', quote: 'GBP', rate: 0.88 },
          { date, base: 'EUR', quote: 'CHF', rate: 0.93 },
          { date, base: 'EUR', quote: 'CAD', rate: 1.61 },
          { date, base: 'EUR', quote: 'AUD', rate: 1.74 },
          { date, base: 'EUR', quote: 'SGD', rate: 1.49 }]);
      }
      const base = url.searchParams.get('base');
      const quote = url.searchParams.get('quotes');
      if (base === 'USD') return json(fixes);
      if (base === 'CAD') return json([
        { date: '2026-11-02', base: 'CAD', quote: 'JPY', rate: 110.1 },
        { date: '2026-11-03', base: 'CAD', quote: 'JPY', rate: 111.2 }
      ]);
      if (base === 'EUR') return json([
        { date: '2026-11-02', base: 'EUR', quote: 'JPY', rate: 177.1 },
        { date: '2026-11-03', base: 'EUR', quote: 'JPY', rate: 178.3 }
      ]);
      return json([{ date: '2026-11-03', base, quote, rate: 1.25 }]);
    }
    if (url.pathname === '/rest/v1/fx_historical_archive') return json(archive);
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, fetchImpl };
}

function handler(fetchImpl, logger = { error() {} }) {
  return createReaderSummaryHandler({ env, fetchImpl,
    now: () => currentTime, logger });
}

test('pair normalization rejects identical and malformed currencies', () => {
  assert.deepEqual(normalizeFxPair(' usd ', 'jpy'), { base: 'USD', quote: 'JPY' });
  assert.equal(normalizeFxPair('USD', 'USD'), null);
  assert.equal(normalizeFxPair('US', 'JPY'), null);
});

test('reader sign-in accepts the FX Intelligence dashboard as a safe return destination', () => {
  const values = new Map();
  const window = { location: new URL(origin),
    localStorage: { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    addEventListener() {} };
  const document = { readyState: 'loading', head: { append() {} },
    createElement: () => ({}), addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null };
  vm.runInNewContext(readerAuthSource,
    { window, document, URL, URLSearchParams, FormData: class {} });
  assert.equal(window.GPIRReaderAuth.safeReturnTo('/pages/fx/intelligence.html'),
    '/pages/fx/intelligence.html');
});

test('ticker-selected pairs and periods survive dashboard and access routes', () => {
  const selection = selectionFromSearch('?base=eur&quote=jpy&period=5Y');
  assert.deepEqual({ ...selection }, { base: 'EUR', quote: 'JPY', period: '5Y' });
  assert.equal(selectionFromSearch('?base=USD&quote=USD'), null);
  const returnTo = fxIntelligenceReturnTo(selection, selection.period);
  assert.equal(returnTo,
    '/pages/fx/intelligence.html?base=EUR&quote=JPY&period=5Y');
  const guest = accessMarkup(new Error('SESSION_REQUIRED'), returnTo);
  assert.match(guest, /\/reader\/sign-in\/\?returnTo=%2Fpages%2Ffx%2Fintelligence\.html%3Fbase%3DEUR%26quote%3DJPY%26period%3D5Y/);
  assert.match(guest, /\/reader\/create-account\/\?returnTo=/);
  assert.match(accessMarkup(new Error('SUBSCRIPTION_REQUIRED'), returnTo),
    /\/reader\/plan\/\?returnTo=/);
  assert.match(accessMarkup(new Error('SUBSCRIPTION_EXPIRED'), returnTo),
    /Renew subscription/);
});

test('subscription plan return is retained only for an allowed FX pair destination', () => {
  const values = new Map();
  const window = { location: new URL(origin),
    sessionStorage: { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {} };
  const document = { readyState: 'loading', head: { append() {} },
    createElement: () => ({}), addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null };
  vm.runInNewContext(readerAuthSource,
    { window, document, URL, URLSearchParams, FormData: class {} });
  const destination = '/pages/fx/intelligence.html?base=EUR&quote=JPY&period=5Y';
  assert.equal(rememberFxIntelligenceReturn(window, destination), true);
  assert.equal(consumeFxIntelligenceReturn(window), destination);
  assert.equal(values.size, 0);
  assert.equal(rememberFxIntelligenceReturn(window, '/reader/plan/'), false);
});

test('server-verified subscription completion returns to the selected FX pair', async () => {
  const values = new Map();
  const window = { location: new URL(origin),
    sessionStorage: { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {} };
  const document = { readyState: 'loading', head: { append() {} },
    createElement: () => ({}), addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null };
  vm.runInNewContext(readerAuthSource,
    { window, document, URL, URLSearchParams, FormData: class {} });
  const destination = '/pages/fx/intelligence.html?base=EUR&quote=JPY&period=5Y';
  assert.equal(rememberFxIntelligenceReturn(window, destination), true);

  const assignments = [];
  const target = { location: { origin, assign: value => assignments.push(value) },
    sessionStorage: window.sessionStorage, GPIRReaderAuth: window.GPIRReaderAuth,
    dispatchEvent() {} };
  const config = { enabled: true, environment: 'sandbox',
    planId: '33333333-3333-4333-8333-333333333333',
    supabaseUrl: projectUrl,
    createSubscriptionEndpoint: `${projectUrl}/functions/v1/gpir-paypal-create-subscription`,
    verifySubscriptionEndpoint: `${projectUrl}/functions/v1/gpir-paypal-verify-subscription` };
  const result = await verifySubscription({ config,
    supabase: { auth: { getSession: async () => ({ data: { session: {
      access_token: 'fixture-token'
    } } }) } },
    subscriptionId: 'I-TEST12345678', eventTarget: target,
    fetchImpl: async () => json({ environment: 'sandbox', status: 'ACTIVE',
      verification: 'SERVER_VERIFIED', publicationAccess: 'PUBLICATION_SCOPED',
      paymentConfirmed: true })
  });
  assert.equal(result.status, 'ACTIVE');
  assert.deepEqual(assignments, [destination]);
  assert.equal(values.size, 0);
});

test('six period windows use only source observations and actual fixing dates', () => {
  const points = [
    { date: '2021-11-04', rate: 100 }, { date: '2025-11-04', rate: 108 },
    { date: '2026-08-04', rate: 110 }, { date: '2026-09-12', rate: 109 },
    { date: '2026-10-04', rate: 111 }, { date: '2026-11-02', rate: 112 },
    { date: '2026-11-03', rate: 113 }
  ];
  assert.deepEqual(pointsForPeriod(points, 'W', '2026-11-03').map(point => point.date),
    ['2026-11-02', '2026-11-03']);
  assert.deepEqual(pointsForPeriod(points, 'M', '2026-11-03').map(point => point.date),
    ['2026-10-04', '2026-11-02', '2026-11-03']);
  assert.deepEqual(pointsForPeriod(points, 'Q', '2026-11-03').map(point => point.date),
    ['2026-08-04', '2026-09-12', '2026-10-04', '2026-11-02', '2026-11-03']);
  assert.equal(pointsForPeriod(points, 'Y', '2026-11-03').length, 6);
  assert.equal(pointsForPeriod(points, '5Y', '2026-11-03').length, 7);
  assert.equal(pointsForPeriod(points, 'MAX', '2026-11-03').length, points.length);
  assert.deepEqual(previousPeriodPoints(points, 'M', '2026-11-03').map(point => point.date),
    ['2026-09-12']);
});

test('calendar-month windows clamp to the last valid day without overflowing', () => {
  const points = [
    { date: '2024-02-28', rate: 100 }, { date: '2024-02-29', rate: 101 },
    { date: '2024-03-01', rate: 102 }, { date: '2024-03-31', rate: 103 }
  ];
  assert.deepEqual(pointsForPeriod(points, 'M', '2024-03-31').map(point => point.date),
    ['2024-02-29', '2024-03-01', '2024-03-31']);
});

test('deterministic metrics report change, extrema, returns, percentile and minimum volatility history', () => {
  const fixture = [
    { date: '2026-01-01', rate: 100 }, { date: '2026-01-02', rate: 102 },
    { date: '2026-01-03', rate: 98 }, { date: '2026-01-04', rate: 101 }
  ];
  const metrics = calculateMetrics(fixture);
  assert.ok(Math.abs(metrics.changePercent - 1) < 1e-12);
  assert.equal(metrics.high.date, '2026-01-02');
  assert.equal(metrics.low.date, '2026-01-03');
  assert.equal(metrics.returns.length, 3);
  assert.equal(metrics.historicalPercentile, 75);
  assert.equal(metrics.annualizedVolatility, null);
  assert.deepEqual(metrics.distribution,
    { positive: 2, negative: 1, flat: 0, observations: 3 });
  assert.equal(calculateMetrics(fixture.slice(0, 1)).status, 'INSUFFICIENT_OBSERVATIONS');
});

test('moving-average and annualised-volatility calculations require sufficient observations', () => {
  const points = Array.from({ length: 200 }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
    rate: 100 + index
  }));
  const metrics = calculateMetrics(points);
  assert.equal(metrics.movingAverages[20], 289.5);
  assert.equal(metrics.movingAverages[50], 274.5);
  assert.equal(metrics.movingAverages[200], 199.5);
  assert.ok(metrics.annualizedVolatility > 0);
});

test('last comparable rate uses the last earlier observed fixing within disclosed tolerance', () => {
  const points = [
    { date: '2026-01-01', rate: 100 }, { date: '2026-01-02', rate: 90 },
    { date: '2026-01-03', rate: 100.5 }
  ];
  assert.deepEqual(comparableRateObservation(points, 100.5),
    { date: '2026-01-01', rate: 100 });
  assert.equal(comparableRateObservation(points, 120), null);
});

test('FX history requires a server-verified authenticated session', async () => {
  const fixture = mockFetch();
  const response = await handler(fixture.fetchImpl)(request('USD/JPY', null));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'SESSION_REQUIRED');
  assert.equal(fixture.calls.length, 0);
});

test('malformed currency requests are rejected and supported currencies are source-validated', async () => {
  const invalidFixture = mockFetch();
  const invalid = await handler(invalidFixture.fetchImpl)(request('USD-XXX'));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'INVALID_FX_PAIR');

  const unsupportedFixture = mockFetch();
  const unsupported = await handler(unsupportedFixture.fetchImpl)(request('USD/XXX'));
  assert.equal(unsupported.status, 404);
  assert.equal((await unsupported.json()).code, 'UNSUPPORTED_CURRENCY');
  assert.equal(unsupportedFixture.calls.some(call =>
    call.url.pathname === '/v2/providers/ecb/rates' &&
    call.url.searchParams.get('from') === '1999-01-04'), false);
});

test('FX history is denied to a signed-in reader without an active subscription', async () => {
  const fixture = mockFetch({ subscription: null });
  const response = await handler(fixture.fetchImpl)(request('USD/JPY'));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'SUBSCRIPTION_REQUIRED');
  assert.equal(fixture.calls.some(call => call.url.hostname === 'api.frankfurter.dev'), false);
});

test('entitlement verification failures fail closed without requesting source history', async () => {
  const fixture = mockFetch({ subscriptionFailure: true });
  const response = await handler(fixture.fetchImpl)(request('USD/JPY'));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'SUBSCRIPTION_CHECK_UNAVAILABLE');
  assert.equal(fixture.calls.some(call => call.url.hostname === 'api.frankfurter.dev'), false);
});

test('expired subscriptions receive renewal state and no historical data', async () => {
  const fixture = mockFetch({ subscription: { ...activeSubscription, status: 'EXPIRED',
    effective_until: '2026-11-03T00:00:00.000Z' } });
  const response = await handler(fixture.fetchImpl)(request('USD/JPY'));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'SUBSCRIPTION_EXPIRED');
  assert.equal(fixture.calls.some(call => call.url.hostname === 'api.frankfurter.dev'), false);
});

test('active subscriber receives attributed source fixing dates separately from GPIR capture time', async () => {
  const fixture = mockFetch({ archive: [{ timestamp: '2026-11-03T10:07:00.000Z',
    rate: 155.1, source: 'reference-open-er-api' }] });
  const response = await handler(fixture.fetchImpl)(request('USD/JPY'));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.history.status, 'AVAILABLE');
  assert.equal(body.history.source, 'European Central Bank via Frankfurter');
  assert.equal(body.history.sourceTermsUrl,
    'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html');
  assert.equal(body.history.firstFixingDate, '2026-11-02');
  assert.equal(body.history.lastFixingDate, '2026-11-04');
  assert.deepEqual(body.history.points.map(point => point.date),
    ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(body.history.points.some(point => point.rate === 900), false);
  assert.equal(body.history.retrievedAt, new Date(currentTime).toISOString());
  assert.equal(body.gpirCapture.capturedAt, '2026-11-03T10:07:00.000Z');
  assert.equal(body.gpirCaptureStatus, 'AVAILABLE');
  assert.equal(body.history.peerComparisons.find(peer => peer.pair === 'EUR/JPY').rate, 178.3);
  assert.match(body.archiveNotice, /not mixed/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
});

test('independent pairs return distinct contexts while sharing only same-pair cache entries', async () => {
  const fixture = mockFetch();
  const read = handler(fixture.fetchImpl);
  const cad = await read(request('CAD/JPY'));
  const eur = await read(request('EUR/JPY'));
  const cadBody = await cad.json();
  assert.equal(cadBody.history.pair, 'CAD/JPY');
  assert.deepEqual(cadBody.history.points.map(point => point.rate), [110.1, 111.2]);
  const euroBody = await eur.json();
  assert.equal(euroBody.history.pair, 'EUR/JPY');
  assert.deepEqual(euroBody.history.points.map(point => point.rate), [177.1, 178.3]);
  const historyRequests = fixture.calls.filter(call =>
    call.url.pathname === '/v2/providers/ecb/rates' &&
    call.url.searchParams.get('from') === '1999-01-04' &&
    call.url.searchParams.get('to') !== '1999-01-04');
  assert.deepEqual(historyRequests.map(call => call.url.searchParams.get('base')),
    ['CAD', 'EUR']);
});

test('source failures fail closed without a success-shaped empty history', async () => {
  const fixture = mockFetch({ sourceFailure: true });
  const response = await handler(fixture.fetchImpl)(request('GBP/JPY'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'ERROR', code: 'FX_SOURCE_UNAVAILABLE' });
});
