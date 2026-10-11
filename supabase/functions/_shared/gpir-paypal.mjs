export const PAYPAL_SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PAYPAL_ID = /^[A-Z0-9]{8,32}$/i;

export function paymentConfiguration(env, { webhook = false } = {}) {
  const required = ['SUPABASE_URL', 'GPIR_SUPABASE_PUBLISHABLE_KEY',
    'GPIR_SUPABASE_SECRET_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'];
  if (webhook) required.push('PAYPAL_WEBHOOK_ID');
  const values = Object.fromEntries(required.map(name => [name, env[name]?.trim()]));
  if (env.PAYPAL_ENVIRONMENT?.trim().toLowerCase() !== 'sandbox' ||
      !required.every(name => values[name])) return null;
  let supabaseUrl;
  try { supabaseUrl = new URL(values.SUPABASE_URL); } catch { return null; }
  if (supabaseUrl.protocol !== 'https:' || !supabaseUrl.hostname.endsWith('.supabase.co')) return null;
  return Object.freeze({ ...values, SUPABASE_URL: supabaseUrl.origin,
    PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_BASE_URL: PAYPAL_SANDBOX_BASE });
}

export function allowedOrigins(env) {
  return new Set(String(env.GPIR_PAYPAL_ALLOWED_ORIGINS || '').split(',')
    .map(value => value.trim()).filter(Boolean));
}

export function corsHeaders(origin, env) {
  const headers = { 'cache-control': 'private, no-store, max-age=0', pragma: 'no-cache',
    vary: 'Origin', 'x-content-type-options': 'nosniff' };
  if (origin && allowedOrigins(env).has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, content-type';
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return headers;
}

export function jsonResponse(status, body, origin, env) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status,
    headers: { ...corsHeaders(origin, env), 'content-type': 'application/json; charset=utf-8' } });
}

export function safeError(status, code, origin, env) {
  return jsonResponse(status, { status: 'ERROR', code }, origin, env);
}

export function validateBrowserRequest(request, env) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins(env).has(origin)) return { error: safeError(403,
    'ORIGIN_NOT_ALLOWED', null, env) };
  if (request.method === 'OPTIONS') return { error: jsonResponse(204, {}, origin, env) };
  if (request.method !== 'POST') return { error: safeError(405, 'METHOD_NOT_ALLOWED', origin, env) };
  return { origin };
}

export function bearerToken(request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') || '');
  return match?.[1] || null;
}

export async function authenticateSupabaseUser({ request, config, fetchImpl }) {
  const token = bearerToken(request);
  if (!token) return null;
  let response;
  try {
    response = await fetchImpl(`${config.SUPABASE_URL}/auth/v1/user`, { headers: {
      apikey: config.GPIR_SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` } });
  } catch { return null; }
  if (!response.ok) return null;
  let user;
  try { user = await response.json(); } catch { return null; }
  return UUID.test(user?.id || '') ? Object.freeze({ id: user.id }) : null;
}

export async function supabaseRpc({ config, name, body, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(`${config.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: config.GPIR_SUPABASE_SECRET_KEY,
        authorization: `Bearer ${config.GPIR_SUPABASE_SECRET_KEY}`,
        'content-type': 'application/json' }, body: JSON.stringify(body)
    });
  } catch { return { ok: false, data: null, debugId: null }; }
  const debugId = response.headers.get('x-request-id');
  let data = null;
  try { data = await response.json(); } catch {}
  return { ok: response.ok, data, debugId };
}

function basicCredentials(clientId, clientSecret) {
  try { return globalThis.btoa(`${clientId}:${clientSecret}`); } catch { return null; }
}

export async function paypalAccessToken({ config, fetchImpl }) {
  const encoded = basicCredentials(config.PAYPAL_CLIENT_ID, config.PAYPAL_CLIENT_SECRET);
  if (!encoded) return null;
  let response;
  try {
    response = await fetchImpl(`${config.PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST', headers: { authorization: `Basic ${encoded}`,
        'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: 'grant_type=client_credentials'
    });
  } catch { return null; }
  if (!response.ok) return null;
  let result;
  try { result = await response.json(); } catch { return null; }
  return typeof result?.access_token === 'string' && result.access_token
    ? result.access_token : null;
}

export async function paypalJson({ config, accessToken, path, method = 'GET',
  body, requestId, fetchImpl }) {
  const headers = { authorization: `Bearer ${accessToken}`, accept: 'application/json',
    'content-type': 'application/json', prefer: 'return=representation' };
  if (requestId) headers['paypal-request-id'] = requestId;
  let response;
  try {
    response = await fetchImpl(`${config.PAYPAL_BASE_URL}${path}`, { method, headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  } catch { return { ok: false, status: 503, data: null, debugId: null }; }
  let data = null;
  try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data,
    debugId: response.headers.get('paypal-debug-id') };
}

export function minorToValue(minor) {
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}

export function valueToMinor(value) {
  const match = /^(0|[1-9]\d*)\.(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function preparedOrder(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || !UUID.test(row.local_order_id || '') ||
      !UUID.test(row.supabase_record_id || '') ||
      typeof row.publication_id !== 'string' || typeof row.sku !== 'string' ||
      typeof row.display_name !== 'string' || row.currency !== 'USD' ||
      !Number.isSafeInteger(Number(row.expected_amount_minor)) ||
      Number(row.expected_amount_minor) <= 0) return null;
  return Object.freeze({ ...row, expected_amount_minor: Number(row.expected_amount_minor) });
}

export function storedOrder(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || !UUID.test(row.local_order_id || '') ||
      !UUID.test(row.supabase_record_id || '') || !PAYPAL_ID.test(row.paypal_order_id || '') ||
      typeof row.publication_id !== 'string' || row.currency !== 'USD' ||
      !Number.isSafeInteger(Number(row.expected_amount_minor)) ||
      Number(row.expected_amount_minor) <= 0) return null;
  return Object.freeze({ ...row, expected_amount_minor: Number(row.expected_amount_minor) });
}

export function verifiedCapture(order, expected) {
  if (!order || order.id !== expected.paypal_order_id || order.status !== 'COMPLETED') return null;
  const unit = Array.isArray(order.purchase_units)
    ? order.purchase_units.find(item => item?.custom_id === expected.local_order_id) : null;
  const captures = unit?.payments?.captures;
  if (!unit || !Array.isArray(captures)) return null;
  const capture = captures.find(item => item?.status === 'COMPLETED' &&
    PAYPAL_ID.test(item?.id || ''));
  const amount = capture?.amount;
  if (!capture || amount?.currency_code !== expected.currency ||
      valueToMinor(amount?.value) !== expected.expected_amount_minor) return null;
  return Object.freeze({ captureId: capture.id, currency: amount.currency_code,
    amountMinor: expected.expected_amount_minor, providerStatus: capture.status });
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
