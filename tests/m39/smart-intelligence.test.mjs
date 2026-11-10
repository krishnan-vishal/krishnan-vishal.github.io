import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildDashboardMetrics, buildHeatmap, fetchHistory, filterSmartRecords, normalizeEditorial,
  normalizeLiveAlerts, normalizeSmartRecords, periodBounds, periodStart, SMART_TOPICS }
  from '../../assets/js/smart-intelligence.mjs';
import { buildTopicContext } from '../../assets/js/gpir-topic-intelligence.mjs';
import { publicFxResearchRecords } from '../../assets/js/gpir-reader-dashboard.mjs';
import { activeSection } from '../../assets/js/my-gpir-navigation.mjs';

const root = new URL('../../', import.meta.url);
const page = await readFile(new URL('pages/intelligence/smart.html', root), 'utf8');
const dashboard = await readFile(new URL('reader/my-gpir/index.html', root), 'utf8');
const homepageScript = await readFile(new URL('assets/js/script.js', root), 'utf8');
const editorialValue = JSON.parse(await readFile(
  new URL('assets/data/fx/editorial-public.json', root), 'utf8'));

test('Smart Intelligence is a distinct authenticated reader tool', () => {
  assert.match(page, /<h1>Executive Intelligence Dashboard<\/h1>/);
  assert.match(page, /LIVE GLOBAL ALERTS/);
  assert.match(page, /gpir-reader-auth\.js/);
  for (const period of ['24H','7D','30D','QTD','YTD','CUSTOM'])
    assert.match(page, new RegExp(`<option value="${period}">`));
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

test('custom periods include governed records from the five-year historical window', () => {
  const bounds = periodBounds('CUSTOM', Date.parse('2026-11-10T12:00:00Z'), '2021-11-01', '2022-05-05');
  const records = normalizeSmartRecords({ status: 'OK', records: [{
    id: 'historical', title: 'A historical payments development',
    summary: 'An approved source describes a historical payments development with sufficient factual detail for display.',
    publishedAt: '2022-05-04T10:00:00Z', category: 'Payments',
    canonicalUrl: 'https://example.com/publication', source: { name: 'Official source' }
  }] });
  assert.equal(bounds.start, Date.parse('2021-11-01T00:00:00Z'));
  assert.equal(filterSmartRecords(records, { bounds, geography: 'all', topics: [] }).length, 1);
});

test('reference history uses the distinct existing API view', async () => {
  const requested = [];
  const fetchImpl = async url => {
    requested.push(new URL(url));
    return { ok: true, json: async () => ({ status: 'OK', total: 0, records: [] }) };
  };
  await fetchHistory(fetchImpl, 'https://example.supabase.co');
  await fetchHistory(fetchImpl, 'https://example.supabase.co', true);
  assert.equal(requested[0].searchParams.get('view'), null);
  assert.equal(requested[1].searchParams.get('view'), 'references');
  assert.equal(requested[1].searchParams.get('scope'), 'history');
});

test('My GPIR separates public research from paid library and exposes three exact actions', () => {
  const records = publicFxResearchRecords(editorialValue);
  assert.equal(records.length, 26);
  const aed = records.find(record => record.pair === 'AED/INR');
  assert.equal(aed.fxIntelligenceUrl, '/pages/fx/pairs/aed-inr.html');
  assert.equal(aed.smartIntelligenceUrl, '/pages/intelligence/smart.html');
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

const HOUR = 3600000;
function governedRecord(id, title, hoursAgo, extra = {}) {
  return { id, title, summary: `${title}. The published source describes a validated payments development with enough factual detail for governed display.`,
    publishedAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(), category: 'Cross-Border Payments',
    country: 'Singapore', displayLifecycleStatus: 'ARCHIVED', canonicalUrl: `https://example.gov.sg/${id}`,
    source: { name: 'Example Authority' }, ...extra };
}

test('public Global Alerts API alerts reach the signed-in ribbon and exclude unapproved items', () => {
  const alert = { id: 'live-1', headline: 'Authority opens cross-border payment corridor', summary: 'The authority confirmed a cross-border payment corridor for regulated participants.',
    publishedAt: new Date(Date.now() - HOUR).toISOString(), category: 'Cross-Border Payments', country: 'Singapore',
    sourceName: 'Example Authority', sourceUrl: 'https://example.gov.sg/corridor', publicationStatus: 'approved', tickerEligible: true, sourceVerified: true };
  const live = normalizeLiveAlerts({ alerts: [alert,
    { ...alert, id: 'pending', publicationStatus: 'pending' },
    { ...alert, id: 'ineligible', tickerEligible: false },
    { ...alert, id: 'unverified', sourceVerified: false }] }, []);
  assert.deepEqual(live.map(item => item.id), ['live-1']);
  assert.equal(live[0].url, 'https://example.gov.sg/corridor');
  assert.equal(live[0].sourceName, 'Example Authority');
  assert.ok(live[0].topicIds.includes('cross-border'));
});

test('an alert opens a topic-specific view from current and historical repository records, including after expiry', () => {
  const records = normalizeSmartRecords({ status: 'OK', records: [
    governedRecord('alert', 'Authority opens cross-border payment corridor', 2),
    governedRecord('current', 'Regulator updates cross-border payment rules', 24 * 5),
    governedRecord('old', 'Earlier cross-border payment pilot concluded', 24 * 200),
    governedRecord('other', 'Bank announces fraud controls', 24 * 3, { category: 'Fraud' }),
    governedRecord('tech', 'Settlement connector change', 24 * 2, { dataClass: 'TECHNICAL_REFERENCE', category: 'Technical' })
  ] });
  const alert = records.find(item => item.id === 'alert');
  for (const now of [Date.now(), Date.now() + 30 * 24 * HOUR]) {
    const context = buildTopicContext(alert, records, now);
    assert.deepEqual(context.topic.topicIds, alert.topicIds);
    assert.ok(context.topic.topicIds.includes('cross-border'));
    const ids = [...context.current, ...context.historical].map(item => item.id);
    assert.ok(ids.includes('old') && !ids.includes('other') && !ids.includes('tech') && !ids.includes('alert'));
  }
  const now = Date.now();
  assert.deepEqual(buildTopicContext(alert, records, now).current.map(item => item.id), ['current']);
  assert.deepEqual(buildTopicContext(alert, records, now).historical.map(item => item.id), ['old']);
  assert.match(page, /data-smart-alert/);
});
