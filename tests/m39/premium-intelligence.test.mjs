import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TOPIC_TAXONOMY } from '../../assets/js/gpir-topic-intelligence.mjs';
import { eligibleLiveRecords, filterSmartRecords, normalizeSmartRecords, periodBounds } from '../../assets/js/smart-intelligence.mjs';
import {
  EXECUTIVE_THEME_IDS, OTHER_THEME, PREMIUM_THEMES, THEME_COLORS, buildAskQuery, buildExecutiveDonut, buildExecutiveKpis, buildGeographyCoverage, buildItemShare,
  buildRegionThemeMatrix, buildRegionalActivity, buildShareUrl, buildSummaryPoints, buildThemeDistribution, buildThemeMomentum, buildTimelineEvents,
  buildTrendByTheme, classifyDisplayRegion, classifyThemeIds, compareCounts, deltaBadge, heatColor, isExecutiveEligible, matchesGeography, primaryThemeId,
  referenceClass, trendTable
} from '../../assets/js/smart-presentation.mjs';
import {
  donutChartOption, kpiStripMarkup, mapChartOption, momentumChartOption, regionHeatmapMarkup, timelineMarkup, trendChartOption
} from '../../assets/js/smart-executive.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [page, css, charts, presentation, executive] = await Promise.all([
  read('pages/intelligence/smart.html'), read('assets/css/smart-executive.css'),
  read('assets/js/smart-charts.mjs'), read('assets/js/smart-presentation.mjs'), read('assets/js/smart-executive.mjs')]);

const NOW = Date.parse('2026-11-11T12:00:00Z');
const DAY = 86400000;
const base = { summary: 'Validated governed summary long enough to pass the normalisation checks.', category: 'Payments',
  topics: [], source: { name: 'MAS', trustTier: 'T1' }, country: 'Singapore', region: 'Asia Pacific' };
const raw = (id, title, publishedAt, extra = {}) => ({ ...base, id, title, publishedAt, canonicalUrl: `https://example.gov/${id}`, ...extra });
const normalize = items => normalizeSmartRecords({ status: 'OK', records: items });
const hyperswitch = {
  id: 'hs', title: 'Hyperswitch repository evidence', publishedAt: '2026-11-10T09:00:00Z', summary: 'Technical repository evidence for software development history.',
  canonicalUrl: 'https://github.com/juspay/hyperswitch/commit/2e1e7bd63a86e5d9b2d1f6f4bd7ce6ec4b3a6f6f', dataClass: 'TECHNICAL_REFERENCE',
  recordType: 'SPECIFICATION_CHANGE', product: 'Hyperswitch', repository: 'juspay/hyperswitch', source: { name: 'GitHub', trustTier: 'T1' }
};
const bis = {
  id: 'bis', title: 'BIS policy rate observation', publishedAt: '2026-11-09T09:00:00Z', summary: 'Authoritative BIS statistical observation, historical reference data.',
  canonicalUrl: 'https://stats.bis.org/api/v2/data/example', dataClass: 'STATISTICAL_REFERENCE', recordType: 'STATISTICAL_OBSERVATION',
  statisticalValue: 6.5, source: { name: 'BIS', trustTier: 'T1' }
};

test('the twelve premium themes use one palette, reuse existing taxonomy ids and never duplicate a classification', () => {
  assert.equal(PREMIUM_THEMES.length, 12);
  assert.equal(new Set(PREMIUM_THEMES.map(theme => theme.id)).size, 12);
  assert.equal(new Set(PREMIUM_THEMES.map(theme => theme.color)).size, 12);
  const taxonomy = new Set(TOPIC_TAXONOMY.map(topic => topic.id));
  for (const theme of PREMIUM_THEMES) {
    for (const id of theme.taxonomy || []) assert.ok(taxonomy.has(id), `${theme.id} references unknown taxonomy id ${id}`);
    assert.equal(THEME_COLORS[theme.id], theme.color);
    assert.match(theme.ink, /^#[0-9a-f]{6}$/);
  }
  assert.equal(THEME_COLORS[OTHER_THEME.id], OTHER_THEME.color);
  const colours = Object.fromEntries(PREMIUM_THEMES.map(theme => [theme.id, theme.color]));
  assert.notEqual(colours.fraud, colours.regulatory);
  assert.notEqual(colours.ai, colours.agentic);
  assert.deepEqual(EXECUTIVE_THEME_IDS, ['ai', 'agentic', 'web3', 'aml']);
  assert.deepEqual(EXECUTIVE_THEME_IDS.map(id => PREMIUM_THEMES.find(theme => theme.id === id).label),
    ['AI in Payments', 'Agentic Commerce', 'Web3 Payments', 'AML & Financial Crime']);
});

test('AI, Agentic and Web3 themes require explicit payments context and are not generic technology news', () => {
  const classify = (title, summary) => classifyThemeIds({ title, summary, category: '', topics: [], keywords: [], topicIds: [] });
  assert.ok(classify('Payment processor deploys AI model for card fraud scoring', 'Machine learning scores card transactions.').includes('ai'));
  assert.ok(classify('Bank pilots agentic payments for autonomous checkout', 'AI agents initiate payments on behalf of customers.').includes('agentic'));
  assert.ok(classify('Bank settles tokenised deposits on a blockchain ledger', 'Settlement of payments over distributed ledger technology.').includes('web3'));
  assert.deepEqual(classify('Chipmaker unveils new AI accelerator', 'The processor targets generative AI workloads in data centres.'), []);
  assert.deepEqual(classify('Gaming studio launches blockchain collectibles', 'Players trade digital collectibles.'), []);
});

test('themes reuse existing taxonomy classification and keep unique-versus-overlapping counts distinct', () => {
  const records = normalize([
    raw('a', 'Instant payment scheme goes live', '2026-11-10T09:00:00Z', { topics: ['real-time'] }),
    raw('b', 'Regulator licence for cross-border remittance provider', '2026-11-09T09:00:00Z', { topics: ['licence', 'remittance'] }),
    raw('c', 'Quarterly payments commentary', '2026-11-08T09:00:00Z')
  ]);
  assert.deepEqual(records[0].themeIds, ['real-time']);
  assert.deepEqual(records[1].themeIds.sort(), ['cross-border', 'regulatory']);
  assert.equal(primaryThemeId(records[2]), OTHER_THEME.id);
  const distribution = buildThemeDistribution(records);
  assert.equal(distribution.unique, 3);
  assert.equal(distribution.classifications, 3);
  assert.equal(distribution.slices.reduce((total, slice) => total + slice.count, 0), distribution.unique);
  const overlapping = buildThemeDistribution(normalize([raw('d', 'Licence for cross-border remittance provider', '2026-11-09T09:00:00Z', { topics: ['licence', 'remittance'] })]));
  assert.equal(overlapping.unique, 1);
  assert.equal(overlapping.classifications, 2);
});

test('Hyperswitch repository records and BIS statistics are excluded from executive intelligence but stay in the archive', () => {
  const records = normalize([
    raw('news', 'Payment network launches instant settlement service', '2026-11-10T09:00:00Z', { topics: ['real-time'] }),
    hyperswitch, { ...hyperswitch, id: 'hs-release', recordType: 'SOFTWARE_RELEASE', canonicalUrl: 'https://github.com/juspay/hyperswitch/releases/tag/v1.2.3' },
    { ...hyperswitch, id: 'hs-bare', dataClass: '', recordType: '', canonicalUrl: 'https://github.com/juspay/hyperswitch/commit/abc' }, bis
  ]);
  assert.equal(records.length, 5);
  assert.deepEqual(records.filter(isExecutiveEligible).map(record => record.id), ['news']);
  assert.equal(referenceClass(records.find(record => record.id === 'bis')), 'statistical');
  assert.equal(referenceClass(records.find(record => record.id === 'hs')), 'technical');
  assert.equal(referenceClass(records.find(record => record.id === 'hs-release')), 'technical');
  assert.equal(referenceClass(records.find(record => record.id === 'hs-bare')), 'technical');
  assert.equal(records.filter(record => !isExecutiveEligible(record)).length, 4);
});

test('genuine validated payments-industry content, including Hyperswitch company news, remains eligible', () => {
  const [funding, rails] = normalize([
    raw('funding', 'Juspay, maker of Hyperswitch, announces a partnership with a payment network', '2026-11-10T09:00:00Z', { topics: ['partnership'], canonicalUrl: 'https://www.pymnts.com/news/example' }),
    raw('infra', 'Central bank publishes payment infrastructure settlement roadmap', '2026-11-09T09:00:00Z', { topics: ['settlement'] })
  ]);
  assert.equal(isExecutiveEligible(funding), true);
  assert.equal(isExecutiveEligible(rails), true);
  assert.ok(rails.themeIds.includes('infrastructure'));
});

test('trend, momentum, KPI and summary figures equal the governed records', () => {
  const dates = ['2026-11-10', '2026-11-09', '2026-11-05', '2026-10-28', '2026-10-27', '2026-10-01', '2026-01-02'];
  const records = normalize(dates.map((date, index) => raw(`w${index}`, `Instant payment update ${index}`, `${date}T09:00:00Z`, { topics: ['real-time'] })));
  const ai = normalize([raw('ai1', 'AI model scores card payments', '2026-11-10T09:00:00Z'), raw('ai2', 'AI model for payments fraud', '2026-11-04T09:00:00Z')]);
  const trend = buildTrendByTheme([...records, ...ai], NOW);
  assert.equal(trend.weeks.length, 8);
  assert.deepEqual(trend.weeks.map(week => week.short), ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']);
  assert.match(trend.weeks[0].date, /^[A-Z][a-z]{2} \d{1,2}$/);
  assert.equal(trend.weeks.at(-1).inProgress, true);
  assert.equal(trend.weeks[0].inProgress, false);
  assert.deepEqual(trend.series.map(series => series.id), EXECUTIVE_THEME_IDS);
  const aiSeries = trend.series.find(series => series.id === 'ai');
  assert.equal(aiSeries.data.reduce((sum, value) => sum + value, 0), 2);
  assert.equal(aiSeries.data.at(-1), 1);
  const option = trendChartOption(trend);
  assert.deepEqual(option.series.map(series => series.data), trend.series.map(series => series.data));
  assert.match(trendTable(trend), /data-drill-week="/);
  const bounds = periodBounds('7D', NOW);
  const current = filterSmartRecords(records, { bounds });
  const previous = filterSmartRecords(records, { bounds: { start: bounds.previousStart, end: bounds.previousEnd } });
  const momentum = buildThemeMomentum(current, previous);
  const realTime = momentum.find(row => row.id === 'real-time');
  assert.equal(realTime.current, current.length);
  assert.equal(realTime.previous, previous.length);
  assert.deepEqual(realTime.change, compareCounts(current.length, previous.length));
  const featured = EXECUTIVE_THEME_IDS.map(id => momentum.find(row => row.id === id));
  assert.deepEqual(momentumChartOption(featured).series[0].data, featured.map(row => row.current));
  const eight = periodBounds('8W', NOW);
  const scoped = filterSmartRecords(ai, { bounds: eight });
  const kpis = buildExecutiveKpis({ scoped, previous: [], current: scoped, previousCurrent: [] });
  assert.equal(kpis.themes.find(item => item.id === 'ai').value, 2);
  assert.equal(kpis.themes.find(item => item.id === 'ai').change.isNew, true);
  assert.equal(kpis.total.value, 2);
  assert.match(kpiStripMarkup(kpis, { period: '8W', selected: new Set() }), /vs\. prior 8 weeks/);
});

test('the 8-week period aligns with the trend weeks and a zero prior count never yields a percentage', () => {
  const bounds = periodBounds('8W', NOW);
  const trend = buildTrendByTheme([], NOW);
  assert.equal(bounds.start, trend.weeks[0].start);
  assert.equal(bounds.previousEnd, bounds.start);
  assert.deepEqual(deltaBadge(compareCounts(3, 0)), { text: 'New', direction: 'up' });
  assert.deepEqual(deltaBadge(compareCounts(18, 12)), { text: '+50%', direction: 'up' });
  assert.deepEqual(deltaBadge(compareCounts(8, 10)), { text: '−20%', direction: 'down' });
});

test('a zero current count yields truthful empty states and no invented figures', () => {
  assert.equal(compareCounts(2, 0).label, 'New');
  assert.doesNotMatch(compareCounts(2, 0).label, /%|Infinity|NaN/);
  const empty = buildThemeDistribution([]);
  assert.equal(empty.unique, 0);
  assert.deepEqual(empty.slices, []);
  const trend = buildTrendByTheme([], NOW);
  assert.equal(trend.total, 0);
  assert.equal(trend.max, 0);
  const regional = buildRegionalActivity([]);
  assert.equal(regional.mapped, 0);
  assert.ok(regional.regions.every(region => region.count === 0 && region.percent === 0));
  const donut = buildExecutiveDonut(empty);
  assert.equal(donut.unique, 0);
  assert.equal(donutChartOption(donut).series[0].data.length, 0);
  const matrix = buildRegionThemeMatrix([]);
  assert.equal(matrix.max, 0);
  const kpis = buildExecutiveKpis({ scoped: [], previous: [], current: [], previousCurrent: [] });
  for (const markup of [kpiStripMarkup(kpis, { period: '8W', selected: new Set() }), regionHeatmapMarkup(matrix, { themes: new Set(), geography: 'all' }), timelineMarkup(buildTimelineEvents([]))])
    assert.doesNotMatch(markup, /NaN|Infinity|undefined/);
  const points = buildSummaryPoints({ kpis, regional, current: [], scoped: [], period: '8W' });
  assert.equal(points.length, 4);
  assert.match(points[0], /No verified development/);
  assert.match(points[2], /Too few developments/);
  assert.match(timelineMarkup([]), /No verified developments in this selection/);
  assert.equal(heatColor(0), '#edf0e8');
});

test('regions come only from verified metadata; aggregate scopes are reported, never guessed', () => {
  const records = normalize([
    raw('sg', 'Instant payments in Singapore', '2026-11-10T09:00:00Z'),
    raw('in', 'Instant payments in India', '2026-11-09T09:00:00Z', { country: 'India', region: 'Asia Pacific' }),
    raw('eu', 'Instant payments in Europe', '2026-11-08T09:00:00Z', { country: '', region: 'Europe', geography: 'European Union' }),
    raw('us', 'Instant payments in the US', '2026-11-08T09:00:00Z', { country: 'United States', region: 'Americas' }),
    raw('uae', 'Instant payments in the UAE', '2026-11-08T09:00:00Z', { country: 'United Arab Emirates', region: 'Middle East & Africa' }),
    raw('agg', 'Instant payments across the Americas', '2026-11-07T09:00:00Z', { country: '', region: 'Americas', geography: 'Americas' }),
    raw('none', 'Instant payments without geography', '2026-11-07T09:00:00Z', { country: '', region: '' })
  ]);
  const coverage = buildGeographyCoverage(records);
  assert.equal(coverage.total, 7);
  assert.equal(coverage.attributed, 6);
  assert.deepEqual(coverage.countries.map(country => country.label).sort(), ['India', 'Singapore', 'United Arab Emirates', 'United States']);
  const regional = buildRegionalActivity(records);
  assert.deepEqual(regional.regions.filter(region => region.count).map(region => [region.key, region.count]), [['na', 1], ['europe', 1], ['apac', 2], ['gcc', 1]]);
  assert.equal(regional.mapped, 5);
  assert.equal(regional.unmapped, 2);
  assert.equal(regional.regions.find(region => region.key === 'apac').percent, 40);
  assert.equal(classifyDisplayRegion(records.find(record => record.id === 'agg')), null);
  assert.equal(matchesGeography(records.find(record => record.id === 'us'), 'na'), true);
  assert.equal(matchesGeography(records.find(record => record.id === 'us'), 'americas'), true);
  assert.equal(matchesGeography(records.find(record => record.id === 'us'), 'latam'), false);
  const option = mapChartOption(regional)({ width: 400, height: 144 });
  assert.equal(option.series[0].data.reduce((sum, point) => sum + point.count, 0), regional.mapped);
  assert.ok(option.geo.layoutSize <= 400);
  const matrix = buildRegionThemeMatrix(records, ['real-time']);
  assert.equal(matrix.cells[0].reduce((sum, cell) => sum + cell.count, 0), regional.mapped);
});

test('the timeline lists the newest development of each distinct theme, oldest to newest, with source links', () => {
  const records = normalize([
    raw('a', 'Instant payments scheme goes live', '2026-11-10T09:00:00Z', { topics: ['real-time'] }),
    raw('b', 'Instant payments scheme expands', '2026-11-09T09:00:00Z', { topics: ['real-time'] }),
    raw('c', 'Regulator issues licensing framework', '2026-11-05T09:00:00Z', { topics: ['regulation', 'licence'] }),
    raw('d', 'AML and KYC obligations updated for payments', '2026-11-02T09:00:00Z', { topics: ['aml'] })
  ]);
  const events = buildTimelineEvents(records, 3);
  assert.deepEqual(events.map(event => event.id), ['d', 'c', 'a']);
  const markup = timelineMarkup(events);
  assert.match(markup, /href="https:\/\/example\.gov\/d" target="_blank" rel="noopener noreferrer"/);
  assert.match(markup, /datetime="2026-11-10"/);
});

test('theme filters compose with period, geography and taxonomy topics without altering existing filters', () => {
  const records = normalize([
    raw('r', 'Instant payment scheme', '2026-11-10T09:00:00Z', { topics: ['real-time'] }),
    raw('f', 'Fraud scam rules for payment apps', '2026-11-10T09:00:00Z', { topics: ['fraud'], country: 'India', region: 'Asia Pacific' }),
    raw('o', 'Fraud scam rules in Europe', '2026-11-10T09:00:00Z', { topics: ['fraud'], country: '', region: 'Europe', geography: 'Europe' })
  ]);
  const bounds = periodBounds('30D', NOW);
  assert.equal(filterSmartRecords(records, { bounds }).length, 3);
  assert.deepEqual(filterSmartRecords(records, { bounds, themes: ['fraud'] }).map(record => record.id).sort(), ['f', 'o']);
  assert.deepEqual(filterSmartRecords(records, { bounds, themes: ['fraud'], geography: 'europe' }).map(record => record.id), ['o']);
  assert.deepEqual(filterSmartRecords(records, { bounds, topics: ['real-time'] }).map(record => record.id), ['r']);
  assert.deepEqual(filterSmartRecords(records, { bounds, themes: ['fraud'], topics: ['real-time'] }), []);
});

test('Smart Share exposes only whitelisted dashboard context and public source URLs', () => {
  const state = { period: 'CUSTOM', geography: 'apac', themes: new Set(['fraud']), topics: new Set(['aml']), customStart: '2026-11-02', customEnd: '2026-11-08', alertId: 'secret-alert', heat: { topicId: 'x' } };
  const url = new URL(buildShareUrl('https://fintechoisis.com/pages/intelligence/smart.html?access_token=abc&alert=secret&token=xyz#fragment', state));
  assert.equal(url.origin + url.pathname, 'https://fintechoisis.com/pages/intelligence/smart.html');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['from', 'geo', 'period', 'themes', 'to', 'topics']);
  assert.equal(url.hash, '');
  assert.doesNotMatch(url.toString(), /access_token|token|secret|alert/);
  const [record] = normalize([raw('share', 'Instant payments update', '2026-11-10T09:00:00Z')]);
  const item = buildItemShare(record);
  assert.deepEqual(Object.keys(item).sort(), ['text', 'title', 'url']);
  assert.equal(item.url, 'https://example.gov/share');
});

test('Ask GPIR receives theme, geography, date range and source context through the existing query interface', () => {
  const query = buildAskQuery({ period: 'CUSTOM', customStart: '2026-11-02', customEnd: '2026-11-08' },
    { themeLabels: ['Fraud Prevention & Cybersecurity'], topicLabels: [], geographyLabel: 'Asia Pacific' });
  assert.equal(query, 'Show validated Fraud Prevention & Cybersecurity announcements for Asia Pacific during 2026-11-02 to 2026-11-08');
  assert.equal(buildAskQuery({ period: '30D' }), 'Show validated payments intelligence announcements for All geographies during 30D');
  const [record] = normalize([raw('ask', 'Instant payments update', '2026-11-10T09:00:00Z')]);
  assert.match(buildAskQuery({}, { record }), /Instant payments update.*MAS.*2026-11-10.*https:\/\/example\.gov\/ask/);
});

test('live announcements keep the governed 12-hour window independent of the executive filter', () => {
  const records = normalize([
    raw('fresh', 'Fresh announcement', new Date(NOW - 11 * 3600000).toISOString()),
    raw('stale', 'Stale announcement', new Date(NOW - 13 * 3600000).toISOString()),
    raw('future', 'Future announcement', new Date(NOW + 3600000).toISOString())
  ]);
  assert.deepEqual(eligibleLiveRecords(records, NOW).map(record => record.id), ['fresh']);
});

test('charts expose accessible equivalents: summaries, data tables, keyboard navigation and drill-down buttons', () => {
  const trend = buildTrendByTheme(normalize([raw('t', 'Instant payments update', '2026-11-10T09:00:00Z')]), NOW);
  const table = trendTable(trend);
  assert.match(table, /<caption>/);
  assert.match(table, /<th scope="col">/);
  assert.equal((table.match(/data-drill-week="/g) || []).length, 8);
  for (const name of ['weekly', 'momentum', 'distribution', 'geography']) {
    assert.match(page, new RegExp(`data-smart-chart="${name}" tabindex="0"`));
    assert.match(page, new RegExp(`data-smart-chart-summary="${name}"`));
    assert.match(page, new RegExp(`data-smart-table="${name}"`));
  }
  assert.match(page, /data-smart-table="heatmap"/);
  assert.match(page, /role="img" aria-labelledby="smp-weekly-summary"/);
  assert.match(charts, /ResizeObserver/);
  assert.match(charts, /details\.open = true/);
  assert.match(charts, /ArrowRight/);
  assert.match(charts, /showTip/);
  assert.match(executive, /aria: \{ enabled: true \}/);
  assert.match(css, /\.smx-chart\[data-chart-state=empty\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  const heat = regionHeatmapMarkup(buildRegionThemeMatrix([]), { themes: new Set(), geography: 'all' });
  assert.match(heat, /role="grid"/);
  assert.equal((heat.match(/<button type="button" class="smx-heat-cell"/g) || []).length, 24);
  assert.match(heat, /aria-label="AI in Payments in North America: 0 verified developments, no activity\. Select to filter\."/);
});

test('the premium page keeps its static, governed architecture and pins the open-source chart engine', () => {
  assert.match(page, /echarts@5\.6\.0\/dist\/echarts\.min\.js" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"/);
  assert.match(page, /smart-executive\.css/);
  assert.match(page, /data-smart-theme-controls/);
  assert.match(page, /data-smart-topic-controls/);
  assert.match(page, /data-smart-theme-tiles/);
  assert.match(page, /data-smart-reference/);
  assert.match(page, /data-smart-share/);
  assert.match(page, /<h1>Executive Intelligence Dashboard<\/h1>/);
  assert.match(page, /LATEST VERIFIED DEVELOPMENTS/);
  assert.match(page, /Regional Activity/);
  assert.doesNotMatch(page, /<img[^>]+Executive Payments Intelligence Dashboard/i);
  assert.doesNotMatch(page, /\.png/);
  assert.doesNotMatch(page, /Subscribe|PayPal/);
  const executableSources = [presentation, charts, executive].join('\n');
  assert.doesNotMatch(executableSources, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|\.innerHTML\s*=/i);
  assert.doesNotMatch(executableSources, /Math\.random|\b(predict|forecast|projected|expected to)\b/i);
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').split('}')
    .map(rule => rule.split('{')[0].trim()).filter(Boolean);
  for (const selector of selectors) assert.match(selector, /^\.gpir-sc\b/, selector);
});
