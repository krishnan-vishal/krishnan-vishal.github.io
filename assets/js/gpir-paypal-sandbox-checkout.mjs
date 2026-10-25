const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secureEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname));
  } catch { return false; }
}

export function validSandboxConfig(config) {
  let supabaseUrl; let createUrl; let captureUrl;
  try {
    supabaseUrl = new URL(config?.supabaseUrl);
    createUrl = new URL(config?.createOrderEndpoint);
    captureUrl = new URL(config?.captureOrderEndpoint);
  } catch { return false; }
  return config?.environment === 'sandbox' && config.enabled === true &&
    typeof config.clientId === 'string' && config.clientId.length > 10 &&
    !/replace|example|live/i.test(config.clientId) && config.currency === 'USD' &&
    config.intent === 'CAPTURE' && config.recurrence === 'NONE' &&
    Array.isArray(config.offers) && config.offers.length > 0 &&
    config.offers.every(offer => UUID.test(offer?.id || '') &&
      typeof offer?.displayName === 'string' && offer.displayName.trim() &&
      offer.currency === 'USD' && Number.isSafeInteger(offer.unitAmountMinor) &&
      offer.unitAmountMinor > 0) &&
    new Set(config.offers.map(offer => offer.id)).size === config.offers.length &&
    secureEndpoint(config.createOrderEndpoint) && secureEndpoint(config.captureOrderEndpoint) &&
    supabaseUrl.protocol === 'https:' &&
    supabaseUrl.hostname === 'hoewtptllwkcqrgryazu.supabase.co' &&
    createUrl.origin === supabaseUrl.origin && captureUrl.origin === supabaseUrl.origin &&
    createUrl.pathname === '/functions/v1/gpir-paypal-create-order' &&
    captureUrl.pathname === '/functions/v1/gpir-paypal-capture-order';
}

export function sandboxCheckoutConfig(global, summary) {
  const checkout = summary?.paymentCheckout;
  const offers = summary?.purchaseOffers;
  const supabaseUrl = global.GPIR_SUPABASE_PUBLIC_CONFIG?.url;
  const hostname = global.location?.hostname || '';
  const hostAllowed = ['localhost', '127.0.0.1', '::1'].includes(hostname) ||
    /^[a-z0-9-]+-4192\.app\.github\.dev$/i.test(hostname);
  if (!hostAllowed || summary?.environment !== 'sandbox' ||
      summary?.availability?.oneTimeCheckout !== 'AVAILABLE' ||
      checkout?.provider !== 'PAYPAL_ORDERS' || checkout?.currency !== 'USD' ||
      checkout?.intent !== 'CAPTURE' || checkout?.recurrence !== 'NONE' ||
      !Array.isArray(offers) || !offers.length) return null;
  const origin = String(supabaseUrl || '').replace(/\/$/, '');
  const config = Object.freeze({ enabled: true, environment: 'sandbox',
    clientId: checkout.clientId, currency: checkout.currency, intent: checkout.intent,
    recurrence: checkout.recurrence, offers, supabaseUrl,
    createOrderEndpoint: `${origin}/functions/v1/gpir-paypal-create-order`,
    captureOrderEndpoint: `${origin}/functions/v1/gpir-paypal-capture-order` });
  return validSandboxConfig(config) ? config : null;
}

async function authenticatedSession(supabase) {
  let result;
  try { result = await supabase?.auth?.getSession(); } catch { return null; }
  const session = result?.data?.session;
  if (result?.error || !session?.user || typeof session.access_token !== 'string' ||
      !session.access_token) return null;
  return session;
}

async function postJson(endpoint, token, body, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', cache: 'no-store',
      credentials: 'omit', redirect: 'error', headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body) });
  } catch { return null; }
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) return null;
  try { return await response.json(); } catch { return null; }
}

export async function createSandboxOrder({ config, offerId, supabase,
  requestId = crypto.randomUUID(), fetchImpl } = {}) {
  if (!validSandboxConfig(config) || !UUID.test(offerId || '') ||
      !config.offers.some(offer => offer.id === offerId) || !UUID.test(requestId)) return null;
  const session = await authenticatedSession(supabase);
  if (!session) return null;
  const result = await postJson(config.createOrderEndpoint, session.access_token,
    { offerId, clientRequestId: requestId }, fetchImpl);
  return result?.environment === 'sandbox' && result?.status === 'CREATED' &&
    typeof result.orderId === 'string' ? result.orderId : null;
}

export async function captureSandboxOrder({ config, supabase, orderId, fetchImpl } = {}) {
  if (!validSandboxConfig(config) || typeof orderId !== 'string' || !orderId) return null;
  const session = await authenticatedSession(supabase);
  if (!session) return null;
  const result = await postJson(config.captureOrderEndpoint, session.access_token,
    { orderId }, fetchImpl);
  return result?.environment === 'sandbox' && result?.status === 'CAPTURED' &&
    result?.entitlement === 'SERVER_VERIFIED' ? result : null;
}

function announce(root, message, state = 'idle') {
  const output = root.querySelector('[data-paypal-status]');
  if (output) { output.textContent = message; output.dataset.state = state; }
}

function loadSdk(config, document, global) {
  if (global.paypal?.Buttons) return Promise.resolve(global.paypal);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gpir-paypal-sandbox-sdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve(global.paypal), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.gpirPaypalSandboxSdk = '';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}` +
      '&currency=USD&intent=capture&components=buttons,funding-eligibility';
    script.async = true; script.onload = () => resolve(global.paypal);
    script.onerror = reject; document.head.append(script);
  });
}

export async function initializePayPalSandboxCheckout({
  global = globalThis,
  document = global.document,
  config = global.GPIR_PAYPAL_SANDBOX_CONFIG,
  supabase = global.GPIR_SUPABASE_CLIENT,
  fetchImpl = global.fetch?.bind(global)
} = {}) {
  const root = document?.querySelector?.('[data-gpir-paypal-checkout="sandbox"]');
  if (!root) return false;
  if (!validSandboxConfig(config)) {
    root.hidden = true; return false;
  }
  root.hidden = false;
  const session = await authenticatedSession(supabase);
  if (!session) {
    announce(root, 'Sign in with a GPIR reader account to use sandbox checkout.', 'error');
    return false;
  }
  const select = root.querySelector('[data-paypal-offer]');
  const price = root.querySelector('[data-paypal-offer-price]');
  const container = root.querySelector('[data-paypal-buttons]');
  if (!select || !container) {
    announce(root, 'Sandbox checkout is not configured.', 'error'); return false;
  }
  select.replaceChildren(...config.offers.map(offer => {
    const option = document.createElement('option'); option.value = offer.id;
    option.textContent = `${offer.displayName} — ${new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD' }).format(offer.unitAmountMinor / 100)}`;
    return option;
  }));
  const updatePrice = () => {
    const offer = config.offers.find(item => item.id === select.value);
    if (price) price.textContent = offer
      ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
        .format(offer.unitAmountMinor / 100)} once. No automatic renewal.` : '';
  };
  updatePrice();
  let paypal;
  try { paypal = await loadSdk(config, document, global); } catch {
    announce(root, 'PayPal Sandbox is temporarily unavailable.', 'error'); return false;
  }
  if (!paypal?.Buttons) {
    announce(root, 'PayPal Sandbox is temporarily unavailable.', 'error'); return false;
  }
  let requestId = null;
  select.onchange = () => { requestId = null; updatePrice(); };
  const buttons = paypal.Buttons({
    style: { layout: 'vertical', shape: 'rect' },
    createOrder: async () => {
      requestId ||= crypto.randomUUID();
      announce(root, 'Creating a secure one-time sandbox order…', 'pending');
      const orderId = await createSandboxOrder({ config, offerId: select.value,
        supabase, requestId, fetchImpl });
      if (!orderId) throw new Error('ORDER_CREATION_FAILED');
      return orderId;
    },
    onApprove: async data => {
      announce(root, 'Verifying the sandbox capture on the server…', 'pending');
      const result = await captureSandboxOrder({ config, supabase, orderId: data.orderID,
        fetchImpl });
      if (!result) throw new Error('CAPTURE_VERIFICATION_FAILED');
      requestId = null;
      announce(root, 'One-time sandbox payment verified. Publication access is ready.', 'success');
      root.dispatchEvent(new CustomEvent('gpir:paypal-sandbox-captured', {
        bubbles: true, detail: { orderId: result.orderId } }));
    },
    onCancel: () => { requestId = null;
      announce(root, 'One-time sandbox checkout cancelled.', 'idle'); },
    onError: () => announce(root,
      'The sandbox payment was not verified. No reader access was activated.', 'error')
  });
  if (buttons.isEligible && !buttons.isEligible()) {
    announce(root, 'PayPal Sandbox is not eligible in this browser.', 'error'); return false;
  }
  container.replaceChildren();
  try { await buttons.render(container); }
  catch { announce(root, 'PayPal Sandbox buttons could not be loaded.', 'error'); return false; }
  announce(root, 'Eligible one-time Sandbox payment methods are shown. No live payment will be taken.',
    'idle');
  return true;
}

export { authenticatedSession, postJson, secureEndpoint };
