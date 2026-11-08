import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildDashboardMetrics, buildHeatmap, filterSmartRecords, normalizeEditorial,
  normalizeSmartRecords, periodBounds, periodStart, SMART_TOPICS }
  from '../../assets/js/smart-intelligence.mjs';
import { publicFxResearchRecords } from '../../assets/js/gpir-reader-dashboard.mjs';
import { activeSection } from '../../assets/js/my-gpir-navigation.mjs';

const root = new URL('../../', import.meta.url);
const page = await readFile(new URL('pages/intelligence/smart.html', root), 'utf8');
const dashboard = await readFile(new URL('reader/my-gpir/index.html', root), 'utf8');
const homepageScript = await readFile(new URL('assets/js/script.js', root), 'utf8');
const editorialValue = JSON.parse(await readFile(
  new URL('assets/data/fx/editorial-public.json', root), 'utf8'));

test('Smart Intelligence is a distinct authenticated reader tool', () => {
  assert.match(page, /<h1>My Intelligence Dashboard<\/h1>/);
  assert.match(page, /LIVE GLOBAL ALERTS/);
  assert.match(page, /gpir-reader-auth\.js/);
  for (const period of ['24H','7D','30D','QTD','YTD','CUSTOM'])
    assert.match(page, new RegExp(`data-smart-period="${period}"`));
  assert.match(page, /data-smart-geography/);
  assert.match(page, /data-smart-topic-controls/);
  assert.match(page, /TOP SIGNAL NOW/);
  assert.match(page, /data-smart-kpis/);
  assert.match(page, /data-smart-heatmap/);
  assert.match(page, /Ask GPIR with this context/);
  assert.match(homepageScript, /askMatch = String\(window\.location\.search/);
  assert.match(homepageScript, /answerQuery\(safeContext\)/);
  assert.doesNotMatch(page, /Subscribe|PayPal/);
});

test('governed Smart Intelligence records retain citations and filter by subject and period', () => {
  const value = { status: 'OK', records: [
    { id: 'one', title: 'RBI updates cross-border payment controls',
      summary: 'The published source describes a validated payments development with enough factual detail for governed display.',
      publishedAt: '2026-11-05T12:00:00.000Z', category: 'Payments', country: 'India',
      displayLifecycleStatus: 'ARCHIVED', canonicalUrl: 'https://rbi.org.in/example',
      source: { name: 'Reserve Bank of India' }, keywords: ['cross-border'] },
    { id: 'two', title: 'Older wallet development',
      summary: 'This factual archived record is valid but intentionally falls outside the selected fifteen day analytical period.',
      publishedAt: '2025-01-05T12:00:00.000Z', category: 'Wallets',
      canonicalUrl: 'https://mas.gov.sg/example', source: { name: 'MAS' } }
  ] };
  const records = normalizeSmartRecords(value);
  assert.equal(records.length, 2);
  const matches = filterSmartRecords(records, { kind: 'country', subject: 'India',
    period: '15D', now: Date.parse('2026-11-07T12:00:00.000Z') });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].sourceName, 'Reserve Bank of India');
  assert.equal(periodStart('15D', Date.parse('2026-11-07T12:00:00.000Z')),
    Date.parse('2026-10-23T12:00:00.000Z'));
});

test('dashboard calculations use all 36 governed topics, equivalent periods and dated records', () => {
  assert.equal(SMART_TOPICS.length, 36);
  assert.equal(new Set(SMART_TOPICS.map(topic => topic.id)).size, 36);
  const now = Date.parse('2026-11-07T12:00:00.000Z');
  const bounds = periodBounds('30D', now);
  assert.equal(bounds.end - bounds.start, 30 * 86400000 + 1);
  const records = normalizeSmartRecords({ status: 'OK', records: [
    { id: 'current', title: 'MAS expands cross-border digital money initiative',
      summary: 'The official release records a cross-border payments and digital money development with validated supporting detail.',
      publishedAt: '2026-10-22T16:00:00.000Z', category: 'Cross-Border Payments',
      topics: ['Cross-Border Payments','Digital Money'], country: 'Singapore',
      canonicalUrl: 'https://mas.gov.sg/example', source: { name: 'MAS', trustTier: 'T1' } },
    { id: 'previous', title: 'Authority publishes payment infrastructure regulation',
      summary: 'The official release records a payment infrastructure regulation with validated supporting factual detail.',
      publishedAt: '2026-09-22T16:00:00.000Z', category: 'Regulation',
      topics: ['Regulation','Payment Infrastructure'], country: 'Singapore',
      canonicalUrl: 'https://mas.gov.sg/older', source: { name: 'MAS', trustTier: 'T1' } }
  ] });
  const current = filterSmartRecords(records, { bounds, geography: 'apac', topics: [] });
  const previous = filterSmartRecords(records, {
    bounds: { start: bounds.previousStart, end: bounds.previousEnd }, geography: 'apac', topics: [] });
  assert.equal(current.length, 1);
  assert.equal(previous.length, 1);
  const metrics = buildDashboardMetrics(current, previous);
  assert.equal(metrics.length, 6);
  assert.equal(metrics[0].value, 1);
  const heatmap = buildHeatmap(records, now);
  assert.equal(heatmap.weeks.length, 12);
  assert.equal(heatmap.rows.length, SMART_TOPICS.length);
  assert.ok(heatmap.rows.some(row => row.counts.some(Boolean)));
});

test('My GPIR separates public research from paid library and exposes three exact actions', () => {
  const records = publicFxResearchRecords(editorialValue);
  assert.equal(records.length, 26);
  const aed = records.find(record => record.pair === 'AED/INR');
  assert.equal(aed.fxIntelligenceUrl,
    '/pages/fx/intelligence.html?base=AED&quote=INR&period=M');
  assert.equal(aed.smartIntelligenceUrl,
    '/pages/intelligence/smart.html?kind=pair&subject=AED%2FINR&period=YTD');
  assert.match(aed.editorialUrl, /^\//);
  assert.match(dashboard, /id="public-research"/);
  assert.match(dashboard, /data-reader-public-research/);
  assert.match(dashboard, /id="library"/);
  assert.equal(activeSection('#public-research'), 'public-research');
});

test('Contentful editorial normalization remains limited to governed published pair records', () => {
  const records = normalizeEditorial(editorialValue);
  assert.equal(records.length, 26);
  assert.equal(new Set(records.map(record => record.pair)).size, 26);
  assert.ok(records.every(record => record.url.startsWith('/')));
});
