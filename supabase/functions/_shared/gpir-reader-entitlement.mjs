// Server-side subscriber entitlement for GPIR reader features. It reads the same
// gpir_paypal_subscriptions records as gpir-reader-summary (the existing entitlement
// source); it never trusts a browser claim and fails closed on every uncertainty.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECTS = Object.freeze({ qlnvhfapctcpzqyuhhth: 'PRODUCTION', hoewtptllwkcqrgryazu: 'SANDBOX' });

export function paymentEnvironment(supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).hostname;
    return PROJECTS[host.replace(/\.supabase\.co$/, '')] || null;
  } catch { return null; }
}

function instant(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

export function isActiveSubscription(row, now) {
  if (row?.status !== 'ACTIVE') return false;
  const from = row.effective_from == null ? null : instant(row.effective_from);
  const until = row.effective_until == null ? null : instant(row.effective_until);
  if ((row.effective_from != null && from === null) || (row.effective_until != null && until === null)) return false;
  return (from === null || from <= now) && (until === null || until > now);
}

function requestHeaders(projectKey, bearer) {
  const headers = new Headers();
  headers.set('apikey', projectKey);
  headers.set('authorization', `Bearer ${bearer}`);
  return headers;
}

async function read(fetchImpl, url, headers) {
  try {
    const response = await fetchImpl(url, { headers });
    return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
  } catch { return { ok: false, status: 0, data: null }; }
}

export async function resolveSubscriberAccess({ fetchImpl = fetch, supabaseUrl, serviceKey, accessToken,
  now = Date.now() }) {
  const environment = paymentEnvironment(supabaseUrl);
  if (!environment || !serviceKey) return { decision: 'ERROR', reason: 'ENTITLEMENT_CONFIGURATION' };
  if (!accessToken) return { decision: 'UNAUTHENTICATED', reason: 'SESSION_REQUIRED' };
  const user = await read(fetchImpl, `${supabaseUrl}/auth/v1/user`,
    requestHeaders(serviceKey, accessToken));
  if (user.status === 401 || user.status === 403) return { decision: 'UNAUTHENTICATED', reason: 'SESSION_INVALID' };
  if (!user.ok || !UUID.test(user.data?.id || '')) return { decision: 'ERROR', reason: 'SESSION_VERIFICATION_FAILED' };
  const query = new URLSearchParams({ select: 'id,status,effective_from,effective_until',
    user_id: `eq.${user.data.id}`, environment: `eq.${environment}`, order: 'updated_at.desc', limit: '1' });
  const subscriptions = await read(fetchImpl, `${supabaseUrl}/rest/v1/gpir_paypal_subscriptions?${query}`,
    requestHeaders(serviceKey, serviceKey));
  if (!subscriptions.ok || !Array.isArray(subscriptions.data)) return { decision: 'ERROR', reason: 'ENTITLEMENT_UNAVAILABLE' };
  return isActiveSubscription(subscriptions.data[0], now)
    ? { decision: 'ALLOW', userId: user.data.id } : { decision: 'DENY', reason: 'SUBSCRIPTION_REQUIRED' };
}
