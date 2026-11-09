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
  { id: 'cross-border', label: 'Cross-Border Payments & Remittances', short: 'Cross-Border Payments', color: '#2f7fb5', taxonomy: ['cross-border', 'remittances'] },
  { id: 'real-time', label: 'Real-Time & Instant Payments', short: 'Real-Time Payments', color: '#0c8db3', taxonomy: ['real-time'] },
  { id: 'infrastructure', label: 'Payment Infrastructure & Interoperability', short: 'Payments Infrastructure', color: '#2f9e6b', taxonomy: ['infrastructure', 'payment-gateways'],
    pattern: /\binteroperab\w*|\biso 20022\b|\bpayment rails?\b|\bopen banking\b/ },
  { id: 'ai', label: 'AI in Payments', short: 'AI in Payments', color: '#0f9d8a', requiresPayments: true,
    pattern: /\bartificial intelligence\b|\bmachine learning\b|\bgenerative ai\b|\blarge language models?\b|\bllms?\b|\bai[- ](?:powered|driven|based|enabled|model|models|assistant|assistants)\b|\bai\b/ },
  { id: 'agentic', label: 'Agentic Commerce', short: 'Agentic Commerce', color: '#f0613f', requiresPayments: true,
    pattern: /\bagentic\b|\bai agents?\b|\bautonomous agents?\b|\bagent-to-agent\b|\bmachine payments?\b/ },
  { id: 'web3', label: 'Web3 Payments', short: 'Web3 Payments', color: '#8b5cf6', requiresPayments: true,
    pattern: /\bweb3\b|\bblockchain\b|\bcrypto\w*|\bdigital assets?\b|\btokeni[sz]\w*|\bdistributed ledger\b|\bdlt\b|\bsmart contracts?\b|\bon-chain\b/ },
  { id: 'aml', label: 'AML & Financial Crime', short: 'AML & Financial Crime', color: '#2f6fe0', taxonomy: ['aml'] },
  { id: 'fraud', label: 'Fraud Prevention & Cybersecurity', short: 'Fraud & Cyber', color: '#c0392b', taxonomy: ['fraud'] },
  { id: 'regulatory', label: 'Regulatory Actions & Licensing', short: 'Regulatory', color: '#a77d1f', taxonomy: ['regulatory', 'licences', 'payments-licensing', 'fintech-licensing'] },
  { id: 'cbdc', label: 'CBDCs, Digital Money & Stablecoins', short: 'CBDC & Digital Money', color: '#7a8a22', taxonomy: ['cbdc'],
    pattern: /\bstablecoins?\b|\bdigital money\b|\btokeni[sz]ed deposits?\b/ },
  { id: 'wallets', label: 'Wallets & Digital Payments', short: 'Wallets', color: '#b0537f', taxonomy: ['wallets', 'super-apps'] },
  { id: 'partnerships', label: 'Strategic Partnerships & Payment Networks', short: 'Partnerships', color: '#5d6b8a', taxonomy: ['deals'] }
]);

// The four governed themes featured in the executive KPI strip, trend, momentum and heatmap.
export const EXECUTIVE_THEME_IDS = Object.freeze(['ai', 'agentic', 'web3', 'aml']);

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
const AXIS_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
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

export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function sparklineSvg(values, color) {
  if (!values?.length) return '';
  const max = Math.max(1, ...values);
  const width = 96;
  const height = 28;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - 3 - (value / max) * (height - 6)).toFixed(1)}`);
  return `<svg class="smp-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><polyline points="${points.join(' ')}" fill="none" stroke="${esc(color)}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${((values.length - 1) * step).toFixed(1)}" cy="${points.at(-1).split(',')[1]}" r="2.2" fill="${esc(color)}"/></svg>`;
}

export function dataTableMarkup({ caption, columns, rows, drill }) {
  const head = columns.map(column => `<th scope="col">${esc(column)}</th>`).join('') + (drill ? '<th scope="col"><span class="smp-sr">Action</span></th>' : '');
  const body = rows.map(row => `<tr>${row.cells.map((cell, index) => index === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}${drill ? `<td>${row.drill ? `<button type="button" ${row.drill}>${esc(drill)}</button>` : ''}</td>` : ''}</tr>`).join('');
  return `<table class="smp-table"><caption>${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function trendTable(trend) {
  return dataTableMarkup({ caption: 'Verified developments per week for the featured themes (UTC weeks; themes overlap)', columns: ['Week starting', ...trend.series.map(series => series.label)], drill: 'Show week',
    rows: trend.weeks.map((week, index) => ({ cells: [`${isoDay(week.start)}${week.inProgress ? ' (in progress)' : ''}`, ...trend.series.map(series => series.data[index])], drill: `data-drill-week="${week.start}"` })) });
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

export function geographyTable(regional, coverage) {
  return dataTableMarkup({ caption: `Developments with verified geography (${regional.mapped} of ${regional.total} map to a region)`, columns: ['Region or country', 'Developments'], drill: 'Filter region',
    rows: [...regional.regions.map(region => ({ cells: [`Region · ${region.label}`, region.count], drill: `data-drill-region="${esc(region.key)}"` })),
      ...coverage.countries.map(country => ({ cells: [`Country · ${country.label}`, country.count], drill: '' }))] });
}

export function heatmapTable(matrix) {
  return dataTableMarkup({ caption: 'Relative activity: verified developments by featured theme and region', columns: ['Theme', ...matrix.regions.map(region => region.label)], drill: '',
    rows: matrix.themes.map((theme, row) => ({ cells: [theme.label, ...matrix.cells[row].map(cell => cell.count)] })) });
}

// Executive regions. The display region comes only from governed country, region and geography
// metadata; aggregate scopes such as "Americas" or "Middle East & Africa" are never split by guesswork.
export const DISPLAY_REGIONS = Object.freeze([
  { key: 'na', label: 'North America', short: 'NA', color: '#2563c9', anchor: [-100, 43], offset: [-54, -14] },
  { key: 'europe', label: 'Europe', short: 'EU', color: '#7c4dcc', anchor: [14, 52], offset: [8, -27] },
  { key: 'apac', label: 'APAC', short: 'APAC', color: '#0f9d8a', anchor: [112, 32], offset: [52, -4] },
  { key: 'gcc', label: 'GCC / ME', short: 'GCC', color: '#d98e04', anchor: [48, 25], offset: [46, 29] },
  { key: 'latam', label: 'Latin America', short: 'LATAM', color: '#d9433f', anchor: [-62, -14], offset: [-54, 4] },
  { key: 'afr', label: 'Africa', short: 'AFR', color: '#2f9e6b', anchor: [22, 2], offset: [-10, 30] }
]);
export const SUBREGION_KEYS = Object.freeze(DISPLAY_REGIONS.map(region => region.key));
export const GEOGRAPHY_FILTER_KEYS = Object.freeze(['all', 'global', 'apac', 'europe', 'americas', 'mea', 'na', 'latam', 'gcc', 'afr']);

const AGGREGATE_SCOPE = /\b(emea|middle east\s*(?:&|and)\s*africa|the americas|americas|global|worldwide|international)\b/;
const REGION_PATTERNS = Object.freeze([
  ['na', /\b(united states|usa|u\.s\.a?\.?|canada|north america)\b|\bus\b/],
  ['latam', /\b(latin america|latam|caribbean|south america|central america|brazil|mexico|argentina|chile|colombia|peru|uruguay)\b/],
  ['gcc', /\b(gcc|gulf|middle east|mena|uae|emirates|saudi|qatar|bahrain|oman|kuwait)\b/],
  ['afr', /\b(africa|nigeria|kenya|ghana|egypt|morocco|tanzania|uganda|ethiopia|rwanda|senegal|south africa)\b/],
  ['europe', /\b(europe|european|united kingdom|uk|germany|france|sepa|eu|italy|spain|netherlands|switzerland|ireland|sweden|poland)\b/],
  ['apac', /\b(apac|asia|pacific|singapore|india|japan|china|australia|new zealand|malaysia|thailand|indonesia|philippines|hong kong|korea|vietnam|pakistan|bangladesh|sri lanka|maldives)\b/]
]);

function matchRegion(text) {
  const lower = String(text || '').toLowerCase();
  return lower ? REGION_PATTERNS.find(([, pattern]) => pattern.test(lower))?.[0] || null : null;
}

export function classifyDisplayRegion(record) {
  const byCountry = matchRegion(record.country);
  if (byCountry) return byCountry;
  const scope = [record.geography, record.region].filter(Boolean).join(' ').toLowerCase();
  return AGGREGATE_SCOPE.test(scope) ? null : matchRegion(scope);
}

export function matchesGeography(record, key) {
  if (!key || key === 'all') return true;
  return SUBREGION_KEYS.includes(key) ? classifyDisplayRegion(record) === key : record.regionKey === key;
}

// Share of the developments that map to a verified display region. Unmapped records are reported, not guessed.
export function buildRegionalActivity(records) {
  const counts = new Map();
  let mapped = 0;
  for (const record of records) {
    const key = classifyDisplayRegion(record);
    if (!key) continue;
    mapped += 1;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const regions = DISPLAY_REGIONS.map(region => {
    const count = counts.get(region.key) || 0;
    return { ...region, count, share: mapped ? count / mapped : 0, percent: mapped ? Math.round(count / mapped * 100) : 0 };
  });
  return { total: records.length, mapped, unmapped: records.length - mapped, regions };
}

export function buildRegionThemeMatrix(records, themeIds = EXECUTIVE_THEME_IDS) {
  const themes = themeIds.map(id => themeById(id));
  const regionOf = new Map(records.map(record => [record, classifyDisplayRegion(record)]));
  const cells = themes.map(theme => DISPLAY_REGIONS.map(region => ({
    themeId: theme.id, regionKey: region.key,
    count: records.filter(record => regionOf.get(record) === region.key && record.themeIds.includes(theme.id)).length
  })));
  const max = Math.max(0, ...cells.flat().map(cell => cell.count));
  return { themes, regions: DISPLAY_REGIONS, cells, max, mapped: [...regionOf.values()].filter(Boolean).length };
}

export function buildTrendByTheme(records, now, themeIds = EXECUTIVE_THEME_IDS, weeks = 8) {
  const last = utcWeekStart(now);
  const axis = Array.from({ length: weeks }, (_, index) => {
    const start = last - (weeks - 1 - index) * 7 * DAY;
    return { start, short: `W${index + 1}`, date: AXIS_DATE.format(new Date(start)), inProgress: start + 7 * DAY > now };
  });
  const series = themeIds.map(id => {
    const theme = themeById(id);
    return { id, label: theme.short, color: theme.color, data: buildThemeWeekly(records, id, now, weeks) };
  });
  return { weeks: axis, series, max: Math.max(0, ...series.flatMap(item => item.data)), total: series.reduce((sum, item) => sum + item.data.reduce((a, b) => a + b, 0), 0) };
}

// Featured themes are listed individually; every other primary theme is grouped so the ring stays readable.
export function buildExecutiveDonut(distribution, themeIds = EXECUTIVE_THEME_IDS) {
  const byId = new Map(distribution.slices.map(slice => [slice.id, slice]));
  const featured = themeIds.map(id => {
    const theme = themeById(id);
    return { id, label: theme.short, color: theme.color, count: byId.get(id)?.count || 0 };
  });
  const other = distribution.unique - featured.reduce((sum, slice) => sum + slice.count, 0);
  const slices = [...featured, ...(other > 0 ? [{ id: 'other-themes', label: 'Other themes', color: '#9aa7b6', count: other }] : [])]
    .map(slice => ({ ...slice, percent: distribution.unique ? Math.round(slice.count / distribution.unique * 100) : 0 }));
  return { unique: distribution.unique, slices };
}

export function priorPeriodLabel(period) {
  return ({ '24H': 'vs. prior 24 hours', '7D': 'vs. prior 7 days', '30D': 'vs. prior 30 days', '8W': 'vs. prior 8 weeks' })[period] || 'vs. preceding period';
}

export function periodLabel(period) {
  return ({ '24H': 'Last 24 hours', '7D': 'Last 7 days', '30D': 'Last 30 days', '8W': 'Last 8 weeks', QTD: 'Quarter to date', YTD: 'Year to date', CUSTOM: 'Custom range' })[period] || period;
}

// A percentage is shown only when the preceding count is non-zero.
export function deltaBadge(change) {
  if (!change) return null;
  if (change.isNew) return { text: 'New', direction: 'up' };
  if (change.direction === 'flat') return { text: change.label === 'No activity' ? '—' : '0%', direction: 'flat' };
  const parts = /^([+−])(<1%|\d+%)/.exec(change.label);
  return { text: parts ? `${parts[1]}${parts[2]}` : change.deltaLabel, direction: change.direction };
}

export function buildExecutiveKpis({ scoped, previous, current, previousCurrent, themeIds = EXECUTIVE_THEME_IDS }) {
  const count = (list, id) => list.filter(record => record.themeIds.includes(id)).length;
  const themes = themeIds.map(id => {
    const theme = themeById(id);
    const value = count(scoped, id);
    return { id, label: theme.label, color: theme.color, icon: id, value, previous: count(previous, id), change: compareCounts(value, count(previous, id)) };
  });
  const total = { id: 'total', label: 'Verified Developments', color: '#b8913a', icon: 'pulse', value: current.length, previous: previousCurrent.length,
    change: compareCounts(current.length, previousCurrent.length) };
  return { themes, total };
}

// Executive Summary sentences are assembled from computed figures only; they never assert more than the counts show.
export function buildSummaryPoints({ kpis, regional, current, scoped, period }) {
  const points = [];
  const featured = kpis.themes;
  const prior = priorPeriodLabel(period).replace('vs. ', '');
  const leader = [...featured].sort((left, right) => right.value - left.value)[0];
  if (leader?.value) {
    const badge = deltaBadge(leader.change);
    points.push(`${leader.label} leads with ${leader.value} of ${scoped.length} verified developments${badge && badge.direction !== 'flat' ? ` (${badge.text} vs. ${prior})` : ''}.`);
  } else points.push('No verified development in this selection matches the four featured themes.');
  const growers = featured.filter(item => item.previous > 0 && item.value > item.previous)
    .sort((left, right) => (right.value / right.previous) - (left.value / left.previous));
  const fresh = featured.filter(item => item.previous === 0 && item.value > 0);
  if (growers.length) points.push(`${growers[0].label} grows fastest: ${growers[0].value} vs. ${growers[0].previous} in the ${prior} (${deltaBadge(growers[0].change).text}).`);
  else if (fresh.length) points.push(`${fresh[0].label} is new: ${fresh[0].value} verified development${fresh[0].value === 1 ? '' : 's'}, none in the ${prior}.`);
  else points.push(`No featured theme grew compared with the ${prior}.`);
  const top = [...regional.regions].sort((left, right) => right.count - left.count)[0];
  if (top?.count) points.push(`${top.label} has the largest regional share: ${top.percent}% of ${regional.mapped} geo-verified developments.`);
  else points.push('Too few developments carry verified geography to compare regions.');
  const latest = current[0];
  points.push(latest ? `Latest: ${latest.title.length > 38 ? `${latest.title.slice(0, 35)}…` : latest.title} (${latest.sourceName}, ${isoDay(Date.parse(latest.publishedAt))}).`
    : 'No verified development is available for the selected period.');
  return points;
}

// Key developments: the newest record of each distinct primary theme first, then the next newest, shown oldest to newest.
export function buildTimelineEvents(records, limit = 5) {
  const seen = new Set();
  const key = [];
  for (const record of records) {
    const theme = primaryThemeId(record);
    if (key.length < limit && !seen.has(theme)) { seen.add(theme); key.push(record); }
  }
  for (const record of records) if (key.length < limit && !key.includes(record)) key.push(record);
  return key.sort((left, right) => left.publishedAt.localeCompare(right.publishedAt)).map(record => {
    const theme = themeById(primaryThemeId(record));
    const date = new Date(record.publishedAt);
    return { id: record.id, title: record.title, url: record.url, sourceName: record.sourceName, publishedAt: record.publishedAt,
      month: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date).toUpperCase(), day: String(date.getUTCDate()).padStart(2, '0'),
      themeId: theme.id, themeLabel: theme.short, color: theme.color };
  });
}

// Green (lower activity) through yellow to red (higher activity). Zero is a distinct neutral tone.
export function heatColor(ratio) {
  if (!(ratio > 0)) return '#edf0e8';
  const stops = [[0, [143, 209, 140]], [0.5, [247, 226, 122]], [0.78, [247, 164, 96]], [1, [236, 82, 78]]];
  const clamped = Math.min(1, ratio);
  const upper = stops.findIndex(([at]) => at >= clamped);
  const [fromAt, from] = stops[Math.max(0, upper - 1)];
  const [toAt, to] = stops[Math.max(1, upper)];
  const t = toAt === fromAt ? 0 : (clamped - fromAt) / (toAt - fromAt);
  return `#${from.map((value, index) => Math.round(value + (to[index] - value) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, '0')).join('')}`;
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
