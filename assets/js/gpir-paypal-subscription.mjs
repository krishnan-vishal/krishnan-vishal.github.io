const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BILLING_ID = /^[A-Z0-9-]{8,64}$/i;
const PROJECTS = Object.freeze({ sandbox: 'hoewtptllwkcqrgryazu',
  production: 'qlnvhfapctcpzqyuhhth' });

function endpoint(value, pathname) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === pathname ? url : null;
  } catch { return null; }
}

export function approvalUrl(value, environment) {
  let url;
  try { url = new URL(value); } catch { return null; }
  const hostname = environment === 'sandbox' ? 'www.sandbox.paypal.com' : 'www.paypal.com';
  return url.protocol === 'https:' && url.hostname === hostname &&
    !url.username && !url.password ? url.href : null;
}

export function validSubscriptionConfig(config) {
  if (!config?.enabled || !PROJECTS[config.environment] ||
      (config.environment === 'production' && config.productionEnabled !== true) ||
      !UUID.test(config.planId || '')) return false;
  let supabaseUrl;
  try { supabaseUrl = new URL(config.supabaseUrl); } catch { return false; }
  const createUrl = endpoint(config.createSubscriptionEndpoint,
    '/functions/v1/gpir-paypal-create-subscription');
  const verifyUrl = endpoint(config.verifySubscriptionEndpoint,
    '/functions/v1/gpir-paypal-verify-subscription');
  return supabaseUrl.protocol === 'https:' &&
    supabaseUrl.hostname === `${PROJECTS[config.environment]}.supabase.co` &&
    createUrl?.origin === supabaseUrl.origin && verifyUrl?.origin === supabaseUrl.origin;
}

async function session(supabase) {
  let result;
  try { result = await supabase?.auth?.getSession(); } catch { return null; }
  return result?.data?.session?.access_token ? result.data.session : null;
}

async function post(endpointUrl, token, body, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(endpointUrl, { method: 'POST', cache: 'no-store',
      credentials: 'omit', redirect: 'error', headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body) });
  } catch { return null; }
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) return null;
  try { return await response.json(); } catch { return null; }
}

export async function createSubscription({ config, supabase,
  clientRequestId = crypto.randomUUID(), fetchImpl = fetch } = {}) {
  if (!validSubscriptionConfig(config) || !UUID.test(clientRequestId)) return null;
  const current = await session(supabase); if (!current) return null;
  const result = await post(config.createSubscriptionEndpoint, current.access_token,
    { planId: config.planId, clientRequestId }, fetchImpl);
  if (result?.environment !== config.environment ||
      !['APPROVAL_PENDING', 'ACTIVE'].includes(result?.status) ||
      !BILLING_ID.test(result?.subscriptionId || '')) return null;
  const next = result.status === 'APPROVAL_PENDING'
    ? approvalUrl(result.approvalUrl, config.environment) : null;
  if (result.status === 'APPROVAL_PENDING' && !next) return null;
  return Object.freeze({ status: result.status, subscriptionId: result.subscriptionId,
    approvalUrl: next, environment: result.environment });
}

export async function verifySubscription({ config, supabase, subscriptionId,
  eventTarget = globalThis, fetchImpl = fetch } = {}) {
  if (!validSubscriptionConfig(config) || !BILLING_ID.test(subscriptionId || '')) return null;
  const current = await session(supabase); if (!current) return null;
  const result = await post(config.verifySubscriptionEndpoint, current.access_token,
    { subscriptionId }, fetchImpl);
  if (result?.environment !== config.environment || result?.status !== 'ACTIVE' ||
      result?.entitlement !== 'SERVER_VERIFIED') return null;
  if (result.paymentConfirmed === true)
    eventTarget?.dispatchEvent?.(new CustomEvent('gpir:paypal-payment-verified', {
      detail: { type: 'SUBSCRIPTION' }
    }));
  return result;
}

function announce(root, message, state = 'idle') {
  const output = root?.querySelector?.('[data-subscription-status]');
  if (output) { output.textContent = message; output.dataset.state = state; }
}

export function subscriptionConfig(global, summary) {
  const supabaseUrl = global.GPIR_SUPABASE_PUBLIC_CONFIG?.url;
  const offer = summary?.subscriptionOffer;
  if (summary?.availability?.subscriptionCheckout !== 'AVAILABLE' ||
      !['sandbox', 'production'].includes(summary?.environment) ||
      !UUID.test(offer?.id || '')) return null;
  const hostname = global.location?.hostname || '';
  const hostAllowed = summary.environment === 'production'
    ? ['fintechoisis.com', 'www.fintechoisis.com'].includes(hostname)
    : ['localhost', '127.0.0.1', '::1'].includes(hostname) ||
      /^[a-z0-9-]+-4192\.app\.github\.dev$/i.test(hostname);
  if (!hostAllowed) return null;
  const origin = String(supabaseUrl || '').replace(/\/$/, '');
  return Object.freeze({ enabled: true, environment: summary.environment,
    productionEnabled: summary.environment === 'production', planId: offer.id, supabaseUrl,
    createSubscriptionEndpoint: `${origin}/functions/v1/gpir-paypal-create-subscription`,
    verifySubscriptionEndpoint: `${origin}/functions/v1/gpir-paypal-verify-subscription` });
}

function cleanReturnLocation(global) {
  const params = new URLSearchParams(global.location.search);
  for (const name of ['subscription', 'subscription_id', 'paypal-subscription', 'ba_token', 'token'])
    params.delete(name);
  const query = params.toString();
  global.history?.replaceState?.(null, '', `${global.location.pathname}${query ? `?${query}` : ''}` +
    `${global.location.hash || ''}`);
}

export async function initializePayPalSubscription({ global = globalThis,
  document = global.document, summary, fetchImpl = global.fetch?.bind(global) } = {}) {
  const root = document?.querySelector?.('[data-gpir-paypal-subscription]');
  if (!root) return false;
  const config = subscriptionConfig(global, summary);
  const button = root.querySelector('[data-subscription-start]');
  if (!validSubscriptionConfig(config)) {
    if (summary?.environment === 'production' && config) {
      root.hidden = false;
      if (button) { button.disabled = true; button.onclick = null; }
      announce(root, 'Live subscription checkout is pending activation. No payment can be initiated.',
        'pending');
      return true;
    }
    root.hidden = true;
    return false;
  }
  root.hidden = false;
  const storageKey = `gpir.paypal.subscription.request.${config.planId}`;
  const clearRequest = () => { try { global.sessionStorage?.removeItem?.(storageKey); global.sessionStorage?.removeItem?.(`${storageKey}.pending`); } catch {} };
  const params = new URLSearchParams(global.location.search);
  const returnState = params.get('paypal-subscription') || params.get('subscription');
  // The provider return is only a navigation hint, never proof of ownership or payment.
  // The server must match the authenticated reader, local subscription and PayPal ID.
  let pendingId = params.get('subscription_id');
  if (returnState === 'approved' && !pendingId) {
    try { pendingId = global.sessionStorage?.getItem?.(`${storageKey}.pending`); } catch {}
  }

  if (summary.plan?.billingStatus === 'ACTIVE') {
    if (button) button.hidden = true;
    announce(root, summary.plan.paymentConfirmed
      ? 'Your PayPal subscription payment is confirmed.'
      : 'Your PayPal subscription is active; Premium access awaits confirmed payment.',
    summary.plan.paymentConfirmed ? 'success' : 'pending');
    return true;
  }
  if (returnState === 'cancelled') {
    clearRequest(); cleanReturnLocation(global);
    announce(root, 'PayPal subscription approval was cancelled.', 'idle');
  } else if (['return', 'approved'].includes(returnState) && BILLING_ID.test(pendingId || '')) {
    if (button) button.disabled = true;
    announce(root, 'Verifying the approved PayPal subscription…', 'pending');
    const verified = await verifySubscription({ config, supabase: global.GPIR_SUPABASE_CLIENT,
      subscriptionId: pendingId, eventTarget: global, fetchImpl });
    if (button) button.disabled = false;
    cleanReturnLocation(global);
    if (!verified) {
      announce(root, 'The subscription is not active. No publication access was granted.', 'error');
      return false;
    }
    clearRequest();
    announce(root, verified.paymentConfirmed
      ? 'Payment confirmed. Refreshing your account…'
      : 'Subscription verified; Premium access awaits confirmed payment.',
    verified.paymentConfirmed ? 'success' : 'pending');
    return true;
  }

  if (button) button.onclick = async () => {
    button.disabled = true;
    announce(root, 'Creating a secure PayPal subscription…', 'pending');
    let clientRequestId = null;
    try { clientRequestId = global.sessionStorage?.getItem?.(storageKey); } catch {}
    if (!UUID.test(clientRequestId || '')) {
      clientRequestId = global.crypto?.randomUUID?.();
      try { global.sessionStorage?.setItem?.(storageKey, clientRequestId); } catch {}
    }
    const created = await createSubscription({ config, supabase: global.GPIR_SUPABASE_CLIENT,
      clientRequestId, fetchImpl });
    if (!created) {
      button.disabled = false;
      announce(root, 'PayPal subscription could not be started. No access was granted.', 'error');
      return;
    }
    if (created.status === 'ACTIVE') {
      const verified = await verifySubscription({ config, supabase: global.GPIR_SUPABASE_CLIENT,
        subscriptionId: created.subscriptionId, eventTarget: global, fetchImpl });
      button.disabled = false;
      if (verified) {
        clearRequest();
        announce(root, verified.paymentConfirmed
          ? 'Payment confirmed. Refreshing your account…'
          : 'Subscription verified; Premium access awaits confirmed payment.',
        verified.paymentConfirmed ? 'success' : 'pending');
      } else announce(root,
        'The subscription is not active. No publication access was granted.', 'error');
      return;
    }
    try { global.sessionStorage?.setItem?.(`${storageKey}.pending`, created.subscriptionId); } catch {}
    global.location.assign(created.approvalUrl);
  };
  return true;
}
