import { TOPIC_TAXONOMY, classifyTopicIds, groupRelayItems } from './gpir-topic-intelligence.mjs';

const DAY = 86400000;
const HISTORY_FLOOR = Date.parse('2024-11-08T00:00:00Z');
const INTELLIGENCE_PATH = '/functions/v1/gpir-public-intelligence?scope=history&limit=100';
const LIVE_PATH = '/functions/v1/gpir-public-alerts';
const EDITORIAL_PATH = '/assets/data/fx/editorial-public.json';
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
      product: clean(item.product, 100)
    };
    record.regionKey = inferRegion(record);
    record.topicIds = classifyRecordTopics(record);
    return [record];
  }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
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
  return records.filter(record => {
    const time = Date.parse(record.publishedAt);
    if (time < bounds.start || time >= bounds.end) return false;
    if (options.geography && options.geography !== 'all' && record.regionKey !== options.geography) return false;
    if (topicSet.size && !record.topicIds.some(topic => topicSet.has(topic))) return false;
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

function isCritical(record) {
  return /\b(critical|urgent|enforcement action|sanction|breach|cyberattack|fraud)\b/i.test(
    [record.title, record.summary, record.outcomeStatus].filter(Boolean).join(' '));
}

function comparison(current, previous) {
  if (current === previous) return { label: 'No change', direction: 'flat' };
  if (!previous) return { label: current ? `New · +${current}` : 'No activity', direction: current ? 'up' : 'flat' };
  const percent = Math.round(((current - previous) / previous) * 100);
  return { label: `${percent > 0 ? '+' : ''}${percent}% vs prior`, direction: percent > 0 ? 'up' : 'down' };
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

export function buildHeatmap(records, now = Date.now()) {
  const lastWeek = utcWeekStart(now);
  const weeks = Array.from({ length: 12 }, (_, index) => lastWeek - (11 - index) * 7 * DAY);
  const rows = SMART_TOPICS.map(topic => ({
    topic,
    counts: weeks.map(week => records.filter(record => {
      const time = Date.parse(record.publishedAt);
      return time >= week && time < week + 7 * DAY && record.topicIds.includes(topic.id);
    }).length)
  }));
  const max = Math.max(0, ...rows.flatMap(row => row.counts));
  return { weeks, rows, max };
}

function endpointOrigin(global) {
  try {
    const url = new URL(global.GPIR_SUPABASE_PUBLIC_CONFIG?.url);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') ? url.origin : null;
  } catch { return null; }
}

async function fetchHistory(fetchImpl, origin) {
  const records = [];
  for (let offset = 0; offset <= 5000; offset += 100) {
    const response = await fetchImpl(`${origin}${INTELLIGENCE_PATH}&offset=${offset}`, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('INTELLIGENCE_UNAVAILABLE');
    const payload = await response.json();
    const page = normalizeSmartRecords(payload);
    records.push(...page);
    if (records.length >= Number(payload.total || 0) || page.length < 100) return records;
  }
  throw new Error('INTELLIGENCE_PAGE_LIMIT');
}

function recordMarkup(record) {
  const geography = [record.country, record.region, record.geography].filter(Boolean).join(' · ') || 'Geography not classified';
  const recordClass = record.dataClass?.endsWith('_REFERENCE')
    ? record.dataClass.replaceAll('_', ' ') : record.lifecycle;
  const dateLabel = record.observationPeriod ? `Observation ${record.observationPeriod}` :
    record.referenceDate ? `Verified change ${record.referenceDate}` : isoDay(record.publishedAt);
  return `<article class="smi-record"><div class="smi-record-meta"><span class="smi-pill">${escapeHtml(recordClass)}</span><span class="smi-pill">${escapeHtml(record.category)}</span></div><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.summary)}</p><div class="smi-record-meta"><span>${escapeHtml(dateLabel)}</span><span>· ${escapeHtml(geography)}</span><span>· ${escapeHtml(record.sourceName)}</span></div><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Read authoritative source</a></article>`;
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
  const kicker = record.dataClass?.endsWith('_REFERENCE') ? 'TOP VERIFIED REFERENCE' : 'TOP SIGNAL NOW';
  top.innerHTML = `<p class="smi-kicker">${kicker}</p><h2>${escapeHtml(record.title)}</h2><p>${escapeHtml(record.summary)}</p><div class="smi-signal-meta"><span class="smi-pill">${escapeHtml(isoDay(record.publishedAt))}</span><span class="smi-pill">${escapeHtml(record.category)}</span><span class="smi-pill">${escapeHtml(record.sourceName)}</span></div><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Open verified source</a>`;
  const extras = records.slice(1, 4);
  supporting.innerHTML = `<p class="smi-kicker">SUPPORTING DEVELOPMENTS</p>${extras.length ? `<ol>${extras.map(item => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><small>${escapeHtml(isoDay(item.publishedAt))} · ${escapeHtml(item.sourceName)}</small></li>`).join('')}</ol>` : '<p>No additional eligible developments match this context.</p>'}`;
}

function renderKpis(root, current, previous) {
  root.querySelector('[data-smart-kpis]').innerHTML = buildDashboardMetrics(current, previous)
    .map(item => `<article class="smi-kpi" data-tone="${item.tone || 'blue'}"><strong>${item.value}</strong><span>${escapeHtml(item.label)}</span><em>${escapeHtml(item.comparison.label)}</em></article>`).join('');
}

function renderTopicCards(root, currentBase, previousBase) {
  const target = root.querySelector('[data-smart-topic-cards]');
  target.innerHTML = SMART_TOPICS.map(topic => {
    const current = currentBase.filter(record => record.topicIds.includes(topic.id));
    const previous = previousBase.filter(record => record.topicIds.includes(topic.id));
    const trend = comparison(current.length, previous.length);
    const latest = current.slice(0, 2);
    const summary = current.length
      ? `${current.length} validated signal${current.length === 1 ? '' : 's'} in the selected period. Most recent evidence is dated ${isoDay(current[0].publishedAt)}.`
      : 'No qualifying dated observation for this topic and selected context.';
    return `<article class="smi-topic-card" data-topic="${topic.id}" role="button" tabindex="0" aria-label="Show ${escapeHtml(topic.label)} intelligence"><header><h3>${escapeHtml(topic.label)}</h3><span class="smi-topic-count">${current.length}</span></header><p class="smi-trend" data-direction="${trend.direction}">${escapeHtml(trend.label)}</p><p>${escapeHtml(summary)}</p>${latest.length ? `<ul>${latest.map(record => `<li><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.title)}</a><small>${escapeHtml(record.sourceName)}</small></li>`).join('')}</ul>` : ''}</article>`;
  }).join('');
}

function renderHeatmap(root, records, now) {
  const target = root.querySelector('[data-smart-heatmap]');
  const heatmap = buildHeatmap(records, now);
  const level = count => !count || !heatmap.max ? 0 : Math.min(4, Math.ceil((count / heatmap.max) * 4));
  target.innerHTML = `<span></span>${heatmap.weeks.map(week => `<span class="smi-week">${new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(week))}</span>`).join('')}${heatmap.rows.map(row => `<span class="smi-row-label">${escapeHtml(row.topic.label)}</span>${row.counts.map((count, index) => `<span class="smi-heat-cell" data-level="${level(count)}" title="${escapeHtml(row.topic.label)} · week of ${isoDay(heatmap.weeks[index])} · ${count} qualifying signal${count === 1 ? '' : 's'}">${count || ''}</span>`).join('')}`).join('')}`;
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
    (state.geography === 'all' || record.regionKey === state.geography) &&
    (!state.topics.size || record.topicIds.some(topic => state.topics.has(topic))));
  if (!matches.length) {
    ribbon.dataset.state = 'empty';
    target.textContent = 'No verified announcements qualify for the selected topics in the preceding 12 hours.';
    return;
  }
  ribbon.dataset.state = 'ready';
  target.innerHTML = matches.slice(0, 4).map(record => `<a href="?alert=${encodeURIComponent(record.id)}" data-smart-alert-id="${escapeHtml(record.id)}">${escapeHtml(record.title)}</a>`).join(' · ');
}

function updateAskLinks(root, state) {
  const topicNames = SMART_TOPICS.filter(topic => state.topics.has(topic.id)).map(topic => topic.label);
  const geography = root.querySelector('[data-smart-geography]')?.selectedOptions?.[0]?.textContent || 'All geographies';
  const query = `Show validated ${topicNames.length ? topicNames.join(', ') : 'payments intelligence'} announcements for ${geography} during ${state.period}`;
  document.querySelectorAll('[data-smart-ask]').forEach(link => {
    link.href = `../../index.html?ask=${encodeURIComponent(query)}#gpir-search`;
  });
}

function updateUrl(global, state) {
  const url = new URL(global.location.href);
  url.searchParams.set('period', state.period);
  url.searchParams.set('geo', state.geography);
  state.topics.size ? url.searchParams.set('topics', [...state.topics].join(',')) : url.searchParams.delete('topics');
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
  const state = {
    period: ['24H','7D','30D','QTD','YTD','CUSTOM'].includes(params.get('period')) ? params.get('period') : '30D',
    geography: ['all','global','apac','europe','americas','mea'].includes(params.get('geo')) ? params.get('geo') : 'all',
    topics: new Set(initialTopics), customStart: params.get('from') || '2024-11-08',
    customEnd: params.get('to') || isoDay(now()),
    alertId: clean(params.get('alert'), 100)
  };
  const topicControls = root.querySelector('[data-smart-topic-controls]');
  topicControls.innerHTML = SMART_TOPICS.map(topic => `<label><input type="checkbox" value="${topic.id}"${state.topics.has(topic.id) ? ' checked' : ''}> ${escapeHtml(topic.label)}</label>`).join('');
  const geo = root.querySelector('[data-smart-geography]');
  geo.value = state.geography;
  root.querySelector('[data-smart-start]').value = state.customStart;
  root.querySelector('[data-smart-end]').value = state.customEnd;
  root.querySelector('[data-smart-custom]').hidden = state.period !== 'CUSTOM';

  const [historyResult, liveResult, editorialResult] = await Promise.allSettled([
    fetchHistory(fetchImpl, origin),
    fetchImpl(`${origin}${LIVE_PATH}`, { cache: 'no-store', headers: { accept: 'application/json' } }).then(async response => {
      if (!response.ok) throw new Error('LIVE_UNAVAILABLE'); return response.json();
    }),
    fetchImpl(EDITORIAL_PATH, { cache: 'no-store' }).then(async response => response.ok ? response.json() : null)
  ]);
  const status = root.querySelector('[data-smart-status]');
  if (historyResult.status !== 'fulfilled') {
    root.dataset.state = 'unavailable';
    status.textContent = 'Governed historical intelligence is temporarily unavailable. No analytical values have been inferred.';
    return false;
  }
  let records = historyResult.value;
  let liveRecords = liveResult.status === 'fulfilled' ? normalizeLiveAlerts(liveResult.value, records) : [];
  const editorial = editorialResult.status === 'fulfilled' ? normalizeEditorial(editorialResult.value) : [];

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

  const render = () => {
    const requestNow = now();
    const bounds = periodBounds(state.period, requestNow, state.customStart, state.customEnd);
    const current = filterSmartRecords(records, { bounds, geography: state.geography, topics: [...state.topics] });
    const previousBounds = { start: bounds.previousStart, end: bounds.previousEnd };
    const previous = filterSmartRecords(records, { bounds: previousBounds, geography: state.geography, topics: [...state.topics] });
    const baseCurrent = filterSmartRecords(records, { bounds, geography: state.geography, topics: [] });
    const basePrevious = filterSmartRecords(records, { bounds: previousBounds, geography: state.geography, topics: [] });
    const historicalContext = records.filter(record => state.geography === 'all' || record.regionKey === state.geography);
    root.querySelectorAll('[data-smart-period]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.smartPeriod === state.period)));
    root.querySelector('[data-smart-custom]').hidden = state.period !== 'CUSTOM';
    root.querySelector('[data-smart-asof]').textContent = `As of ${new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(requestNow))} UTC`;
    renderLive(root, liveRecords, state, requestNow);
    renderAlertFocus(root, liveRecords, records, state, requestNow, topicIntel.get(state.alertId));
    loadTopicIntelligence(state.alertId);
    renderTopSignal(root, current);
    renderKpis(root, current, previous);
    renderTopicCards(root, baseCurrent, basePrevious);
    renderHeatmap(root, historicalContext, requestNow);
    const results = root.querySelector('[data-smart-results]');
    results.innerHTML = current.length ? current.map(recordMarkup).join('') :
      '<div class="smi-empty"><strong>No validated records match this context.</strong><p>Broaden the filters or period. No sample signal, KPI or market-impact conclusion has been substituted.</p></div>';
    const subject = clean(params.get('subject'), 20).toUpperCase();
    const related = /^[A-Z]{3}\/[A-Z]{3}$/.test(subject) ? editorial.filter(item => item.pair === subject) : [];
    const editorialTarget = root.querySelector('[data-smart-editorial]');
    editorialTarget.hidden = !related.length;
    editorialTarget.innerHTML = related.length ? `<p class="smi-kicker">PUBLISHED CONTENTFUL RESEARCH</p>${related.map(item => `<article><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><a href="${escapeHtml(item.url)}">Read Published Research</a></article>`).join('')}` : '';
    status.textContent = `${current.length} governed signal${current.length === 1 ? '' : 's'} shown from ${records.length} verified historical record${records.length === 1 ? '' : 's'}. Live alerts remain restricted to 12 hours.`;
    updateAskLinks(root, state);
    updateUrl(global, state);
    root.dataset.state = 'ready';
  };

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

  // Topic cards are selection controls; source links remain independently navigable.
  const cards = root.querySelector('[data-smart-topic-cards]');
  const selectTopicCard = (event) => {
    if (event.target.closest('a')) return;
    const card = event.target.closest('[data-topic]');
    if (!card || !cards.contains(card)) return;
    state.topics = new Set([card.dataset.topic]);
    topicControls.querySelectorAll('input').forEach(input => { input.checked = state.topics.has(input.value); });
    render();
    root.querySelector('[data-smart-results]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  cards?.addEventListener('click', selectTopicCard);
  cards?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!event.target.matches('[data-topic]')) return;
    event.preventDefault(); selectTopicCard(event);
  });

  root.querySelectorAll('[data-smart-period]').forEach(button => button.addEventListener('click', () => {
    state.period = button.dataset.smartPeriod; render();
  }));
  root.querySelector('[data-smart-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    state.geography = geo.value;
    state.customStart = root.querySelector('[data-smart-start]').value || '2024-11-08';
    state.customEnd = root.querySelector('[data-smart-end]').value || isoDay(now());
    state.topics = new Set([...topicControls.querySelectorAll('input:checked')].map(input => input.value));
    render();
  });
  root.querySelector('[data-smart-clear]')?.addEventListener('click', () => {
    topicControls.querySelectorAll('input').forEach(input => { input.checked = false; });
    state.topics.clear(); render();
  });
  render();
  // Periodically refresh the same governed sources. No parallel publication pipeline.
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const [historical, live] = await Promise.allSettled([
        fetchHistory(fetchImpl, origin),
        fetchImpl(`${origin}${LIVE_PATH}`, { cache: 'no-store', headers: { accept: 'application/json' } })
          .then(async response => { if (!response.ok) throw new Error('LIVE_UNAVAILABLE'); return response.json(); })
      ]);
      if (historical.status === 'fulfilled') records = historical.value;
      if (live.status === 'fulfilled') liveRecords = normalizeLiveAlerts(live.value, records);
      // Only transient failures are retried; a subscription denial is kept for the session.
      clearTransientTopicIntel();
      render();
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
