import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TOPIC_TAXONOMY } from '../../assets/js/gpir-topic-intelligence.mjs';
import { eligibleLiveRecords, filterSmartRecords, normalizeSmartRecords, periodBounds } from '../../assets/js/smart-intelligence.mjs';
import {
  OTHER_THEME, PREMIUM_THEMES, THEME_COLORS, buildAskQuery, buildExecutiveSummary, buildGeographyCoverage, buildItemShare, buildShareUrl,
  buildThemeDistribution, buildThemeMomentum, buildWeeklyActivity, classifyThemeIds, compareCounts, distributionChartOption, geographyChartOption,
  isExecutiveEligible, kpiMarkup, momentumChartOption, primaryThemeId, referenceClass, ringSvg, weeklyChartOption, weeklyTable
} from '../../assets/js/smart-presentation.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [page, css, charts, presentation] = await Promise.all([
  read('pages/intelligence/smart.html'), read('assets/css/smart-premium.css'),
  read('assets/js/smart-charts.mjs'), read('assets/js/smart-presentation.mjs')]);

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

test('weekly activity, momentum and summary figures equal the governed records', () => {
  const dates = ['2026-11-10', '2026-11-09', '2026-11-05', '2026-10-28', '2026-10-27', '2026-10-01', '2026-01-02'];
  const records = normalize(dates.map((date, index) => raw(`w${index}`, `Instant payment update ${index}`, `${date}T09:00:00Z`, { topics: ['real-time'] })));
  const weekly = buildWeeklyActivity(records, NOW);
  assert.equal(weekly.weeks.length, 8);
  const manual = weekly.weeks.map(week => records.filter(record => Date.parse(record.publishedAt) >= week.start && Date.parse(record.publishedAt) < week.start + 7 * DAY).length);
  assert.deepEqual(weekly.weeks.map(week => week.count), manual);
  assert.equal(weekly.total, manual.reduce((sum, value) => sum + value, 0));
  assert.equal(weekly.weeks.at(-1).inProgress, true);
  assert.equal(weekly.weeks[0].inProgress, false);
  const option = weeklyChartOption(weekly);
  assert.deepEqual(option.series[0].data.map(point => point.value), manual);
  const bounds = periodBounds('7D', NOW);
  const current = filterSmartRecords(records, { bounds });
  const previous = filterSmartRecords(records, { bounds: { start: bounds.previousStart, end: bounds.previousEnd } });
  const momentum = buildThemeMomentum(current, previous);
  const realTime = momentum.find(row => row.id === 'real-time');
  assert.equal(realTime.current, current.length);
  assert.equal(realTime.previous, previous.length);
  assert.deepEqual(realTime.change, compareCounts(current.length, previous.length));
  assert.deepEqual(momentumChartOption(momentum).series[1].data.map(point => point.value), [realTime.current]);
});

test('a zero preceding count is labelled New and a zero current count yields truthful empty states', () => {
  assert.equal(compareCounts(2, 0).label, 'New');
  assert.doesNotMatch(compareCounts(2, 0).label, /%|Infinity|NaN/);
  const empty = buildThemeDistribution([]);
  assert.equal(empty.unique, 0);
  assert.deepEqual(empty.slices, []);
  const weekly = buildWeeklyActivity([], NOW);
  assert.equal(weekly.total, 0);
  assert.equal(weekly.max, 0);
  assert.deepEqual(weekly.weeks.map(week => week.count), Array(8).fill(0));
  const geography = buildGeographyCoverage([]);
  assert.equal(geography.attributed, 0);
  assert.equal(geographyChartOption(geography).series[0].data.length, 0);
  assert.equal(distributionChartOption(empty).series[0].data.length, 0);
  const summary = buildExecutiveSummary({ current: [], previous: [], scope: [], geography, liveCount: 0, now: NOW });
  for (const item of summary) assert.doesNotMatch(kpiMarkup(item), /NaN|Infinity|undefined/);
  assert.match(ringSvg(0, 0, '#0e7c86'), /0%/);
  assert.equal(summary.find(item => item.id === 'live').value, 0);
  assert.match(summary.find(item => item.id === 'live').note, /None qualifying/);
});

test('geographic coverage uses verified metadata only and reports what is not attributed', () => {
  const records = normalize([
    raw('sg', 'Instant payments in Singapore', '2026-11-10T09:00:00Z'),
    raw('in', 'Instant payments in India', '2026-11-09T09:00:00Z', { country: 'India', region: 'Asia Pacific' }),
    raw('eu', 'Instant payments in Europe', '2026-11-08T09:00:00Z', { country: '', region: 'Europe', geography: 'European Union' }),
    raw('none', 'Instant payments without geography', '2026-11-07T09:00:00Z', { country: '', region: '' })
  ]);
  const coverage = buildGeographyCoverage(records);
  assert.equal(coverage.total, 4);
  assert.equal(coverage.attributed, 3);
  assert.equal(coverage.unattributed, 1);
  assert.deepEqual(coverage.regions.map(region => [region.key, region.count]), [['apac', 2], ['europe', 1]]);
  assert.deepEqual(coverage.countries.map(country => country.label).sort(), ['India', 'Singapore']);
  const option = geographyChartOption(coverage, 'regions');
  assert.equal(option.series[0].data.reduce((sum, point) => sum + point.value, 0), coverage.attributed);
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

test('charts expose accessible equivalents: summaries, data tables and drill-down buttons', () => {
  const weekly = buildWeeklyActivity(normalize([raw('t', 'Instant payments update', '2026-11-10T09:00:00Z')]), NOW);
  const table = weeklyTable(weekly);
  assert.match(table, /<caption>/);
  assert.match(table, /<th scope="col">/);
  assert.equal((table.match(/data-drill-week="/g) || []).length, 8);
  for (const name of ['weekly', 'momentum', 'distribution', 'geography']) {
    assert.match(page, new RegExp(`data-smart-chart="${name}"`));
    assert.match(page, new RegExp(`data-smart-chart-summary="${name}"`));
    assert.match(page, new RegExp(`data-smart-table="${name}"`));
  }
  assert.match(page, /role="img" aria-labelledby="smp-weekly-summary"/);
  assert.match(charts, /ResizeObserver/);
  assert.match(charts, /details\.open = true/);
  assert.match(presentation, /aria: \{ enabled: true \}/);
  assert.match(css, /\.smp-chart\[data-chart-state=empty\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
});

test('the premium page keeps its static, governed architecture and pins the open-source chart engine', () => {
  assert.match(page, /echarts@5\.6\.0\/dist\/echarts\.min\.js" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"/);
  assert.match(page, /smart-premium\.css/);
  assert.match(page, /data-smart-theme-controls/);
  assert.match(page, /data-smart-theme-tiles/);
  assert.match(page, /data-smart-reference/);
  assert.match(page, /data-smart-share/);
  assert.match(page, /EXECUTIVE INTELLIGENCE SUMMARY/);
  assert.match(page, /LATEST VERIFIED DEVELOPMENTS/);
  assert.match(page, /GEOGRAPHIC INTELLIGENCE/);
  assert.doesNotMatch(page, /Subscribe|PayPal/);
  const executableSources = [presentation, charts].join('\n');
  assert.doesNotMatch(executableSources, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|\.innerHTML\s*=/i);
  assert.doesNotMatch(executableSources, /Math\.random|\b(predict|forecast|projected|expected to)\b/i);
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').split('}')
    .map(rule => rule.split('{')[0].trim()).filter(Boolean);
  for (const selector of selectors) assert.match(selector, /^\.gpir-sc\b/, selector);
});
