import assert from 'node:assert/strict';
import {
  buildBisDataUrl, csvRows, observationDate, parseBisReleaseCalendarCsv,
  parseBisSdmxCsv
} from '../scripts/intelligence/bis-sdmx-csv.mjs';

const url = buildBisDataUrl({
  dataflow: 'WS_CPMI_CASHLESS', startPeriod: '2023', endPeriod: '2024',
  countryCodes: ['IN', 'SG'], lastNObservations: 2
});
const parsedUrl = new URL(url);
assert.equal(parsedUrl.pathname, '/api/v2/data/dataflow/BIS/WS_CPMI_CASHLESS/1.0/*');
assert.equal(parsedUrl.searchParams.get('c[REP_CTY]'), 'IN+SG');
assert.equal(parsedUrl.searchParams.get('c[TIME_PERIOD]'), 'ge:2023+le:2024');

const sample = 'DATAFLOW,FREQ,REP_CTY,TIME_PERIOD,OBS_VALUE,UNIT_MULT,UNIT_MEASURE,TITLE\n' +
  'BIS:WS_CPMI_CASHLESS(1.0),A,IN,2024,12.5,6,373,"India, payments"\n' +
  'BIS:WS_CPMI_CASHLESS(1.0),A,IN,2024,12.5,6,373,"India, payments"\n' +
  'BIS:WS_CPMI_CASHLESS(1.0),A,SG,2023,10.25,6,373,Singapore payments\n';
const result = parseBisSdmxCsv(sample, {
  dataflow: 'WS_CPMI_CASHLESS', sourceUrl: url,
  releaseDates: { 2024: '2026-04-27', 2023: '2025-03-25' }
});
assert.equal(result.length, 2);
assert.equal(result[0].value, 12.5);
assert.equal(result[0].dimensions.REP_CTY, 'IN');
assert.equal(result[0].providerReleaseDate, '2026-04-27');
assert.equal(result[0].observationDate, '2024-12-31');
assert.equal(result[0].publicationStatus, 'NOT_PUBLISHED');
assert.equal(result[0].alertEligible, false);
assert.equal(csvRows('a,b\n"x,y",z\n')[1][0], 'x,y');
assert.equal(observationDate('2026-Q2'), '2026-06-30');
assert.equal(observationDate('2026-02'), '2026-02-28');
assert.throws(() => buildBisDataUrl({ dataflow: 'WS_CBP', startPeriod: '2024', endPeriod: '2025', countryCodes: ['US'] }), /APPROVED_DATAFLOW/);
assert.throws(() => buildBisDataUrl({ dataflow: 'WS_CBPOL', startPeriod: '2024', endPeriod: '2025', countryCodes: [] }), /COUNTRY_FILTER_REQUIRED/);
assert.throws(() => parseBisSdmxCsv(sample, { dataflow: 'WS_CPMI_CASHLESS', sourceUrl: 'https://example.org/api/' }), /NOT_OFFICIAL/);
assert.throws(() => parseBisSdmxCsv('DATAFLOW,TIME_PERIOD,OBS_VALUE\nBIS:WS_CBPOL(1.0),2025,bad', {
  dataflow: 'WS_CBPOL', sourceUrl: buildBisDataUrl({ dataflow: 'WS_CBPOL', startPeriod: '2025', endPeriod: '2025', countryCodes: ['IN'] })
}), /OBSERVATION_INVALID/);

const calendar = 'DATAFLOW,FREQ,CATEGORY,RELEASE_TYPE,TIME_PERIOD,OBS_VALUE\n' +
  'BIS:BIS_REL_CAL(1.0),A,CPMI_CT,S,2024,20260427\n' +
  'BIS:BIS_REL_CAL(1.0),A,CPMI_CT,S,2025,20270427\n';
assert.deepEqual(parseBisReleaseCalendarCsv(calendar, {
  category: 'CPMI_CT', releaseType: 'S', now: Date.parse('2026-11-08T00:00:00Z')
}), { 2024: '2026-04-27' });
console.log('BIS SDMX v2 parser, dimensions, release-date and deduplication checks PASS');
