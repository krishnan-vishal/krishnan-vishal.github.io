import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildDashboardMetrics, buildHeatmap, filterSmartRecords, normalizeEditorial,
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

test('My GPIR separates public FX research, standalone Smart Intelligence and paid library', () => {
  const records = publicFxResearchRecords(editorialValue);
  assert.equal(records.length, 26);
  const aed = records.find(record => record.pair === 'AED/INR');
  assert.equal(aed.fxIntelligenceUrl, '/pages/fx/pairs/aed-inr.html');
  assert.equal(aed.smartIntelligenceUrl, undefined);
  assert.ok(dashboard.includes('/pages/intelligence/smart.html'));
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


test('M40 governed cursor history preserves filters and forwards stable continuation anchors',async()=>{
  const {fetchM40HistoryCursor}=await import('../../assets/js/smart-intelligence.mjs');
  const state={topics:new Set(['cross-border']),themes:new Set(['regulatory']),geography:'apac'};
  const bounds={start:Date.parse('2026-11-01T00:00:00Z'),end:Date.parse('2026-11-12T00:00:00Z')};
  const anchor={publishedAt:'2026-11-10T10:00:00Z',id:'00000000-0000-4000-8000-000000000001'};
  let count=0;
  const fetchImpl=async(url)=>{
    count++;
    const query=new URL(url).searchParams;
    assert.equal(query.get('view'),'history-cursor');
    assert.equal(query.get('offset'),null);
    assert.equal(query.get('region'),'apac');
    assert.deepEqual(query.getAll('topic'),['cross-border']);
    assert.deepEqual(query.getAll('theme'),['regulatory']);
    assert.equal(query.get('afterTime'),count===1?null:anchor.publishedAt);
    assert.equal(query.get('afterId'),count===1?null:anchor.id);
    return {ok:true,json:async()=>({status:'OK',kind:'announcements',records:[{id:'one'}],
      hasMore:count===1,nextCursor:count===1?anchor:null})};
  };
  const first=await fetchM40HistoryCursor(fetchImpl,'https://fintechoisis.com',state,bounds);
  assert.deepEqual(first.nextCursor,anchor);
  const second=await fetchM40HistoryCursor(fetchImpl,'https://fintechoisis.com',state,bounds,first.nextCursor);
  assert.equal(second.hasMore,false);
  assert.equal(count,2);
});

test('M40 cursor rejects malformed or unsuccessful history responses without guessed records',async()=>{
  const {fetchM40HistoryCursor}=await import('../../assets/js/smart-intelligence.mjs');
  const state={topics:new Set(),themes:new Set(),geography:'all'};
  const bounds={start:0,end:Date.now()};
  await assert.rejects(()=>fetchM40HistoryCursor(async()=>({ok:true,json:async()=>({status:'OK',kind:'announcements',records:[],hasMore:true})}),
    'https://fintechoisis.com',state,bounds),/M40_HISTORY_INVALID/);
  await assert.rejects(()=>fetchM40HistoryCursor(async()=>({ok:false}),
    'https://fintechoisis.com',state,bounds),/M40_HISTORY_UNAVAILABLE/);
});
