const CACHE_MS = 10 * 60 * 1000;
const HISTORY_DAYS = 30;
const ALLOWED_ORIGINS = new Set(['https://fintechoisis.com']);
let cached = null;

function configuration(env) {
    const url = String(env.SUPABASE_URL || '').trim();
    const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) || !key) return null;
        return { url: parsed.origin, key };
    } catch { return null; }
}

function response(status, body, origin, cache = false) {
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': cache ? 'public, max-age=600, stale-while-revalidate=1800' : 'no-store',
        'x-content-type-options': 'nosniff', vary: 'Origin',
        'x-gpir-operational-mode': 'deterministic-no-llm'
    };
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        headers['access-control-allow-origin'] = origin;
        headers['access-control-allow-methods'] = 'GET, OPTIONS';
        headers['access-control-allow-headers'] = 'accept, content-type';
    }
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function validRows(rows) {
    if (!Array.isArray(rows)) return null;
    const normalized = rows.flatMap(row => {
        const rate = Number(row?.rate);
        const captured = Date.parse(row?.captured_at || '');
        if (!/^[A-Z]{3}$/.test(row?.base_currency || '') ||
            !/^[A-Z]{3}$/.test(row?.target_currency || '') ||
            row.base_currency === row.target_currency || !validDay(row?.observation_date) ||
            !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(captured) ||
            typeof row?.source !== 'string' || !row.source.trim() ||
            !['provider-native', 'derived-cross', 'derived-inverse'].includes(row?.rate_method)) return [];
        return [{ base: row.base_currency, quote: row.target_currency,
            observationDate: row.observation_date, rate, region: String(row.region || 'GLOBAL'),
            provider: row.source.trim(), rateType: row.rate_method,
            capturedAt: new Date(captured).toISOString() }];
    });
    return normalized.length === rows.length ? normalized : null;
}

function round(value, digits = 6) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

export function buildFxSnapshot(rows, generatedAt) {
    const normalized = validRows(rows);
    if (!normalized) throw new Error('FX_SNAPSHOT_INVALID_ROWS');
    const groups = new Map();
    for (const row of normalized) {
        const pair = `${row.base}/${row.quote}`;
        if (!groups.has(pair)) groups.set(pair, []);
        groups.get(pair).push(row);
    }
    const pairs = [...groups.entries()].map(([pair, values]) => {
        const byDay = new Map(values.sort((left, right) =>
            left.observationDate.localeCompare(right.observationDate) || left.capturedAt.localeCompare(right.capturedAt))
            .map(value => [value.observationDate, value]));
        const points = [...byDay.values()];
        const latest = points.at(-1);
        const previous = points.at(-2);
        const percentageChange = previous ? round((latest.rate / previous.rate - 1) * 100, 6) : null;
        return {
            pair, base: latest.base, quote: latest.quote, mid: latest.rate, last: latest.rate,
            previousBusinessClose: previous?.rate ?? null,
            previousBusinessDate: previous?.observationDate ?? null,
            absoluteChange: previous ? round(latest.rate - previous.rate) : null,
            percentageChange,
            direction: percentageChange === null ? 'unavailable' : percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'unchanged',
            timestamp: latest.capturedAt, observationDate: latest.observationDate,
            gpirRetrievedAt: latest.capturedAt, provider: latest.provider,
            rateType: latest.rateType, region: latest.region, validationStatus: 'VALIDATED',
            dataStatus: 'REFERENCE'
        };
    }).sort((left, right) => left.pair.localeCompare(right.pair));
    const latestCapture = pairs.map(pair => pair.timestamp).sort().at(-1) || generatedAt;
    return { schemaVersion: 'M44-FX-SNAPSHOT-1', status: 'OK', dataStatus: pairs.length ? 'OK' : 'EMPTY',
        generatedAt, refreshIntervalMinutes: 10, source: 'fx_historical_archive',
        currencyUniverse: { gpirRetrievedAt: latestCapture },
        staleAfterMinutesByProviderType: { live: 60, reference: 1440, fallback: 4320 }, pairs };
}

async function loadProjection(fetchImpl, config) {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.set('apikey', config.key);
    headers.set('authorization', `Bearer ${config.key}`);
    const result = await fetchImpl(`${config.url}/rest/v1/rpc/gpir_m44_fx_snapshot_v1`, {
        method: 'POST', headers, body: JSON.stringify({ p_days: HISTORY_DAYS })
    });
    let rows = null;
    try { rows = await result.json(); } catch {}
    if (!result.ok || !Array.isArray(rows)) throw new Error('FX_SNAPSHOT_PROJECTION_UNAVAILABLE');
    return rows;
}

export function createFxSnapshotHandler({ env, fetchImpl = fetch, now = () => Date.now(), loadRows = null }) {
    return async function handle(request) {
        const origin = request.headers.get('origin');
        if (origin && !ALLOWED_ORIGINS.has(origin))
            return response(403, { status: 'ERROR', code: 'ORIGIN_NOT_ALLOWED' }, null);
        if (request.method === 'OPTIONS') return response(204, {}, origin);
        if (request.method !== 'GET') return response(405, { status: 'ERROR', code: 'METHOD_NOT_ALLOWED' }, origin);
        const config = configuration(env);
        if (!config && !loadRows)
            return response(503, { status: 'ERROR', code: 'FX_SNAPSHOT_CONFIGURATION_REQUIRED' }, origin);
        const currentTime = now();
        if (cached?.expiresAt > currentTime)
            return response(200, { ...cached.value, cacheStatus: 'HIT' }, origin, true);
        try {
            const rows = loadRows ? await loadRows() : await loadProjection(fetchImpl, config);
            const value = buildFxSnapshot(rows, new Date(currentTime).toISOString());
            cached = { value, expiresAt: currentTime + CACHE_MS };
            return response(200, { ...value, cacheStatus: 'MISS' }, origin, true);
        } catch {
            if (cached?.value)
                return response(200, { ...cached.value, cacheStatus: 'STALE', dataStatus: 'LAST_KNOWN_GOOD' }, origin, true);
            return response(503, { status: 'ERROR', code: 'FX_SNAPSHOT_UNAVAILABLE' }, origin);
        }
    };
}

export function clearFxSnapshotCache() { cached = null; }
