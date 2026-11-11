import { editorialUrlKey, isOfficialUrl, isWithinLiveWindow } from '../_shared/gpir-intelligence-validation.mjs';
import { buildTopicContext, classifyDevelopment, groupRelayItems } from '../_shared/gpir-topic-intelligence.mjs';
import { resolveSubscriberAccess } from '../_shared/gpir-reader-entitlement.mjs';
import { authorizedEditorialCandidates, loadPublicEditorialAuthority,
  normalizeOwnerEditorialPublications } from '../_shared/gpir-public-editorial.mjs';

export const PUBLIC_REPOSITORY_WINDOW_DAYS = 15;
export const BIS_SOURCE_ID = 'BIS-GLOBAL-001';
export const MOJALOOP_SOURCE_ID = 'MOJALOOP-OSS-001';
export const HYPERSWITCH_SOURCE_ID = 'HYPERSWITCH-OSS-001';
export const REFERENCE_SOURCE_IDS = Object.freeze([
  BIS_SOURCE_ID, MOJALOOP_SOURCE_ID, HYPERSWITCH_SOURCE_ID
]);
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

function response(status, body, requestOrigin, env, { private: personalized = false } = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': personalized ? 'private, no-store, max-age=0' : 'public, max-age=120',
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

export function normalizeBisReferenceRows({ rows = [], sources = [] }) {
  const source = sources.find(item => item.source_id === BIS_SOURCE_ID &&
    item.source_status === 'GREEN' && item.official_url === 'https://data.bis.org/');
  if (!source) return [];
  return rows.flatMap(row => {
    const metadata = row?.metadata;
    const observationDate = metadata?.observation_date;
    const period = metadata?.observation_period;
    const value = Number(metadata?.value);
    const sourceUrl = metadata?.source_url;
    let sourceHost = null;
    try { sourceHost = new URL(sourceUrl).hostname; } catch {}
    if (row?.source_id !== BIS_SOURCE_ID || row?.ingestion_status !== 'PROCESSED' ||
        metadata?.provider !== 'BIS' || metadata?.data_class !== 'STATISTICAL_REFERENCE' ||
        metadata?.publication_eligible !== false || metadata?.alert_eligible !== false ||
        !/^\d{4}-\d{2}-\d{2}$/.test(observationDate || '') ||
        !/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|-(?:Q[1-4]|S[12]))?$/.test(period || '') ||
        !Number.isFinite(value) || sourceHost !== 'stats.bis.org') return [];
    const unit = typeof metadata.unit_measure === 'string' && metadata.unit_measure
      ? metadata.unit_measure : 'not stated';
    const multiplier = typeof metadata.unit_multiplier === 'string' && metadata.unit_multiplier
      ? metadata.unit_multiplier : 'not stated';
    const title = typeof row.raw_title === 'string' && row.raw_title.trim().length >= 8
      ? row.raw_title.trim().slice(0, 400)
      : `${metadata.dataflow} statistical observation — ${period}`;
    const topic = typeof metadata.topic === 'string' && metadata.topic.trim()
      ? metadata.topic.trim().slice(0, 100) : 'Payments';
    const providerReleaseDate = /^\d{4}-\d{2}-\d{2}$/.test(metadata.provider_release_date || '')
      ? metadata.provider_release_date : null;
    return [{
      id: row.id,
      status: 'GPIR_CLASSIFIED', contentStatus: 'STATISTICAL_REFERENCE_VERIFIED',
      dataClass: 'STATISTICAL_REFERENCE', recordType: 'BIS_OBSERVATION',
      lifecycleStatus: 'HISTORICAL', displayLifecycleStatus: 'ARCHIVED',
      headline: title, title,
      summary: `BIS statistical observation for ${period}: value ${value}; unit code ${unit}; multiplier ${multiplier}.`,
      developments: [], category: topic, topics: [topic, 'Statistical reference'], subcategory: metadata.dataflow,
      country: metadata.country_code || null, countryCode: metadata.country_code || null, region: null,
      observationPeriod: period, observationDate, providerReleaseDate,
      publicationDate: observationDate, publishedDate: observationDate,
      publishedAt: `${observationDate}T00:00:00.000Z`,
      publicationMonth: observationDate.slice(5, 7), publicationYear: observationDate.slice(0, 4),
      tickerEligible: false, canonicalUrl: sourceUrl, pageUrl: sourceUrl,
      keywords: [topic.toLowerCase(), 'bis', 'statistics'], outcomeStatus: 'REFERENCE',
      geography: metadata.country_code || null, eventId: null,
      sources: [{ name: source.source_name, url: sourceUrl,
        publishedAt: providerReleaseDate ? `${providerReleaseDate}T00:00:00.000Z` : null }],
      source: { name: source.source_name, publicationTitle: source.source_name, url: sourceUrl,
        trustTier: source.trust_tier || null, category: source.category || null },
      statisticalValue: value, unitMeasure: unit, unitMultiplier: multiplier,
      dimensions: metadata.dimensions && typeof metadata.dimensions === 'object'
        ? metadata.dimensions : {}
    }];
  });
}

const TECHNICAL_SOURCES = Object.freeze({
  [MOJALOOP_SOURCE_ID]: Object.freeze({
    provider: 'MOJALOOP', product: 'Mojaloop', repository: 'mojaloop/helm',
    officialUrl: 'https://github.com/mojaloop/helm', topic: 'Payment infrastructure',
    path: /^\/mojaloop\/helm\/releases\/tag\/[^/]+$/
  }),
  [HYPERSWITCH_SOURCE_ID]: Object.freeze({
    provider: 'HYPERSWITCH', product: 'Hyperswitch', repository: 'juspay/hyperswitch',
    officialUrl: 'https://github.com/juspay/hyperswitch', topic: 'Payment orchestration',
    path: /^\/juspay\/hyperswitch\/(?:releases\/tag\/[^/]+|commit\/[0-9a-f]{40})$/
  })
});

export function normalizeTechnicalReferenceRows({ rows = [], sources = [] }) {
  const sourceMap = new Map(sources.flatMap(source => {
    const config = TECHNICAL_SOURCES[source?.source_id];
    return config && source.source_status === 'GREEN' && source.official_url === config.officialUrl
      ? [[source.source_id, source]] : [];
  }));
  return rows.flatMap(row => {
    const config = TECHNICAL_SOURCES[row?.source_id];
    const source = sourceMap.get(row?.source_id);
    const metadata = row?.metadata;
    let canonical;
    try { canonical = new URL(row?.canonical_url || metadata?.source_url); } catch { return []; }
    const recordType = metadata?.record_type;
    const dateValue = recordType === 'TECHNICAL_CHANGE'
      ? metadata?.commit_timestamp : row?.source_published_at;
    const publishedTime = Date.parse(dateValue || '');
    if (!config || !source || row?.ingestion_status !== 'PROCESSED' ||
        metadata?.provider !== config.provider || metadata?.data_class !== 'TECHNICAL_REFERENCE' ||
        !['SOFTWARE_RELEASE', 'TECHNICAL_CHANGE'].includes(recordType) ||
        metadata?.publication_eligible !== false || metadata?.alert_eligible !== false ||
        metadata?.settlement_telemetry !== false || metadata?.repository !== config.repository ||
        canonical.protocol !== 'https:' || canonical.hostname !== 'github.com' ||
        !config.path.test(canonical.pathname) || !Number.isFinite(publishedTime)) return [];
    const published = new Date(publishedTime);
    const day = published.toISOString().slice(0, 10);
    const title = typeof row.raw_title === 'string' && row.raw_title.trim().length >= 8
      ? row.raw_title.trim().slice(0, 400)
      : `${config.product} verified technical change — ${day}`;
    const referenceLabel = recordType === 'SOFTWARE_RELEASE' ? 'software release' : 'repository change';
    return [{
      id: row.id,
      status: 'GPIR_CLASSIFIED', contentStatus: 'TECHNICAL_REFERENCE_VERIFIED',
      dataClass: 'TECHNICAL_REFERENCE', recordType,
      lifecycleStatus: 'HISTORICAL', displayLifecycleStatus: 'ARCHIVED',
      headline: title, title,
      summary: `Official ${config.product} ${referenceLabel} dated ${day}. This is verified technical history, not live settlement telemetry, a regulatory event or an operational alert.`,
      developments: [], category: metadata.topic || config.topic,
      topics: [metadata.topic || config.topic, 'Technical reference'],
      subcategory: recordType, country: 'Global', countryCode: null, region: 'Global',
      referenceDate: day, publicationDate: day, publishedDate: day,
      publishedAt: published.toISOString(), publicationMonth: day.slice(5, 7),
      publicationYear: day.slice(0, 4), tickerEligible: false,
      canonicalUrl: canonical.toString(), pageUrl: canonical.toString(),
      keywords: [config.product.toLowerCase(), 'technical reference',
        recordType === 'SOFTWARE_RELEASE' ? 'release history' : 'connector specification'],
      outcomeStatus: 'REFERENCE', geography: 'Global', eventId: null,
      sources: [{ name: source.source_name, url: canonical.toString(),
        publishedAt: published.toISOString() }],
      source: { name: source.source_name, publicationTitle: source.source_name,
        url: canonical.toString(), trustTier: source.trust_tier || null,
        category: source.category || null },
      product: config.product, repository: config.repository,
      settlementTelemetry: false, alertEligible: false
    }];
  });
}

export function normalizeRepositoryRows({ announcements, sources, topics = [], developments = [],
  topicSources = [], statisticalObservations = [], publicationAudits = [], candidates = [], now = Date.now(),
  windowDays = PUBLIC_REPOSITORY_WINDOW_DAYS, includeReferences = false }) {
  const byAnnouncement = new Map(topics.map(t => [t.announcement_id,t]));
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const eventByAnnouncement = new Map(publicationAudits.filter(audit => audit.decision === 'PUBLISHED' &&
    audit.announcement_id && candidateById.has(audit.candidate_id))
    .map(audit => [audit.announcement_id, candidateById.get(audit.candidate_id)]));
  const byTopicSources = new Map();
  const byTopicDevelopments = new Map();
  for (const link of topicSources) { if (!byTopicSources.has(link.topic_id)) byTopicSources.set(link.topic_id, []); byTopicSources.get(link.topic_id).push(link); }
  for (const d of developments) { if (!byTopicDevelopments.has(d.topic_id)) byTopicDevelopments.set(d.topic_id, []); byTopicDevelopments.get(d.topic_id).push(d); }
  const bySource = new Map((sources || [])
    .filter(source => source.source_status === 'GREEN')
    .map(source => [source.source_id, source]));
  const announcementsNormalized = (announcements || []).flatMap(row => {
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
    const linkedCandidate = eventByAnnouncement.get(row.id);
    const event = linkedCandidate?.source_id === row.source_id &&
      editorialUrlKey(linkedCandidate.canonical_url) === editorialUrlKey(row.canonical_url)
      ? linkedCandidate : null;
    const countryCode = typeof event?.country_code === 'string' && /^[A-Z]{2}$/.test(event.country_code)
      ? event.country_code : null;
    const eventRegion = typeof event?.region === 'string' && event.region.trim()
      ? event.region.trim().slice(0, 100) : null;
    const verifiedSources = (byTopicSources.get(topic?.id) || []).filter(link =>
      bySource.has(link.source_id) && isOfficialUrl(link.canonical_url,bySource.get(link.source_id).official_url))
      .map(link => {
        const linked = bySource.get(link.source_id);
        return {name:linked.source_name,url:link.canonical_url,publishedAt:link.source_published_at,
          country:typeof linked.country==='string'?linked.country:null,
          region:Array.isArray(linked.region_tags)&&linked.region_tags[0]?linked.region_tags[0]:null,
          segment:linked.category||null};
      });
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
      topics: Array.isArray(row.topic_headers) ? row.topic_headers.filter(value =>
        typeof value === 'string' && value.trim()).slice(0, 12) : [],
      subcategory: null,
      country: null,
      countryCode,
      region: eventRegion,
      eventGeography: { countryCode, region: eventRegion },
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
      geography: eventRegion,
      eventId: topic?.id || null,
      sources: [{name:source.source_name,url:row.canonical_url,publishedAt:published.toISOString(),country:typeof source.country==='string'?source.country:null,region:Array.isArray(source.region_tags)&&source.region_tags[0]?source.region_tags[0]:null,segment:source.category||null}, ...verifiedSources].filter((item,index,all)=>all.findIndex(other=>other.url===item.url)===index).slice(0,4),
      source: {
        name: source.source_name,
        publicationTitle: source.source_name,
        url: row.canonical_url,
        trustTier: source.trust_tier || null,
        category: source.category || null
      }
    }];
  });
  const references = includeReferences ? [
    ...normalizeBisReferenceRows({ rows: statisticalObservations, sources }),
    ...normalizeTechnicalReferenceRows({ rows: statisticalObservations, sources })
  ] : [];
  if (!references.length) return announcementsNormalized;
  return [...announcementsNormalized, ...references]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) ||
      String(left.id).localeCompare(String(right.id)));
}

export function createPublicIntelligenceHandler({ env, fetchImpl = fetch,
  loadRows = null, loadAuthority = null, now = () => Date.now(), entitlement = null }) {
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
    const topicContext = String(requestUrl.searchParams.get('topicContext') || '').trim();
    const relayView = requestUrl.searchParams.get('view') === 'relay';
    const referenceView = requestUrl.searchParams.get('view') === 'references';
    const history = requestUrl.searchParams.get('scope') === 'history' || Boolean(topicContext) || referenceView;
    const date = requestUrl.searchParams.get('date');
    const year = requestUrl.searchParams.get('year');
    const lifecycle = requestUrl.searchParams.get('lifecycle');
    const category = String(requestUrl.searchParams.get('category') || '').trim().toLowerCase().slice(0,100);
    const day = String(requestUrl.searchParams.get('day') || '').trim().toLowerCase();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return response(400,{status:'ERROR',code:'INVALID_DATE'},origin,env);
    if (year && !/^\d{4}$/.test(year)) return response(400,{status:'ERROR',code:'INVALID_YEAR'},origin,env);
    if (day && !['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(day)) return response(400,{status:'ERROR',code:'INVALID_DAY'},origin,env);
    if (lifecycle && !['LIVE','ARCHIVED'].includes(lifecycle)) return response(400,{status:'ERROR',code:'INVALID_LIFECYCLE'},origin,env);
    if (topicContext && !/^[A-Za-z0-9._:-]{1,120}$/.test(topicContext))
      return response(400, { status: 'ERROR', code: 'INVALID_TOPIC_CONTEXT' }, origin, env, { private: true });
    if (topicContext) {
      // Enhanced topic intelligence is subscriber-only and decided on the server for every
      // request, before any repository data is read.
      const accessToken = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') || '')?.[1] || null;
      const access = entitlement
        ? await entitlement({ accessToken, now: requestNow })
        : config ? await resolveSubscriberAccess({ fetchImpl, supabaseUrl: config.url, serviceKey: config.key,
          accessToken, now: requestNow }) : { decision: 'ERROR' };
      if (access.decision === 'UNAUTHENTICATED')
        return response(401, { status: 'ERROR', code: access.reason || 'SESSION_REQUIRED' }, origin, env, { private: true });
      if (access.decision === 'DENY')
        return response(403, { status: 'DENY', code: 'SUBSCRIPTION_REQUIRED' }, origin, env, { private: true });
      if (access.decision !== 'ALLOW')
        return response(503, { status: 'ERROR', code: 'ENTITLEMENT_UNAVAILABLE' }, origin, env, { private: true });
    }
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
          select: 'source_id,source_name,official_url,source_status,country,region_tags,category,trust_tier',
          limit: '500'
        });
        const topicQuery = new URLSearchParams({select:'id,announcement_id,keywords,outcome_status,geography',limit:'1000'});
        const developmentsQuery = new URLSearchParams({select:'id,topic_id,candidate_id,event_type,effective_date,summary,outcome_status',limit:'5000'});
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
        const [sources, topics, developments, topicSources, statisticalObservations] = await Promise.all([
          allRows('source_registry', sourceQuery),
          allRows('gpir_intelligence_topics', topicQuery),
          allRows('gpir_intelligence_developments', developmentsQuery),
          allRows('gpir_intelligence_topic_sources', linksQuery),
          referenceView ? allRows('intelligence_raw_ingestion', new URLSearchParams({
            select: 'id,source_id,raw_title,canonical_url,source_published_at,ingestion_status,metadata',
            source_id: `in.(${REFERENCE_SOURCE_IDS.join(',')})`, ingestion_status: 'eq.PROCESSED',
            order: 'discovered_at.desc,id.asc'
          })) : Promise.resolve([])
        ]);
        const announcementIds = referenceView ? [] : announcements.map(item => item.id)
          .filter(id => /^[0-9a-f-]{36}$/i.test(id));
        const publicationAudits = [];
        for (let start = 0; start < announcementIds.length; start += 100) {
          publicationAudits.push(...await allRows('intelligence_publication_audits', new URLSearchParams({
            select: 'candidate_id,announcement_id,decision,validation_payload', decision: 'eq.PUBLISHED',
            announcement_id: `in.(${announcementIds.slice(start, start + 100).join(',')})`,
            order: 'candidate_id.asc'
          })));
        }
        const developmentCandidates = [...new Set(developments.map(item => item.candidate_id)
          .filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
        for (let start = 0; start < developmentCandidates.length; start += 100) {
          publicationAudits.push(...await allRows('intelligence_publication_audits', new URLSearchParams({
            select: 'candidate_id,announcement_id,decision,validation_payload',
            candidate_id: `in.(${developmentCandidates.slice(start, start + 100).join(',')})`,
            decision: 'eq.DUPLICATE', order: 'candidate_id.asc'
          })));
        }
        const candidateIds = [...new Set(publicationAudits.map(audit => audit.candidate_id)
          .filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
        const candidates = [];
        for (let start = 0; start < candidateIds.length; start += 100) {
          candidates.push(...await allRows('intelligence_candidates', new URLSearchParams({
            select: 'id,source_id,canonical_url,published_at,country_code,region', id: `in.(${candidateIds.slice(start, start + 100).join(',')})`,
            candidate_status: 'in.(APPROVED,DUPLICATE)', order: 'id.asc'
          })));
        }
        rows = { announcements, sources, topics, developments, topicSources, statisticalObservations, publicationAudits, candidates };
      }
      let ownerRecords = [];
      if (!referenceView) {
        const authority = loadAuthority ? await loadAuthority() :
          await loadPublicEditorialAuthority({ env, supabaseUrl: config?.url, serviceKey: config?.key, fetchImpl });
        ownerRecords = normalizeOwnerEditorialPublications({ authority, now: requestNow,
          windowDays: history ? null : PUBLIC_REPOSITORY_WINDOW_DAYS });
        const accepted = authorizedEditorialCandidates({ authority,
          candidates: rows.candidates || [], audits: rows.publicationAudits || [], sources: rows.sources || [] });
        const byCandidate = new Map((rows.candidates || []).map(candidate => [candidate.id, candidate]));
        const byAnnouncement = new Map((rows.publicationAudits || [])
          .filter(audit => audit.decision === 'PUBLISHED' && accepted.has(audit.candidate_id))
          .map(audit => [audit.announcement_id, byCandidate.get(audit.candidate_id)]));
        const announcements = (rows.announcements || []).filter(item => {
          const candidate = byAnnouncement.get(item.id);
          return candidate && candidate.source_id === item.source_id &&
            editorialUrlKey(candidate.canonical_url) === editorialUrlKey(item.canonical_url) &&
            Number.isFinite(Date.parse(candidate.published_at || '')) &&
            Date.parse(candidate.published_at) === Date.parse(item.published_at);
        });
        const developments = (rows.developments || []).filter(item => accepted.has(item.candidate_id));
        const developmentIds = new Set(developments.map(item => item.id));
        rows = { ...rows, announcements,
          developments, topicSources: (rows.topicSources || []).filter(item => developmentIds.has(item.development_id)) };
      }
      let records = normalizeRepositoryRows({ ...rows, now: requestNow,
        windowDays: history ? null : PUBLIC_REPOSITORY_WINDOW_DAYS, includeReferences: referenceView });
      if (ownerRecords.length) records = [...records, ...ownerRecords]
        .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) ||
          String(left.id).localeCompare(String(right.id)));
      if (referenceView) records = records.filter(record => record.dataClass === 'STATISTICAL_REFERENCE' ||
        record.dataClass === 'TECHNICAL_REFERENCE');
      if (topicContext) {
        const context = buildTopicContext(records.find(record => record.id === topicContext) || { id: null }, records, requestNow);
        return context
          ? response(200, { status: 'OK', context, generatedAt: new Date(requestNow).toISOString() }, origin, env, { private: true })
          : response(404, { status: 'ERROR', code: 'TOPIC_NOT_FOUND' }, origin, env, { private: true });
      }
      if (relayView) {
        // Free public relay: live (12-hour) developments as topic-level items, with every
        // individual source retained as supporting evidence. Expired items stay in the repository.
        // Reports are grouped before expiry is applied, so a topic leaves the relay 12 hours
        // after its ORIGINAL report and later corroboration cannot extend its life.
        const items = groupRelayItems(records.filter(record => !record.dataClass)
          .map(record => ({ ...record, topic: classifyDevelopment(record) })))
          .filter(item => item.displayLifecycleStatus === 'LIVE');
        return response(200, { status: 'OK', view: 'relay', windowHours: 12, total: items.length, items,
          generatedAt: new Date(requestNow).toISOString() }, origin, env);
      }
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
        status: 'OK', source: referenceView ? 'verified_reference_history' : 'global_announcements', total, limit, offset,
        windowDays: history ? null : PUBLIC_REPOSITORY_WINDOW_DAYS,
        scope: history ? 'history' : 'recent',
        records, generatedAt: new Date(requestNow).toISOString()
      }, origin, env);
    } catch {
      return response(503, { status: 'ERROR', code: 'REPOSITORY_UNAVAILABLE' }, origin, env);
    }
  };
}
