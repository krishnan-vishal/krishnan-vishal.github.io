import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { filterSmartRecords, normalizeEditorial, normalizeSmartRecords, periodStart }
  from '../../assets/js/smart-intelligence.mjs';
import { publicFxResearchRecords } from '../../assets/js/gpir-reader-dashboard.mjs';
import { activeSection } from '../../assets/js/my-gpir-navigation.mjs';

const root = new URL('../../', import.meta.url);
const page = await readFile(new URL('pages/intelligence/smart.html', root), 'utf8');
const dashboard = await readFile(new URL('reader/my-gpir/index.html', root), 'utf8');
const editorialValue = JSON.parse(await readFile(
  new URL('assets/data/fx/editorial-public.json', root), 'utf8'));

test('Smart Intelligence is a distinct authenticated reader tool', () => {
  assert.match(page, /<h1>Smart Intelligence<\/h1>/);
  assert.match(page, /This is separate from quantitative FX Intelligence/);
  assert.match(page, /gpir-reader-auth\.js/);
  assert.match(page, /data-smart-kind/);
  assert.match(page, /data-smart-period="15D"/);
  assert.match(page, /Open ASK GPIR/);
  assert.doesNotMatch(page, /Subscribe|paid plan|PayPal/);
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

test('My GPIR separates public research from paid library and exposes three exact actions', () => {
  const records = publicFxResearchRecords(editorialValue);
  assert.equal(records.length, 26);
  const aed = records.find(record => record.pair === 'AED/INR');
  assert.equal(aed.fxIntelligenceUrl,
    '/pages/fx/intelligence.html?base=AED&quote=INR&period=M');
  assert.equal(aed.smartIntelligenceUrl,
    '/pages/intelligence/smart.html?kind=pair&subject=AED%2FINR&period=1Y');
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
