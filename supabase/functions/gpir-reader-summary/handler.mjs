const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECTS = Object.freeze({ sandbox: 'hoewtptllwkcqrgryazu',
  production: 'qlnvhfapctcpzqyuhhth' });
const ONETIME_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD']);
const FRANKFURTER_ORIGIN = 'https://api.frankfurter.dev';
const FRANKFURTER_SOURCE = 'European Central Bank via Frankfurter';
const FRANKFURTER_START_DATE = '1999-01-04';
const FX_HISTORY_CACHE_MS = 15 * 60 * 1000;
const FX_HISTORY_CACHE_MAX_ENTRIES = 12;
const FX_PEER_BASES = Object.freeze(['USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'SGD']);
const fxHistoryCache = new Map();
let currencyCatalogCache = null;

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
  const acceptanceUserId = env.GPIR_FX_LIVE_ACCEPTANCE_ENABLED === 'true' &&
    UUID.test(env.GPIR_FX_LIVE_ACCEPTANCE_USER_ID?.trim() || '')
    ? env.GPIR_FX_LIVE_ACCEPTANCE_USER_ID.trim() : null;
  return Object.freeze({ ...values, SUPABASE_URL: url.origin,
    PAYMENT_ENVIRONMENT: environment.toUpperCase(), environment,
    FX_LIVE_ACCEPTANCE_USER_ID: acceptanceUserId });
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

function validFxPair(value) {
  const match = typeof value === 'string' ? /^([A-Z]{3})\/([A-Z]{3})$/.exec(value) : null;
  return match && match[1] !== match[2] ? Object.freeze({ base: match[1], quote: match[2] }) : null;
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
  return { status: result.status, code };
}

function validRows(result) {
  return result.ok && Array.isArray(result.data) ? result.data : null;
}

// M39: retain the existing RPC as primary; recover only from stale PostgREST RPC discovery.
async function fetchPolicyCandidates(fetchImpl, config, headers) {
  const primary = await jsonFetch(fetchImpl,
    `${config.SUPABASE_URL}/rest/v1/rpc/gpir_list_entitlement_candidates_v2`,
    { method: 'POST', headers, body: '{}' });
  if (primary.ok || primary.data?.code !== 'PGRST202') return primary;

  const query = new URLSearchParams({
    select: 'publication_id,supabase_record_id',
    status: 'eq.ACTIVE', access_class: 'eq.ENTITLED',
    order: 'publication_id.asc', limit: '500'
  });
  return jsonFetch(fetchImpl,
    `${config.SUPABASE_URL}/rest/v1/gpir_publication_access_policies?${query}`,
    { headers });
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

function m37PaymentSummary(row) {
  const amount = Number(row?.amount_minor);
  if (!UUID.test(row?.id || '') || !ONETIME_CURRENCIES.has(row?.currency) ||
      !(amount === 999 || (amount === 100 && row.currency === 'USD' &&
        row.duration_days === 30 && row.environment === 'PRODUCTION')) ||
      !['CREATED', 'APPROVED', 'PENDING', 'CAPTURED', 'DENIED',
        'REFUNDED', 'REVERSED'].includes(row?.status)) return null;
  return Object.freeze({ id: row.id, publicationId: 'PREMIUM_LIBRARY',
    supabaseRecordId: null, paymentKind: 'PREMIUM_LIBRARY_PASS', currency: row.currency,
    expectedAmountMinor: amount,
    capturedAmountMinor: ['CAPTURED', 'REFUNDED', 'REVERSED'].includes(row.status) ? amount : null,
    status: row.status, createdAt: isoOrNull(row.created_at),
    capturedAt: isoOrNull(row.captured_at) });
}

function subscriptionSummary(row) {
  if (!UUID.test(row?.id || '') || typeof row?.status !== 'string' ||
      !['APPROVAL_PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED',
        'PAYMENT_FAILED'].includes(row.status)) return null;
  return Object.freeze({ status: row.status, effectiveFrom: isoOrNull(row.effective_from),
    effectiveUntil: isoOrNull(row.effective_until),
    paymentConfirmedAt: isoOrNull(row.payment_confirmed_at) });
}

function validatedCurrencyCatalog(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const entries = value.map(item => [item?.iso_code, item]);
  if (entries.some(([code, item]) => !/^[A-Z]{3}$/.test(code || '') ||
      typeof item?.name !== 'string' || !item.name.trim() ||
      !validCalendarDate(item.start_date) ||
      (item.end_date != null && (!validCalendarDate(item.end_date) ||
        item.end_date < item.start_date))) ||
      new Set(entries.map(([code]) => code)).size !== entries.length) return null;
  return Object.freeze(Object.fromEntries(entries.map(([code, item]) => [code,
    Object.freeze({ name: item.name.trim(), startDate: item.start_date,
      endDate: item.end_date || null })])));
}

function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function validatedRatePoints(payload, pair, throughDate, currencies) {
  if (!Array.isArray(payload)) return null;
  const baseCurrency = currencies[pair.base];
  const quoteCurrency = currencies[pair.quote];
  const fromDate = [baseCurrency.startDate, quoteCurrency.startDate]
    .sort().at(-1);
  const toDate = [throughDate, baseCurrency.endDate, quoteCurrency.endDate]
    .filter(Boolean).sort()[0];
  const points = [];
  for (const observation of payload) {
    const date = observation?.date;
    const rate = Number(observation?.rate);
    if (!validCalendarDate(date) || date < fromDate || date > toDate ||
        observation.base !== pair.base || observation.quote !== pair.quote ||
        !Number.isFinite(rate) || rate <= 0) continue;
    points.push(Object.freeze({ date, rate }));
  }
  return points.sort((left, right) => left.date.localeCompare(right.date));
}

async function fetchFrankfurterJson(fetchImpl, path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const result = await fetchImpl(`${FRANKFURTER_ORIGIN}/v2/${path}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!result.ok) throw new Error(`FX_SOURCE_HTTP_${result.status}`);
    const value = await result.json();
    if (!value || typeof value !== 'object')
      throw new Error('FX_SOURCE_INVALID_RESPONSE');
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

async function frankfurterCurrencies(fetchImpl, currentTime) {
  if (currencyCatalogCache && currencyCatalogCache.expiresAt > currentTime)
    return currencyCatalogCache.currencies;
  const currencies = validatedCurrencyCatalog(await fetchFrankfurterJson(fetchImpl,
    'currencies?providers=ecb'));
  if (!currencies) throw new Error('FX_SOURCE_INVALID_CURRENCY_CATALOG');
  currencyCatalogCache = { currencies, expiresAt: currentTime + FX_HISTORY_CACHE_MS };
  return currencies;
}

function frankfurterPeerComparisons(payload, pair, date, currencies) {
  if (!Array.isArray(payload)) return [];
  const euroRates = new Map(payload.filter(item => item?.base === 'EUR' &&
    item.date === date && Number.isFinite(Number(item.rate)) && Number(item.rate) > 0)
    .map(item => [item.quote, Number(item.rate)]));
  const euroQuote = pair.quote === 'EUR' ? 1 : euroRates.get(pair.quote);
  if (!Number.isFinite(euroQuote) || euroQuote <= 0) return [];
  return FX_PEER_BASES.filter(base => base !== pair.quote && currencies[base] &&
    (base === 'EUR' || euroRates.has(base))).map(base => {
    const euroBase = base === 'EUR' ? 1 : euroRates.get(base);
    return Object.freeze({ pair: `${base}/${pair.quote}`, date,
      rate: euroQuote / euroBase, method: 'COMMON_EUR_REFERENCE',
      source: FRANKFURTER_SOURCE });
  }).filter(item => Number.isFinite(item.rate) && item.rate > 0);
}

async function frankfurterHistory(fetchImpl, pair, currentTime, now, logger) {
  const key = `${pair.base}/${pair.quote}`;
  const cached = fxHistoryCache.get(key);
  if (cached?.expiresAt > currentTime) {
    fxHistoryCache.delete(key);
    fxHistoryCache.set(key, cached);
    return cached.value;
  }

  const currencies = await frankfurterCurrencies(fetchImpl, currentTime);
  if (!currencies[pair.base] || !currencies[pair.quote])
    return Object.freeze({ status: 'UNSUPPORTED_CURRENCY', pair: key });

  const throughDate = new Date(currentTime).toISOString().slice(0, 10);
  const query = new URLSearchParams({ from: FRANKFURTER_START_DATE,
    to: throughDate, base: pair.base, quotes: pair.quote });
  const sourceData = await fetchFrankfurterJson(fetchImpl,
    `providers/ecb/rates?${query}`);
  const points = validatedRatePoints(sourceData, pair, throughDate, currencies);
  if (!points) throw new Error('FX_SOURCE_INVALID_HISTORY');
  if (!points.length) return Object.freeze({ status: 'NO_HISTORICAL_OBSERVATIONS',
    pair: key, source: FRANKFURTER_SOURCE });

  let peerComparisons = [];
  let peerStatus = 'UNAVAILABLE';
  try {
    const peerCodes = [...new Set([...FX_PEER_BASES, pair.quote])]
      .filter(code => code !== 'EUR' && currencies[code]);
    const peerQuery = new URLSearchParams({ from: points[points.length - 1].date,
      to: points[points.length - 1].date, base: 'EUR', quotes: peerCodes.join(',') });
    const peerData = await fetchFrankfurterJson(fetchImpl,
      `providers/ecb/rates?${peerQuery}`);
    peerComparisons = frankfurterPeerComparisons(peerData, pair,
      points[points.length - 1].date, currencies);
    if (peerComparisons.length) peerStatus = 'AVAILABLE';
  } catch (error) {
    logger.error('gpir-reader-summary FX peer source failure', {
      pair: key,
      code: /^[A-Z0-9_]{1,48}$/.test(error?.message || '')
        ? error.message : 'FX_PEER_SOURCE_UNAVAILABLE'
    });
    peerStatus = 'UNAVAILABLE';
  }

  const value = Object.freeze({ status: 'AVAILABLE', pair: key,
    baseName: currencies[pair.base].name, quoteName: currencies[pair.quote].name,
    source: FRANKFURTER_SOURCE,
    sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
    sourceTermsUrl: 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html',
    providerUrl: 'https://www.frankfurter.dev/',
    retrievedAt: new Date(now()).toISOString(),
    rateMethod: pair.base === 'EUR' || pair.quote === 'EUR'
      ? 'ECB_EUR_REFERENCE_RATE' : 'ECB_EUR_PIVOT_CROSS_RATE',
    firstFixingDate: points[0].date, lastFixingDate: points[points.length - 1].date,
    currencies,
    points: Object.freeze(points), peerStatus, peerComparisons: Object.freeze(peerComparisons) });
  fxHistoryCache.delete(key);
  fxHistoryCache.set(key, { value, expiresAt: currentTime + FX_HISTORY_CACHE_MS });
  while (fxHistoryCache.size > FX_HISTORY_CACHE_MAX_ENTRIES)
    fxHistoryCache.delete(fxHistoryCache.keys().next().value);
  return value;
}

async function latestGpirCapture(fetchImpl, config, pair, serviceHeaders) {
  const query = new URLSearchParams({ select: 'timestamp,rate,source',
    base_currency: `eq.${pair.base}`, target_currency: `eq.${pair.quote}`,
    order: 'timestamp.desc', limit: '1' });
  const result = await jsonFetch(fetchImpl,
    `${config.SUPABASE_URL}/rest/v1/fx_historical_archive?${query}`,
    { headers: serviceHeaders });
  const row = Array.isArray(result.data) ? result.data[0] : null;
  const timestamp = isoOrNull(row?.timestamp);
  const rate = Number(row?.rate);
  if (!result.ok || !timestamp || !Number.isFinite(rate) || rate <= 0 ||
      typeof row?.source !== 'string' || !row.source.trim()) return null;
  return Object.freeze({ capturedAt: timestamp, rate, source: safeText(row.source) });
}

async function authorizedFxResponse({ fetchImpl, config, origin, env, userId,
  pair, now, logger }) {
  const serviceHeaders = new Headers();
  serviceHeaders.set('apikey', config.GPIR_SUPABASE_SECRET_KEY);
  serviceHeaders.set('authorization', `Bearer ${config.GPIR_SUPABASE_SECRET_KEY}`);
  const hasAcceptanceAccess = config.FX_LIVE_ACCEPTANCE_USER_ID === userId;
  const currentTime = now();
  if (!hasAcceptanceAccess) {
    const query = new URLSearchParams({
      select: 'id,status,effective_from,effective_until,payment_confirmed_at',
      user_id: `eq.${userId}`,
      environment: `eq.${config.PAYMENT_ENVIRONMENT}`, order: 'updated_at.desc', limit: '1'
    });
    const subscriptions = await jsonFetch(fetchImpl,
      `${config.SUPABASE_URL}/rest/v1/gpir_paypal_subscriptions?${query}`,
      { headers: serviceHeaders });
    if (!validRows(subscriptions))
      return response(503, { status: 'ERROR', code: 'SUBSCRIPTION_CHECK_UNAVAILABLE' }, origin, env);

    const subscription = subscriptions.data.length
      ? subscriptionSummary(subscriptions.data[0]) : null;
    const hasActiveSubscription = subscription?.status === 'ACTIVE' &&
      subscription.effectiveFrom && subscription.effectiveUntil &&
      subscription.paymentConfirmedAt &&
      Date.parse(subscription.effectiveFrom) <= currentTime &&
      Date.parse(subscription.effectiveUntil) > currentTime;
    if (!hasActiveSubscription) {
      const expired = subscription?.status === 'EXPIRED' ||
        (subscription?.effectiveUntil && Date.parse(subscription.effectiveUntil) <= currentTime);
      return response(403, { status: 'DENY',
        code: expired ? 'SUBSCRIPTION_EXPIRED' : 'SUBSCRIPTION_REQUIRED' }, origin, env);
    }
  }

  let history;
  try {
    history = await frankfurterHistory(fetchImpl, pair, currentTime, now, logger);
  } catch (error) {
    logger.error('gpir-reader-summary FX source failure', {
      pair: `${pair.base}/${pair.quote}`,
      code: /^[A-Z0-9_]{1,48}$/.test(error?.message || '')
        ? error.message : 'FX_SOURCE_UNAVAILABLE'
    });
    return response(503, { status: 'ERROR', code: 'FX_SOURCE_UNAVAILABLE' }, origin, env);
  }
  if (history.status !== 'AVAILABLE')
    return response(404, { status: 'UNAVAILABLE', code: history.status,
      pair: history.pair, source: history.source || null }, origin, env);

  const gpirCapture = await latestGpirCapture(fetchImpl, config, pair, serviceHeaders);
  return response(200, { status: 'OK', history, gpirCapture,
    gpirCaptureStatus: gpirCapture ? 'AVAILABLE' : 'UNAVAILABLE',
    archiveNotice: 'GPIR capture timestamps are separate from Frankfurter fixing dates and are not mixed into the historical reference series.' },
  origin, env);
}

function m37LibraryPassSummary(row, currentTime) {
  const effectiveFrom = isoOrNull(row?.effective_from);
  const effectiveUntil = isoOrNull(row?.effective_until);
  const revokedAt = isoOrNull(row?.revoked_at);
  if (!UUID.test(row?.id || '') || !UUID.test(row?.source_order_id || '') ||
      !['ACTIVE', 'REVOKED'].includes(row?.status) || !effectiveFrom || !effectiveUntil ||
      Date.parse(effectiveUntil) <= Date.parse(effectiveFrom) ||
      (row.status === 'ACTIVE' && row.revoked_at != null) ||
      (row.status === 'REVOKED' && !revokedAt)) return null;
  const status = row.status === 'REVOKED' ? 'REVOKED' :
    Date.parse(effectiveFrom) > currentTime ? 'PENDING' :
    Date.parse(effectiveUntil) <= currentTime ? 'EXPIRED' : 'ACTIVE';
  return Object.freeze({ status, scope: 'PREMIUM_LIBRARY', sourceOrderId: row.source_order_id,
    effectiveFrom, effectiveUntil, revokedAt });
}

function purchaseKey(row) { return `${row.supabase_record_id}:${row.publication_id}`; }

function publicationCandidate(row) {
  if (!UUID.test(row?.supabase_record_id || '') ||
      typeof row?.publication_id !== 'string' || !row.publication_id.trim()) return null;
  return Object.freeze({ supabase_record_id: row.supabase_record_id,
    publication_id: row.publication_id });
}

function subscriptionOffer(row, requiredStatus) {
  const amount = Number(row?.unit_amount_minor);
  if (!UUID.test(row?.id || '') || typeof row?.display_name !== 'string' ||
      !row.display_name.trim() || row.currency !== 'USD' ||
      !Number.isSafeInteger(amount) || amount <= 0 ||
      !['MONTH', 'YEAR'].includes(row.billing_interval) ||
      !['SANDBOX_ACTIVE', 'LIVE_ACTIVE'].includes(requiredStatus) ||
      row.status !== requiredStatus) return null;
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
    const requestUrl = new URL(request.url);
    const hasFxPair = requestUrl.searchParams.has('fxPair');
    const requestedPair = hasFxPair ? validFxPair(requestUrl.searchParams.get('fxPair')) : null;
    if (hasFxPair && !requestedPair)
      return response(400, { status: 'ERROR', code: 'INVALID_FX_PAIR' }, origin, env);
    const token = bearerToken(request);
    if (!token) return response(401, { status: 'ERROR', code: 'SESSION_REQUIRED' }, origin, env);

    const userHeaders = new Headers();
    userHeaders.set('apikey', config.GPIR_SUPABASE_PUBLISHABLE_KEY);
    userHeaders.set('authorization', `Bearer ${token}`);
    userHeaders.set('content-type', 'application/json');
    const userResult = await jsonFetch(fetchImpl, `${config.SUPABASE_URL}/auth/v1/user`,
      { headers: userHeaders });
    const user = userResult.data;
    if (!userResult.ok || !UUID.test(user?.id || ''))
      return response(401, { status: 'ERROR', code: 'SESSION_INVALID' }, origin, env);
    if (requestedPair) return authorizedFxResponse({ fetchImpl, config, origin, env,
      userId: user.id, pair: requestedPair, now, logger });

    const serviceHeaders = new Headers();
    serviceHeaders.set('apikey', config.GPIR_SUPABASE_SECRET_KEY);
    serviceHeaders.set('authorization', `Bearer ${config.GPIR_SUPABASE_SECRET_KEY}`);
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
    const activePlanStatus = config.environment === 'sandbox'
      ? 'SANDBOX_ACTIVE' : 'LIVE_ACTIVE';
    const planQuery = new URLSearchParams({
      select: 'id,display_name,currency,unit_amount_minor,billing_interval,status',
      environment: `eq.${config.PAYMENT_ENVIRONMENT}`,
      status: `eq.${activePlanStatus}`,
      order: 'created_at.asc', limit: '1'
    });
    const m37PaymentQuery = new URLSearchParams({
      select: 'id,currency,amount_minor,duration_days,environment,status,created_at,captured_at',
      user_id: `eq.${user.id}`, environment: 'eq.PRODUCTION',
      order: 'created_at.desc', limit: '100'
    });
    const m37PassQuery = new URLSearchParams({
      select: 'id,source_order_id,status,effective_from,effective_until,revoked_at',
      user_id: `eq.${user.id}`, order: 'effective_until.desc', limit: '100'
    });
    const [candidatesResult, offersResult, paymentsResult, purchasesResult,
      subscriptionsResult, plansResult, m37PaymentsResult, m37PassesResult] = await Promise.all([
      fetchPolicyCandidates(fetchImpl, config, serviceHeaders),
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
      config.environment === 'production'
        ? jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_m37_onetime_orders?${m37PaymentQuery}`,
          { headers: serviceHeaders }) : Promise.resolve({ ok: true, status: 200, data: [] }),
      config.environment === 'production'
        ? jsonFetch(fetchImpl, `${config.SUPABASE_URL}/rest/v1/gpir_m37_library_entitlements?${m37PassQuery}`,
          { headers: serviceHeaders }) : Promise.resolve({ ok: true, status: 200, data: [] })
    ]);

    for (const [dependency, result] of [
      ['gpir_list_entitlement_candidates_v2', candidatesResult],
      ['gpir_payment_offers', offersResult],
      ['gpir_payment_orders', paymentsResult],
      ['gpir_publication_purchase_entitlements', purchasesResult],
      ['gpir_paypal_subscriptions', subscriptionsResult],
      ['gpir_subscription_plans', plansResult],
      ['gpir_m37_onetime_orders', m37PaymentsResult],
      ['gpir_m37_library_entitlements', m37PassesResult]
    ]) if (!validRows(result)) reportDependencyFailure(logger, dependency, result);

    const policyCandidates = validRows(candidatesResult);
    const offers = validRows(offersResult);
    const rawPayments = validRows(paymentsResult);
    const purchases = validRows(purchasesResult);
    const rawSubscriptions = validRows(subscriptionsResult);
    const rawPlans = validRows(plansResult);
    const rawM37Payments = validRows(m37PaymentsResult);
    const rawM37Passes = validRows(m37PassesResult);
    let libraryPassAvailable = Boolean(rawM37Passes);
    const libraryPasses = rawM37Passes
      ? rawM37Passes.map(row => m37LibraryPassSummary(row, now())).filter(Boolean) : [];
    if (rawM37Passes && libraryPasses.length !== rawM37Passes.length) {
      libraryPassAvailable = false;
      reportDependencyFailure(logger, 'gpir_m37_library_entitlements', m37PassesResult);
    }
    const libraryPass = libraryPassAvailable
      ? libraryPasses.find(pass => pass.status === 'ACTIVE') || libraryPasses[0] || null : null;
    const activeLibraryPass = libraryPass?.status === 'ACTIVE';

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
    const hasPlanAccess = entitlementAvailable && !activeLibraryPass && publications.some((publication, index) =>
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
        activeLibraryPass ? 'PREMIUM_LIBRARY_PASS' : 'PLAN';
      return [Object.freeze({ publicationId: publication.publication_id,
        supabaseRecordId: publication.supabase_record_id,
        accessClass: 'ENTITLED', accessSource })];
    }) : [];
    let paymentsAvailable = Boolean(rawPayments && rawM37Payments);
    const legacyPayments = rawPayments ? rawPayments.map(paymentSummary).filter(Boolean) : [];
    const m37Payments = rawM37Payments ? rawM37Payments.map(m37PaymentSummary).filter(Boolean) : [];
    const payments = [...legacyPayments, ...m37Payments].sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    if ((rawPayments && legacyPayments.length !== rawPayments.length) ||
        (rawM37Payments && m37Payments.length !== rawM37Payments.length)) {
      paymentsAvailable = false;
      if (rawPayments && legacyPayments.length !== rawPayments.length)
        reportDependencyFailure(logger, 'gpir_payment_orders', paymentsResult);
      if (rawM37Payments && m37Payments.length !== rawM37Payments.length)
        reportDependencyFailure(logger, 'gpir_m37_onetime_orders', m37PaymentsResult);
    }
    let checkoutOffer = rawPlans?.length
      ? subscriptionOffer(rawPlans[0], activePlanStatus) : null;
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
        subscriptionCheckout: checkoutOffer ? 'AVAILABLE' : 'UNAVAILABLE' }),
      summary: Object.freeze({ libraryCount: entitlementAvailable ? library.length : null,
        paymentCount: paymentsAvailable ? payments.length : null,
        activePurchaseCount: purchases && libraryPassAvailable
          ? purchases.filter(row => row.status === 'ACTIVE').length +
            libraryPasses.filter(pass => pass.status === 'ACTIVE').length : null }),
      generatedAt: new Date(now()).toISOString() }), origin, env);
  };
}

export { configuration, m37LibraryPassSummary, m37PaymentSummary, paymentSummary,
  publicationCandidate, subscriptionOffer, subscriptionSummary };
