// Presentation layer for the M39 premium Smart Intelligence dashboard.
// Pure and deterministic: no network, clock, storage or DOM access. Every figure is derived from
// records already normalised by smart-intelligence.mjs, so charts can never show invented values.
import { classifyTopicIds } from './gpir-topic-intelligence.mjs';

export const DAY = 86400000;

// One centralised presentation mapping. Each theme reuses existing GPIR taxonomy ids wherever an
// equivalent exists; only AI, Agentic and Web3 need language patterns because the shared taxonomy
// has no equivalent. Those three additionally require explicit payments / money-movement context.
const PAYMENTS_CONTEXT = /\b(payments?|settlement|remittances?|money movement|money transfer|banking|banks?|financial services|financial institutions?|card|cards|wallets?|clearing|fintech|acquir\w+|merchant|checkout|payouts?)\b/;

const channel = (hex, index) => {
  const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = hex => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
// Text colour for the dense heatmap cells: whichever of white or navy contrasts better with the tint.
function inkFor(color) {
  const mixed = '#' + [0, 1, 2].map(index => Math.round(parseInt(color.slice(1 + index * 2, 3 + index * 2), 16) * 0.8 + 255 * 0.2).toString(16).padStart(2, '0')).join('');
  const contrast = other => (Math.max(luminance(mixed), luminance(other)) + 0.05) / (Math.min(luminance(mixed), luminance(other)) + 0.05);
  return contrast('#ffffff') >= contrast('#0b1b30') ? '#ffffff' : '#0b1b30';
}

const THEME_DEFINITIONS = Object.freeze([
  { id: 'cross-border', label: 'Cross-Border Payments & Remittances', short: 'Cross-Border', color: '#0e7c86', taxonomy: ['cross-border', 'remittances'] },
  { id: 'real-time', label: 'Real-Time & Instant Payments', short: 'Real-Time', color: '#2563c9', taxonomy: ['real-time'] },
  { id: 'infrastructure', label: 'Payment Infrastructure & Interoperability', short: 'Infrastructure', color: '#4a6fa5', taxonomy: ['infrastructure', 'payment-gateways'],
    pattern: /\binteroperab\w*|\biso 20022\b|\bpayment rails?\b|\bopen banking\b/ },
  { id: 'ai', label: 'AI in Payments', short: 'AI', color: '#7c3aed', requiresPayments: true,
    pattern: /\bartificial intelligence\b|\bmachine learning\b|\bgenerative ai\b|\blarge language models?\b|\bllms?\b|\bai[- ](?:powered|driven|based|enabled|model|models|assistant|assistants)\b|\bai\b/ },
  { id: 'agentic', label: 'Agentic Payments', short: 'Agentic', color: '#4338ca', requiresPayments: true,
    pattern: /\bagentic\b|\bai agents?\b|\bautonomous agents?\b|\bagent-to-agent\b|\bmachine payments?\b/ },
  { id: 'web3', label: 'Web3 & Blockchain in Payments', short: 'Web3', color: '#a21caf', requiresPayments: true,
    pattern: /\bweb3\b|\bblockchain\b|\bcrypto\w*|\bdigital assets?\b|\btokeni[sz]\w*|\bdistributed ledger\b|\bdlt\b|\bsmart contracts?\b|\bon-chain\b/ },
  { id: 'aml', label: 'AML, KYC & Financial Crime Compliance', short: 'AML / KYC', color: '#d98e04', taxonomy: ['aml'] },
  { id: 'fraud', label: 'Fraud Prevention & Cybersecurity', short: 'Fraud / Cyber', color: '#c0392b', taxonomy: ['fraud'] },
  { id: 'regulatory', label: 'Regulatory Actions & Licensing', short: 'Regulatory', color: '#b8913a', taxonomy: ['regulatory', 'licences', 'payments-licensing', 'fintech-licensing'] },
  { id: 'cbdc', label: 'CBDCs, Digital Money & Stablecoins', short: 'CBDC / Digital Money', color: '#2bb5ab', taxonomy: ['cbdc'],
    pattern: /\bstablecoins?\b|\bdigital money\b|\btokeni[sz]ed deposits?\b/ },
  { id: 'wallets', label: 'Wallets & Digital Payments', short: 'Wallets', color: '#b0537f', taxonomy: ['wallets', 'super-apps'] },
  { id: 'partnerships', label: 'Strategic Partnerships & Payment Networks', short: 'Partnerships', color: '#2f9e5b', taxonomy: ['deals'] }
]);

export const PREMIUM_THEMES = Object.freeze(THEME_DEFINITIONS.map(theme => Object.freeze({ ...theme, ink: inkFor(theme.color) })));

export const OTHER_THEME = Object.freeze({ id: 'other', label: 'Other payments intelligence', short: 'Other', color: '#8a97a6' });
export const THEME_COLORS = Object.freeze(Object.fromEntries([...PREMIUM_THEMES, OTHER_THEME].map(theme => [theme.id, theme.color])));

// Most specific theme first: a record keeps one primary theme so unique counts stay additive.
const PRIMARY_ORDER = ['agentic', 'ai', 'web3', 'cbdc', 'aml', 'fraud', 'regulatory', 'real-time', 'cross-border',
  'infrastructure', 'wallets', 'partnerships'];

export function themeById(id) {
  return PREMIUM_THEMES.find(theme => theme.id === id) || (id === OTHER_THEME.id ? OTHER_THEME : null);
}

function recordText(record) {
  return [record.category, ...(record.topics || []), ...(record.keywords || []), record.title, record.summary]
    .filter(Boolean).join(' ').toLowerCase();
}

export function classifyThemeIds(record) {
  const taxonomy = new Set(record.topicIds || classifyTopicIds(record));
  const text = recordText(record);
  const contextual = PAYMENTS_CONTEXT.test(text);
  return PREMIUM_THEMES.filter(theme => {
    if (theme.taxonomy?.some(id => taxonomy.has(id))) return true;
    if (!theme.pattern || (theme.requiresPayments && !contextual)) return false;
    return theme.pattern.test(text);
  }).map(theme => theme.id);
}

export function primaryThemeId(record) {
  const ids = record.themeIds || classifyThemeIds(record);
  return PRIMARY_ORDER.find(id => ids.includes(id)) || OTHER_THEME.id;
}

// Software repository history and statistical series are reference data, never premium news.
export function referenceClass(record) {
  if (!record) return null;
  if (record.dataClass === 'STATISTICAL_REFERENCE') return 'statistical';
  let host = '';
  try { host = new URL(record.url).hostname; } catch {}
  if (record.dataClass === 'TECHNICAL_REFERENCE' || /^(SOFTWARE_RELEASE|SPECIFICATION_CHANGE|REPOSITORY_COMMIT)$/.test(record.recordType || '')
    || host === 'github.com' || /\b(hyperswitch|juspay)\b/i.test(`${record.product || ''} ${record.repository || ''}`)) return 'technical';
  return null;
}

export function isExecutiveEligible(record) {
  return Boolean(record) && referenceClass(record) === null;
}

// A zero preceding count never produces a percentage.
export function compareCounts(current, previous) {
  const delta = current - previous;
  const deltaLabel = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0';
  if (!current && !previous) return { label: 'No activity', direction: 'flat', delta, deltaLabel, isNew: false };
  if (!previous) return { label: 'New', direction: 'up', delta, deltaLabel, isNew: true };
  if (!delta) return { label: 'No change', direction: 'flat', delta, deltaLabel, isNew: false };
  const percent = Math.round((delta / previous) * 100);
  const magnitude = percent === 0 ? '<1%' : `${Math.abs(percent)}%`;
  return { label: `${delta > 0 ? '+' : '−'}${magnitude} vs prior`, direction: delta > 0 ? 'up' : 'down', delta, deltaLabel, isNew: false };
}

export function utcWeekStart(timestamp) {
  const date = new Date(timestamp);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return start - ((new Date(start).getUTCDay() + 6) % 7) * DAY;
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const isoDay = timestamp => new Date(timestamp).toISOString().slice(0, 10);

function inWeek(record, week) {
  const time = Date.parse(record.publishedAt);
  return time >= week && time < week + 7 * DAY;
}

export function buildWeeklyActivity(records, now, weeks = 8) {
  const last = utcWeekStart(now);
  const series = Array.from({ length: weeks }, (_, index) => {
    const start = last - (weeks - 1 - index) * 7 * DAY;
    const count = records.filter(record => inWeek(record, start)).length;
    return { start, end: start + 6 * DAY, label: SHORT_DATE.format(new Date(start)), count, inProgress: start + 7 * DAY > now };
  });
  return { weeks: series, total: series.reduce((sum, week) => sum + week.count, 0), max: Math.max(0, ...series.map(week => week.count)) };
}

export function buildThemeWeekly(records, themeId, now, weeks = 8) {
  const last = utcWeekStart(now);
  return Array.from({ length: weeks }, (_, index) => {
    const start = last - (weeks - 1 - index) * 7 * DAY;
    return records.filter(record => inWeek(record, start) && record.themeIds.includes(themeId)).length;
  });
}

export function buildThemeMomentum(current, previous) {
  return PREMIUM_THEMES.map(theme => {
    const now = current.filter(record => record.themeIds.includes(theme.id));
    const before = previous.filter(record => record.themeIds.includes(theme.id));
    const change = compareCounts(now.length, before.length);
    return { id: theme.id, label: theme.label, short: theme.short, color: theme.color, current: now.length, previous: before.length,
      change, sources: new Set(now.map(record => record.sourceName).filter(Boolean)).size };
  });
}

// Unique records are counted once under their primary theme; overlapping classifications are
// reported separately so the two views are never confused.
export function buildThemeDistribution(records) {
  const counts = new Map();
  let classifications = 0;
  for (const record of records) {
    classifications += record.themeIds.length;
    const id = primaryThemeId(record);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const slices = [...PREMIUM_THEMES, OTHER_THEME].filter(theme => counts.get(theme.id))
    .map(theme => ({ id: theme.id, label: theme.label, short: theme.short, color: theme.color, count: counts.get(theme.id) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  return { unique: records.length, classifications, slices };
}

export const REGION_LABELS = Object.freeze({
  global: 'Global', apac: 'Asia Pacific', europe: 'Europe', americas: 'Americas', mea: 'Middle East & Africa', unclassified: 'Other regions'
});
const GLOBAL_SCOPE = new Set(['', 'global', 'worldwide', 'international', 'multiple']);
export const REGION_FILTER_KEYS = Object.freeze(['global', 'apac', 'europe', 'americas', 'mea']);

export function hasGeographyMetadata(record) {
  return Boolean(record.country || record.region || record.geography);
}

// Only records carrying governed geographic metadata contribute; the rest are reported, not guessed.
export function buildGeographyCoverage(records) {
  const attributed = records.filter(hasGeographyMetadata);
  const regions = new Map();
  const countries = new Map();
  for (const record of attributed) {
    regions.set(record.regionKey, (regions.get(record.regionKey) || 0) + 1);
    const country = record.country;
    if (country && !GLOBAL_SCOPE.has(country.toLowerCase())) countries.set(country, (countries.get(country) || 0) + 1);
  }
  const sort = (left, right) => right.count - left.count || left.label.localeCompare(right.label);
  return {
    total: records.length, attributed: attributed.length, unattributed: records.length - attributed.length,
    regions: [...regions].map(([key, count]) => ({ key, label: REGION_LABELS[key] || key, count })).sort(sort),
    countries: [...countries].map(([label, count]) => ({ key: label, label, count })).sort(sort)
  };
}

export function buildExecutiveSummary({ current, previous, scope, geography, liveCount, now }) {
  const share = (ids, list) => list.filter(record => ids.some(id => record.themeIds.includes(id))).length;
  const sources = new Set(current.map(record => record.sourceName).filter(Boolean));
  const sourceCounts = new Map();
  for (const record of current) sourceCounts.set(record.sourceName, (sourceCounts.get(record.sourceName) || 0) + 1);
  const topSource = Math.max(0, ...sourceCounts.values());
  const spark = ids => {
    const last = utcWeekStart(now);
    return Array.from({ length: 8 }, (_, index) => {
      const start = last - (7 - index) * 7 * DAY;
      return scope.filter(record => inWeek(record, start) && (!ids || ids.some(id => record.themeIds.includes(id)))).length;
    });
  };
  const themed = (id, label, themeId) => {
    const value = share([themeId], current);
    return { id, label, value, change: compareCounts(value, share([themeId], previous)), ring: { numerator: value, denominator: current.length },
      spark: spark([themeId]), color: THEME_COLORS[themeId], note: `${value} of ${current.length} developments` };
  };
  return [
    { id: 'developments', label: 'Verified industry developments', value: current.length, change: compareCounts(current.length, previous.length),
      ring: null, spark: spark(null), color: '#102c4b', note: 'Selected period' },
    themed('regulatory', 'Regulatory developments', 'regulatory'),
    themed('cross-border', 'Cross-border payments', 'cross-border'),
    themed('infrastructure', 'Payments infrastructure', 'infrastructure'),
    { id: 'geography', label: 'Geographic coverage', value: geography.countries.length + (geography.countries.length ? 0 : geography.regions.length),
      unit: geography.countries.length ? (geography.countries.length === 1 ? 'country' : 'countries') : (geography.regions.length === 1 ? 'region' : 'regions'),
      change: null, ring: { numerator: geography.attributed, denominator: geography.total }, spark: null, color: '#0e7c86',
      note: `${geography.attributed} of ${geography.total} developments carry verified geography` },
    { id: 'sources', label: 'Source diversity', value: sources.size, unit: sources.size === 1 ? 'source' : 'sources', change: null, ring: null, spark: null, color: '#b8913a',
      note: current.length ? `Largest source: ${Math.round(topSource / current.length * 100)}% of developments` : 'No developments in selection' },
    { id: 'live', label: 'Live announcements', value: liveCount, change: null, ring: null, spark: null, color: '#c0392b', live: true,
      note: liveCount ? 'Qualifying in the governed 12-hour window' : 'None qualifying in the 12-hour window' }
  ];
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function ringSvg(numerator, denominator, color) {
  const radius = 15.9155;
  const fraction = denominator > 0 ? Math.min(1, Math.max(0, numerator / denominator)) : 0;
  const percent = Math.round(fraction * 100);
  return `<svg class="smp-ring" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><circle cx="18" cy="18" r="${radius}" fill="none" stroke="#e6e1d3" stroke-width="3.4"/>${fraction > 0 ? `<circle cx="18" cy="18" r="${radius}" fill="none" stroke="${esc(color)}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="${(fraction * 100).toFixed(2)} 100" transform="rotate(-90 18 18)"/>` : ''}<text x="18" y="21" text-anchor="middle" font-size="8.5" font-weight="700" fill="#102c4b">${percent}%</text></svg>`;
}

export function sparklineSvg(values, color) {
  if (!values?.length) return '';
  const max = Math.max(1, ...values);
  const width = 96;
  const height = 28;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - 3 - (value / max) * (height - 6)).toFixed(1)}`);
  return `<svg class="smp-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><polyline points="${points.join(' ')}" fill="none" stroke="${esc(color)}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${((values.length - 1) * step).toFixed(1)}" cy="${points.at(-1).split(',')[1]}" r="2.2" fill="${esc(color)}"/></svg>`;
}

export function kpiMarkup(item) {
  const change = item.change ? `<span class="smp-delta" data-direction="${item.change.direction}">${esc(item.change.isNew ? `New (${item.change.deltaLabel})` : item.change.label)}</span>` : '';
  const visual = item.ring ? ringSvg(item.ring.numerator, item.ring.denominator, item.color) : item.spark ? sparklineSvg(item.spark, item.color) : '';
  const spoken = `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ''}. ${item.note}.${item.change ? ` ${item.change.label}.` : ''}`;
  return `<article class="smp-kpi"${item.live ? ' data-live="true"' : ''} style="--kpi-color:${esc(item.color)}" role="group" aria-label="${esc(spoken)}"><div class="smp-kpi-head"><span class="smp-kpi-label">${esc(item.label)}</span>${visual}</div><strong>${esc(item.value)}${item.unit ? `<small>${esc(item.unit)}</small>` : ''}</strong>${change}<p>${esc(item.note)}</p></article>`;
}

export function dataTableMarkup({ caption, columns, rows, drill }) {
  const head = columns.map(column => `<th scope="col">${esc(column)}</th>`).join('') + (drill ? '<th scope="col"><span class="smp-sr">Action</span></th>' : '');
  const body = rows.map(row => `<tr>${row.cells.map((cell, index) => index === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}${drill ? `<td>${row.drill ? `<button type="button" ${row.drill}>${esc(drill)}</button>` : ''}</td>` : ''}</tr>`).join('');
  return `<table class="smp-table"><caption>${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function weeklyTable(weekly) {
  return dataTableMarkup({ caption: 'Verified industry developments by publication week (UTC)', columns: ['Week starting', 'Developments'], drill: 'Show week',
    rows: weekly.weeks.map(week => ({ cells: [`${isoDay(week.start)}${week.inProgress ? ' (in progress)' : ''}`, week.count], drill: `data-drill-week="${week.start}"` })) });
}

export function momentumTable(rows) {
  return dataTableMarkup({ caption: 'Current period versus preceding equivalent period, by theme', columns: ['Theme', 'Current', 'Preceding', 'Change'], drill: 'Filter',
    rows: rows.map(row => ({ cells: [row.label, row.current, row.previous, row.change.isNew ? `New (${row.change.deltaLabel})` : row.change.deltaLabel], drill: `data-drill-theme="${esc(row.id)}"` })) });
}

export function distributionTable(distribution) {
  return dataTableMarkup({ caption: `Unique developments by primary theme (${distribution.unique} unique; ${distribution.classifications} overlapping classifications)`,
    columns: ['Primary theme', 'Unique developments'], drill: 'Filter',
    rows: distribution.slices.map(slice => ({ cells: [slice.label, slice.count], drill: slice.id === OTHER_THEME.id ? '' : `data-drill-theme="${esc(slice.id)}"` })) });
}

export function geographyTable(geography) {
  return dataTableMarkup({ caption: `Developments with verified geography (${geography.attributed} of ${geography.total})`, columns: ['Region or country', 'Developments'], drill: 'Filter region',
    rows: [...geography.regions.map(region => ({ cells: [`Region · ${region.label}`, region.count], drill: REGION_FILTER_KEYS.includes(region.key) ? `data-drill-region="${esc(region.key)}"` : '' })),
      ...geography.countries.map(country => ({ cells: [`Country · ${country.label}`, country.count], drill: '' }))] });
}

// ECharts option builders. They contain only counts supplied by the builders above.
const AXIS_TEXT = '#4d5d6e';
const GRID_LINE = '#e6e1d3';
const baseOption = { animationDuration: 350, textStyle: { fontFamily: 'Inter, "Segoe UI", Arial, sans-serif' }, aria: { enabled: true } };

export function weeklyChartOption(weekly) {
  return {
    ...baseOption,
    grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true,
      formatter: params => `Week of ${esc(isoDay(weekly.weeks[params[0].dataIndex].start))}${weekly.weeks[params[0].dataIndex].inProgress ? ' (in progress)' : ''}<br/><b>${params[0].value}</b> verified developments` },
    xAxis: { type: 'category', data: weekly.weeks.map(week => week.label), axisLabel: { color: AXIS_TEXT, fontSize: 11 }, axisLine: { lineStyle: { color: GRID_LINE } }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, max: value => Math.max(value.max, 1), splitLine: { lineStyle: { color: GRID_LINE } }, axisLabel: { color: AXIS_TEXT, fontSize: 11 } },
    series: [{ type: 'bar', name: 'Verified developments', barMaxWidth: 34, cursor: 'pointer',
      data: weekly.weeks.map(week => ({ value: week.count, itemStyle: { color: week.inProgress ? '#c8a457' : '#102c4b', borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: 'top', color: '#102c4b', fontSize: 11, formatter: ({ value }) => value || '' },
      emphasis: { itemStyle: { color: '#b8913a' } } },
    { type: 'line', name: 'Trend', data: weekly.weeks.map(week => week.count), symbolSize: 5, lineStyle: { color: '#0e7c86', width: 2 }, itemStyle: { color: '#0e7c86' }, silent: true, tooltip: { show: false } }]
  };
}

// Rows shown in the momentum chart, bottom-to-top so the largest current count renders first.
export function orderMomentum(rows) {
  return rows.filter(row => row.current || row.previous)
    .sort((left, right) => right.current - left.current || right.previous - left.previous || left.label.localeCompare(right.label)).reverse();
}

export function geographyList(geography, mode = 'regions') {
  return (mode === 'countries' ? geography.countries : geography.regions).slice(0, 8).reverse();
}

export function momentumChartOption(rows) {
  const ordered = orderMomentum(rows);
  return {
    ...baseOption,
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: AXIS_TEXT, fontSize: 11 }, data: ['Current period', 'Preceding period'] },
    grid: { left: 8, right: 24, top: 28, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true,
      formatter: params => { const row = ordered[params[0].dataIndex]; return `<b>${esc(row.label)}</b><br/>Current: ${row.current}<br/>Preceding: ${row.previous}<br/>Change: ${esc(row.change.isNew ? `New (${row.change.deltaLabel})` : row.change.deltaLabel)}`; } },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: GRID_LINE } }, axisLabel: { color: AXIS_TEXT, fontSize: 11 } },
    yAxis: { type: 'category', data: ordered.map(row => row.short), axisLabel: { color: '#102c4b', fontSize: 11, width: 112, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { show: false } },
    series: [
      { type: 'bar', name: 'Preceding period', barMaxWidth: 9, itemStyle: { color: '#c5ccd6', borderRadius: [0, 3, 3, 0] }, cursor: 'pointer', data: ordered.map(row => row.previous), label: { show: true, position: 'right', color: '#6b7788', fontSize: 10 } },
      { type: 'bar', name: 'Current period', barMaxWidth: 11, cursor: 'pointer', data: ordered.map(row => ({ value: row.current, itemStyle: { color: row.color, borderRadius: [0, 3, 3, 0] } })), label: { show: true, position: 'right', color: '#102c4b', fontSize: 11, fontWeight: 700 } }
    ]
  };
}

export function distributionChartOption(distribution) {
  return {
    ...baseOption,
    tooltip: { trigger: 'item', confine: true, formatter: ({ data }) => `<b>${esc(data.name)}</b><br/>${data.value} unique development${data.value === 1 ? '' : 's'} (primary theme)` },
    legend: { type: 'plain', bottom: 0, itemWidth: 10, itemHeight: 10, itemGap: 10, textStyle: { color: AXIS_TEXT, fontSize: 11 } },
    title: { text: String(distribution.unique), subtext: 'unique developments', left: 'center', top: '30%', textStyle: { color: '#102c4b', fontSize: 26, fontFamily: 'Georgia, serif', fontWeight: 600 }, subtextStyle: { color: AXIS_TEXT, fontSize: 11 }, itemGap: 2 },
    series: [{ type: 'pie', radius: ['44%', '66%'], center: ['50%', '40%'], cursor: 'pointer', avoidLabelOverlap: true, minAngle: 4,
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 }, label: { show: false },
      data: distribution.slices.map(slice => ({ name: slice.short, value: slice.count, id: slice.id, itemStyle: { color: slice.color } })) }]
  };
}

export function geographyChartOption(geography, mode = 'regions') {
  const list = geographyList(geography, mode);
  return {
    ...baseOption,
    grid: { left: 8, right: 28, top: 8, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: params => `<b>${esc(list[params[0].dataIndex].label)}</b><br/>${params[0].value} verified development${params[0].value === 1 ? '' : 's'}` },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: GRID_LINE } }, axisLabel: { color: AXIS_TEXT, fontSize: 11 } },
    yAxis: { type: 'category', data: list.map(item => item.label), axisLabel: { color: '#102c4b', fontSize: 11, width: 120, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { show: false } },
    series: [{ type: 'bar', name: 'Verified developments', barMaxWidth: 16, cursor: 'pointer', data: list.map(item => ({ value: item.count, itemStyle: { color: '#0e7c86', borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: '#102c4b', fontSize: 11, fontWeight: 700 } }]
  };
}

// Smart Share: only whitelisted dashboard parameters ever leave the page; no tokens, user
// identifiers or entitlement data. Recipients still sign in with a free reader account.
export function buildShareUrl(locationHref, state) {
  const source = new URL(locationHref);
  const url = new URL(`${source.origin}${source.pathname}`);
  url.searchParams.set('period', state.period);
  url.searchParams.set('geo', state.geography);
  if (state.themes?.size) url.searchParams.set('themes', [...state.themes].join(','));
  if (state.topics?.size) url.searchParams.set('topics', [...state.topics].join(','));
  if (state.period === 'CUSTOM') { url.searchParams.set('from', state.customStart); url.searchParams.set('to', state.customEnd); }
  return url.toString();
}

export function buildItemShare(record) {
  return { title: record.title, text: `${record.title} — ${record.sourceName}, ${isoDay(Date.parse(record.publishedAt))}`, url: record.url };
}

export function buildAskQuery(state, { themeLabels = [], topicLabels = [], geographyLabel = 'All geographies', record = null } = {}) {
  if (record) return `Explain this verified development: "${record.title}" (${record.sourceName}, ${isoDay(Date.parse(record.publishedAt))}) ${record.url}`;
  const labels = [...themeLabels, ...topicLabels];
  const range = state.period === 'CUSTOM' ? `${state.customStart} to ${state.customEnd}` : state.period;
  return `Show validated ${labels.length ? labels.join(', ') : 'payments intelligence'} announcements for ${geographyLabel} during ${range}`;
}

export function themeChipMarkup(theme, checked) {
  return `<label class="smp-chip" style="--theme-color:${esc(theme.color)}"><input type="checkbox" value="${esc(theme.id)}"${checked ? ' checked' : ''}><i aria-hidden="true"></i><span>${esc(theme.short)}</span></label>`;
}
