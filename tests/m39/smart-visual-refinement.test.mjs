import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildHeatmapSelection, compareCounts, describeTechnicalChange, evidenceKind, normalizeSmartRecords
} from '../../assets/js/smart-intelligence.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [page, css, baseCss, script] = await Promise.all([
  read('pages/intelligence/smart.html'), read('assets/css/gpir-smart-card-sections.css'),
  read('assets/css/smart-intelligence.css'), read('assets/js/smart-intelligence.mjs')]);

const NOW = Date.parse('2026-11-11T12:00:00Z');
const base = { status: 'GPIR_CLASSIFIED', summary: 'Validated governed summary long enough to pass normalisation checks.', category: 'Regulation',
  topics: ['Regulation'], source: { name: 'MAS', trustTier: 'T1' }, country: 'Singapore' };
const record = (id, publishedAt, extra = {}) => ({ ...base, id, title: `Regulatory update ${id}`, publishedAt, canonicalUrl: `https://example.gov/${id}`, ...extra });

test('a zero preceding count is labelled New and never produces a percentage', () => {
  const fresh = compareCounts(3, 0);
  assert.equal(fresh.label, 'New');
  assert.equal(fresh.isNew, true);
  assert.equal(fresh.deltaLabel, '+3');
  assert.doesNotMatch(fresh.label, /%|Infinity|NaN/);
  assert.equal(compareCounts(0, 0).label, 'No activity');
  assert.equal(compareCounts(2, 2).label, 'No change');
  assert.equal(compareCounts(3, 2).label, '+50% vs prior');
  assert.equal(compareCounts(1, 4).label, '−75% vs prior');
  assert.equal(compareCounts(0, 2).deltaLabel, '−2');
});

test('heatmap selection lists dated records and compares like-for-like weeks', () => {
  const week = Date.parse('2026-11-02T00:00:00Z');
  const records = normalizeSmartRecords({ status: 'OK', records: [
    record('current-a', '2026-11-03T09:00:00Z'), record('current-b', '2026-11-05T09:00:00Z'),
    record('previous', '2026-10-28T09:00:00Z'), record('older', '2026-10-10T09:00:00Z')
  ] });
  const selection = buildHeatmapSelection(records, 'regulatory', week, NOW);
  assert.equal(selection.inProgress, false);
  assert.deepEqual(selection.current.map(item => item.id).sort(), ['current-a', 'current-b']);
  assert.deepEqual(selection.previous.map(item => item.id), ['previous']);
  assert.equal(selection.comparison.label, '+100% vs prior');
  assert.equal(selection.sourceCount, 1);
  assert.equal(selection.previousAvailable, true);
});

test('a week in progress is compared with the same elapsed days of the preceding week', () => {
  const week = Date.parse('2026-11-09T00:00:00Z');
  const records = normalizeSmartRecords({ status: 'OK', records: [
    record('this-week', '2026-11-10T09:00:00Z'),
    record('same-days', '2026-11-03T09:00:00Z'),
    record('later-days', '2026-11-06T09:00:00Z')
  ] });
  const selection = buildHeatmapSelection(records, 'regulatory', week, NOW);
  assert.equal(selection.inProgress, true);
  assert.equal(selection.elapsedDays, 3);
  assert.deepEqual(selection.previous.map(item => item.id), ['same-days']);
  assert.equal(selection.comparison.label, 'No change');
});

test('a preceding week before the archive floor is never invented', () => {
  const selection = buildHeatmapSelection([], 'regulatory', Date.parse('2024-11-04T00:00:00Z'), NOW);
  assert.equal(selection.previousAvailable, false);
  assert.equal(selection.comparison, null);
  const empty = buildHeatmapSelection([], 'regulatory', Date.parse('2026-11-02T00:00:00Z'), NOW);
  assert.equal(empty.current.length, 0);
  assert.equal(empty.comparison.label, 'No activity');
});

const bis = {
  ...base, id: 'bis-1', title: 'BIS CPMI cashless payments statistics — India', dataClass: 'STATISTICAL_REFERENCE', recordType: 'BIS_OBSERVATION',
  publishedAt: '2024-12-31T00:00:00.000Z', canonicalUrl: 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CPMI_CASHLESS/1.0/*?c%5BREP_CTY%5D=IN',
  observationPeriod: '2024-Q4', observationDate: '2024-12-31', providerReleaseDate: '2025-11-01', statisticalValue: 4821.5,
  unitMeasure: 'USD', unitMultiplier: '6', countryCode: 'IN', source: { name: 'BIS Statistics', trustTier: 'T1' },
  dimensions: { FREQ: 'Q', REP_CTY: 'IN', nested: { ignored: true } }
};
const hyperswitch = {
  ...base, id: 'hs-1', title: 'Hyperswitch change 2e1e7bd63a86', dataClass: 'TECHNICAL_REFERENCE', recordType: 'TECHNICAL_CHANGE',
  publishedAt: '2026-03-28T12:02:30.000Z', referenceDate: '2026-03-28', product: 'Hyperswitch', repository: 'juspay/hyperswitch',
  canonicalUrl: 'https://github.com/juspay/hyperswitch/commit/2e1e7bd63a8614fce68fbd1f0780dd83b79c703f',
  source: { name: 'Hyperswitch official repository', trustTier: 'T2' }
};

test('BIS observation metadata is carried through unchanged and flagged as machine-readable source data', () => {
  const [item] = normalizeSmartRecords({ status: 'OK', records: [bis] });
  assert.equal(item.statisticalValue, 4821.5);
  assert.equal(item.unitMeasure, 'USD');
  assert.equal(item.unitMultiplier, '6');
  assert.equal(item.observationPeriod, '2024-Q4');
  assert.equal(item.url, bis.canonicalUrl);
  assert.deepEqual(item.dimensions, [{ key: 'FREQ', value: 'Q' }, { key: 'REP_CTY', value: 'IN' }]);
  const kind = evidenceKind(item);
  assert.equal(kind.id, 'statistical');
  assert.match(kind.note, /machine-readable source data/i);
  assert.match(kind.linkLabel, /SDMX XML/);
});

test('a missing or non-numeric statistical value stays absent instead of becoming zero', () => {
  const [missing] = normalizeSmartRecords({ status: 'OK', records: [{ ...bis, id: 'bis-2', statisticalValue: null }] });
  const [text] = normalizeSmartRecords({ status: 'OK', records: [{ ...bis, id: 'bis-3', statisticalValue: '12' }] });
  assert.equal(missing.statisticalValue, null);
  assert.equal(text.statisticalValue, null);
});

test('Hyperswitch GitHub records are technical repository evidence, never payments-industry announcements', () => {
  const [item] = normalizeSmartRecords({ status: 'OK', records: [hyperswitch] });
  const kind = evidenceKind(item);
  assert.equal(kind.id, 'technical');
  assert.equal(kind.label, 'Technical repository evidence');
  assert.match(kind.note, /not a payments-industry announcement/i);
  const change = describeTechnicalChange(item);
  assert.equal(change.type, 'Repository commit');
  assert.equal(change.reference, '2e1e7bd63a86');
  assert.match(change.description, /does not include a commit message/);
  const release = describeTechnicalChange({ ...item, recordType: 'SOFTWARE_RELEASE', url: 'https://github.com/juspay/hyperswitch/releases/tag/v1.2.3' });
  assert.equal(release.type, 'Software release');
  assert.equal(release.reference, 'v1.2.3');
  assert.equal(evidenceKind({ dataClass: '' }), null);
});

test('rendering escapes record fields and keeps authoritative links external and noopener', () => {
  assert.match(script, /evidenceMarkup\(record, kind\)/);
  assert.match(script, /escapeHtml\(note\)/);
  assert.match(script, /escapeHtml\(value\)/);
  assert.match(script, /rel="noopener noreferrer"/);
  assert.doesNotMatch(script, /\b(predict|forecast|projected|expected to)\b/i);
});

test('logo uses the approved brand mark unfiltered with a fixed square footprint', () => {
  assert.match(page, /assets\/branding\/logos\/fo-mark\.svg/);
  assert.doesNotMatch(baseCss, /\.smi-brand img\{[^}]*filter/);
  assert.match(baseCss, /\.smi-brand img\{[^}]*width:2\.75rem;height:2\.75rem;aspect-ratio:1;object-fit:contain/);
  assert.match(baseCss, /\.smi-nav\{[^}]*background:#fff/);
});

test('summary cards use the light editorial theme instead of dark navy fills', () => {
  const topSignal = /\.gpir-sc \.smi-top-signal,\.gpir-sc \.smi-supporting\{([^}]*)\}/.exec(css)[1];
  assert.match(topSignal, /background:#fff/);
  assert.doesNotMatch(css, /linear-gradient\(135deg,var\(--sc-navy\)/);
  assert.doesNotMatch(baseCss, /\.smi-hero\{[^}]*var\(--smi-navy\),#123c62/);
});

test('heatmap is an accessible, keyboard-operable selection grid with a live status', () => {
  assert.match(script, /class="smi-heat-cell"[^`]*aria-pressed="\$\{isSelected\}"[^`]*aria-label=/);
  assert.match(script, /tabindex="\$\{/);
  assert.match(script, /ArrowLeft[\s\S]*ArrowRight[\s\S]*ArrowUp[\s\S]*ArrowDown[\s\S]*Home[\s\S]*End/);
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(page, /data-smart-heat-detail/);
  assert.match(page, /role="status" data-smart-heat-status/);
  assert.match(page, /aria-describedby="smi-heat-hint"/);
});

test('refinement keeps data contracts, periods, geography filters and the 12-hour live window', () => {
  assert.match(script, /INTELLIGENCE_PATH = '\/functions\/v1\/gpir-public-intelligence\?scope=history&limit=100'/);
  assert.match(script, /LIVE_PATH = '\/functions\/v1\/gpir-public-alerts'/);
  assert.match(script, /12 \* 60 \* 60 \* 1000/);
  for (const period of ['24H', '7D', '30D', 'QTD', 'YTD', 'CUSTOM']) assert.match(page, new RegExp(`data-smart-period="${period}"`));
  for (const geo of ['global', 'apac', 'europe', 'americas', 'mea']) assert.match(page, new RegExp(`<option value="${geo}">`));
  assert.match(page, /data-smart-alert/);
  assert.match(page, /data-smart-compare-window/);
});
