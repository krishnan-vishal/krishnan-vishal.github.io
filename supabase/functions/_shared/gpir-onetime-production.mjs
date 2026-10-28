import { ONETIME_AMOUNT_MINOR, ONETIME_DURATION_DAYS, formatPayPalAmount,
  isSupportedCurrency, parsePayPalAmount }
  from './gpir-onetime-currency.mjs';

export const ONETIME_PRODUCTION_PROJECT = 'qlnvhfapctcpzqyuhhth';
export const PAYPAL_PRODUCTION_BASE = 'https://api-m.paypal.com';
export const ONETIME_PRODUCTION_ORIGIN = 'https://fintechoisis.com';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PAYPAL_ID = /^[A-Z0-9-]{8,64}$/i;

export function onetimeConfiguration(env, { webhook = false } = {}) {
  const required = ['SUPABASE_URL', 'GPIR_SUPABASE_PUBLISHABLE_KEY',
    'GPIR_SUPABASE_SECRET_KEY', 'GPIR_ONETIME_ALLOWED_ORIGINS',
    'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'];
  if (webhook) required.push('ONETIME_PAYPAL_WEBHOOK_ID');
  const values = Object.fromEntries(required.map(name => [name, env?.[name]?.trim()]));
  const environment = (env?.PAYPAL_ENVIRONMENT || env?.PAYPAL_ENV || '').trim().toLowerCase();
  if (env?.ONETIME_CHECKOUT_ENABLED !== 'true' || environment !== 'live' ||
      !required.every(name => values[name])) return null;
  let url;
  try { url = new URL(values.SUPABASE_URL); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== `${ONETIME_PRODUCTION_PROJECT}.supabase.co` ||
      url.pathname !== '/' || (env.PAYPAL_BASE_URL && env.PAYPAL_BASE_URL !== PAYPAL_PRODUCTION_BASE))
    return null;
  return Object.freeze({ ...values, SUPABASE_URL: url.origin,
    PAYPAL_ENVIRONMENT: 'live', PAYMENT_ENVIRONMENT: 'LIVE',
    PAYPAL_BASE_URL: PAYPAL_PRODUCTION_BASE });
}

export function allowedOrigins(env) {
  return new Set([ONETIME_PRODUCTION_ORIGIN,
    ...String(env?.GPIR_ONETIME_ALLOWED_ORIGINS || '').split(',')
      .map(value => value.trim()).filter(Boolean)]);
}

export function corsHeaders(origin, env) {
  const headers = { 'cache-control': 'private, no-store, max-age=0', pragma: 'no-cache',
    vary: 'Origin', 'x-content-type-options': 'nosniff' };
  if (origin && allowedOrigins(env).has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, apikey, content-type';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
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

export function validateBrowserRequest(request, env, methods = ['POST']) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins(env).has(origin))
    return { error: safeError(403, 'ORIGIN_NOT_ALLOWED', null, env) };
  if (request.method === 'OPTIONS') return { error: jsonResponse(204, {}, origin, env) };
  if (!methods.includes(request.method))
    return { error: safeError(405, 'METHOD_NOT_ALLOWED', origin, env) };
  return { origin };
}

function bearerToken(request) {
  return /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') || '')?.[1] || null;
}

export async function authenticateSupabaseUser({ request, config, fetchImpl }) {
  const token = bearerToken(request);
  if (!token) return null;
  let response;
  try {
    const headers = new Headers();
    headers.set('apikey', config.GPIR_SUPABASE_PUBLISHABLE_KEY);
    headers.set('authorization', `Bearer ${token}`);
    response = await fetchImpl(`${config.SUPABASE_URL}/auth/v1/user`, { headers });
  } catch { return null; }
  if (!response.ok) return null;
  let user;
  try { user = await response.json(); } catch { return null; }
  return UUID.test(user?.id || '') ? Object.freeze({ id: user.id }) : null;
}

export async function supabaseRpc({ config, name, body, fetchImpl }) {
  let response;
  try {
    const headers = new Headers();
    headers.set('apikey', config.GPIR_SUPABASE_SECRET_KEY);
    headers.set('authorization', `Bearer ${config.GPIR_SUPABASE_SECRET_KEY}`);
    headers.set('content-type', 'application/json');
    response = await fetchImpl(`${config.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body)
    });
  } catch { return { ok: false, data: null, debugId: null }; }
  let data = null;
  try { data = await response.json(); } catch {}
  return { ok: response.ok, data, debugId: response.headers.get('x-request-id') };
}

export async function supabaseRest({ config, table, query = '', method = 'GET', body,
  prefer, fetchImpl }) {
  let response;
  try {
    const headers = new Headers();
    headers.set('apikey', config.GPIR_SUPABASE_SECRET_KEY);
    headers.set('authorization', `Bearer ${config.GPIR_SUPABASE_SECRET_KEY}`);
    headers.set('content-type', 'application/json');
    if (prefer) headers.set('prefer', prefer);
    response = await fetchImpl(`${config.SUPABASE_URL}/rest/v1/${table}${query}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch { return { ok: false, status: 503, data: null, debugId: null }; }
  let data = null;
  try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data,
    debugId: response.headers.get('x-request-id') };
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
  let data;
  try { data = await response.json(); } catch { return null; }
  return typeof data?.access_token === 'string' && data.access_token ? data.access_token : null;
}

export async function paypalJson({ config, accessToken, path, method = 'GET', body,
  requestId, fetchImpl }) {
  const headers = { authorization: `Bearer ${accessToken}`, accept: 'application/json',
    'content-type': 'application/json', prefer: 'return=representation' };
  if (requestId) headers['paypal-request-id'] = requestId;
  let response;
  try {
    response = await fetchImpl(`${config.PAYPAL_BASE_URL}${path}`, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { return { ok: false, status: 503, data: null, debugId: null }; }
  let data = null;
  try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data,
    debugId: response.headers.get('paypal-debug-id') };
}

export function normalizedOffer(row) {
  if (!row || !UUID.test(row.offer_id || '') || typeof row.pass_id !== 'string' ||
      !(row.publication_id === 'PREMIUM_LIBRARY' && row.supabase_record_id == null && row.pass_id === 'GPIR_PREMIUM_LIBRARY_30D') ||
      typeof row.display_name !== 'string' || !isSupportedCurrency(row.currency) ||
      Number(row.unit_amount_minor) !== ONETIME_AMOUNT_MINOR ||
      Number(row.access_duration_days) !== ONETIME_DURATION_DAYS)
    return null;
  const amountMinor = Number(row.unit_amount_minor);
  return Object.freeze({ offerId: row.offer_id, passId: row.pass_id,
    publicationId: row.publication_id, supabaseRecordId: row.supabase_record_id,
    displayName: row.display_name, currency: row.currency,
    amountMinor, amount: formatPayPalAmount(row.currency, amountMinor),
    durationDays: Number(row.access_duration_days) });
}

export function preparedOrder(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  const offer = row ? normalizedOffer({ offer_id: row.offer_id, pass_id: row.pass_id,
    publication_id: row.publication_id, supabase_record_id: row.supabase_record_id,
    display_name: row.display_name, currency: row.currency,
    unit_amount_minor: row.expected_amount_minor,
    access_duration_days: row.access_duration_days }) : null;
  if (!offer || !UUID.test(row.local_order_id || '') || typeof row.sku !== 'string' ||
      typeof row.provider_request_id !== 'string' || !row.provider_request_id) return null;
  if (row.paypal_order_id && !PAYPAL_ID.test(row.paypal_order_id)) return null;
  return Object.freeze({ ...row, ...offer,
    expectedAmountMinor: Number(row.expected_amount_minor) });
}

export function storedOrder(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || !UUID.test(row.local_order_id || '') || !PAYPAL_ID.test(row.paypal_order_id || '') ||
      !(row.publication_id === 'PREMIUM_LIBRARY' && row.supabase_record_id == null) ||
      !isSupportedCurrency(row.currency) ||
      !Number.isSafeInteger(Number(row.expected_amount_minor)) ||
      Number(row.expected_amount_minor) <= 0 ||
      !Number.isInteger(Number(row.access_duration_days)) || Number(row.access_duration_days) <= 0)
    return null;
  return Object.freeze({ ...row, expected_amount_minor: Number(row.expected_amount_minor),
    access_duration_days: Number(row.access_duration_days) });
}

export function productionStoredOrder(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || !UUID.test(row.id || '') || !PAYPAL_ID.test(row.paypal_order_id || '') ||
      !isSupportedCurrency(row.currency) || Number(row.amount_minor) !== ONETIME_AMOUNT_MINOR ||
      Number(row.duration_days) !== ONETIME_DURATION_DAYS ||
      !['CREATED', 'APPROVED', 'PENDING', 'CAPTURED', 'DENIED',
        'REFUNDED', 'REVERSED'].includes(row.status) ||
      (row.paypal_capture_id && !PAYPAL_ID.test(row.paypal_capture_id))) return null;
  return Object.freeze({ local_order_id: row.id, paypal_order_id: row.paypal_order_id,
    paypal_capture_id: row.paypal_capture_id || null, order_status: row.status,
    publication_id: 'PREMIUM_LIBRARY', supabase_record_id: null,
    currency: row.currency, expected_amount_minor: Number(row.amount_minor),
    access_duration_days: Number(row.duration_days) });
}

export function verifiedCapture(order, local) {
  if (!order || order.id !== local.paypal_order_id || order.status !== 'COMPLETED') return null;
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  if (units.length !== 1 || units[0]?.custom_id !== local.local_order_id) return null;
  const captures = units[0]?.payments?.captures;
  if (!Array.isArray(captures) || captures.length !== 1) return null;
  const capture = captures[0];
  const amountMinor = parsePayPalAmount(capture?.amount?.currency_code,
    capture?.amount?.value);
  if (!PAYPAL_ID.test(capture?.id || '') || capture.status !== 'COMPLETED' ||
      capture.amount?.currency_code !== local.currency ||
      amountMinor !== local.expected_amount_minor) return null;
  return Object.freeze({ captureId: capture.id, currency: local.currency,
    amountMinor, providerStatus: capture.status });
}

export function captureStatus(order) {
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  return typeof capture?.status === 'string' ? capture.status :
    typeof order?.status === 'string' ? order.status : null;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
