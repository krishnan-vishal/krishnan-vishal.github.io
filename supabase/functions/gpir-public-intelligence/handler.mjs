import { isOfficialUrl, isWithinLiveWindow } from '../_shared/gpir-intelligence-validation.mjs';

const DEFAULT_ORIGINS = Object.freeze([
  'https://fintechoisis.com',
  'https://codex-m39-g1-alerts-krishnan-vishal-github-io.krishnanvishal12.workers.dev'
]);

function configuration(env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) || !key)
      return null;
    return { url: parsed.origin, key };
  } catch { return null; }
}

function allowedOrigins() {
  return new Set(DEFAULT_ORIGINS);
}

function response(status, body, requestOrigin, env) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=120',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey, authorization',
    vary: 'Origin',
    'x-content-type-options': 'nosniff'
  };
  if (requestOrigin && allowedOrigins().has(requestOrigin))
    headers['access-control-allow-origin'] = requestOrigin;
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

async function jsonFetch(fetchImpl, url, headers) {
  const result = await fetchImpl(url, { headers });
  if (!result.ok) throw new Error(`HTTP_${result.status}`);
  const data = await result.json();
  if (!Array.isArray(data)) throw new Error('INVALID_REPOSITORY_RESPONSE');
  return data;
}

export function normalizeRepositoryRows({ announcements, sources, events = [], eventSources = [], now = Date.now() }) {
  const byAnnouncement = new Map(events.map(e => [e.announcement_id,e]));
  const byEvent = new Map();
  for (const link of eventSources) { if (!byEvent.has(link.event_id)) byEvent.set(link.event_id, []); byEvent.get(link.event_id).push(link); }
  const bySource = new Map((sources || [])
    .filter(source => source.source_status === 'GREEN')
    .map(source => [source.source_id, source]));
  return (announcements || []).flatMap(row => {
    const source = bySource.get(row.source_id);
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const summary = typeof row.summary_narration === 'string' ? row.summary_narration.trim() : '';
    const publishedTime = Date.parse(row.published_at || '');
    if (!source || row.publication_status !== 'approved' || title.length < 12 ||
        summary.length < 40 || !Number.isFinite(publishedTime) ||
        !isOfficialUrl(row.canonical_url, source.official_url)) return [];
    const published = new Date(publishedTime);
    const event = byAnnouncement.get(row.id);
    const verifiedSources = (byEvent.get(event?.id) || []).filter(link =>
      bySource.has(link.source_id) && isOfficialUrl(link.canonical_url,bySource.get(link.source_id).official_url))
      .map(link => ({name:bySource.get(link.source_id).source_name,url:link.canonical_url,publishedAt:link.source_published_at}));
    const live = row.ticker_eligible === true && isWithinLiveWindow(published.toISOString(), now);
    const category = Array.isArray(row.topic_headers) && row.topic_headers[0]
      ? row.topic_headers[0] : 'Payments';
    return [{
      id: row.id,
      status: 'GPIR_CLASSIFIED',
      contentStatus: 'CONTENT_VERIFIED',
      lifecycleStatus: live ? 'LIVE' : 'HISTORICAL',
      displayLifecycleStatus: live ? 'LIVE' : 'ARCHIVED',
      headline: title,
      title,
      summary,
      category,
      subcategory: null,
      country: null,
      region: null,
      publicationDate: published.toISOString().slice(0, 10),
      publishedDate: published.toISOString().slice(0, 10),
      publishedAt: published.toISOString(),
      publicationMonth: String(published.getUTCMonth() + 1).padStart(2, '0'),
      publicationYear: String(published.getUTCFullYear()),
      tickerEligible: live,
      canonicalUrl: row.canonical_url,
      pageUrl: row.canonical_url,
      keywords: event?.keywords || [],
      outcomeStatus: event?.outcome_status || 'PENDING',
      geography: event?.geography || null,
      eventId: event?.id || null,
      sources: verifiedSources.length ? verifiedSources : [{name:source.source_name,url:row.canonical_url,publishedAt:published.toISOString()}],
      source: {
        name: source.source_name,
        publicationTitle: source.source_name,
        url: row.canonical_url
      }
    }];
  });
}

export function createPublicIntelligenceHandler({ env, fetchImpl = fetch,
  loadRows = null, now = () => Date.now() }) {
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins().has(origin))
      return response(403, { status: 'ERROR', code: 'ORIGIN_NOT_ALLOWED' }, null, env);
    if (request.method === 'OPTIONS') return response(204, {}, origin, env);
    if (request.method !== 'GET')
      return response(405, { status: 'ERROR', code: 'METHOD_NOT_ALLOWED' }, origin, env);
    const config = configuration(env);
    if (!config && !loadRows)
      return response(503, { status: 'ERROR', code: 'REPOSITORY_CONFIGURATION_REQUIRED' }, origin, env);
    const requestUrl = new URL(request.url);
    const queryText = String(requestUrl.searchParams.get('q') || '').trim().toLowerCase().slice(0, 120);
    const limit = Math.max(1, Math.min(100, Number(requestUrl.searchParams.get('limit')) || 50));
    const offset = Math.max(0, Math.min(5000, Number(requestUrl.searchParams.get('offset')) || 0));
    try {
      let rows;
      if (loadRows) rows = await loadRows();
      else {
        const headers = new Headers();
        headers.set('apikey', config.key);
        headers.set('authorization', `Bearer ${config.key}`);
        const announcementQuery = new URLSearchParams({
          select: 'id,source_id,title,summary_narration,canonical_url,published_at,ticker_eligible,topic_headers,publication_status',
          publication_status: 'eq.approved', order: 'published_at.desc,id.asc', limit: '1000'
        });
        const sourceQuery = new URLSearchParams({
          select: 'source_id,source_name,official_url,source_status', limit: '500'
        });
        const eventQuery = new URLSearchParams({select:'id,announcement_id,keywords,outcome_status,geography',limit:'1000'});
        const linksQuery = new URLSearchParams({select:'event_id,source_id,canonical_url,source_published_at',limit:'5000'});
        const [announcements, sources, events, eventSources] = await Promise.all([
          jsonFetch(fetchImpl, `${config.url}/rest/v1/global_announcements?${announcementQuery}`, headers),
          jsonFetch(fetchImpl, `${config.url}/rest/v1/source_registry?${sourceQuery}`, headers),
          jsonFetch(fetchImpl, `${config.url}/rest/v1/gpir_intelligence_events?${eventQuery}`, headers),
          jsonFetch(fetchImpl, `${config.url}/rest/v1/gpir_intelligence_event_sources?${linksQuery}`, headers)
        ]);
        rows = { announcements, sources, events, eventSources };
      }
      let records = normalizeRepositoryRows({ ...rows, now: now() });
      if (queryText) records = records.filter(record => [
        record.title, record.summary, record.category, record.source?.name
      ].filter(Boolean).join(' ').toLowerCase().includes(queryText));
      const total = records.length;
      records = records.slice(offset, offset + limit);
      return response(200, {
        status: 'OK', source: 'global_announcements', total, limit, offset,
        records, generatedAt: new Date(now()).toISOString()
      }, origin, env);
    } catch {
      return response(503, { status: 'ERROR', code: 'REPOSITORY_UNAVAILABLE' }, origin, env);
    }
  };
}
