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
  return result?.environment === config.environment &&
    ['APPROVAL_PENDING', 'ACTIVE'].includes(result?.status) &&
    BILLING_ID.test(result?.subscriptionId || '') ? result : null;
}

export async function verifySubscription({ config, supabase, subscriptionId,
  eventTarget = globalThis, fetchImpl = fetch } = {}) {
  if (!validSubscriptionConfig(config) || !BILLING_ID.test(subscriptionId || '')) return null;
  const current = await session(supabase); if (!current) return null;
  const result = await post(config.verifySubscriptionEndpoint, current.access_token,
    { subscriptionId }, fetchImpl);
  if (result?.environment !== config.environment || result?.status !== 'ACTIVE' ||
      result?.entitlement !== 'SERVER_VERIFIED') return null;
  eventTarget?.dispatchEvent?.(new CustomEvent('gpir:paypal-payment-verified', {
    detail: { type: 'SUBSCRIPTION' }
  }));
  return result;
}
