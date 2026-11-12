import { TOPIC_TAXONOMY, classifyTopicIds, groupRelayItems } from './gpir-topic-intelligence.mjs';
import {
  EXECUTIVE_THEME_IDS, GEOGRAPHY_FILTER_KEYS, PREMIUM_THEMES, buildAskQuery, buildExecutiveDonut, buildExecutiveKpis, buildGeographyCoverage, buildItemShare,
  buildRegionThemeMatrix, buildRegionalActivity, buildShareUrl, buildSummaryPoints, buildThemeDistribution, buildThemeMomentum, buildThemeWeekly,
  buildServerAggregateModels, buildTimelineEvents, buildTrendByTheme, classifyThemeIds, compareCounts, distributionTable, geographyTable, heatmapTable, isExecutiveEligible,
  matchesGeography, momentumTable, periodLabel, primaryThemeId, referenceClass, sparklineSvg, themeById, themeChipMarkup, trendTable
} from './smart-presentation.mjs';
import {
  donutChartOption, donutLegendMarkup, donutPoints, kpiStripMarkup, mapChartOption, mapPoints, momentumChartOption, momentumDeltasMarkup,
  momentumLabelsMarkup, momentumPoints, regionHeatmapMarkup, summaryMarkup, timelineMarkup, trendChartOption, trendPoints
} from './smart-executive.mjs';
import { createChartController } from './smart-charts.mjs';

export { compareCounts, isExecutiveEligible, referenceClass };

const DAY = 86400000;
const HISTORY_FLOOR = Date.parse('2024-11-08T00:00:00Z');
const INTELLIGENCE_PATH = '/functions/v1/gpir-public-intelligence?scope=history&limit=1000';
const LIVE_PATH = '/functions/v1/gpir-public-alerts';
const EDITORIAL_PATH = '/assets/data/fx/editorial-public.json';
const GOVERNED_ROUTES_PATH = '/routes.json';
const LEGACY_PERIOD_DAYS = Object.freeze({ '7D': 7, '15D': 15, '30D': 30, '1Y': 365, MAX: null });

export const SMART_TOPICS = TOPIC_TAXONOMY;

function clean(value, max = 800) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function safeHttps(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function isoDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function utcStartOfDay(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcWeekStart(timestamp) {
  const start = utcStartOfDay(timestamp);
  const day = new Date(start).getUTCDay();
  return start - ((day + 6) % 7) * DAY;
}

export function periodBounds(period, now = Date.now(), customStart = '', customEnd = '') {
  const endToday = utcStartOfDay(now) + DAY;
  let start;
  let end = Math.min(now + 1, endToday);
  if (period === '24H') start = now - DAY;
  else if (period === '7D') start = now - 7 * DAY;
  else if (period === '30D') start = now - 30 * DAY;
  else if (period === '8W') start = utcWeekStart(now) - 49 * DAY;
  else if (period === 'QTD') {
    const date = new Date(now);
    start = Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1);
  } else if (period === 'CUSTOM') {
    const parsedStart = Date.parse(`${customStart}T00:00:00Z`);
    const parsedEnd = Date.parse(`${customEnd}T00:00:00Z`);
    start = Number.isFinite(parsedStart) ? Math.max(HISTORY_FLOOR, parsedStart) : HISTORY_FLOOR;
    end = Number.isFinite(parsedEnd) ? Math.min(endToday, parsedEnd + DAY) : end;
    if (start >= end) start = Math.max(HISTORY_FLOOR, end - DAY);
  } else start = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  start = Math.max(HISTORY_FLOOR, start);
  const duration = Math.max(DAY, end - start);
  return Object.freeze({ start, end, previousStart: Math.max(HISTORY_FLOOR, start - duration), previousEnd: start });
}

export function periodStart(period, now = Date.now()) {
  const days = LEGACY_PERIOD_DAYS[period];
  return days == null ? null : now - days * DAY;
}

function inferRegion(record) {
  const text = [record.region, record.geography, record.country].filter(Boolean).join(' ').toLowerCase();
  if (/global|worldwide/.test(text)) return 'global';
  if (/singapore|india|japan|china|australia|new zealand|apac|asia|pacific|malaysia|thailand|indonesia|philippines/.test(text)) return 'apac';
  if (/europe|european|uk|united kingdom|germany|france|sepa|eu\b/.test(text)) return 'europe';
  if (/america|united states|canada|brazil|mexico|latam|caribbean/.test(text)) return 'americas';
  if (/middle east|africa|gcc|uae|emirates|saudi|qatar|bahrain|oman|kuwait/.test(text)) return 'mea';
  return text ? 'unclassified' : 'global';
}

export function classifyRecordTopics(record) {
  return classifyTopicIds(record);
}

function normalizeDimensions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const label = clean(key, 40);
    const text = typeof entry === 'string' || typeof entry === 'number' ? clean(String(entry), 80) : '';
    return label && text ? [{ key: label, value: text }] : [];
  }).slice(0, 12);
}

export function normalizeSmartRecords(value) {
  if (value?.status !== 'OK' || !Array.isArray(value.records)) return [];
  return value.records.flatMap(item => {
    const publishedAt = Date.parse(item?.publishedAt || '');
    const url = safeHttps(item?.canonicalUrl || item?.source?.url);
    const title = clean(item?.title || item?.headline, 240);
    const summary = clean(item?.summary, 2000);
    if (!Number.isFinite(publishedAt) || !url || !title || summary.length < 40) return [];
    const record = {
      id: clean(item.id, 100), title, summary, url,
      publishedAt: new Date(publishedAt).toISOString(),
      category: clean(item.category, 100) || 'Payments',
      topics: Array.isArray(item.topics) ? item.topics.map(value => clean(value, 100)).filter(Boolean) : [],
      country: clean(item.country, 100), region: clean(item.region, 100),
      geography: clean(item.geography, 180),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(value => clean(value, 80)).filter(Boolean) : [],
      sourceName: clean(item?.source?.name, 140) || 'Authoritative source',
      sourceTrustTier: clean(item?.source?.trustTier || item?.sourceTrustTier, 20),
      lifecycle: clean(item.displayLifecycleStatus || item.lifecycleStatus, 40) || 'ARCHIVED',
      outcomeStatus: clean(item.outcomeStatus, 40),
      dataClass: clean(item.dataClass, 60),
      observationPeriod: clean(item.observationPeriod, 24),
      providerReleaseDate: clean(item.providerReleaseDate, 10),
      referenceDate: clean(item.referenceDate, 10),
      recordType: clean(item.recordType, 60),
      product: clean(item.product, 100),
      repository: clean(item.repository, 100),
      observationDate: clean(item.observationDate, 10),
      countryCode: clean(item.countryCode, 10),
      statisticalValue: typeof item.statisticalValue === 'number' && Number.isFinite(item.statisticalValue)
        ? item.statisticalValue : null,
      unitMeasure: clean(item.unitMeasure, 60),
      unitMultiplier: clean(item.unitMultiplier, 60),
      dimensions: normalizeDimensions(item.dimensions)
    };
    record.regionKey = inferRegion(record);
    record.topicIds = classifyRecordTopics(record);
    record.themeIds = classifyThemeIds(record);
    return [record];
  }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export function normalizeM40Records(value) {
  if (value?.status !== 'OK' || !Array.isArray(value.records)) return [];
  return value.records.flatMap(item => {
    const publishedAt = Date.parse(item?.published_at || '');
    const url = safeHttps(item?.canonical_url);
    const title = clean(item?.title, 240);
    const summary = clean(item?.summary, 2000);
    if (!Number.isFinite(publishedAt) || !url || !title || summary.length < 40) return [];
    return [{
      id: clean(item.id,100), title, summary, url,
      publishedAt: new Date(publishedAt).toISOString(), category: clean(item.category,100) || 'Payments',
      topics: Array.isArray(item.topic_headers) ? item.topic_headers.map(value => clean(value,100)).filter(Boolean) : [],
      topicIds: Array.isArray(item.topic_ids) ? item.topic_ids.map(value => clean(value,60)).filter(Boolean) : [],
      themeIds: Array.isArray(item.theme_ids) ? item.theme_ids.map(value => clean(value,60)).filter(Boolean) : [],
      country: clean(item.country,100), region: Array.isArray(item.region_tags) ? clean(item.region_tags[0],100) : '',
      geography: clean(item.geography,180), regionKey: clean(item.region_key,30),
      sourceName: clean(item.source_name,140) || 'Authoritative source',
      sourceTrustTier: clean(item.trust_tier,20), lifecycle: 'ARCHIVED', outcomeStatus: ''
    }];
  }).sort((left,right) => right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id));
}

export function m40Query(state, bounds, { view = 'cards', limit = 10, offset = 0 } = {}) {
  const query = new URLSearchParams({ view, kind:'announcements', start:new Date(bounds.start).toISOString(),
    end:new Date(bounds.end).toISOString(), limit:String(limit), offset:String(offset) });
  [...state.topics].forEach(topic => query.append('topic',topic));
  [...state.themes].forEach(theme => query.append('theme',theme));
  if (state.geography !== 'all') query.set('region',state.geography);
  return query;
}

export async function fetchM40Aggregate(fetchImpl, origin, state, bounds, options) {
  const response = await fetchImpl(`${origin}/functions/v1/gpir-public-intelligence?${m40Query(state,bounds,options)}`,
    {cache:'no-store',headers:{accept:'application/json'}});
  if (!response.ok) throw new Error('M40_AGGREGATE_UNAVAILABLE');
  const payload = await response.json();
  const maps = ['categories','topics','themes','primaryThemes','regions','daily','weekly','monthly','dailyThemes','weeklyThemes','regionThemes'];
  if (payload?.status !== 'OK' || !Number.isInteger(payload.total) || !Array.isArray(payload.records) ||
      maps.some(key => !payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key])))
    throw new Error('M40_AGGREGATE_INVALID');
  return payload;
}


// Historical evidence pages use the service-governed keyset route; totals stay with aggregates.
export async function fetchM40HistoryCursor(fetchImpl, origin, state, bounds, cursor = null) {
  const query = m40Query(state,bounds,{view:'history-cursor',limit:10,offset:0});
  query.delete('offset');
  if (cursor) {
    query.set('afterTime',cursor.publishedAt);
    query.set('afterId',cursor.id);
  }
  const response = await fetchImpl(`${origin}/functions/v1/gpir-public-intelligence?${query}`,
    {cache:'no-store',headers:{accept:'application/json'}});
  if (!response.ok) throw new Error('M40_HISTORY_UNAVAILABLE');
  const payload = await response.json();
  if (payload?.status !== 'OK' || payload.kind !== 'announcements' || !Array.isArray(payload.records) ||
      payload.records.length > 10 || typeof payload.hasMore !== 'boolean' ||
      (payload.hasMore && (!payload.nextCursor?.publishedAt || !payload.nextCursor?.id)))
    throw new Error('M40_HISTORY_INVALID');
  return payload;
}

export function normalizeLiveAlerts(value, historical) {
  if (!Array.isArray(value?.alerts)) return [];
  const historyById = new Map(historical.map(record => [record.id, record]));
  // Overlapping reports of one development become one topic-level relay item that keeps
  // the original publication time and every individual source as supporting evidence.
  return groupRelayItems(value.alerts.flatMap(item => {
    // Same approval gates as the homepage ticker; both read one governed API.
    if (!item || (item.publicationStatus && item.publicationStatus !== 'approved')) return [];
    if (item.tickerEligible === false || item.sourceVerified === false || item.hasUnresolvedRestrictions === true) return [];
    if (historyById.has(item?.id)) return [historyById.get(item.id)];
    const publishedAt = Date.parse(item?.publishedAt || item?.published_at || '');
    const title = clean(item?.title || item?.headline, 240);
    const url = safeHttps(item?.canonicalUrl || item?.canonical_url || item?.sourceUrl || item?.url || item?.source?.url);
    if (!Number.isFinite(publishedAt) || !title || !url) return [];
    const record = {
      id: clean(item.id, 100), title, summary: clean(item?.summary || item?.summary_narration, 2000),
      url, publishedAt: new Date(publishedAt).toISOString(), category: clean(item.category, 100) || 'Payments',
      topics: Array.isArray(item.topicHeaders) ? item.topicHeaders : [], keywords: [],
      country: clean(item.country, 100), region: clean(item.region, 100), geography: clean(item.geography, 180),
      sourceName: clean(item?.source?.name || item?.sourceName, 140) || 'Authoritative source',
      lifecycle: 'LIVE', outcomeStatus: clean(item.outcomeStatus, 40)
    };
    record.regionKey = inferRegion(record);
    record.topicIds = classifyRecordTopics(record);
    record.themeIds = classifyThemeIds(record);
    return [record];
  }));
}

export function findAlert(id, liveRecords, records) {
  return liveRecords.find(record => record.id === id || record.memberIds?.includes(id)) ||
    records.find(record => record.id === id) || null;
}

const TOPIC_INTELLIGENCE_PATH = '/functions/v1/gpir-public-intelligence?topicContext=';

// Enhanced topic intelligence is built and entitlement-checked on the server; the browser
// only renders what the signed-in reader's entitlement allows.
export async function fetchTopicIntelligence(fetchImpl, origin, accessToken, alertId) {
  try {
    const response = await fetchImpl(`${origin}${TOPIC_INTELLIGENCE_PATH}${encodeURIComponent(alertId)}`, {
      cache: 'no-store', headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) return { status: 'SESSION_EXPIRED' };
    if (response.status === 403) return { status: 'DENIED' };
    if (response.status === 404) return { status: 'NOT_FOUND' };
    if (!response.ok) return { status: 'UNAVAILABLE' };
    const payload = await response.json();
    return payload?.status === 'OK' && payload.context ? { status: 'OK', context: payload.context } : { status: 'UNAVAILABLE' };
  } catch { return { status: 'UNAVAILABLE' }; }
}

export function filterSmartRecords(records, options = {}) {
  const query = clean(options.subject, 80).toLowerCase();
  if (query || options.kind) {
    const start = periodStart(LEGACY_PERIOD_DAYS[options.period] === undefined ? '15D' : options.period, options.now || Date.now());
    return records.filter(record => {
      if (start != null && Date.parse(record.publishedAt) < start) return false;
      if (!query) return true;
      const fields = options.kind === 'country' ? [record.country, record.geography] :
        options.kind === 'region' ? [record.region, record.geography] :
        options.kind === 'pair' ? [record.title, record.summary, ...record.keywords] :
        options.kind === 'topic' ? [record.category, ...record.topics, record.title, record.summary, ...record.keywords] :
        [record.country, record.region, record.geography, record.category, ...record.topics,
          record.title, record.summary, ...record.keywords];
      return fields.filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }
  const bounds = options.bounds || periodBounds(options.period || '30D', options.now || Date.now(), options.customStart, options.customEnd);
  const topicSet = new Set(options.topics || []);
  const themeSet = new Set(options.themes || []);
  return records.filter(record => {
    const time = Date.parse(record.publishedAt);
    if (time < bounds.start || time >= bounds.end) return false;
    if (!matchesGeography(record, options.geography)) return false;
    if (topicSet.size && !record.topicIds.some(topic => topicSet.has(topic))) return false;
    if (themeSet.size && !(record.themeIds || []).some(theme => themeSet.has(theme))) return false;
    return true;
  });
}

export function normalizeEditorial(value) {
  if (value?.source !== 'contentful-published-public' || !Array.isArray(value.records)) return [];
  return value.records.flatMap(item => /^[A-Z]{3}\/[A-Z]{3}$/.test(item?.pair || '') &&
    typeof item?.url === 'string' && item.url.startsWith('/')
    ? [{ pair: item.pair, title: clean(item.title, 200), summary: clean(item.summary, 500), url: item.url }]
    : []);
}

function normalizeGovernedRoutes(value) {
  if (value?.schemaVersion !== '1.0.0' || !Array.isArray(value.routes)) return [];
  const seen = new Set();
  return value.routes.flatMap(item => {
    if (item?.authAuthority !== 'supabase' || item.controlledValidation !== false ||
        !/^VK-GPIR-P-[0-9]+-[0-9]+$/.test(item.identity || '') ||
        !/^\/[a-z0-9][a-z0-9/_-]*\/$/.test(item.route || '') ||
        item.canonicalUrl !== 'https://fintechoisis.com' + item.route || seen.has(item.identity)) return [];
    seen.add(item.identity);
    const title = item.route.split('/').filter(Boolean).pop().replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { title, summary: clean(item.publicationType, 80) || 'Research publication', url: item.route,
      search: title.toLowerCase() };
  });
}

function isCritical(record) {
  return /\b(critical|urgent|enforcement action|sanction|breach|cyberattack|fraud)\b/i.test(
    [record.title, record.summary, record.outcomeStatus].filter(Boolean).join(' '));
}

function comparison(current, previous) {
  const { label, direction } = compareCounts(current, previous);
  return { label, direction };
}

export function buildDashboardMetrics(current, previous) {
  const countTopic = (records, id) => records.filter(record => record.topicIds.includes(id)).length;
  const sources = new Set(current.map(record => record.sourceName).filter(Boolean));
  return [
    { label: 'Signals', value: current.length, comparison: comparison(current.length, previous.length), tone: 'gold' },
    { label: 'Critical', value: current.filter(isCritical).length, comparison: comparison(current.filter(isCritical).length, previous.filter(isCritical).length), tone: 'red' },
    { label: 'Regulatory Actions', value: countTopic(current, 'regulatory'), comparison: comparison(countTopic(current, 'regulatory'), countTopic(previous, 'regulatory')) },
    { label: 'Deals & Partnerships', value: countTopic(current, 'deals'), comparison: comparison(countTopic(current, 'deals'), countTopic(previous, 'deals')) },
    { label: 'Licences', value: countTopic(current, 'licences'), comparison: comparison(countTopic(current, 'licences'), countTopic(previous, 'licences')) },
    { label: 'Sources', value: sources.size, comparison: { label: 'Unique validated sources', direction: 'flat' }, tone: 'gold' }
  ];
}

export function buildHeatmap(records, now = Date.now(), topics = SMART_TOPICS, field = 'topicIds') {
  const lastWeek = utcWeekStart(now);
  const weeks = Array.from({ length: 12 }, (_, index) => lastWeek - (11 - index) * 7 * DAY);
  const rows = topics.map(topic => ({
    topic,
    counts: weeks.map(week => records.filter(record => {
      const time = Date.parse(record.publishedAt);
      return time >= week && time < week + 7 * DAY && (record[field] || []).includes(topic.id);
    }).length)
  }));
  const max = Math.max(0, ...rows.flatMap(row => row.counts));
  return { weeks, rows, max };
}

// Records behind one heatmap cell plus a like-for-like comparison with the preceding week.
// A week still in progress is compared with the same elapsed days of the preceding week.
export function buildHeatmapSelection(records, topicId, weekStart, now = Date.now(), field = 'topicIds') {
  const inProgress = weekStart + 7 * DAY > now;
  const elapsedDays = inProgress ? Math.min(7, Math.max(1, Math.floor((now - weekStart) / DAY) + 1)) : 7;
  const previousStart = weekStart - 7 * DAY;
  const inWindow = (record, start, days) => {
    const time = Date.parse(record.publishedAt);
    return time >= start && time < start + days * DAY && (record[field] || []).includes(topicId);
  };
  const current = records.filter(record => inWindow(record, weekStart, elapsedDays));
  const previous = records.filter(record => inWindow(record, previousStart, elapsedDays));
  const previousAvailable = previousStart >= HISTORY_FLOOR;
  return {
    topicId, weekStart, weekEnd: weekStart + 6 * DAY, inProgress, elapsedDays,
    current, previous, previousStart, previousAvailable,
    comparison: previousAvailable ? compareCounts(current.length, previous.length) : null,
    sourceCount: new Set(current.map(record => record.sourceName).filter(Boolean)).size
  };
}

// Distinguishes machine-readable statistics and GitHub repository history from announcements.
export function evidenceKind(record) {
  if (record?.dataClass === 'STATISTICAL_REFERENCE' && record?.recordType === 'RPW_CORRIDOR_QUARTER') {
    return { id: 'statistical', label: 'World Bank RPW statistical reference',
      tag: 'World Bank Remittance Prices Worldwide',
      note: 'USD 200 transfer cost is an unweighted mean of surveyed service quotes. The quarter-end reference marker is not the survey or publication date. This is historical evidence, not a news announcement.',
      linkLabel: 'Open World Bank RPW source catalog' };
  }
  if (record?.dataClass === 'STATISTICAL_REFERENCE') {
    return { id: 'statistical', label: 'BIS statistical reference',
      tag: 'BIS statistical data (SDMX XML)',
      note: 'Authoritative BIS statistical observation. The linked raw XML is machine-readable source data, not an article or announcement.',
      linkLabel: 'Open machine-readable source data (SDMX XML)' };
  }
  if (record?.dataClass === 'TECHNICAL_REFERENCE') {
    return { id: 'technical', label: 'Technical repository evidence',
      tag: 'GitHub repository evidence',
      note: 'GitHub repository history for product development. It is technical evidence, not a payments-industry announcement.',
      linkLabel: 'Open repository evidence on GitHub' };
  }
  return null;
}

// Reads only the validated GitHub URL path (release tag or commit hash) and record metadata.
export function describeTechnicalChange(record) {
  let pathName = '';
  try { pathName = new URL(record.url).pathname; } catch {}
  const release = /\/releases\/tag\/([^/]+)$/.exec(pathName);
  const commit = /\/commit\/([0-9a-f]{40})$/.exec(pathName);
  let tag = '';
  if (release) { try { tag = decodeURIComponent(release[1]); } catch { tag = release[1]; } }
  if (release || record.recordType === 'SOFTWARE_RELEASE') {
    return { type: 'Software release', referenceLabel: 'Release tag', reference: tag,
      description: `Software release${tag ? ` ${tag}` : ''} published in the ${record.repository || 'official'} repository.` };
  }
  const sha = commit ? commit[1].slice(0, 12) : '';
  return { type: 'Repository commit', referenceLabel: 'Commit', reference: sha,
    description: `Repository commit${sha ? ` ${sha}` : ''} recorded in ${record.repository || 'the official repository'}. The validated metadata does not include a commit message; open the commit for the full change.` };
}

function endpointOrigin(global) {
  try {
    const url = new URL(global.GPIR_SUPABASE_PUBLIC_CONFIG?.url);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') ? url.origin : null;
  } catch { return null; }
}

export async function fetchHistory(fetchImpl, origin, { maxPages = 51 } = {}) {
  const records = [];
  for (let offset = 0; offset < maxPages * 1000; offset += 1000) {
    const response = await fetchImpl(`${origin}${INTELLIGENCE_PATH}&offset=${offset}`, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('INTELLIGENCE_UNAVAILABLE');
    const payload = await response.json();
    const page = normalizeSmartRecords(payload);
    records.push(...page);
    if (records.length >= Number(payload.total || 0) || page.length < 1000) return records;
  }
  if (maxPages < 51) return records;
  throw new Error('INTELLIGENCE_PAGE_LIMIT');
}

function evidenceMarkup(record, kind) {
  if (!kind) return '';
  // Reader-facing highlights use validated normalized metadata only. Raw source fields
  // remain available on demand, never as a wall of technical database columns.
  const facts = [];
  const add = (label, value) => { if (value !== '' && value != null) facts.push([label, String(value)]); };
  let headline = '';
  let context = '';
  if (kind.id === 'statistical') {
    const value = record.statisticalValue;
    const title = record.dimensions.find(d => d.key === 'TITLE')?.value || record.title;
    const policyRate = /policy rate/i.test(title);
    headline = value == null ? 'Recorded observation' : String(value) + (policyRate ? '%' : '');
    context = 'Historical observation · ' + (record.country || record.countryCode || 'Reference area not specified');
    add('Observation date', record.observationDate || record.observationPeriod);
    add('Reference area', record.country || record.countryCode);
    add('Series', title);
  } else {
    const change = describeTechnicalChange(record);
    headline = change.type;
    context = (record.product || record.repository || 'Official software repository') + ' · technical history, not an industry announcement';
    add('Verified date', record.referenceDate);
    add('Repository', record.repository);
    add(change.referenceLabel, change.reference);
  }
  const technical = kind.id === 'statistical'
    ? [['Unit code', record.unitMeasure], ['Multiplier code', record.unitMultiplier], ['Provider release', record.providerReleaseDate],
      ...record.dimensions.map(d => ['Dimension ' + d.key, d.value])]
    : [['Product', record.product], ['Repository', record.repository], ['Record type', describeTechnicalChange(record).type]];
  const rows = values => values.filter(([, value]) => value !== '' && value != null)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('');
  return `<div class="smi-record-evidence smi-reader-evidence" data-evidence="${kind.id}">
    <div class="smi-reader-evidence-head"><strong>${escapeHtml(headline)}</strong><span>${escapeHtml(context)}</span></div>
    <dl class="smi-reader-facts">${rows(facts)}</dl>
    <details class="smi-reader-methodology"><summary>Source &amp; methodology · technical details</summary>
      <p>${escapeHtml(kind.note)}</p><dl class="smi-record-facts">${rows(technical)}</dl>
      <a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(kind.linkLabel)}</a>
    </details>
  </div>`;
}

function recordMarkup(record) {
  const geography = [...new Set([record.country, record.region, record.geography].filter(Boolean))].join(' · ') || 'Geography not classified';
  const kind = evidenceKind(record);
  const recordClass = kind ? kind.label : record.lifecycle;
  const dateLabel = record.observationPeriod ? `Observation ${record.observationPeriod}` :
    record.referenceDate ? `${kind?.id === 'technical' ? describeTechnicalChange(record).type : 'Verified change'} dated ${record.referenceDate}` : isoDay(record.publishedAt);
  return `<article class="smi-record"${kind ? ` data-evidence="${kind.id}"` : ''}><div class="smi-record-meta"><span class="smi-pill"${kind ? ` data-evidence="${kind.id}"` : ''}>${escapeHtml(recordClass)}</span><span class="smi-pill">${escapeHtml(record.category)}</span></div><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.summary)}</p>${evidenceMarkup(record, kind)}<div class="smi-record-meta"><span>${escapeHtml(dateLabel)}</span><span>· ${escapeHtml(geography)}</span><span>· ${escapeHtml(record.sourceName)}</span></div>${kind ? '' : `<a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Read authoritative source</a>`}</article>`;
}

function evidenceTag(record) {
  const kind = evidenceKind(record);
  return kind ? ` · ${escapeHtml(kind.tag)}` : '';
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const askHref = query => `../../index.html?ask=${encodeURIComponent(query)}#gpir-search`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function recordGeography(record) {
  return [...new Set([record.country, record.region, record.geography].filter(Boolean))].join(' · ');
}

// Primary theme first, then up to two overlapping themes. Text labels accompany every colour.
function themeTags(record, limit = 3) {
  const primary = primaryThemeId(record);
  const ids = [primary, ...(record.themeIds || []).filter(id => id !== primary)].slice(0, limit);
  return ids.map(id => themeById(id)).filter(Boolean)
    .map(theme => `<span class="smp-tag" style="--theme-color:${theme.color}">${escapeHtml(theme.short)}</span>`).join('');
}

function developmentMarkup(record) {
  const primary = themeById(primaryThemeId(record));
  const geography = recordGeography(record) || 'Geography not classified';
  const themes = (record.themeIds || []).map(id => themeById(id)?.label).filter(Boolean);
  const facts = [['Source', record.sourceName], ['Source trust tier', record.sourceTrustTier], ['Published', isoDay(record.publishedAt)],
    ['Record status', record.lifecycle], ['Geography', geography], ['Category', record.category], ['Themes', themes.join(' · ')]]
    .filter(([, value]) => value).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  const ask = askHref(buildAskQuery({}, { record }));
  return `<li class="smp-dev" style="--theme-color:${primary.color}" data-theme="${primary.id}" data-record-id="${escapeHtml(record.id)}"><time datetime="${escapeHtml(isoDay(record.publishedAt))}">${escapeHtml(LONG_DATE.format(new Date(record.publishedAt)))}</time><span class="smp-dev-dot" aria-hidden="true"></span><div class="smp-dev-body"><div class="smp-dev-tags">${themeTags(record)}</div><h3>${escapeHtml(record.title)}</h3><p class="smp-dev-meta">${escapeHtml(record.sourceName)} · ${escapeHtml(geography)}</p><p class="smp-dev-summary">${escapeHtml(record.summary)}</p><div class="smp-dev-actions"><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Verify source</a><a href="${escapeHtml(ask)}" data-smart-item-ask>Ask GPIR</a><button type="button" data-smart-share-item="${escapeHtml(record.id)}">Share</button></div><details class="smp-dev-more"><summary>Source &amp; methodology</summary><p>${escapeHtml(record.summary)}</p><dl class="smp-facts">${facts}</dl><p class="smp-method-note">Dated, validated record from the governed GPIR repository. Themes are classified from the record's own metadata and text; counts imply no market impact.</p></details></div></li>`;
}

function renderTopSignal(root, records) {
  const top = root.querySelector('[data-smart-top-signal]');
  const supporting = root.querySelector('[data-smart-supporting]');
  if (!records.length) {
    top.innerHTML = '<p class="smi-kicker">TOP SIGNAL NOW</p><h2>No qualifying signal in this context</h2><p>No headline or interpretation has been manufactured. Broaden the period, geography or topic selection to inspect other governed records.</p>';
    supporting.innerHTML = '<p class="smi-kicker">SUPPORTING DEVELOPMENTS</p><p>No additional eligible developments match this context.</p>';
    return;
  }
  const record = records[0];
  const primary = themeById(primaryThemeId(record));
  top.style.setProperty('--theme-color', primary.color);
  const geography = recordGeography(record);
  top.innerHTML = `<p class="smi-kicker">TOP SIGNAL NOW</p><h2>${escapeHtml(record.title)}</h2><p>${escapeHtml(record.summary)}</p><div class="smi-signal-meta">${themeTags(record)}<span class="smi-pill">${escapeHtml(isoDay(record.publishedAt))}</span><span class="smi-pill">${escapeHtml(record.sourceName)}</span>${geography ? `<span class="smi-pill">${escapeHtml(geography)}</span>` : ''}</div><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Open verified source</a> · <a href="${escapeHtml(askHref(buildAskQuery({}, { record })))}" data-smart-item-ask>Ask GPIR about this</a>`;
  const extras = records.slice(1, 4);
  supporting.innerHTML = `<p class="smi-kicker">SUPPORTING DEVELOPMENTS</p>${extras.length ? `<ol>${extras.map(item => `<li style="--theme-color:${themeById(primaryThemeId(item)).color}"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><small>${escapeHtml(isoDay(item.publishedAt))} · ${escapeHtml(item.sourceName)}</small></li>`).join('')}</ol>` : '<p>No additional eligible developments match this context.</p>'}`;
}

// The executive composition: KPI strip, summary, momentum, heatmap and the compact timeline.
function renderExecutive(root, models, state) {
  const { kpis, summary, donut, momentum, matrix, events, period } = models;
  const set = (name, html) => { const target = root.querySelector(`[data-smart-${name}]`); if (target) target.innerHTML = html; };
  const text = (name, value) => { const target = root.querySelector(`[data-smart-${name}]`); if (target) target.textContent = value; };
  set('kpis', kpiStripMarkup(kpis, { period, selected: state.themes }));
  set('summary', summaryMarkup(summary));
  set('donut-legend', donutLegendMarkup(donut));
  text('donut-total', donut.unique);
  set('momentum-labels', momentumLabelsMarkup(momentum, state.themes));
  set('momentum-deltas', momentumDeltasMarkup(momentum));
  set('region-heatmap', regionHeatmapMarkup(matrix, { themes: state.themes, geography: state.geography }));
  set('timeline-track', timelineMarkup(events));
  const current = period === '8W';
  text('momentum-current', current ? 'Current (W1 – W8)' : 'Current period');
  text('momentum-prior', current ? 'Prior (W-8 – W0)' : 'Prior period');
  text('heat-period', `Relative activity intensity (${periodLabel(period).toLowerCase()})`);
}

function themeTileMarkup(row, series, selected) {
  const sourceLabel = row.sources == null ? 'exact server aggregate' : plural(row.sources,'source');
  const spoken = `${row.short}: ${plural(row.current, 'verified development')} in the selected period, ${row.previous} in the preceding period, ${row.change.isNew ? 'new' : row.change.deltaLabel}, ${sourceLabel}`;
  return `<button type="button" class="smp-tile" style="--theme-color:${row.color}" data-theme-tile="${row.id}" aria-pressed="${selected}" aria-label="${escapeHtml(`Filter by ${spoken}`)}"><span class="smp-tile-name"><i aria-hidden="true"></i>${escapeHtml(row.short)}</span><strong>${row.current}</strong><span class="smp-delta" data-direction="${row.change.direction}">${escapeHtml(row.change.isNew ? `New (${row.change.deltaLabel})` : row.change.label)}</span>${row.current || row.previous ? sparklineSvg(series, row.color) : ''}<small>${row.current ? `${sourceLabel} · prior ${row.previous}` : 'No verified evidence in this period'}</small></button>`;
}

function renderThemeTiles(root, rows, scopeRecords, state, now) {
  root.querySelector('[data-smart-theme-tiles]').innerHTML = rows.map(row =>
    themeTileMarkup(row, buildThemeWeekly(scopeRecords, row.id, now), state.themes.has(row.id))).join('');
}

function renderServerThemeTiles(root, models, state) {
  root.querySelector('[data-smart-theme-tiles]').innerHTML = models.allThemes.map(row =>
    themeTileMarkup(row, models.themeSeries[row.id] || [], state.themes.has(row.id))).join('');
}

function setSummary(root, name, text) {
  const target = root.querySelector(`[data-smart-chart-summary="${name}"]`);
  if (target) target.textContent = text;
}

function renderAnalytics(root, models) {
  const { trend, momentum, distribution, donut, regional, coverage, matrix } = models;
  const busiest = trend.series.map(series => ({ series, peak: Math.max(0, ...series.data) })).sort((left, right) => right.peak - left.peak)[0];
  setSummary(root, 'weekly', trend.total
    ? `Weekly verified developments for the four featured themes over the last eight UTC weeks (${plural(trend.total, 'theme classification')}; themes overlap). Highest single week: ${busiest.series.label} with ${busiest.peak}. The latest week is in progress. Select a point to open that week.`
    : 'No verified developments for the featured themes in the last eight UTC weeks for this selection.');
  const leader = [...momentum].sort((left, right) => right.current - left.current || left.label.localeCompare(right.label))[0];
  setSummary(root, 'momentum', leader && (leader.current || leader.previous)
    ? `Featured themes, current versus prior period. Largest current theme: ${leader.label} with ${leader.current} (prior ${leader.previous}). Counts overlap because one development can carry several themes.`
    : 'No featured-theme developments in the current or prior period.');
  setSummary(root, 'distribution', distribution.unique
    ? `${plural(distribution.unique, 'unique development')} counted once under a primary theme: ${donut.slices.map(slice => `${slice.label} ${slice.count}`).join(', ')}.`
    : 'No verified developments in this selection, so no theme distribution is shown.');
  setSummary(root, 'geography', regional.mapped
    ? `${regional.mapped} of ${regional.total} developments map to a verified region: ${regional.regions.map(region => `${region.label} ${region.percent}%`).join(', ')}. ${regional.unmapped} without a specific verified region are not plotted.`
    : 'Too few developments in this selection carry a specific verified region, so no regional shares are shown.');
  root.querySelector('[data-smart-table="weekly"]').innerHTML = trend.total ? trendTable(trend) : '';
  root.querySelector('[data-smart-table="momentum"]').innerHTML = momentumTable(momentum);
  root.querySelector('[data-smart-table="distribution"]').innerHTML = distribution.unique ? distributionTable(distribution) : '';
  root.querySelector('[data-smart-table="geography"]').innerHTML = regional.mapped ? geographyTable(regional, coverage) : '';
  root.querySelector('[data-smart-table="heatmap"]').innerHTML = matrix.mapped ? heatmapTable(matrix) : '';
}

function renderTimeline(root, records, state) {
  const target = root.querySelector('[data-smart-results]');
  const shown = records.slice(0, state.visible);
  target.innerHTML = records.length
    ? `<ol class="smp-timeline">${shown.map(developmentMarkup).join('')}</ol>${records.length > shown.length
      ? `<button type="button" class="smp-more" data-smart-more>Show ${Math.min(8, records.length - shown.length)} more · ${shown.length} of ${records.length} shown</button>`
      : `<p class="smp-count">${plural(records.length, 'verified development')} shown.</p>`}`
    : '<div class="smi-empty"><strong>No validated records match this context.</strong><p>Broaden the filters or period. No sample signal, KPI or market-impact conclusion has been substituted.</p></div>';
}

// BIS statistics and software repository history stay available for audit, outside industry analytics.
function renderReference(root, records) {
  const target = root.querySelector('[data-smart-reference]');
  if (!target) return;
  const statistical = records.filter(record => referenceClass(record) === 'statistical');
  const technical = records.filter(record => referenceClass(record) === 'technical');
  target.hidden = !records.length;
  if (!records.length) { target.innerHTML = ''; return; }
  const list = items => items.slice(0, 12).map(recordMarkup).join('') + (items.length > 12 ? `<p class="smi-heat-note">Showing the latest 12 of ${items.length} records.</p>` : '');
  target.innerHTML = `<summary>Historical reference data &amp; audit records <span>${plural(statistical.length, 'statistical observation')} · ${plural(technical.length, 'technical record')}</span></summary><div class="smp-reference-body"><p>BIS statistical observations are historical reference data, not breaking news. Software repository history is retained for auditability and is excluded from industry rankings, momentum and analytics.</p>${statistical.length ? `<h3>BIS statistical reference data</h3><div class="smi-results">${list(statistical)}</div>` : ''}${technical.length ? `<h3>Technical repository audit records</h3><div class="smi-results">${list(technical)}</div>` : ''}</div>`;
}



const WEEK_FORMAT = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const WEEK_FORMAT_YEAR = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function weekRangeLabel(weekStart) {
  return `${WEEK_FORMAT.format(new Date(weekStart))} – ${WEEK_FORMAT_YEAR.format(new Date(weekStart + 6 * DAY))}`;
}

function heatSelectionValid(heat, weeks) {
  return Boolean(heat && PREMIUM_THEMES.some(topic => topic.id === heat.topicId) && weeks.includes(heat.weekStart));
}

function renderCompareWindow(root, bounds) {
  const target = root.querySelector('[data-smart-compare-window]');
  if (!target) return;
  const range = (start, end) => `${isoDay(start)} to ${isoDay(end - 1)}`;
  const shorter = bounds.previousEnd - bounds.previousStart < bounds.end - bounds.start;
  target.textContent = `Current period ${range(bounds.start, bounds.end)} · preceding period ${range(bounds.previousStart, bounds.previousEnd)} (UTC).${shorter ? ` The preceding window is shorter because the GPIR archive begins on ${isoDay(HISTORY_FLOOR)}.` : ''}`;
}

function renderHeatmap(root, records, now, heat) {
  const target = root.querySelector('[data-smart-heatmap]');
  const heatmap = buildHeatmap(records, now, PREMIUM_THEMES, 'themeIds');
  const selected = heatSelectionValid(heat, heatmap.weeks) ? heat : null;
  const level = count => !count || !heatmap.max ? 0 : Math.min(4, Math.ceil((count / heatmap.max) * 4));
  const tabStop = selected ? `${selected.topicId}|${selected.weekStart}` : `${heatmap.rows[0]?.topic.id}|${heatmap.weeks[0]}`;
  target.innerHTML = `<span></span>${heatmap.weeks.map(week => `<span class="smi-week">${WEEK_FORMAT.format(new Date(week))}</span>`).join('')}${heatmap.rows.map((row, rowIndex) => `<span class="smi-row-label" style="--theme-color:${row.topic.color}">${escapeHtml(row.topic.short)}</span>${row.counts.map((count, index) => {
    const week = heatmap.weeks[index];
    const isSelected = selected?.topicId === row.topic.id && selected.weekStart === week;
    const label = `${row.topic.label}, week of ${isoDay(week)}: ${count} qualifying signal${count === 1 ? '' : 's'}. Select to list the dated records.`;
    return `<button type="button" class="smi-heat-cell" style="--theme-color:${row.topic.color};--theme-ink:${row.topic.ink}" data-level="${level(count)}" data-heat-topic="${row.topic.id}" data-heat-week="${week}" data-heat-row="${rowIndex}" data-heat-col="${index}" aria-pressed="${isSelected}" aria-label="${escapeHtml(label)}" tabindex="${`${row.topic.id}|${week}` === tabStop ? 0 : -1}" title="${escapeHtml(row.topic.label)} · week of ${isoDay(week)} · ${count} qualifying signal${count === 1 ? '' : 's'}">${count || ''}</button>`;
  }).join('')}`).join('')}`;
  renderHeatDetail(root, records, selected, now);
}

function renderServerHeatmap(root, aggregate, now) {
  const target = root.querySelector('[data-smart-heatmap]');
  const lastWeek = utcWeekStart(now);
  const weeks = Array.from({length:12},(_,index)=>lastWeek-(11-index)*7*DAY);
  const rows = PREMIUM_THEMES.map(topic => ({topic,counts:weeks.map(week =>
    Number(aggregate?.weeklyThemes?.[isoDay(week)]?.[topic.id] || 0))}));
  const max = Math.max(0,...rows.flatMap(row=>row.counts));
  const level = count => !count || !max ? 0 : Math.min(4,Math.ceil((count/max)*4));
  target.innerHTML = `<span></span>${weeks.map(week=>`<span class="smi-week">${WEEK_FORMAT.format(new Date(week))}</span>`).join('')}${rows.map(row=>`<span class="smi-row-label" style="--theme-color:${row.topic.color}">${escapeHtml(row.topic.short)}</span>${row.counts.map((count,index)=>`<span class="smi-heat-cell" data-aggregate-static="true" data-level="${level(count)}" style="--theme-color:${row.topic.color};--theme-ink:${row.topic.ink}" aria-label="${escapeHtml(`${row.topic.label}, week of ${isoDay(weeks[index])}: ${count} verified development${count===1?'':'s'}`)}" title="${escapeHtml(row.topic.label)} · week of ${isoDay(weeks[index])} · ${count}">${count||''}</span>`).join('')}`).join('')}`;
  const detail = root.querySelector('[data-smart-heat-detail]');
  if (detail) {
    detail.dataset.state='idle';
    detail.innerHTML='<p class="smi-heat-note">Exact server-calculated weekly counts across the complete matching dataset. Use the governed evidence pagination to retrieve additional records on request.</p>';
  }
}

function heatRecordList(records) {
  const shown = records.slice(0, 25);
  return `<ol class="smi-heat-records">${shown.map(record => `<li><time datetime="${escapeHtml(isoDay(record.publishedAt))}">${escapeHtml(isoDay(record.publishedAt))}</time><span><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.title)}</a><small>${escapeHtml(record.sourceName)}${evidenceTag(record)}</small></span></li>`).join('')}</ol>${records.length > shown.length ? `<p class="smi-heat-note">Showing the latest ${shown.length} of ${records.length} records.</p>` : ''}`;
}

function renderHeatDetail(root, records, heat, now) {
  const target = root.querySelector('[data-smart-heat-detail]');
  if (!target) return;
  const status = root.querySelector('[data-smart-heat-status]');
  if (!heat) {
    target.dataset.state = 'idle';
    target.innerHTML = '<p class="smi-heat-note">Select a topic and week in the grid to list its dated supporting records and compare it with the preceding week. Counts describe recorded history only.</p>';
    return;
  }
  const topic = PREMIUM_THEMES.find(item => item.id === heat.topicId);
  const selection = buildHeatmapSelection(records, heat.topicId, heat.weekStart, now, 'themeIds');
  const range = weekRangeLabel(heat.weekStart);
  const change = selection.comparison;
  const previousRange = weekRangeLabel(selection.previousStart);
  const basis = selection.inProgress
    ? `Week in progress: ${selection.elapsedDays} UTC day${selection.elapsedDays === 1 ? '' : 's'} so far, compared with the same days of the preceding week (${previousRange}).`
    : `Compared with the preceding week (${previousRange}).`;
  const stats = [
    ['This week', selection.current.length],
    ['Preceding week', selection.previousAvailable ? selection.previous.length : 'Not available'],
    ['Change', change ? (change.isNew ? `New (${change.deltaLabel})` : `${change.deltaLabel} · ${change.label}`) : 'Not available'],
    ['Sources', selection.sourceCount]
  ];
  target.dataset.state = 'selected';
  target.innerHTML = `<div class="smi-heat-detail-head"><div><p class="smi-kicker">SELECTED TOPIC AND WEEK</p><h3>${escapeHtml(topic.label)} · ${escapeHtml(range)}</h3></div><button type="button" data-smart-heat-clear>Clear selection</button></div><p class="smi-heat-note">${escapeHtml(selection.previousAvailable ? basis : 'The preceding week is before the start of the GPIR archive, so no comparison is shown.')}</p><dl class="smi-heat-stats">${stats.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('')}</dl>${selection.current.length ? heatRecordList(selection.current) : '<p class="smi-heat-note">No qualifying dated records for this topic in the selected week. Nothing has been inferred.</p>'}${selection.previous.length ? `<details class="smi-heat-previous"><summary>Preceding-week records (${selection.previous.length})</summary>${heatRecordList(selection.previous)}</details>` : ''}`;
  if (status) status.textContent = `${topic.label}, ${range}: ${selection.current.length} qualifying record${selection.current.length === 1 ? '' : 's'}${change ? `, ${change.isNew ? 'new compared with the preceding week' : change.label}` : ''}.`;
}

export function eligibleLiveRecords(records, now = Date.now()) {
  return records.filter(record => {
    const published = Date.parse(record.publishedAt);
    return Number.isFinite(published) && published <= now && now - published < 12 * 60 * 60 * 1000;
  });
}

function topicIntelligenceMarkup(intel, alert) {
  if (!intel || intel.status === 'LOADING')
    return '<div class="smi-topic-intel" data-state="loading"><p>Checking your plan for topic intelligence…</p></div>';
  if (intel.status === 'DENIED')
    return '<div class="smi-topic-intel" data-state="locked"><h3>Topic intelligence</h3><p>Topic-level intelligence — theme, corridor, supporting sources, and current and historical context — is part of the GPIR subscriber plan. The verified alert above remains free.</p><a href="/reader/plan/">View GPIR plan options</a></div>';
  if (intel.status === 'SESSION_EXPIRED')
    return '<div class="smi-topic-intel" data-state="expired"><p>Your session has expired. <a href="/reader/sign-in/">Sign in again</a> to view topic intelligence.</p></div>';
  if (intel.status !== 'OK')
    return '<div class="smi-topic-intel" data-state="unavailable"><p>Topic intelligence is temporarily unavailable. No substitute content has been inferred.</p></div>';
  const context = intel.context;
  const pills = [context.topic?.theme, context.topic?.country, context.topic?.corridor, ...(context.topic?.keywords || []).slice(0, 5)]
    .filter(Boolean).map(value => `<span class="smi-pill">${escapeHtml(value)}</span>`).join('');
  const link = item => safeHttps(item.canonicalUrl || item.url);
  const list = items => items.length ? `<ol>${items.map(item => `<li>${link(item) ? `<a href="${escapeHtml(link(item))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}<small>${escapeHtml(isoDay(item.publishedAt))} · ${escapeHtml(item.source?.name || item.sourceName || 'Authoritative source')}${item.corroboratingReports ? ` · ${item.corroboratingReports} corroborating report${item.corroboratingReports === 1 ? '' : 's'}` : ''}</small></li>`).join('')}</ol>` : '<p>No governed records.</p>';
  const sources = (context.supportingSources || []).filter(source => safeHttps(source.url)).map(source =>
    `<li><a href="${escapeHtml(safeHttps(source.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}</a><small>${escapeHtml(isoDay(source.publishedAt))}</small></li>`).join('');
  return `<div class="smi-topic-intel" data-state="ready"><h3>Topic intelligence</h3><div class="smi-signal-meta">${pills}</div>${sources ? `<h3>Supporting sources</h3><ol class="smi-sources">${sources}</ol>` : ''}<div class="smi-alert-columns"><div><h3>Current context · last 30 days (${Number(context.currentTotal) || 0})</h3>${list(context.current || [])}</div><div><h3>Historical context · repository (${Number(context.historicalTotal) || 0})</h3>${list(context.historical || [])}</div></div></div>`;
}

function renderAlertFocus(root, liveRecords, records, state, now, intel) {
  const target = root.querySelector('[data-smart-alert]');
  if (!target) return;
  if (!state.alertId) { target.hidden = true; target.innerHTML = ''; return; }
  const alert = findAlert(state.alertId, liveRecords, records);
  target.hidden = false;
  if (!alert) {
    target.innerHTML = '<p class="smi-kicker">SELECTED ALERT</p><h2>Alert not found in the governed repository</h2><p>No substitute content has been inferred. <a href="#" data-smart-alert-clear>Return to the dashboard</a></p>';
    return;
  }
  const live = eligibleLiveRecords([alert], now).length > 0;
  const topics = SMART_TOPICS.filter(topic => (alert.topicIds || []).includes(topic.id))
    .map(topic => `<span class="smi-pill">${escapeHtml(topic.label)}</span>`).join('');
  target.innerHTML = `<p class="smi-kicker">SELECTED ALERT · ${live ? 'LIVE · LATEST 12H' : 'ARCHIVED · RETAINED IN THE GPIR REPOSITORY'}</p><h2>${escapeHtml(alert.title)}</h2><p>${escapeHtml(alert.summary)}</p><div class="smi-signal-meta"><span class="smi-pill">${escapeHtml(alert.publishedAt.slice(0, 16).replace('T', ' '))} UTC</span><span class="smi-pill">${escapeHtml(alert.category)}</span><span class="smi-pill">${escapeHtml(alert.sourceName)}</span>${topics}</div><a href="${escapeHtml(alert.url)}" target="_blank" rel="noopener noreferrer">Open verified source</a> · <a href="#" data-smart-alert-clear>Clear selected alert</a>${topicIntelligenceMarkup(intel, alert)}`;
}

function renderLive(root, liveRecords, state, now) {
  const ribbon = document.querySelector('[data-smart-live]');
  const target = document.querySelector('[data-smart-live-content]');
  if (!ribbon || !target) return;
  const matches = eligibleLiveRecords(liveRecords, now).filter(record =>
    matchesGeography(record, state.geography) &&
    (!state.topics.size || record.topicIds.some(topic => state.topics.has(topic))) &&
    (!state.themes.size || (record.themeIds || []).some(theme => state.themes.has(theme))));
  if (!matches.length) {
    ribbon.dataset.state = 'empty';
    target.textContent = 'No verified announcements qualify for the selected topics in the preceding 12 hours.';
    return 0;
  }
  ribbon.dataset.state = 'ready';
  target.innerHTML = matches.slice(0, 4).map(record => `<a href="?alert=${encodeURIComponent(record.id)}" data-smart-alert-id="${escapeHtml(record.id)}">${escapeHtml(record.title)}</a>`).join(' · ');
  return matches.length;
}

function updateAskLinks(root, state) {
  const geographyLabel = root.querySelector('[data-smart-geography]')?.selectedOptions?.[0]?.textContent || 'All geographies';
  const query = buildAskQuery(state, {
    themeLabels: PREMIUM_THEMES.filter(theme => state.themes.has(theme.id)).map(theme => theme.label),
    topicLabels: SMART_TOPICS.filter(topic => state.topics.has(topic.id)).map(topic => topic.label), geographyLabel
  });
  document.querySelectorAll('[data-smart-ask]').forEach(link => {
    link.href = askHref(query);
  });
}

function updateUrl(global, state) {
  const url = new URL(global.location.href);
  url.searchParams.set('period', state.period);
  url.searchParams.set('geo', state.geography);
  state.topics.size ? url.searchParams.set('topics', [...state.topics].join(',')) : url.searchParams.delete('topics');
  state.themes.size ? url.searchParams.set('themes', [...state.themes].join(',')) : url.searchParams.delete('themes');
  state.alertId ? url.searchParams.set('alert', state.alertId) : url.searchParams.delete('alert');
  if (state.period === 'CUSTOM') {
    url.searchParams.set('from', state.customStart);
    url.searchParams.set('to', state.customEnd);
  } else {
    url.searchParams.delete('from'); url.searchParams.delete('to');
  }
  global.history?.replaceState?.(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function initializeSmartIntelligence({ global = window,
  document = global.document, fetchImpl = global.fetch?.bind(global), now = () => Date.now() } = {}) {
  const root = document?.querySelector?.('[data-smart-root]');
  if (!root) return false;
  let session = null;
  try {
    session = global.GPIRReaderAuth?.sessionReady ? await global.GPIRReaderAuth.sessionReady :
      (await global.GPIR_SUPABASE_CLIENT?.auth?.getSession())?.data?.session;
  } catch {}
  if (!session?.user || !session.access_token) {
    const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
    global.GPIRReaderAuth?.rememberReturnTo?.(returnTo);
    global.location.assign(`/reader/sign-in/?returnTo=${encodeURIComponent(returnTo)}`);
    return false;
  }
  const origin = endpointOrigin(global);
  if (!origin || !fetchImpl) return false;
  const params = new URL(global.location.href).searchParams;
  const initialTopics = clean(params.get('topics'), 300).split(',').filter(id => SMART_TOPICS.some(topic => topic.id === id));
  const initialThemes = clean(params.get('themes'), 300).split(',').filter(id => PREMIUM_THEMES.some(theme => theme.id === id));
  const dateParam = (name, fallback) => /^\d{4}-\d{2}-\d{2}$/.test(params.get(name) || '') ? params.get(name) : fallback;
  const state = {
    period: ['24H','7D','30D','8W','QTD','YTD','CUSTOM'].includes(params.get('period')) ? params.get('period') : '8W',
    geography: GEOGRAPHY_FILTER_KEYS.includes(params.get('geo')) ? params.get('geo') : 'all',
    topics: new Set(initialTopics), themes: new Set(initialThemes), customStart: dateParam('from', '2024-11-08'),
    customEnd: dateParam('to', isoDay(now())),
    alertId: clean(params.get('alert'), 100), heat: null,
    visible: global.matchMedia?.('(max-width: 640px)').matches ? 3 : 4, contextKey: ''
  };
  const topicControls = root.querySelector('[data-smart-topic-controls]');
  topicControls.innerHTML = SMART_TOPICS.map(topic => `<label><input type="checkbox" value="${topic.id}"${state.topics.has(topic.id) ? ' checked' : ''}> ${escapeHtml(topic.label)}</label>`).join('');
  const themeControls = root.querySelector('[data-smart-theme-controls]');
  if (themeControls) themeControls.innerHTML = PREMIUM_THEMES.map(theme => themeChipMarkup(theme, state.themes.has(theme.id))).join('');
  const themeSelect = root.querySelector('[data-smart-theme-select]');
  themeSelect.insertAdjacentHTML('beforeend', PREMIUM_THEMES.map(theme => `<option value="${theme.id}">${escapeHtml(theme.short)}</option>`).join(''));
  const periodSelect = root.querySelector('[data-smart-period-select]');
  const syncThemeControls = () => {
    themeControls?.querySelectorAll('input').forEach(input => { input.checked = state.themes.has(input.value); });
    themeSelect.value = state.themes.size === 1 ? [...state.themes][0] : state.themes.size ? 'multiple' : 'all';
  };
  const geo = root.querySelector('[data-smart-geography]');
  geo.value = state.geography;
  periodSelect.value = state.period;
  syncThemeControls();
  root.querySelector('[data-smart-start]').value = state.customStart;
  root.querySelector('[data-smart-end]').value = state.customEnd;
  root.querySelector('[data-smart-custom]').hidden = state.period !== 'CUSTOM';

  // The 12-hour live relay must not wait for thousands of historical reference rows.
  // Keep the same governed endpoint and filters; history still loads in full for analytics.
  const livePromise = fetchImpl(`${origin}${LIVE_PATH}`, { cache: 'no-store', headers: { accept: 'application/json' } }).then(async response => {
    if (!response.ok) throw new Error('LIVE_UNAVAILABLE');
    return response.json();
  });
  void livePromise.then(payload => {
    renderLive(root, normalizeLiveAlerts(payload, []), state, now());
  }).catch(() => {
    const ribbon = document.querySelector('[data-smart-live]');
    const target = document.querySelector('[data-smart-live-content]');
    if (ribbon && target) {
      ribbon.dataset.state = 'unavailable';
      target.textContent = 'Live announcements are temporarily unavailable. Historical records remain separate.';
    }
  });
  // Exact server-calculated summary and bounded evidence page. All filters are sent as
  // governed taxonomy/theme IDs; the RPC applies OR semantics within each selected set.
  const governedSummary = document.createElement('section');
  governedSummary.className = 'smi-governed-summary';
  governedSummary.setAttribute('aria-live', 'polite');
  governedSummary.textContent = 'Loading exact filtered repository totals…';
  root.prepend(governedSummary);
  const cardsPanel = document.createElement('section');
  cardsPanel.className = 'smi-governed-cards';
  cardsPanel.setAttribute('aria-live', 'polite');
  cardsPanel.textContent = 'Loading bounded governed Smart Card evidence…';
  root.prepend(cardsPanel);
  let dashboardSequence = 0;
  let cardsOffset = 0;
  let historyCursors = [null];
  let historyPageIndex = 0;
  let currentHistoryPage = null;
  const [liveResult, editorialResult, routesResult] = await Promise.allSettled([
    livePromise,
    fetchImpl(EDITORIAL_PATH, { cache: 'no-store' }).then(async response => response.ok ? response.json() : null),
    fetchImpl(GOVERNED_ROUTES_PATH, { cache: 'no-store' }).then(async response => response.ok ? response.json() : null)
  ]);
  const status = root.querySelector('[data-smart-status]');
  let records = [];
  let currentAggregate = null;
  let previousAggregate = null;
  let trendAggregate = null;
  let liveRecords = liveResult.status === 'fulfilled' ? normalizeLiveAlerts(liveResult.value, records) : [];
  const editorial = editorialResult.status === 'fulfilled' ? normalizeEditorial(editorialResult.value) : [];
  const governedRoutes = routesResult.status === 'fulfilled' ? normalizeGovernedRoutes(routesResult.value) : [];

  const topicIntel = new Map();
  const clearTransientTopicIntel = () => {
    for (const [id, result] of topicIntel) if (['UNAVAILABLE', 'SESSION_EXPIRED'].includes(result.status)) topicIntel.delete(id);
  };
  const loadTopicIntelligence = alertId => {
    if (!alertId || topicIntel.has(alertId) || !findAlert(alertId, liveRecords, records)) return;
    topicIntel.set(alertId, { status: 'LOADING' });
    void (async () => {
      // Use the client's current (auto-refreshed) token, not the one captured at page load.
      let token = session.access_token;
      try { token = (await global.GPIR_SUPABASE_CLIENT?.auth?.getSession())?.data?.session?.access_token || token; } catch {}
      topicIntel.set(alertId, await fetchTopicIntelligence(fetchImpl, origin, token, alertId));
      render();
    })();
  };

  let charts = null;

  const render = async (nextOffset = cardsOffset, navigation = null) => {
    const sequence = ++dashboardSequence;
    const requestNow = now();
    const bounds = periodBounds(state.period, requestNow, state.customStart, state.customEnd);
    const contextKey = [state.period, state.geography, state.customStart, state.customEnd, [...state.topics], [...state.themes]].join('|');
    if (contextKey !== state.contextKey) {
      state.contextKey = contextKey;
      state.visible = global.matchMedia?.('(max-width: 640px)').matches ? 3 : 4;
      nextOffset = 0;
      historyCursors = [null]; historyPageIndex = 0; currentHistoryPage = null;
    }
    cardsOffset = nextOffset;
    periodSelect.value = state.period;
    geo.value = state.geography;
    syncThemeControls();
    root.querySelector('[data-smart-custom]').hidden = state.period !== 'CUSTOM';
    root.querySelector('[data-smart-asof]').textContent = `As of ${new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(requestNow))} UTC`;
    governedSummary.textContent = 'Loading exact filtered repository totals…';
    cardsPanel.textContent = 'Loading bounded governed Smart Card evidence…';
    status.textContent = 'Loading server-calculated dashboard aggregates…';
    updateAskLinks(root,state);
    updateUrl(global,state);
    const previousBounds = {start:bounds.previousStart,end:bounds.previousEnd};
    const trendBounds = {start:utcWeekStart(requestNow)-11*7*DAY,end:requestNow+1};
    try {
      // Navigate historical evidence without recomputing exact aggregate totals.
      if (navigation && currentAggregate && previousAggregate && trendAggregate) {
        const targetIndex = navigation === 'next' ? historyPageIndex + 1 : Math.max(0,historyPageIndex - 1);
        if (navigation === 'next' && !currentHistoryPage?.hasMore) return;
        const cursor = navigation === 'next' ? currentHistoryPage.nextCursor : historyCursors[targetIndex];
        const page = await fetchM40HistoryCursor(fetchImpl,origin,state,bounds,cursor);
        if (sequence !== dashboardSequence) return;
        historyPageIndex = targetIndex;
        historyCursors[targetIndex] = cursor;
        currentHistoryPage = page;
      } else {
        [currentAggregate,previousAggregate,trendAggregate,currentHistoryPage] = await Promise.all([
          fetchM40Aggregate(fetchImpl,origin,state,bounds,{view:'cards',limit:10,offset:0}),
          fetchM40Aggregate(fetchImpl,origin,state,previousBounds,{view:'aggregate',limit:1,offset:0}),
          fetchM40Aggregate(fetchImpl,origin,state,trendBounds,{view:'aggregate',limit:1,offset:0}),
          fetchM40HistoryCursor(fetchImpl,origin,state,bounds,null)
        ]);
        if (sequence !== dashboardSequence) return;
        historyPageIndex = 0; historyCursors = [null];
      }
      cardsOffset = historyPageIndex * 10;
      records = normalizeM40Records(currentHistoryPage);
      if (liveResult.status === 'fulfilled') liveRecords = normalizeLiveAlerts(liveResult.value,records);
    } catch {
      if (sequence !== dashboardSequence) return;
      root.dataset.state='unavailable';
      governedSummary.textContent='Filtered repository totals temporarily unavailable; no values have been estimated.';
      cardsPanel.textContent='Governed Smart Card evidence is temporarily unavailable; no records have been inferred.';
      status.textContent='Server-calculated intelligence is unavailable. Existing live alerts remain independent.';
      return;
    }
    const models=buildServerAggregateModels({current:currentAggregate,previous:previousAggregate,
      trend:trendAggregate,records,now:requestNow,period:state.period});
    const heading=document.createElement('strong');
    heading.textContent=`Verified dated announcements: ${currentAggregate.total.toLocaleString()}`;
    const context=document.createElement('span');
    context.textContent=' · Exact server aggregate for every selected topic (OR), theme, geography and timestamp boundary.';
    governedSummary.replaceChildren(heading,context);
    const cardHeading=document.createElement('h2');
    cardHeading.textContent=`Governed Smart Card evidence — ${currentAggregate.total.toLocaleString()} exact matches`;
    const page=document.createElement('span');
    page.textContent=currentAggregate.total ? ` Showing ${cardsOffset+1}–${cardsOffset+records.length}.` : ' No matching evidence.';
    const controls=document.createElement('div');
    const previousButton=document.createElement('button');
    previousButton.type='button'; previousButton.textContent='Previous'; previousButton.disabled=historyPageIndex===0;
    previousButton.addEventListener('click',()=>{void render(cardsOffset,'previous');});
    const nextButton=document.createElement('button');
    nextButton.type='button'; nextButton.textContent='Next'; nextButton.disabled=!currentHistoryPage?.hasMore;
    nextButton.addEventListener('click',()=>{void render(cardsOffset,'next');});
    controls.append(previousButton,nextButton);
    cardsPanel.replaceChildren(cardHeading,page,controls);
    const liveCount = renderLive(root, liveRecords, state, requestNow);
    document.querySelectorAll('[data-smart-alerts-dot]').forEach(dot => { dot.hidden = !liveCount; });
    renderAlertFocus(root, liveRecords, records, state, requestNow, topicIntel.get(state.alertId));
    loadTopicIntelligence(state.alertId);
    renderTopSignal(root,records);
    renderExecutive(root,models,state);
    renderServerThemeTiles(root,models,state);
    renderAnalytics(root,models);
    charts.render({trend:models.trend,momentum:models.momentum,donut:models.donut,regional:models.regional,options:{
      weekly:trendChartOption(models.trend),momentum:momentumChartOption(models.momentum),
      distribution:donutChartOption(models.donut),geography:mapChartOption(models.regional)},points:{
      weekly:trendPoints(models.trend),momentum:momentumPoints(models.momentum),
      distribution:donutPoints(models.donut),geography:mapPoints(models.regional)}});
    renderCompareWindow(root, bounds);
    renderServerHeatmap(root,trendAggregate,requestNow);
    renderTimeline(root,records,state);
    renderReference(root,[]);
    const subject = clean(params.get('subject'), 20).toUpperCase();
    const related = /^[A-Z]{3}\/[A-Z]{3}$/.test(subject) ? editorial.filter(item => item.pair === subject) : [];
    const queryTerms = [...state.topics].map(id => SMART_TOPICS.find(topic => topic.id === id)?.label || '').filter(Boolean);
    const routeMatches = governedRoutes.filter(item => !queryTerms.length || queryTerms.some(term => item.search.includes(term.toLowerCase()))).slice(0, 8);
    const publications = [...related, ...routeMatches.filter(item => !related.some(fx => fx.url === item.url))];
    const editorialTarget = root.querySelector('[data-smart-editorial]');
    editorialTarget.hidden = !publications.length;
    editorialTarget.innerHTML = publications.length ? `<p class="smi-kicker">PUBLISHED GPIR RESEARCH</p>${publications.map(item => `<article><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><a href="${escapeHtml(item.url)}">Read Published Research</a></article>`).join('')}` : '';
    status.textContent=`Exact totals and charts cover all ${currentAggregate.total.toLocaleString()} matching governed announcements. The browser holds only this ${records.length}-record evidence page; further history loads only with Previous/Next. Live alerts remain an independent 12-hour feed.`;
    updateAskLinks(root, state);
    updateUrl(global, state);
    root.dataset.state = 'ready';
  };

  const progressiveSections = [...root.querySelectorAll('[data-smart-progressive]')];
  let compactLayout = global.matchMedia?.('(max-width: 640px)').matches || false;
  progressiveSections.forEach(section => { section.open = !compactLayout; });
  const syncResponsiveLayout = () => {
    const compact = global.matchMedia?.('(max-width: 640px)').matches || false;
    if (compact === compactLayout) return;
    compactLayout = compact;
    progressiveSections.forEach(section => { section.open = !compact; });
    state.visible = compact ? 3 : 4;
    render();
  };
  const layoutQuery = global.matchMedia?.('(max-width: 640px)');
  if (layoutQuery?.addEventListener) layoutQuery.addEventListener('change', syncResponsiveLayout);
  else layoutQuery?.addListener?.(syncResponsiveLayout);
  progressiveSections.forEach(section => section.addEventListener('toggle', () => {
    global.requestAnimationFrame?.(() => charts?.resize());
  }));

  // Selecting an alert scopes the existing dashboard to that alert's topics.
  const selectAlert = id => {
    state.alertId = id;
    clearTransientTopicIntel();
    const alert = id ? findAlert(id, liveRecords, records) : null;
    if (alert) {
      state.topics = new Set(alert.topicIds);
      topicControls.querySelectorAll('input').forEach(input => { input.checked = state.topics.has(input.value); });
    }
    render();
    if (alert) root.querySelector('[data-smart-alert]')?.scrollIntoView?.({ block: 'start' });
  };
  const alertClick = event => {
    const select = event.target?.closest?.('[data-smart-alert-id]');
    const clear = event.target?.closest?.('[data-smart-alert-clear]');
    if (!select && !clear) return;
    event.preventDefault();
    selectAlert(select ? select.dataset.smartAlertId : '');
  };
  document.querySelector('[data-smart-live]')?.addEventListener('click', alertClick);
  root.querySelector('[data-smart-alert]')?.addEventListener('click', alertClick);
  if (state.alertId && !initialTopics.length) {
    const alert = findAlert(state.alertId, liveRecords, records);
    if (alert) {
      state.topics = new Set(alert.topicIds);
      topicControls.querySelectorAll('input').forEach(input => { input.checked = state.topics.has(input.value); });
    }
  }

  // Theme drill-down: KPI cards, chart elements, table buttons and chips all use one selection path.
  // Cards are re-rendered with the selection, so keyboard focus returns to the control that was used.
  const restoreFocus = (container, attribute, value) => {
    root.querySelector(`${container} [${attribute}="${value}"]`)?.focus({ preventScroll: true });
  };
  const selectTheme = themeId => {
    state.themes = state.themes.size === 1 && state.themes.has(themeId) ? new Set() : new Set([themeId]);
    syncThemeControls();
    render();
  };
  const selectWeek = week => {
    state.period = 'CUSTOM';
    state.customStart = isoDay(week.start);
    state.customEnd = isoDay(Math.min(week.end, now()));
    root.querySelector('[data-smart-start]').value = state.customStart;
    root.querySelector('[data-smart-end]').value = state.customEnd;
    render();
  };
  const selectRegion = key => {
    if (!GEOGRAPHY_FILTER_KEYS.includes(key)) return;
    state.geography = state.geography === key ? 'all' : key;
    render();
  };
  const selectCell = (themeId, regionKey) => {
    const same = state.themes.size === 1 && state.themes.has(themeId) && state.geography === regionKey;
    state.themes = same ? new Set() : new Set([themeId]);
    state.geography = same ? 'all' : regionKey;
    render();
  };
  charts = createChartController(global, root, { onWeek: selectWeek, onTheme: selectTheme, onRegion: selectRegion });
  root.addEventListener('click', event => {
    const target = event.target;
    const tile = target.closest?.('[data-theme-tile]');
    if (tile) {
      selectTheme(tile.dataset.themeTile);
      root.querySelector(`[data-theme-tile="${tile.dataset.themeTile}"]`)?.focus({ preventScroll: true });
      return;
    }
    const theme = target.closest?.('[data-drill-theme]');
    if (theme) {
      const container = theme.closest('[data-smart-kpis],[data-smart-momentum-labels],[data-smart-donut-legend]');
      const hostAttribute = ['data-smart-kpis', 'data-smart-momentum-labels', 'data-smart-donut-legend'].find(name => container?.hasAttribute(name));
      selectTheme(theme.dataset.drillTheme);
      if (hostAttribute) restoreFocus(`[${hostAttribute}]`, 'data-drill-theme', theme.dataset.drillTheme);
      return;
    }
    const cell = target.closest?.('[data-heat-cell]');
    if (cell) {
      const [themeId, regionKey] = cell.dataset.heatCell.split('|');
      selectCell(themeId, regionKey);
      restoreFocus('[data-smart-region-heatmap]', 'data-heat-cell', cell.dataset.heatCell);
      return;
    }
    const week = target.closest?.('[data-drill-week]');
    if (week) { const start = Number(week.dataset.drillWeek); selectWeek({ start, end: start + 6 * DAY }); return; }
    const region = target.closest?.('[data-drill-region]');
    if (region) { selectRegion(region.dataset.drillRegion); return; }
    if (target.closest?.('[data-smart-more]')) {
      const firstNew = state.visible;
      state.visible += 8;
      render();
      const heading = root.querySelectorAll('.smp-dev h3')[firstNew];
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      return;
    }
    const itemShare = target.closest?.('[data-smart-share-item]');
    if (itemShare) {
      const record = records.find(item => item.id === itemShare.dataset.smartShareItem);
      if (record) void shareContent(buildItemShare(record), itemShare);
    }
  });
  themeControls?.addEventListener('change', () => {
    state.themes = new Set([...themeControls.querySelectorAll('input:checked')].map(input => input.value));
    render();
  });
  themeSelect.addEventListener('change', () => {
    state.themes = ['all', 'multiple'].includes(themeSelect.value) ? new Set() : new Set([themeSelect.value]);
    render();
  });
  geo.addEventListener('change', () => { state.geography = geo.value; render(); });
  periodSelect.addEventListener('change', () => { state.period = periodSelect.value; render(); });
  ['[data-smart-start]', '[data-smart-end]'].forEach(selector => root.querySelector(selector).addEventListener('change', () => {
    state.customStart = root.querySelector('[data-smart-start]').value || '2024-11-08';
    state.customEnd = root.querySelector('[data-smart-end]').value || isoDay(now());
    render();
  }));
  root.querySelector('[data-smart-search]')?.addEventListener('submit', event => {
    event.preventDefault();
    const query = clean(new FormData(event.currentTarget).get('ask') || '', 300);
    if (query) global.location.assign(askHref(query));
  });
  const shareStatus = root.querySelector('[data-smart-share-status]');
  // Only the whitelisted dashboard context or a public authoritative source URL is ever shared.
  const shareContent = async (payload, trigger) => {
    const announce = text => { if (shareStatus) shareStatus.textContent = text; };
    try {
      if (global.navigator?.share) { await global.navigator.share(payload); announce('Shared.'); return; }
      await global.navigator.clipboard.writeText(`${payload.title ? `${payload.title}\n` : ''}${payload.url}`);
      announce('Link copied to the clipboard.');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      announce(`Copy this link: ${payload.url}`);
    }
    trigger?.focus?.();
  };
  root.querySelector('[data-smart-share]')?.addEventListener('click', event => {
    void shareContent({ title: 'GPIR Smart Intelligence view', text: 'Verified payments intelligence from FINTECHOISIS GPIR', url: buildShareUrl(global.location.href, state) }, event.currentTarget);
  });

  // Heatmap cells are selectable buttons with a roving tab stop and arrow-key navigation.
  const heatmapEl = root.querySelector('[data-smart-heatmap]');
  const heatDetail = root.querySelector('[data-smart-heat-detail]');
  const heatCells = () => [...heatmapEl.querySelectorAll('.smi-heat-cell')];
  const setHeat = (topicId, weekStart) => {
    state.heat = topicId ? { topicId, weekStart } : null;
    heatCells().forEach(cell => cell.setAttribute('aria-pressed',
      String(Boolean(state.heat) && cell.dataset.heatTopic === topicId && Number(cell.dataset.heatWeek) === weekStart)));
    renderHeatDetail(root, records, state.heat, now());
    if (state.heat) heatDetail?.scrollIntoView?.({ block: 'nearest' });
  };
  heatmapEl?.addEventListener('click', event => {
    const cell = event.target.closest?.('.smi-heat-cell');
    if (!cell || cell.dataset.aggregateStatic) return;
    const week = Number(cell.dataset.heatWeek);
    const same = state.heat?.topicId === cell.dataset.heatTopic && state.heat.weekStart === week;
    setHeat(same ? '' : cell.dataset.heatTopic, week);
  });
  heatmapEl?.addEventListener('focusin', event => {
    const cell = event.target.closest?.('.smi-heat-cell');
    if (!cell || cell.dataset.aggregateStatic) return;
    heatCells().forEach(item => { item.tabIndex = -1; });
    cell.tabIndex = 0;
  });
  heatmapEl?.addEventListener('keydown', event => {
    const cell = event.target.closest?.('.smi-heat-cell');
    if (!cell || cell.dataset.aggregateStatic) return;
    if (event.key === 'Escape' && state.heat) { event.preventDefault(); setHeat(''); return; }
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], Home: [0, -Infinity], End: [0, Infinity] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const visible = heatCells().filter(item => !item.hidden);
    const byPosition = new Map(visible.map(item => [`${item.dataset.heatRow}:${item.dataset.heatCol}`, item]));
    let row = Number(cell.dataset.heatRow);
    let col = Number(cell.dataset.heatCol);
    if (move[0]) {
      const rows = [...new Set(visible.map(item => Number(item.dataset.heatRow)))].sort((left, right) => left - right);
      const next = rows[rows.indexOf(row) + move[0]];
      if (next === undefined) return;
      row = next;
    } else {
      const last = Math.max(...visible.map(item => Number(item.dataset.heatCol)));
      col = Math.min(last, Math.max(0, col + move[1]));
    }
    byPosition.get(`${row}:${col}`)?.focus();
  });
  heatDetail?.addEventListener('click', event => {
    if (!event.target.closest?.('[data-smart-heat-clear]')) return;
    const previous = state.heat;
    setHeat('');
    const cell = previous && heatCells().find(item => item.dataset.heatTopic === previous.topicId && Number(item.dataset.heatWeek) === previous.weekStart);
    cell?.focus();
  });

  // The region heatmap is a grid of buttons with a roving tab stop and arrow-key navigation.
  const regionHeat = root.querySelector('[data-smart-region-heatmap]');
  regionHeat?.addEventListener('focusin', event => {
    const cell = event.target.closest?.('.smx-heat-cell');
    if (!cell) return;
    regionHeat.querySelectorAll('.smx-heat-cell').forEach(item => { item.tabIndex = -1; });
    cell.tabIndex = 0;
  });
  regionHeat?.addEventListener('keydown', event => {
    const cell = event.target.closest?.('.smx-heat-cell');
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (!cell || !moves[event.key]) return;
    event.preventDefault();
    const row = Number(cell.dataset.row) + moves[event.key][0];
    const col = Number(cell.dataset.col) + moves[event.key][1];
    regionHeat.querySelector(`.smx-heat-cell[data-row="${row}"][data-col="${col}"]`)?.focus();
  });

  root.querySelector('[data-smart-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    state.topics = new Set([...topicControls.querySelectorAll('input:checked')].map(input => input.value));
    render();
  });
  root.querySelector('[data-smart-clear]')?.addEventListener('click', () => {
    topicControls.querySelectorAll('input').forEach(input => { input.checked = false; });
    state.topics.clear(); state.themes.clear(); state.geography = 'all'; syncThemeControls(); render();
  });
  await render();
  // Periodically refresh the same governed sources. No parallel publication pipeline.
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const live = await Promise.resolve(fetchImpl(`${origin}${LIVE_PATH}`, { cache: 'no-store', headers: { accept: 'application/json' } })
        .then(async response => { if (!response.ok) throw new Error('LIVE_UNAVAILABLE'); return response.json(); }))
        .then(value => ({status:'fulfilled',value}), reason => ({status:'rejected',reason}));
      if (live.status === 'fulfilled') liveRecords = normalizeLiveAlerts(live.value, records);
      // Only transient failures are retried; a subscription denial is kept for the session.
      clearTransientTopicIntel();
      await render(cardsOffset);
    } finally { refreshing = false; }
  };
  if (typeof global.setInterval === 'function') global.setInterval(() => { void refresh(); }, 10 * 60 * 1000);
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
    void initializeSmartIntelligence();
  }); else void initializeSmartIntelligence();
}
