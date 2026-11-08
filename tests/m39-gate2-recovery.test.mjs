import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { aggregateRpwCorridors } from '../scripts/intelligence/rpw-xlsx-quarterly.mjs';
import { buildGithubChangesUrl, buildGithubReleasesUrl, parseGithubReleaseHistory, parseGithubChangeHistory } from '../supabase/functions/_shared/gpir-public-source-adapters.mjs';
import { fetchTechnicalHistory } from '../supabase/functions/_shared/gpir-github-technical.mjs';

const source = 'HYPERSWITCH-OSS-001', since = '2024-01-01', until = '2024-12-31';
const sha = 'a'.repeat(40);
const release = { tag_name: 'v1.0', published_at: '2024-05-01T12:00:00Z', html_url: 'https://github.com/juspay/hyperswitch/releases/tag/v1.0', body: 'Release notes' };
const change = { sha, html_url: `https://github.com/juspay/hyperswitch/commit/${sha}`, commit: { committer: { date: '2024-05-02T12:00:00Z' }, message: 'Update connector' } };

test('GitHub source and record validation rejects spoofing, invalid dates and duplicate identities', () => {
  assert.throws(() => buildGithubReleasesUrl('toString'), /UNAPPROVED/);
  assert.throws(() => buildGithubChangesUrl(source, { since: '2024-02-30', until }), /INVALID/);
  assert.throws(() => buildGithubChangesUrl(source, { since, until, page: 1.5 }), /INVALID/);
  const parsed = parseGithubReleaseHistory([release, release, { ...release, tag_name: 'v2.0-rc1' }, { ...release, tag_name: 'v2', html_url: 'https://evil.example/juspay/hyperswitch/releases/tag/v2' }, { ...release, html_url: 'https://github.com/juspay/hyperswitch/releases/tag/other' }, { ...release, draft: true }], source, { since, until });
  assert.equal(parsed.length, 1);
  const changes = parseGithubChangeHistory([change, change, { ...change, html_url: `https://github.com/juspay/hyperswitch/commit/${'b'.repeat(40)}` }, { ...change, commit: { ...change.commit, committer: { date: '2025-01-01T00:00:00Z' } } }], source, { since, until });
  assert.equal(changes.length, 1);
});

test('acquisition deduplicates both histories and classifies only non-publishable references', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => url.includes('/releases?') ? [release, release] : [change, change] };
  };
  const first = await fetchTechnicalHistory({ sourceId: source, since, until, fetchImpl });
  const second = await fetchTechnicalHistory({ sourceId: source, since, until, fetchImpl });
  assert.deepEqual(first.records.map(record => record.content_hash), second.records.map(record => record.content_hash));
  assert.deepEqual(first.records.map(record => record.metadata.record_type), ['SOFTWARE_RELEASE', 'TECHNICAL_CHANGE']);
  assert.equal(first.statistics.releases_discovered, 1);
  assert.equal(first.statistics.changes_discovered, 1);
  assert.equal(first.records[1].source_published_at, null);
  assert.equal(first.records[1].metadata.commit_timestamp, '2024-05-02T12:00:00Z');
  for (const record of first.records) {
    assert.equal(record.metadata.data_class, 'TECHNICAL_REFERENCE');
    assert.equal(record.metadata.publication_eligible, false);
    assert.equal(record.metadata.alert_eligible, false);
    assert.equal(record.metadata.settlement_telemetry, false);
    assert.equal(record.ingestion_status, 'PROCESSED');
    assert.match(record.discovered_url, /^https:\/\/api\.github\.com\//);
  }
  assert.ok(requests.every(request => request.options.redirect === 'error'));
  await assert.rejects(fetchTechnicalHistory({ sourceId: source, since, until, fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP_403/);
});

test('page limit is explicit even when duplicate records span pages', async () => {
  const result = await fetchTechnicalHistory({ sourceId: source, since, until, maxPages: 1, fetchImpl: async url => ({ ok: true, status: 200, json: async () => url.includes('/releases?') ? Array(100).fill(release) : [] }) });
  assert.equal(result.records.length, 1);
  assert.equal(result.statistics.possibly_truncated.releases, true);
});

test('full change pages trigger date subdivision without losing or duplicating records', async () => {
  const requests = [];
  const result = await fetchTechnicalHistory({ sourceId: source, since: '2024-05-01', until: '2024-05-02', maxPages: 1, fetchImpl: async url => {
    requests.push(url);
    if (url.includes('/releases?')) return { ok: true, status: 200, json: async () => [] };
    const query = new URL(url).searchParams;
    return { ok: true, status: 200, json: async () => query.get('since').slice(0, 10) !== query.get('until').slice(0, 10) ? Array(100).fill(change) : query.get('since').startsWith('2024-05-02') ? [change] : [] };
  } });
  assert.equal(result.statistics.possibly_truncated.changes, false);
  assert.equal(result.statistics.pages_fetched.changes, 3);
  assert.equal(result.records.length, 1);
  assert.equal(requests.length, 4);
});

test('RPW aggregates two eras, excludes missing and non-$200 costs, and retains missing quarters', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gpir-rpw-test-'));
  const headers = ['id','period','source_code','source_name','destination_code','destination_name','firm','cc1 denomination amount','cc1 total cost %'];
  const row = values => `<row>${values.map((value, index) => `<c r="${String.fromCharCode(65 + index)}1" t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`;
  const writeSheet = (name, rows) => { const path = join(directory, name); writeFileSync(path, `<worksheet><sheetData>${[headers, ...rows].map(row).join('')}</sheetData></worksheet>`); return path; };
  const quote = (period, firm, denomination, cost) => [firm, period, 'AUS', 'Australia', 'FJI', 'Fiji', firm, denomination, cost];
  try {
    const sheets = [writeSheet('historical.xml', [quote('2011_1Q','One','200','10'), quote('2011_1Q','One','200','10'), quote('2011_1Q','Two','200','20'), quote('2011_1Q','Bad','200',''), quote('2011_1Q','Bad','500','5')]), writeSheet('recent.xml', [quote('2016_2Q','One','200.00','120')])];
    const result = await aggregateRpwCorridors({ sheets, sharedStrings: [], startPeriod: '2011-Q1', endPeriod: '2016-Q2' });
    assert.deepEqual(result.records.map(record => record.metadata.observation_period), ['2011-Q1', '2016-Q2']);
    assert.equal(result.statistics.records_rejected, 2);
    assert.equal(result.statistics.rows_duplicate, 1);
    assert.equal(result.records[0].metadata.value, 15);
    assert.equal(result.records[0].metadata.median_value, 15);
    assert.equal(result.records[0].metadata.quote_count, 2);
    assert.equal(result.records[1].metadata.value, 120);
    assert.equal(result.records[0].metadata.publication_eligible, false);
    assert.equal(result.records[0].source_published_at, null);
    assert.equal(result.records[0].http_status, null);
    assert.equal(JSON.parse(result.records[0].raw_content).denomination_usd, 200);
    assert.equal(JSON.parse(result.records[0].raw_content).observation_date_basis, 'quarter_end_not_survey_date');
    const conflicting = writeSheet('conflicting.xml', [quote('2011_1Q','One','200','10'), quote('2011_1Q','One','200','11')]);
    await assert.rejects(aggregateRpwCorridors({ sheets: [conflicting], sharedStrings: [], startPeriod: '2011-Q1', endPeriod: '2016-Q2' }), /RPW_CONFLICTING_QUOTE_ID/);
    const badSheet = writeSheet('bad.xml', []);
    writeFileSync(badSheet, '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>wrong</t></is></c></row></sheetData></worksheet>');
    await assert.rejects(aggregateRpwCorridors({ sheets: [badSheet], sharedStrings: [], startPeriod: '2011-Q1', endPeriod: '2016-Q2' }), /RPW_REQUIRED_HEADERS_MISSING/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Edge integration requires registry profile, run claim and reference-only staging', () => {
  const edge = readFileSync(new URL('../supabase/functions/gpir-intelligence-fetch/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /TECHNICAL_SOURCE_REGISTRY_MISMATCH/);
  assert.match(edge, /TECHNICAL_SOURCE_PROFILE_MISMATCH/);
  assert.match(edge, /gpir_claim_intelligence_source_run/);
  assert.match(edge, /TECHNICAL_DEDUP_READ_ERROR/);
  assert.match(edge, /publication_attempted: false, alert_eligible: false/);
});