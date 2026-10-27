const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECTS = Object.freeze({ sandbox: 'hoewtptllwkcqrgryazu',
  production: 'qlnvhfapctcpzqyuhhth' });
const SANDBOX_PREVIEW_ORIGIN =
  'https://gpir-m37-sandbox-checkout-20261026.amusedhill18.chatgpt.site';
const SANDBOX_ENTITLED_PUBLICATIONS = Object.freeze([
  Object.freeze({ publication_id: 'VK-GPIR-P-000000000001-8',
    supabase_record_id: '1f259c71-5af8-4145-b12d-d8a5754732b5' }),
  Object.freeze({ publication_id: 'VK-GPIR-P-000000000002-6',
    supabase_record_id: 'b2ed5960-3432-4c98-b3ab-fbe62793863f' }),
  Object.freeze({ publication_id: 'VK-GPIR-P-000000000003-4',
    supabase_record_id: 'aa4fbdfa-6fa2-4785-8383-ab33cb2c8962' }),
  Object.freeze({ publication_id: 'VK-GPIR-P-000000000004-2',
    supabase_record_id: '08b616cb-045f-422e-81a7-ae947a332ae8' })
]);

function configuration(env) {
  const names = ['SUPABASE_URL', 'GPIR_SUPABASE_PUBLISHABLE_KEY', 'GPIR_SUPABASE_SECRET_KEY'];
  const values = Object.fromEntries(names.map(name => [name, env[name]?.trim()]));
  if (!names.every(name => values[name])) return null;
  let url;
  try { url = new URL(values.SUPABASE_URL); } catch { return null; }
  const environment = env.GPIR_PAYMENT_ENVIRONMENT?.trim().toLowerCase() ||
    (url.hostname === `${PROJECTS.sandbox}.supabase.co` ? 'sandbox' : null);
  if (!environment || !PROJECTS[environment] || url.protocol !== 'https:' ||
      url.hostname !== `${PROJECTS[environment]}.supabase.co`) return null;
  return Object.freeze({ ...values, SUPABASE_URL: url.origin,
    PAYMENT_ENVIRONMENT: environment.toUpperCase(), environment });
}

function allowedOrigins(env) {
  const origins = new Set(String(env.GPIR_ALLOWED_ORIGINS || '').split(',')
    .map(value => value.trim()).filter(Boolean));
  try {
    if (new URL(env.SUPABASE_URL).hostname === `${PROJECTS.sandbox}.supabase.co`)
      origins.add(SANDBOX_PREVIEW_ORIGIN);
  } catch {}
  return origins;
}

function response(status, body, origin, env) {
  const headers = { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0', pragma: 'no-cache',
    vary: 'Origin', 'x-content-type-options': 'nosniff' };
  if (origin && allowedOrigins(env).has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'apikey, authorization, content-type';
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

function postgrestDiagnostic(result) {
  const error = result.data;
  const code = typeof error?.code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(error.code)
    ? error.code : null;
  const message = typeof error?.message === 'string'
    ? error.message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ')
      .trim().slice(0, 240) || null
    : null;
  return { status: result.status, code, message };
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

function subscriptionSummary(row) {
  if (!UUID.test(row?.id || '') || typeof row?.status !== 'string' ||
      !['APPROVAL_PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED',
        'PAYMENT_FAILED'].includes(row.status)) return null;
  return Object.freeze({ status: row.status, effectiveFrom: isoOrNull(row.effective_from),
    effectiveUntil: isoOrNull(row.effective_until) });
}

function libraryPassSummary(row, environment, currentTime) {
  const effectiveFrom = isoOrNull(row?.effective_from);
  const effectiveUntil = isoOrNull(row?.effective_until);
  const orderEnvironment = row?.gpir_onetime_orders?.environment;
  if (!UUID.test(row?.id || '') || !UUID.test(row?.source_order_id || '') ||
      row?.scope !== 'PREMIUM_LIBRARY' || row?.status !== 'ACTIVE' || row?.revoked_at != null ||
      orderEnvironment !== environment || !effectiveFrom || !effectiveUntil ||
      Date.parse(effectiveFrom) > currentTime || Date.parse(effectiveUntil) <= currentTime) return null;
  return Object.freeze({ status: 'ACTIVE', scope: row.scope,
    effectiveFrom, effectiveUntil, sourceOrderId: row.source_order_id });
}

function purchaseKey(row) { return `${row.supabase_record_id}:${row.publication_id}`; }

function publicationCandidate(row) {
  if (!UUID.test(row?.supabase_record_id || '') ||
      typeof row?.publication_id !== 'string' || !row.publication_id.trim()) return null;
  return Object.freeze({ supabase_record_id: row.supabase_record_id,
    publication_id: row.publication_id });
}

function subscriptionOffer(row) {
  const amount = Number(row?.unit_amount_minor);
  if (!UUID.test(row?.id || '') || typeof row?.display_name !== 'string' ||
      !row.display_name.trim() || row.currency !== 'USD' ||
      !Number.isSafeInteger(amount) || amount <= 0 ||
      !['MONTH', 'YEAR'].includes(row.billing_interval)) return null;
  return Object.freeze({ id: row.id, displayName: safeText(row.display_name),
    currency: row.currency, unitAmountMinor: amount, billingInterval: row.billing_interval });
}

function reportDependencyFailure(logger, dependency, result) {
  try {
    logger.error('gpir-reader-summary dependency failure', {
      dependency, ...postgrestDiagnostic(result)
    });
  } catch {}
}

export function createReaderSummaryHandler({ env, fetchImpl = fetch,
  now = () => Date.now(), logger = console }) {
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
      select: 'supabase_record_id,publication_id',
      environment: `eq.${config.PAYMENT_ENVIRONMENT}`,
      status: `eq.${config.environment === 'sandbox' ? 'SANDBOX_ACTIVE' : 'LIVE_ACTIVE'}`,
      order: 'publication_id.asc', limit: '100'
    });
    const paymentQuery = new URLSearchParams({
      select: 'id,publication_id,supabase_record_id,currency,expected_amount_minor,captured_amount_minor,status,created_at,captured_at',
      user_id: `eq.${user.id}`, environment: `eq.${config.PAYMENT_ENVIRONMENT}`,
      order: 'created_at.desc', limit: '100'
    });
    const purchaseQuery = new URLSearchParams({
      select: 'publication_id,supabase_record_id,status,effective_from,revoked_at',
      user_id: `eq.${user.id}`, environment: `eq.${config.PAYMENT_ENVIRONMENT}`,
      order: 'effective_from.desc', limit: '100'
    });
    const subscriptionQuery = new URLSearchParams({
      select: 'id,status,effective_from,effective_until', user_id: `eq.${user.id}`,
      environment: `eq.${config.PAYMENT_ENVIRONMENT}`, order: 'updated_at.desc', limit: '1'
    });
    const libraryPassQuery = new URLSearchParams({
      select: 'id,source_order_id,scope,status,effective_from,effective_until,revoked_at,gpir_onetime_orders!inner(environment)',
      user_id: `eq.${user.id}`, status: 'eq.ACTIVE', revoked_at: 'is.null',
      effective_from: `lte.${new Date(now()).toISOString()}`,
      effective_until: `gt.${new Date(now()).toISOString()}`,
      'gpir_onetime_orders.environment': `eq.${config.PAYMENT_ENVIRONMENT}`,
      order: 'effective_until.desc', limit: '1'
    });
    const planQuery = new URLSearchParams({
      select: 'id,display_name,currency,unit_amount_minor,billing_interval',
      environment: `eq.${config.PAYMENT_ENVIRONMENT}`,
      status: `eq.${config.environment === 'sandbox' ? 'SANDBOX_ACTIVE' : 'LIVE_ACTIVE'}`,
      order: 'created_at.asc', limit: '1'
    });
    const [candidatesResult, offersResult, paymentsResult, purchasesResult,
      subscriptionsResult, plansResult, libraryPassesResult] = await Promise.all([
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/rpc/gpir_list_entitlement_candidates_v2`,
        { method: 'POST', headers: serviceHeaders, body: '{}' }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_payment_offers?${offerQuery}`,
        { headers: serviceHeaders }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_payment_orders?${paymentQuery}`,
        { headers: serviceHeaders }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_publication_purchase_entitlements?${purchaseQuery}`,
        { headers: serviceHeaders }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_paypal_subscriptions?${subscriptionQuery}`,
        { headers: serviceHeaders }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_subscription_plans?${planQuery}`,
        { headers: serviceHeaders }),
      jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_onetime_library_entitlements?${libraryPassQuery}`,
        { headers: serviceHeaders })
    ]);

    const candidateRpcMissing = config.environment === 'sandbox' &&
      candidatesResult.status === 404 && candidatesResult.data?.code === 'PGRST202';
    const effectiveCandidatesResult = candidateRpcMissing
      ? { ok: true, status: 200, data: SANDBOX_ENTITLED_PUBLICATIONS }
      : candidatesResult;
    for (const [dependency, result] of [
      ['gpir_list_entitlement_candidates_v2', effectiveCandidatesResult],
      ['gpir_payment_offers', offersResult],
      ['gpir_payment_orders', paymentsResult],
      ['gpir_publication_purchase_entitlements', purchasesResult],
      ['gpir_paypal_subscriptions', subscriptionsResult],
      ['gpir_subscription_plans', plansResult],
      ['gpir_onetime_library_entitlements', libraryPassesResult]
    ]) if (!validRows(result)) reportDependencyFailure(logger, dependency, result);

    const policyCandidates = validRows(effectiveCandidatesResult);
    const offers = validRows(offersResult);
    const rawPayments = validRows(paymentsResult);
    const purchases = validRows(purchasesResult);
    const rawSubscriptions = validRows(subscriptionsResult);
    const rawPlans = validRows(plansResult);
    const rawLibraryPasses = validRows(libraryPassesResult);
    let libraryPassAvailable = Boolean(rawLibraryPasses);
    const libraryPass = rawLibraryPasses?.length
      ? libraryPassSummary(rawLibraryPasses[0], config.PAYMENT_ENVIRONMENT, now()) : null;
    if (rawLibraryPasses?.length && !libraryPass) {
      libraryPassAvailable = false;
      reportDependencyFailure(logger, 'gpir_onetime_library_entitlements', libraryPassesResult);
    }

    let entitlementAvailable = Boolean(policyCandidates && offers && purchases);
    const candidates = new Map();
    if (entitlementAvailable) {
      for (const row of [...policyCandidates, ...offers, ...purchases]) {
        const candidate = publicationCandidate(row);
        if (!candidate) { entitlementAvailable = false; break; }
        candidates.set(purchaseKey(candidate), candidate);
      }
    }
    const publications = entitlementAvailable ? [...candidates.values()] : [];

    const entitlementResults = await Promise.all(publications.map(publication => jsonFetch(fetchImpl,
      `${config.SUPABASE_URL}/rest/v1/rpc/resolve_publication_entitlement`, {
        method: 'POST', headers: userHeaders, body: JSON.stringify({
          p_publication_id: publication.publication_id,
          p_supabase_record_id: publication.supabase_record_id
        })
      })));
    const decisions = entitlementResults.map(validRows);
    if (decisions.some(rows => !rows || rows.length !== 1 ||
        !['ALLOW', 'DENY'].includes(rows[0]?.decision))) {
      entitlementAvailable = false;
      const failed = entitlementResults.find((result, index) => {
        const rows = decisions[index];
        return !rows || rows.length !== 1 || !['ALLOW', 'DENY'].includes(rows[0]?.decision);
      });
      reportDependencyFailure(logger, 'resolve_publication_entitlement', failed || {});
    }

    const purchaseStates = new Map((purchases || []).map(row => [purchaseKey(row), row.status]));
    const hasPlanAccess = entitlementAvailable && !libraryPass && publications.some((publication, index) =>
      decisions[index][0].decision === 'ALLOW' &&
      purchaseStates.get(purchaseKey(publication)) !== 'ACTIVE');
    let planAvailable = Boolean(rawSubscriptions);
    const subscription = rawSubscriptions?.length ? subscriptionSummary(rawSubscriptions[0]) : null;
    if (rawSubscriptions?.length && !subscription) {
      planAvailable = false;
      reportDependencyFailure(logger, 'gpir_paypal_subscriptions', subscriptionsResult);
    }
    const subscriptionActive = planAvailable && subscription?.status === 'ACTIVE';
    const plan = Object.freeze({ status: subscriptionActive || hasPlanAccess ? 'ACTIVE' :
      subscription ? 'INACTIVE' : 'NOT_ENROLLED',
      accessClass: entitlementAvailable && (subscriptionActive || hasPlanAccess) ? 'ENTITLED' : null,
      effectiveFrom: subscription?.effectiveFrom || null,
      effectiveUntil: subscription?.effectiveUntil || null,
      billingStatus: subscription?.status || 'NOT_ACTIVE' });
    const library = entitlementAvailable ? publications.flatMap((publication, index) => {
      if (decisions[index][0].decision !== 'ALLOW') return [];
      const purchaseState = purchaseStates.get(purchaseKey(publication));
      const accessSource = purchaseState === 'ACTIVE' ? 'ONE_TIME_PURCHASE' :
        libraryPass ? 'PREMIUM_LIBRARY_PASS' : 'PLAN';
      return [Object.freeze({ publicationId: publication.publication_id,
        supabaseRecordId: publication.supabase_record_id,
        accessClass: 'ENTITLED', accessSource })];
    }) : [];
    let paymentsAvailable = Boolean(rawPayments);
    const payments = rawPayments ? rawPayments.map(paymentSummary).filter(Boolean) : [];
    if (rawPayments && payments.length !== rawPayments.length) {
      paymentsAvailable = false;
      reportDependencyFailure(logger, 'gpir_payment_orders', paymentsResult);
    }
    let checkoutOffer = rawPlans?.length ? subscriptionOffer(rawPlans[0]) : null;
    if (rawPlans?.length && !checkoutOffer) {
      reportDependencyFailure(logger, 'gpir_subscription_plans', plansResult);
      checkoutOffer = null;
    }
    const displayName = safeText(user.user_metadata?.display_name || user.user_metadata?.full_name);
    const profile = Object.freeze({ email: safeText(user.email, 254), displayName,
      memberSince: isoOrNull(user.created_at), emailVerified: Boolean(
        user.email_confirmed_at || user.confirmed_at) });

    return response(200, Object.freeze({ status: 'OK', environment: config.environment,
      profile, library, payments, plan, libraryPass, subscriptionOffer: checkoutOffer,
      availability: Object.freeze({ profile: 'AVAILABLE',
        library: entitlementAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        payments: paymentsAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        plan: planAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        libraryPass: libraryPassAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        subscriptionCheckout: config.environment === 'sandbox' && checkoutOffer
          ? 'AVAILABLE' : 'UNAVAILABLE' }),
      summary: Object.freeze({ libraryCount: entitlementAvailable ? library.length : null,
        paymentCount: paymentsAvailable ? payments.length : null,
        activePurchaseCount: purchases
          ? purchases.filter(row => row.status === 'ACTIVE').length : null }),
      generatedAt: new Date(now()).toISOString() }), origin, env);
  };
}

export { configuration, paymentSummary, publicationCandidate, subscriptionOffer,
  subscriptionSummary, libraryPassSummary };
