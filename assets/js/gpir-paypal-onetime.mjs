import { CHECKOUT_CURRENCIES, createLatestRenderGuard, createPayPalSdkLoader }
  from './gpir-paypal-six-currency-loader.mjs';

const PRODUCTION_PROJECT = 'qlnvhfapctcpzqyuhhth';
const PRODUCTION_HOSTS = new Set(['fintechoisis.com', 'www.fintechoisis.com']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYPAL_ID = /^[A-Z0-9-]{8,64}$/i;
const PASS_ID = 'GPIR_PREMIUM_LIBRARY_30D';
const PUBLICATION_ID = 'PREMIUM_LIBRARY';
const AMOUNT_MINOR = 999;
const DURATION_DAYS = 30;
const renderGuards = new WeakMap();
const sdkLoaders = new WeakMap();

function isoOrNull(value) {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function validClientId(value) {
  return typeof value === 'string' && value.length >= 20 && value.length <= 256 &&
    !/[\s<>"']/.test(value);
}

function normalizeOffer(value) {
  if (!value || !UUID.test(value.offerId || '') || value.passId !== PASS_ID ||
      value.publicationId !== PUBLICATION_ID || value.supabaseRecordId != null ||
      typeof value.displayName !== 'string' || !value.displayName.trim() ||
      !CHECKOUT_CURRENCIES.includes(value.currency) || value.amountMinor !== AMOUNT_MINOR ||
      value.amount !== '9.99' || value.durationDays !== DURATION_DAYS) return null;
  return Object.freeze({ offerId: value.offerId, passId: PASS_ID,
    publicationId: PUBLICATION_ID, displayName: value.displayName.trim(),
    currency: value.currency, amountMinor: AMOUNT_MINOR, amount: value.amount,
    durationDays: DURATION_DAYS });
}

export function normalizeOnetimeOffers(values) {
  if (!Array.isArray(values)) return Object.freeze([]);
  const byCurrency = new Map();
  for (const value of values) {
    const offer = normalizeOffer(value);
    if (offer && !byCurrency.has(offer.currency)) byCurrency.set(offer.currency, offer);
  }
  return Object.freeze(CHECKOUT_CURRENCIES.flatMap(currency =>
    byCurrency.has(currency) ? [byCurrency.get(currency)] : []));
}

export function onetimeCheckoutConfig(global = globalThis) {
  if (!PRODUCTION_HOSTS.has(global.location?.hostname || '')) return null;
  const value = global.GPIR_SUPABASE_PUBLIC_CONFIG;
  let url;
  try { url = new URL(value?.url); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== `${PRODUCTION_PROJECT}.supabase.co` ||
      url.pathname !== '/' || typeof value?.publishableKey !== 'string' ||
      !value.publishableKey.startsWith('sb_publishable_')) return null;
  const origin = url.origin;
  return Object.freeze({ origin, publishableKey: value.publishableKey,
    createEndpoint: `${origin}/functions/v1/gpir-onetime-create-order`,
    captureEndpoint: `${origin}/functions/v1/gpir-onetime-capture-order` });
}

async function currentSession(supabase) {
  let result;
  try { result = await supabase?.auth?.getSession(); } catch { return null; }
  const session = result?.data?.session;
  return session?.user && typeof session.access_token === 'string' && session.access_token
    ? session : null;
}

async function authenticatedJson({ config, supabase, endpoint, method = 'GET', body,
  fetchImpl = fetch }) {
  const active = await currentSession(supabase);
  if (!active) throw new Error('SESSION_REQUIRED');
  const headers = new Headers({ authorization: `Bearer ${active.access_token}`,
    accept: 'application/json' });
  headers.set('apikey', config.publishableKey);
  if (body !== undefined) headers.set('content-type', 'application/json');
  let response;
  try {
    response = await fetchImpl(endpoint, { method, cache: 'no-store', credentials: 'omit',
      redirect: 'error', headers,
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new Error('CHECKOUT_UNAVAILABLE'); }
  let result = null;
  try { result = await response.json(); } catch {}
  if (!response.ok) throw new Error(typeof result?.code === 'string'
    ? result.code : 'CHECKOUT_UNAVAILABLE');
  return result;
}

export async function loadOnetimeCatalog({ global = globalThis,
  supabase = global.GPIR_SUPABASE_CLIENT, fetchImpl = global.fetch?.bind(global) } = {}) {
  const config = onetimeCheckoutConfig(global);
  if (!config) throw new Error('PRODUCTION_CHECKOUT_CONFIGURATION_REQUIRED');
  const result = await authenticatedJson({ config, supabase,
    endpoint: config.createEndpoint, fetchImpl });
  const offers = normalizeOnetimeOffers(result?.offers);
  if (result?.status !== 'READY' || result?.environment !== 'live' ||
      !validClientId(result?.clientId)) throw new Error('MALFORMED_CHECKOUT_CATALOG');
  return Object.freeze({ ...config, environment: 'live', clientId: result.clientId, offers });
}

export async function createOnetimeOrder({ global = globalThis, catalog, offer,
  requestId = global.crypto?.randomUUID?.(), supabase = global.GPIR_SUPABASE_CLIENT,
  fetchImpl = global.fetch?.bind(global) } = {}) {
  const approved = normalizeOffer(offer);
  const listed = catalog?.offers?.some(item => item.offerId === approved?.offerId &&
    item.currency === approved?.currency);
  if (!listed || !UUID.test(requestId || '')) throw new Error('INVALID_ORDER_REQUEST');
  const result = await authenticatedJson({ config: catalog, supabase,
    endpoint: catalog.createEndpoint, method: 'POST', fetchImpl,
    body: { passId: approved.passId, currency: approved.currency, requestId } });
  if (result?.status !== 'CREATED' || result?.environment !== 'live' ||
      !PAYPAL_ID.test(result?.orderId || '')) throw new Error('ORDER_CREATION_FAILED');
  return result.orderId;
}

export async function captureOnetimeOrder({ global = globalThis, catalog, orderId,
  supabase = global.GPIR_SUPABASE_CLIENT,
  fetchImpl = global.fetch?.bind(global) } = {}) {
  if (!PAYPAL_ID.test(orderId || '')) throw new Error('INVALID_CAPTURE_REQUEST');
  const result = await authenticatedJson({ config: catalog, supabase,
    endpoint: catalog.captureEndpoint, method: 'POST', fetchImpl, body: { orderId } });
  if (result?.status === 'PENDING' && result?.environment === 'live' &&
      result?.orderId === orderId) return Object.freeze({ status: 'PENDING', orderId });
  const effectiveUntil = isoOrNull(result?.effectiveUntil);
  if (result?.status !== 'CAPTURED' || result?.environment !== 'live' ||
      result?.entitlement !== 'SERVER_VERIFIED' || result?.orderId !== orderId || !effectiveUntil)
    throw new Error('CAPTURE_NOT_VERIFIED');
  return Object.freeze({ status: 'CAPTURED', orderId, entitlement: 'SERVER_VERIFIED',
    effectiveUntil });
}

function announce(root, message, state = 'idle') {
  const output = root?.querySelector?.('[data-onetime-status]');
  if (output) { output.textContent = message; output.dataset.state = state; }
}

function offerLabel(offer) {
  return `${offer.currency} ${offer.amount}`;
}

function expiryLabel(value, locale) {
  return new Intl.DateTimeFormat(locale || 'en-US', { year: 'numeric', month: 'short',
    day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    .format(new Date(value));
}

function checkoutErrorMessage(error) {
  if (error?.message === 'ONETIME_CHECKOUT_DISABLED')
    return 'One-time checkout is currently unavailable.';
  if (error?.message === 'SESSION_REQUIRED')
    return 'Sign in again before starting checkout.';
  return 'PayPal checkout is temporarily unavailable. No payment was initiated.';
}

function loaderFor(global, document) {
  if (!sdkLoaders.has(document)) sdkLoaders.set(document,
    createPayPalSdkLoader({ global, document }));
  return sdkLoaders.get(document);
}

async function renderButtons({ global, document, root, catalog, offer, fetchImpl, revision,
  guard }) {
  const target = root.querySelector('[data-onetime-buttons]');
  if (!target) return false;
  target.replaceChildren();
  announce(root, `Loading secure ${offer.currency} checkout…`, 'pending');
  const paypal = await loaderFor(global, document)({ clientId: catalog.clientId,
    currency: offer.currency });
  if (!guard.isCurrent(revision)) return false;
  const container = document.createElement('div');
  container.className = 'my-gpir-onetime__buttons';
  target.append(container);
  const buttons = paypal.Buttons({
    style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 42 },
    createOrder: () => {
      announce(root, 'Creating a secure server-priced PayPal order…', 'pending');
      return createOnetimeOrder({ global, catalog, offer, fetchImpl });
    },
    onApprove: async data => {
      announce(root, 'Verifying the captured payment and 30-day access…', 'pending');
      try {
        const result = await captureOnetimeOrder({ global, catalog,
          orderId: data?.orderID, fetchImpl });
        if (result.status === 'PENDING') {
          announce(root, 'Payment confirmation is pending. Access has not been granted.', 'pending');
          return;
        }
        announce(root, `Payment verified. Access is active until ${expiryLabel(
          result.effectiveUntil, global.navigator?.language)}.`, 'success');
        const EventConstructor = global.CustomEvent || CustomEvent;
        global.dispatchEvent?.(new EventConstructor('gpir:onetime-payment-verified', {
          detail: { orderId: result.orderId, effectiveUntil: result.effectiveUntil }
        }));
      } catch {
        announce(root, 'The capture was not server-verified. No access was granted.', 'error');
      }
    },
    onCancel: () => announce(root, 'Checkout cancelled. No access was granted.', 'idle'),
    onError: () => announce(root,
      'PayPal could not complete this checkout. No access was granted.', 'error')
  });
  if (typeof buttons?.isEligible !== 'function' || !buttons.isEligible()) {
    target.replaceChildren();
    announce(root, 'PayPal checkout is not eligible for this currency and buyer.', 'unavailable');
    return false;
  }
  await buttons.render(container);
  if (!guard.isCurrent(revision)) { target.replaceChildren(); return false; }
  announce(root, 'Complete payment securely with PayPal.', 'ready');
  return true;
}

export async function initializePayPalOnetimeCheckout({ global = globalThis,
  document = global.document, fetchImpl = global.fetch?.bind(global) } = {}) {
  const root = document?.querySelector?.('[data-gpir-paypal-onetime]');
  if (!root) return false;
  const select = root.querySelector('[data-onetime-currency]');
  const summary = root.querySelector('[data-onetime-offer]');
  const target = root.querySelector('[data-onetime-buttons]');
  if (!select || !summary || !target) return false;
  let catalog;
  try { catalog = await loadOnetimeCatalog({ global, fetchImpl }); }
  catch (error) {
    root.hidden = false; target.replaceChildren(); select.disabled = true;
    announce(root, checkoutErrorMessage(error), 'error'); return false;
  }
  root.hidden = false;
  if (!catalog.offers.length) {
    select.replaceChildren(); select.disabled = true; target.replaceChildren();
    summary.textContent = 'No owner-approved one-time offer is currently available.';
    announce(root, 'One-time checkout is unavailable.', 'unavailable'); return true;
  }
  const previousCurrency = select.value;
  select.replaceChildren(...catalog.offers.map(offer => {
    const option = document.createElement('option'); option.value = offer.currency;
    option.textContent = offerLabel(offer); return option;
  }));
  if (catalog.offers.some(offer => offer.currency === previousCurrency))
    select.value = previousCurrency;
  const guard = renderGuards.get(root) || createLatestRenderGuard();
  renderGuards.set(root, guard);
  const render = async () => {
    const revision = guard.begin();
    const offer = catalog.offers.find(item => item.currency === select.value) || catalog.offers[0];
    select.disabled = true;
    summary.textContent = `${offer.displayName} — ${offer.currency} ${offer.amount} — ` +
      `${offer.durationDays} days, no automatic renewal.`;
    try { await renderButtons({ global, document, root, catalog, offer, fetchImpl,
      revision, guard }); }
    catch { if (guard.isCurrent(revision)) { target.replaceChildren();
      announce(root, 'PayPal checkout is temporarily unavailable. No payment was initiated.',
        'error'); } }
    finally { if (guard.isCurrent(revision)) select.disabled = false; }
  };
  select.onchange = () => { void render(); };
  await render();
  return true;
}

export { AMOUNT_MINOR, DURATION_DAYS, PASS_ID, PUBLICATION_ID };
