const DAY = 86400000;
const HISTORY_FLOOR = Date.parse('2026-01-01T00:00:00Z');
const INTELLIGENCE_PATH = '/functions/v1/gpir-public-intelligence?scope=history&limit=100';
const LIVE_PATH = '/functions/v1/gpir-public-alerts';
const EDITORIAL_PATH = '/assets/data/fx/editorial-public.json';
const LEGACY_PERIOD_DAYS = Object.freeze({ '7D': 7, '15D': 15, '30D': 30, '1Y': 365, MAX: null });

export const SMART_TOPICS = Object.freeze([
  { id: 'regulatory', label: 'Regulatory Actions', aliases: ['regulation','regulatory','central bank','policy','oversight','enforcement'] },
  { id: 'licences', label: 'Licences & Authorisations', aliases: ['licence','license','licensing','authorisation','authorization','approval'] },
  { id: 'cross-border', label: 'Cross-Border Payments', aliases: ['cross-border','cross border','correspondent','international payment'] },
  { id: 'real-time', label: 'Real-Time Payments', aliases: ['real-time','real time','instant payment','faster payment','rtp'] },
  { id: 'infrastructure', label: 'Payment Infrastructure', aliases: ['payment infrastructure','payment rail','settlement','clearing','payment network','payments network'] },
  { id: 'remittances', label: 'Remittances', aliases: ['remittance','diaspora','money transfer'] },
  { id: 'wallets', label: 'Wallets & Digital Payments', aliases: ['wallet','digital payment','mobile payment','embedded payment'] },
  { id: 'aml', label: 'AML, KYC & Compliance', aliases: ['aml','cft','kyc','compliance','sanction','financial crime'] },
  { id: 'fraud', label: 'Fraud & Cybersecurity', aliases: ['fraud','cyber','breach','scam','identity theft'] },
  { id: 'cbdc', label: 'CBDCs & Digital Money', aliases: ['cbdc','digital money','digital currency','tokenised deposit','tokenized deposit'] },
  { id: 'stablecoins', label: 'Stablecoins & Digital Assets', aliases: ['stablecoin','digital asset','crypto','blockchain','tokenization','tokenisation'] },
  { id: 'deals', label: 'Deals & Partnerships', aliases: ['partnership','partner with','memorandum','consortium','deal','acquisition','merger','investment'] },
  { id: 'payments', label: 'Payments', aliases: ["payment services","payments industry","payment system","cashless payments","credit transfer"] },
  { id: 'fintech', label: 'Fintech', aliases: ["fintech","financial technology"] },
  { id: 'global-regional-fintech', label: 'Global & Regional Fintech', aliases: ["global fintech","regional fintech","fintech ecosystem"] },
  { id: 'pass', label: 'PASS', aliases: ["pass platform","pass service"] },
  { id: 'taas', label: 'TaaS', aliases: ["treasury as a service","taas"] },
  { id: 'saas', label: 'SaaS', aliases: ["software as a service","saas"] },
  { id: 'caas', label: 'CaaS', aliases: ["compliance as a service","caas"] },
  { id: 'baas', label: 'BaaS', aliases: ["banking as a service","baas"] },
  { id: 'pobo', label: 'POBO', aliases: ["payment on behalf of","payments on behalf of","pobo"] },
  { id: 'cobo', label: 'COBO', aliases: ["collection on behalf of","collections on behalf of","cobo"] },
  { id: 'global-aggregators', label: 'Global Aggregators', aliases: ["global aggregator","global payment aggregator"] },
  { id: 'regional-aggregators', label: 'Regional Aggregators', aliases: ["regional aggregator","regional payment aggregator"] },
  { id: 'payments-licensing', label: 'Payments Licensing', aliases: ["payment institution licence","payment institution license","payments licensing","payment services licence","payment services license"] },
  { id: 'fintech-licensing', label: 'Fintech Licensing', aliases: ["fintech licence","fintech license","fintech licensing"] },
  { id: 'corporate-payments', label: 'Corporate Payments', aliases: ["corporate payment","business payment","b2b payment"] },
  { id: 'diaspora-payments', label: 'Diaspora Payments', aliases: ["diaspora payment","diaspora remittance"] },
  { id: 'immigrant-payments', label: 'Immigrant Payments', aliases: ["immigrant payment","immigrant remittance"] },
  { id: 'migrant-movements', label: 'Migrant International Movements', aliases: ["international migration","migrant movement","migration corridor"] },
  { id: 'money-movements', label: 'Money Movements', aliases: ["money movement","funds movement"] },
  { id: 'super-apps', label: 'Super Apps', aliases: ["super app","super-app"] },
  { id: 'bnpl', label: 'BNPL', aliases: ["buy now pay later","bnpl"] },
  { id: 'apm', label: 'Alternative Payment Methods (APM)', aliases: ["alternative payment method","apm"] },
  { id: 'cards-money-movements', label: 'Cards – Money Movements', aliases: ["card-based transfer","card to card","card payout","card payment"] },
  { id: 'payment-gateways', label: 'Payment Gateways', aliases: ["payment gateway","payment gateways"] }
]);

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
  const haystack = [
    record.category, ...(record.topics || []), ...(record.keywords || []),
    record.title, record.summary
  ].filter(Boolean).join(' ').toLowerCase();
  return SMART_TOPICS.filter(topic => topic.aliases.some(alias => haystack.includes(alias))).map(topic => topic.id);
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
      providerReleaseDate: clean(item.providerReleaseDate, 10)
    };
    record.regionKey = inferRegion(record);
    record.topicIds = classifyRecordTopics(record);
    return [record];
  }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function normalizeLiveAlerts(value, historical) {
  if (!Array.isArray(value?.alerts)) return [];
  const historyById = new Map(historical.map(record => [record.id, record]));
  return value.alerts.flatMap(item => {
    if (historyById.has(item?.id)) return [historyById.get(item.id)];
    const publishedAt = Date.parse(item?.publishedAt || item?.published_at || '');
    const title = clean(item?.title || item?.headline, 240);
    const url = safeHttps(item?.canonicalUrl || item?.canonical_url || item?.url || item?.source?.url);
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
  });
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
  const recordClass = record.dataClass === 'STATISTICAL_REFERENCE' ? 'STATISTICAL REFERENCE' : record.lifecycle;
  const dateLabel = record.observationPeriod ? `Observation ${record.observationPeriod}` : isoDay(record.publishedAt);
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
  top.innerHTML = `<p class="smi-kicker">TOP SIGNAL NOW</p><h2>${escapeHtml(record.title)}</h2><p>${escapeHtml(record.summary)}</p><div class="smi-signal-meta"><span class="smi-pill">${escapeHtml(isoDay(record.publishedAt))}</span><span class="smi-pill">${escapeHtml(record.category)}</span><span class="smi-pill">${escapeHtml(record.sourceName)}</span></div><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Open verified source</a>`;
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
    return `<article class="smi-topic-card" data-topic="${topic.id}"><header><h3>${escapeHtml(topic.label)}</h3><span class="smi-topic-count">${current.length}</span></header><p class="smi-trend" data-direction="${trend.direction}">${escapeHtml(trend.label)}</p><p>${escapeHtml(summary)}</p>${latest.length ? `<ul>${latest.map(record => `<li><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.title)}</a><small>${escapeHtml(record.sourceName)}</small></li>`).join('')}</ul>` : ''}</article>`;
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
  target.innerHTML = matches.slice(0, 4).map(record => `<a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.title)}</a>`).join(' · ');
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
    topics: new Set(initialTopics), customStart: params.get('from') || '2026-01-01',
    customEnd: params.get('to') || isoDay(now())
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
    status.textContent = `${current.length} governed signal${current.length === 1 ? '' : 's'} shown from ${records.length} eligible historical record${records.length === 1 ? '' : 's'}. Live alerts remain restricted to 12 hours.`;
    updateAskLinks(root, state);
    updateUrl(global, state);
    root.dataset.state = 'ready';
  };

  root.querySelectorAll('[data-smart-period]').forEach(button => button.addEventListener('click', () => {
    state.period = button.dataset.smartPeriod; render();
  }));
  root.querySelector('[data-smart-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    state.geography = geo.value;
    state.customStart = root.querySelector('[data-smart-start]').value || '2026-01-01';
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
