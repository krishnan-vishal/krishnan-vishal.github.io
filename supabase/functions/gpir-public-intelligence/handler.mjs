import { isOfficialUrl, isWithinLiveWindow } from '../_shared/gpir-intelligence-validation.mjs';

export const PUBLIC_REPOSITORY_WINDOW_DAYS = 15;
const PUBLIC_REPOSITORY_WINDOW_MS = PUBLIC_REPOSITORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

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

export function normalizeRepositoryRows({ announcements, sources, topics = [], developments = [], topicSources = [], now = Date.now(), windowDays = PUBLIC_REPOSITORY_WINDOW_DAYS }) {
  const byAnnouncement = new Map(topics.map(t => [t.announcement_id,t]));
  const byTopicSources = new Map();
  const byTopicDevelopments = new Map();
  for (const link of topicSources) { if (!byTopicSources.has(link.topic_id)) byTopicSources.set(link.topic_id, []); byTopicSources.get(link.topic_id).push(link); }
  for (const d of developments) { if (!byTopicDevelopments.has(d.topic_id)) byTopicDevelopments.set(d.topic_id, []); byTopicDevelopments.get(d.topic_id).push(d); }
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
        (windowDays !== null && publishedTime < now - windowDays * 86400000) || publishedTime > now ||
        !isOfficialUrl(row.canonical_url, source.official_url)) return [];
    const published = new Date(publishedTime);
    const topic = byAnnouncement.get(row.id);
    const verifiedSources = (byTopicSources.get(topic?.id) || []).filter(link =>
      bySource.has(link.source_id) && isOfficialUrl(link.canonical_url,bySource.get(link.source_id).official_url))
      .map(link => ({name:bySource.get(link.source_id).source_name,url:link.canonical_url,publishedAt:link.source_published_at}));
    const verifiedDevelopmentIds = new Set((byTopicSources.get(topic?.id) || []).filter(link =>
      bySource.has(link.source_id) && isOfficialUrl(link.canonical_url,bySource.get(link.source_id).official_url))
      .map(link => link.development_id));
    const verifiedDevelopments = (byTopicDevelopments.get(topic?.id) || [])
      .filter(d => verifiedDevelopmentIds.has(d.id) && typeof d.summary === 'string' && d.summary.trim().length >= 120)
      .sort((a,b) => String(a.effective_date).localeCompare(String(b.effective_date)))
      .map(d => ({date:d.effective_date,eventType:d.event_type,summary:d.summary,outcomeStatus:d.outcome_status}));
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
      summary: verifiedDevelopments.length
        ? verifiedDevelopments.map(d => d.summary).join(' ').slice(0, 3000)
        : summary,
      developments: verifiedDevelopments,
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
      keywords: topic?.keywords || [],
      outcomeStatus: topic?.outcome_status || 'PENDING',
      geography: topic?.geography || null,
      eventId: topic?.id || null,
      sources: [{name:source.source_name,url:row.canonical_url,publishedAt:published.toISOString()}, ...verifiedSources].filter((item,index,all)=>all.findIndex(other=>other.url===item.url)===index).slice(0,4),
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
    const requestNow = now();
    const history = requestUrl.searchParams.get('scope') === 'history';
    const date = requestUrl.searchParams.get('date');
    const year = requestUrl.searchParams.get('year');
    const lifecycle = requestUrl.searchParams.get('lifecycle');
    const category = String(requestUrl.searchParams.get('category') || '').trim().toLowerCase().slice(0,100);
    const day = String(requestUrl.searchParams.get('day') || '').trim().toLowerCase();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return response(400,{status:'ERROR',code:'INVALID_DATE'},origin,env);
    if (year && !/^\d{4}$/.test(year)) return response(400,{status:'ERROR',code:'INVALID_YEAR'},origin,env);
    if (day && !['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(day)) return response(400,{status:'ERROR',code:'INVALID_DAY'},origin,env);
    if (lifecycle && !['LIVE','ARCHIVED'].includes(lifecycle)) return response(400,{status:'ERROR',code:'INVALID_LIFECYCLE'},origin,env);
    try {
      let rows;
      if (loadRows) rows = await loadRows();
      else {
        const headers = new Headers();
        headers.set('apikey', config.key);
        headers.set('authorization', `Bearer ${config.key}`);
        const announcementQuery = new URLSearchParams({
          select: 'id,source_id,title,summary_narration,canonical_url,published_at,ticker_eligible,topic_headers,publication_status',
          publication_status: 'eq.approved',
          ...(history ? {} : { published_at: `gte.${new Date(requestNow - PUBLIC_REPOSITORY_WINDOW_MS).toISOString()}` }),
          order: 'published_at.desc,id.asc', limit: '1000'
        });
        const sourceQuery = new URLSearchParams({
          select: 'source_id,source_name,official_url,source_status', limit: '500'
        });
        const topicQuery = new URLSearchParams({select:'id,announcement_id,keywords,outcome_status,geography',limit:'1000'});
        const developmentsQuery = new URLSearchParams({select:'id,topic_id,event_type,effective_date,summary,outcome_status',limit:'5000'});
        const linksQuery = new URLSearchParams({select:'topic_id,development_id,source_id,canonical_url,source_published_at',limit:'5000'});
        // Fetch all approved announcements in bounded PostgREST pages, not just the first 1,000.
        // Fail closed if a page cannot be retrieved; never report a truncated archive as complete.
        const announcements = [];
        for (let page = 0; ; page++) {
          const pageQuery = new URLSearchParams(announcementQuery);
          pageQuery.set('offset', String(page * 1000));
          const batch = await jsonFetch(fetchImpl, `${config.url}/rest/v1/global_announcements?${pageQuery}`, headers);
          announcements.push(...batch);
          if (batch.length < 1000) break;
          if (page >= 99) throw new Error('REPOSITORY_PAGE_LIMIT');
        }
        // Page related evidence too: a complete archive cannot silently lose its sources.
        async function allRows(table, query, pageSize = 1000) {
          const results = [];
          for (let page = 0; ; page++) {
            const params = new URLSearchParams(query);
            params.set('limit', String(pageSize));
            params.set('offset', String(page * pageSize));
            const batch = await jsonFetch(fetchImpl, `${config.url}/rest/v1/${table}?${params}`, headers);
            results.push(...batch);
            if (batch.length < pageSize) return results;
            if (page >= 99) throw new Error('EVIDENCE_PAGE_LIMIT');
          }
        }
        const [sources, topics, developments, topicSources] = await Promise.all([
          allRows('source_registry', sourceQuery),
          allRows('gpir_intelligence_topics', topicQuery),
          allRows('gpir_intelligence_developments', developmentsQuery),
          allRows('gpir_intelligence_topic_sources', linksQuery)
        ]);
        rows = { announcements, sources, topics, developments, topicSources };
      }
      let records = normalizeRepositoryRows({ ...rows, now: requestNow, windowDays: history ? null : PUBLIC_REPOSITORY_WINDOW_DAYS });
      if (date) records = records.filter(record=>record.publicationDate===date);
      if (year) records = records.filter(record=>record.publicationYear===year);
      if (lifecycle) records = records.filter(record=>record.displayLifecycleStatus===lifecycle);
      if (category) records = records.filter(record=>record.category.toLowerCase()===category);
      if (day) records = records.filter(record=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(record.publishedAt)).toLowerCase()===day);
      if (queryText) records = records.filter(record => [
        record.title, record.summary, record.category, record.source?.name
      ].filter(Boolean).join(' ').toLowerCase().includes(queryText));
      const total = records.length;
      records = records.slice(offset, offset + limit);
      return response(200, {
        status: 'OK', source: 'global_announcements', total, limit, offset,
        windowDays: history ? null : PUBLIC_REPOSITORY_WINDOW_DAYS,
        scope: history ? 'history' : 'recent',
        records, generatedAt: new Date(requestNow).toISOString()
      }, origin, env);
    } catch {
      return response(503, { status: 'ERROR', code: 'REPOSITORY_UNAVAILABLE' }, origin, env);
    }
  };
}
