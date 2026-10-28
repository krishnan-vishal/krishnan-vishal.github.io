import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { captureOnetimeOrder, createOnetimeOrder, loadOnetimeCatalog,
  normalizeOnetimeOffers, onetimeCheckoutConfig }
  from '../../assets/js/gpir-paypal-onetime.mjs';
import { readerDashboardState } from '../../assets/js/gpir-reader-dashboard.mjs';

const projectUrl = 'https://qlnvhfapctcpzqyuhhth.supabase.co';
const publishableKey = 'sb_publishable_browser_key';
const accessToken = 'reader-jwt';
const orderId = '5O190127TN364715T';
const effectiveUntil = '2026-11-27T12:00:00.000Z';
const currencies = ['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD'];

function offer(currency, index = 0) {
  return { offerId: `10000000-0000-4000-8000-00000000000${index}`,
    passId: 'GPIR_PREMIUM_LIBRARY_30D', publicationId: 'PREMIUM_LIBRARY',
    supabaseRecordId: null, displayName: 'GPIR Premium Library — 30-Day Pass',
    currency, amountMinor: 999, amount: '9.99', durationDays: 30 };
}

function globalConfig() {
  return { location: { hostname: 'fintechoisis.com' },
    GPIR_SUPABASE_PUBLIC_CONFIG: { url: projectUrl, publishableKey },
    GPIR_SUPABASE_CLIENT: { auth: { getSession: async () => ({ data: { session: {
      user: { id: 'reader' }, access_token: accessToken
    } } }) } }, crypto: { randomUUID: () => '20000000-0000-4000-8000-000000000000' } };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status,
    headers: { 'content-type': 'application/json' } });
}

test('catalog exposes only valid server-returned currencies in the approved order', () => {
  const values = currencies.map(offer).reverse();
  values.push({ ...offer('USD'), amount: '1.00', amountMinor: 100 });
  values.push(offer('JPY'));
  const result = normalizeOnetimeOffers(values);
  assert.deepEqual(result.map(value => value.currency), currencies);
  assert.ok(result.every(value => value.amount === '9.99' && value.durationDays === 30));
  assert.deepEqual(normalizeOnetimeOffers([offer('EUR', 1), offer('CAD', 2)])
    .map(value => value.currency), ['EUR', 'CAD']);
});

test('catalog GET is authenticated and bound to the production project and host', async () => {
  const global = globalConfig();
  let request;
  const catalog = await loadOnetimeCatalog({ global, fetchImpl: async (url, options) => {
    request = { url: String(url), options };
    return json({ status: 'READY', environment: 'live',
      clientId: 'production-paypal-client-id', offers: currencies.map(offer) });
  } });
  assert.equal(request.url, `${projectUrl}/functions/v1/gpir-onetime-create-order`);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.get('authorization'), `Bearer ${accessToken}`);
  assert.equal(request.options.headers.get('apikey'), publishableKey);
  assert.deepEqual(catalog.offers.map(value => value.currency), currencies);
  assert.equal(onetimeCheckoutConfig({ ...global, location: { hostname: 'attacker.example' } }), null);
  assert.equal(onetimeCheckoutConfig({ ...global, GPIR_SUPABASE_PUBLIC_CONFIG: {
    url: 'https://hoewtptllwkcqrgryazu.supabase.co', publishableKey } }), null);
});

test('order creation sends identifiers only and capture trusts only server verification', async () => {
  const global = globalConfig();
  const approved = offer('USD');
  const config = onetimeCheckoutConfig(global);
  const catalog = { ...config, environment: 'live', clientId: 'production-paypal-client-id',
    offers: [approved] };
  let createBody;
  const created = await createOnetimeOrder({ global, catalog, offer: approved,
    fetchImpl: async (_url, options) => {
      createBody = JSON.parse(options.body);
      return json({ status: 'CREATED', environment: 'live', orderId }, 201);
    } });
  assert.equal(created, orderId);
  assert.deepEqual(createBody, { passId: 'GPIR_PREMIUM_LIBRARY_30D', currency: 'USD',
    requestId: '20000000-0000-4000-8000-000000000000' });
  assert.equal('amount' in createBody, false);
  assert.equal('amountMinor' in createBody, false);

  const captured = await captureOnetimeOrder({ global, catalog, orderId,
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), { orderId });
      return json({ status: 'CAPTURED', environment: 'live', orderId,
        entitlement: 'SERVER_VERIFIED', effectiveUntil });
    } });
  assert.equal(captured.status, 'CAPTURED');
  assert.equal(captured.effectiveUntil, effectiveUntil);

  await assert.rejects(captureOnetimeOrder({ global, catalog, orderId,
    fetchImpl: async () => json({ status: 'CAPTURED', environment: 'live', orderId,
      effectiveUntil }) }), /CAPTURE_NOT_VERIFIED/);
  const pending = await captureOnetimeOrder({ global, catalog, orderId,
    fetchImpl: async () => json({ status: 'PENDING', environment: 'live', orderId }, 202) });
  assert.deepEqual(pending, { status: 'PENDING', orderId });
});

test('optional recurring checkout availability does not produce a protected-section warning', () => {
  const availability = { profile: 'AVAILABLE', library: 'AVAILABLE', payments: 'AVAILABLE',
    plan: 'AVAILABLE', libraryPass: 'AVAILABLE', subscriptionCheckout: 'UNAVAILABLE' };
  assert.equal(readerDashboardState({ availability }), 'ready');
  assert.equal(readerDashboardState({ availability: { ...availability,
    payments: 'UNAVAILABLE' } }), 'partial');
  assert.equal(readerDashboardState({ availability: { ...availability,
    libraryPass: 'UNAVAILABLE' } }), 'partial');
});

test('My GPIR keeps recurring controls separate from the one-time checkout', async () => {
  const html = await readFile(new URL('../../reader/my-gpir/index.html', import.meta.url), 'utf8');
  const subscription = await readFile(new URL(
    '../../assets/js/gpir-paypal-subscription.mjs', import.meta.url), 'utf8');
  assert.match(html, /data-gpir-paypal-onetime/);
  assert.match(html, /GPIR Premium Library &mdash; 30-Day Pass/);
  assert.match(html, /data-gpir-paypal-subscription/);
  assert.match(html, /Recurring subscription/);
  assert.match(html, /USD 9\.99 per month\. Recurring billing continues until canceled/);
  assert.match(subscription, /gpir-paypal-create-subscription/);
  assert.match(subscription, /gpir-paypal-verify-subscription/);
});
