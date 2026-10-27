const SANDBOX_URL = 'https://hoewtptllwkcqrgryazu.supabase.co';
const SUPPORTED = Object.freeze(['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'JPY', 'CAD']);

function endpoint(global, name) {
  const url = String(global.GPIR_SUPABASE_PUBLIC_CONFIG?.url || '').replace(/\/$/, '');
  return url === SANDBOX_URL ? `${url}/functions/v1/${name}` : null;
}

async function session(global) {
  try { return (await global.GPIR_SUPABASE_CLIENT?.auth?.getSession())?.data?.session || null; }
  catch { return null; }
}

async function request(global, url, options = {}) {
  const active = await session(global);
  if (!active?.access_token) throw new Error('SESSION_REQUIRED');
  const response = await global.fetch(url, { ...options, cache: 'no-store',
    headers: { authorization: `Bearer ${active.access_token}`,
      'content-type': 'application/json', ...(options.headers || {}) } });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.code || 'CHECKOUT_UNAVAILABLE');
  return body;
}

export async function loadCheckoutCatalog(global = window) {
  const url = endpoint(global, 'gpir-onetime-create-order');
  if (!url) throw new Error('SANDBOX_CONFIGURATION_REQUIRED');
  const body = await request(global, url, { method: 'GET' });
  if (body?.status !== 'READY' || body?.environment !== 'sandbox' ||
      typeof body?.clientId !== 'string' || !body.clientId || !Array.isArray(body?.offers))
    throw new Error('MALFORMED_CHECKOUT_CATALOG');
  return Object.freeze({ ...body, createEndpoint: url,
    captureEndpoint: endpoint(global, 'gpir-onetime-capture-order') });
}

export async function createOrder(global, catalog, offer) {
  const requestId = global.crypto.randomUUID();
  const body = await request(global, catalog.createEndpoint, { method: 'POST',
    body: JSON.stringify({ passId: offer.passId, currency: offer.currency, requestId }) });
  if (body?.status !== 'CREATED' || body?.environment !== 'sandbox' ||
      typeof body?.orderId !== 'string') throw new Error('ORDER_CREATION_FAILED');
  return body.orderId;
}

export async function captureOrder(global, catalog, orderId) {
  const body = await request(global, catalog.captureEndpoint, { method: 'POST',
    body: JSON.stringify({ orderId }) });
  if (body?.status === 'PENDING') return Object.freeze({ status: 'PENDING' });
  if (body?.status !== 'CAPTURED' || body?.environment !== 'sandbox' ||
      body?.entitlement !== 'SERVER_VERIFIED' || typeof body?.effectiveUntil !== 'string')
    throw new Error('CAPTURE_NOT_VERIFIED');
  return Object.freeze(body);
}

function removeSdk(global, document) {
  document.querySelector('script[data-gpir-onetime-sdk]')?.remove();
  try { delete global.paypal_onetime; } catch { global.paypal_onetime = undefined; }
}

export async function loadPayPalSdk({ global = window, document = global.document,
  clientId, currency }) {
  if (!SUPPORTED.includes(currency)) throw new Error('UNSUPPORTED_CURRENCY');
  removeSdk(global, document);
  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
    `&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons,funding-eligibility`;
  script.dataset.namespace = 'paypal_onetime';
  script.dataset.gpirOnetimeSdk = 'true';
  await new Promise((resolve, reject) => {
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('PAYPAL_SDK_UNAVAILABLE')), { once: true });
    document.head.append(script);
  });
  if (!global.paypal_onetime?.Buttons || !global.paypal_onetime?.FUNDING)
    throw new Error('PAYPAL_SDK_UNAVAILABLE');
  return global.paypal_onetime;
}

export async function renderEligibleFunding({ global = window, document = global.document,
  catalog, offer, target, status }) {
  target.replaceChildren();
  status.textContent = 'Checking available PayPal payment methods…';
  const paypal = await loadPayPalSdk({ global, document,
    clientId: catalog.clientId, currency: offer.currency });
  const sources = [...new Set(Object.values(paypal.FUNDING).filter(value =>
    typeof value === 'string'))];
  let rendered = 0;
  for (const fundingSource of sources) {
    const container = document.createElement('div');
    container.className = 'gpir-payonce-funding';
    const buttons = paypal.Buttons({ fundingSource,
      style: { layout: 'vertical', shape: 'rect', label: 'pay' },
      createOrder: () => createOrder(global, catalog, offer),
      onApprove: async data => {
        status.textContent = 'Verifying the Sandbox capture and access pass…';
        const result = await captureOrder(global, catalog, data.orderID);
        status.textContent = result.status === 'PENDING'
          ? 'Payment is pending. Access has not been granted.'
          : `Payment verified. Access is active until ${new Date(result.effectiveUntil).toLocaleString()}.`;
        status.dataset.state = result.status === 'PENDING' ? 'pending' : 'success';
      },
      onCancel: () => { status.textContent = 'Checkout cancelled. No access was granted.';
        status.dataset.state = 'cancelled'; },
      onError: () => { status.textContent = 'PayPal could not complete this checkout.';
        status.dataset.state = 'error'; }
    });
    if (!buttons.isEligible()) continue;
    target.append(container); await buttons.render(container); rendered += 1;
  }
  if (!rendered) {
    status.textContent = 'No PayPal funding method is eligible for this currency and buyer.';
    status.dataset.state = 'unavailable';
  } else {
    status.textContent = 'Choose any eligible method shown by PayPal.';
    status.dataset.state = 'ready';
  }
  return rendered;
}

function offerLabel(offer) {
  return `${offer.displayName} — ${offer.currency} ${offer.amount} — ${offer.durationDays} days`;
}

export async function initializePayOnce({ global = window, document = global.document } = {}) {
  const root = document.querySelector('[data-gpir-payonce]');
  if (!root) return false;
  const status = root.querySelector('[data-payonce-status]');
  const select = root.querySelector('[data-payonce-offer]');
  const target = root.querySelector('[data-payonce-buttons]');
  const active = await session(global);
  if (!active?.user) {
    const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
    global.GPIRReaderAuth?.rememberReturnTo?.(returnTo);
    global.location.assign(`/reader/sign-in/?returnTo=${encodeURIComponent(returnTo)}`);
    return false;
  }
  let catalog;
  try { catalog = await loadCheckoutCatalog(global); }
  catch (error) {
    status.textContent = error.message === 'ONETIME_CHECKOUT_DISABLED'
      ? 'One-time checkout is currently disabled.' : 'The Sandbox checkout is unavailable.';
    status.dataset.state = 'error'; return false;
  }
  if (!catalog.offers.length) {
    status.textContent = 'No owner-approved one-time price is currently enabled.';
    status.dataset.state = 'unavailable'; return true;
  }
  select.replaceChildren(...catalog.offers.map((offer, index) => {
    const option = document.createElement('option'); option.value = String(index);
    option.textContent = offerLabel(offer); return option;
  }));
  const render = async () => {
    select.disabled = true;
    try { await renderEligibleFunding({ global, document, catalog,
      offer: catalog.offers[Number(select.value) || 0], target, status }); }
    catch { target.replaceChildren(); status.textContent = 'PayPal checkout is unavailable.';
      status.dataset.state = 'error'; }
    finally { select.disabled = false; }
  };
  select.addEventListener('change', () => { void render(); });
  await render(); return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
    void initializePayOnce();
  }); else void initializePayOnce();
}

export { SUPPORTED };
