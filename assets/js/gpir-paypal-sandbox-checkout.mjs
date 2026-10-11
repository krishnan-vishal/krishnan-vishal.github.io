const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secureEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname));
  } catch { return false; }
}

export function validSandboxConfig(config) {
  return config?.environment === 'sandbox' &&
    typeof config.clientId === 'string' && config.clientId.length > 10 &&
    !/replace|example|live/i.test(config.clientId) && UUID.test(config.offerId || '') &&
    secureEndpoint(config.createOrderEndpoint) && secureEndpoint(config.captureOrderEndpoint);
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

export async function createSandboxOrder({ config, supabase, requestId = crypto.randomUUID(),
  fetchImpl } = {}) {
  if (!validSandboxConfig(config) || !UUID.test(requestId)) return null;
  const session = await authenticatedSession(supabase);
  if (!session) return null;
  const result = await postJson(config.createOrderEndpoint, session.access_token,
    { offerId: config.offerId, clientRequestId: requestId }, fetchImpl);
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

function loadSdk(config, document) {
  if (globalThis.paypal?.Buttons) return Promise.resolve(globalThis.paypal);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gpir-paypal-sandbox-sdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve(globalThis.paypal), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.gpirPaypalSandboxSdk = '';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}` +
      '&currency=USD&intent=capture&components=buttons';
    script.async = true; script.onload = () => resolve(globalThis.paypal);
    script.onerror = reject; document.head.append(script);
  });
}

export async function initializePayPalSandboxCheckout({
  document = globalThis.document,
  config = globalThis.GPIR_PAYPAL_SANDBOX_CONFIG,
  supabase = globalThis.GPIR_SUPABASE_CLIENT
} = {}) {
  const root = document?.querySelector?.('[data-gpir-paypal-checkout="sandbox"]');
  if (!root) return false;
  if (!validSandboxConfig(config)) {
    announce(root, 'Sandbox checkout is not configured.', 'error'); return false;
  }
  const session = await authenticatedSession(supabase);
  if (!session) {
    announce(root, 'Sign in with a GPIR reader account to use sandbox checkout.', 'error');
    return false;
  }
  let paypal;
  try { paypal = await loadSdk(config, document); } catch {
    announce(root, 'PayPal Sandbox is temporarily unavailable.', 'error'); return false;
  }
  if (!paypal?.Buttons) {
    announce(root, 'PayPal Sandbox is temporarily unavailable.', 'error'); return false;
  }
  let requestId = null;
  const buttons = paypal.Buttons({
    style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
    createOrder: async () => {
      requestId ||= crypto.randomUUID();
      announce(root, 'Creating a secure sandbox order…', 'pending');
      const orderId = await createSandboxOrder({ config, supabase, requestId });
      if (!orderId) throw new Error('ORDER_CREATION_FAILED');
      return orderId;
    },
    onApprove: async data => {
      announce(root, 'Verifying the sandbox capture on the server…', 'pending');
      const result = await captureSandboxOrder({ config, supabase, orderId: data.orderID });
      if (!result) throw new Error('CAPTURE_VERIFICATION_FAILED');
      requestId = null;
      announce(root, 'Sandbox payment verified. Publication access is ready.', 'success');
      root.dispatchEvent(new CustomEvent('gpir:paypal-sandbox-captured', {
        bubbles: true, detail: { orderId: result.orderId } }));
    },
    onCancel: () => { requestId = null; announce(root, 'Sandbox checkout cancelled.', 'idle'); },
    onError: () => announce(root,
      'The sandbox payment was not verified. No reader access was activated.', 'error')
  });
  if (buttons.isEligible && !buttons.isEligible()) {
    announce(root, 'PayPal Sandbox is not eligible in this browser.', 'error'); return false;
  }
  try { await buttons.render(root.querySelector('[data-paypal-buttons]')); }
  catch { announce(root, 'PayPal Sandbox buttons could not be loaded.', 'error'); return false; }
  announce(root, 'PayPal Sandbox checkout ready. No live payment will be taken.', 'idle');
  return true;
}

if (typeof document !== 'undefined') {
  const start = () => { void initializePayPalSandboxCheckout(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

export { authenticatedSession, postJson, secureEndpoint };
