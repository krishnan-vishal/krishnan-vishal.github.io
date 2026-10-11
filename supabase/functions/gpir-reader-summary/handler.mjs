const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuration(env) {
  const names = ['SUPABASE_URL', 'GPIR_SUPABASE_PUBLISHABLE_KEY', 'GPIR_SUPABASE_SECRET_KEY'];
  const values = Object.fromEntries(names.map(name => [name, env[name]?.trim()]));
  if (!names.every(name => values[name])) return null;
  let url;
  try { url = new URL(values.SUPABASE_URL); } catch { return null; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) return null;
  return Object.freeze({ ...values, SUPABASE_URL: url.origin });
}

function allowedOrigins(env) {
  return new Set(String(env.GPIR_ALLOWED_ORIGINS || '').split(',')
    .map(value => value.trim()).filter(Boolean));
}

function response(status, body, origin, env) {
  const headers = { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0', pragma: 'no-cache',
    vary: 'Origin', 'x-content-type-options': 'nosniff' };
  if (origin && allowedOrigins(env).has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, content-type';
    headers['access-control-allow-methods'] = 'GET, OPTIONS';
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function bearerToken(request) {
  return /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') || '')?.[1] || null;
}

async function jsonFetch(fetchImpl, url, init) {
  let result;
  try { result = await fetchImpl(url, init); } catch { return { ok: false, data: null }; }
  let data = null;
  try { data = await result.json(); } catch {}
  return { ok: result.ok, status: result.status, data };
}

function validRows(result) {
  return result.ok && Array.isArray(result.data) ? result.data : null;
}

function safeText(value, max = 160) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function paymentSummary(row) {
  if (!UUID.test(row?.id || '') || !UUID.test(row?.supabase_record_id || '') ||
      typeof row?.publication_id !== 'string' || row.currency !== 'USD' ||
      !Number.isSafeInteger(Number(row.expected_amount_minor))) return null;
  return Object.freeze({ id: row.id, publicationId: row.publication_id,
    supabaseRecordId: row.supabase_record_id, currency: row.currency,
    expectedAmountMinor: Number(row.expected_amount_minor),
    capturedAmountMinor: row.captured_amount_minor == null ? null : Number(row.captured_amount_minor),
    status: safeText(row.status, 24), createdAt: isoOrNull(row.created_at),
    capturedAt: isoOrNull(row.captured_at) });
}

function purchaseKey(row) { return `${row.supabase_record_id}:${row.publication_id}`; }

function publicationCandidate(row) {
  if (!UUID.test(row?.supabase_record_id || '') ||
      typeof row?.publication_id !== 'string' || !row.publication_id.trim()) return null;
  return Object.freeze({ supabase_record_id: row.supabase_record_id,
    publication_id: row.publication_id });
}

export function createReaderSummaryHandler({ env, fetchImpl = fetch,
  now = () => Date.now() }) {
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins(env).has(origin))
      return response(403, { status: 'ERROR', code: 'ORIGIN_NOT_ALLOWED' }, null, env);
    if (request.method === 'OPTIONS') return response(204, {}, origin, env);
    if (request.method !== 'GET')
      return response(405, { status: 'ERROR', code: 'METHOD_NOT_ALLOWED' }, origin, env);
    const config = configuration(env);
    if (!config)
      return response(503, { status: 'ERROR', code: 'READER_SUMMARY_CONFIGURATION_REQUIRED' }, origin, env);
    const token = bearerToken(request);
    if (!token) return response(401, { status: 'ERROR', code: 'SESSION_REQUIRED' }, origin, env);

    const userHeaders = { apikey: config.GPIR_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const userResult = await jsonFetch(fetchImpl, `${config.SUPABASE_URL}/auth/v1/user`,
      { headers: userHeaders });
    const user = userResult.data;
    if (!userResult.ok || !UUID.test(user?.id || ''))
      return response(401, { status: 'ERROR', code: 'SESSION_INVALID' }, origin, env);

    const serviceHeaders = { apikey: config.GPIR_SUPABASE_SECRET_KEY,
      authorization: `Bearer ${config.GPIR_SUPABASE_SECRET_KEY}` };
    const offerQuery = new URLSearchParams({
      select: 'supabase_record_id,publication_id', environment: 'eq.SANDBOX',
      status: 'eq.SANDBOX_ACTIVE', order: 'publication_id.asc', limit: '100'
    });
    const paymentQuery = new URLSearchParams({
      select: 'id,publication_id,supabase_record_id,currency,expected_amount_minor,captured_amount_minor,status,created_at,captured_at',
      user_id: `eq.${user.id}`, order: 'created_at.desc', limit: '100'
    });
    const purchaseQuery = new URLSearchParams({
      select: 'publication_id,supabase_record_id,status,effective_from,revoked_at',
      user_id: `eq.${user.id}`, order: 'effective_from.desc', limit: '100'
    });
    const [offersResult, paymentsResult, purchasesResult] = await Promise.all([
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_payment_offers?${offerQuery}`,
        { headers: serviceHeaders }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_payment_orders?${paymentQuery}`,
        { headers: serviceHeaders }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_publication_purchase_entitlements?${purchaseQuery}`,
        { headers: serviceHeaders })
    ]);
    const offers = validRows(offersResult);
    const rawPayments = validRows(paymentsResult);
    const purchases = validRows(purchasesResult);
    if (!offers || !rawPayments || !purchases)
      return response(503, { status: 'ERROR', code: 'READER_SUMMARY_UNAVAILABLE' }, origin, env);

    const candidates = new Map();
    for (const row of [...offers, ...purchases]) {
      const candidate = publicationCandidate(row);
      if (!candidate)
        return response(503, { status: 'ERROR', code: 'READER_SUMMARY_UNAVAILABLE' }, origin, env);
      candidates.set(purchaseKey(candidate), candidate);
    }
    const publications = [...candidates.values()];

    const entitlementResults = await Promise.all(publications.map(publication => jsonFetch(fetchImpl,
      `${config.SUPABASE_URL}/rest/v1/rpc/resolve_publication_entitlement`, {
        method: 'POST', headers: userHeaders, body: JSON.stringify({
          p_publication_id: publication.publication_id,
          p_supabase_record_id: publication.supabase_record_id
        })
      })));
    const decisions = entitlementResults.map(validRows);
    if (decisions.some(rows => !rows || rows.length !== 1 ||
        !['ALLOW', 'DENY'].includes(rows[0]?.decision)))
      return response(503, { status: 'ERROR', code: 'ENTITLEMENT_RESOLUTION_UNAVAILABLE' }, origin, env);

    const purchaseStates = new Map(purchases.map(row => [purchaseKey(row), row.status]));
    const hasPlanAccess = publications.some((publication, index) =>
      decisions[index][0].decision === 'ALLOW' &&
      purchaseStates.get(purchaseKey(publication)) !== 'ACTIVE');
    const plan = Object.freeze({ status: hasPlanAccess ? 'ACTIVE' : 'NOT_ENROLLED',
      accessClass: hasPlanAccess ? 'ENTITLED' : null, effectiveFrom: null,
      effectiveUntil: null, billingStatus: 'NOT_ACTIVE' });
    const library = publications.flatMap((publication, index) => {
      if (decisions[index][0].decision !== 'ALLOW') return [];
      const purchaseState = purchaseStates.get(purchaseKey(publication));
      const accessSource = purchaseState === 'ACTIVE' ? 'ONE_TIME_PURCHASE' : 'PLAN';
      return [Object.freeze({ publicationId: publication.publication_id,
        supabaseRecordId: publication.supabase_record_id,
        accessClass: 'ENTITLED', accessSource })];
    });
    const payments = rawPayments.map(paymentSummary).filter(Boolean);
    const displayName = safeText(user.user_metadata?.display_name || user.user_metadata?.full_name);
    const profile = Object.freeze({ email: safeText(user.email, 254), displayName,
      memberSince: isoOrNull(user.created_at), emailVerified: Boolean(
        user.email_confirmed_at || user.confirmed_at) });

    return response(200, Object.freeze({ status: 'OK', profile, library, payments, plan,
      summary: Object.freeze({ libraryCount: library.length, paymentCount: payments.length,
        activePurchaseCount: purchases.filter(row => row.status === 'ACTIVE').length }),
      generatedAt: new Date(now()).toISOString() }), origin, env);
  };
}

export { configuration, paymentSummary, publicationCandidate };
