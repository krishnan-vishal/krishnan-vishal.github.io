#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  BIS_DATAFLOWS, BIS_TERMS_URL, buildBisDataUrl, buildBisReleaseCalendarUrl,
  parseBisReleaseCalendarCsv, parseBisSdmxCsv
} from './bis-sdmx-csv.mjs';

const [dataflow, startPeriod, endPeriod, countriesJson = '[]', filtersJson = '{}',
  lastN = '4', maxObservations = '1000'] = process.argv.slice(2);
const countries = JSON.parse(countriesJson);
const componentFilters = JSON.parse(filtersJson);
const config = BIS_DATAFLOWS[dataflow];
if (!config) throw new Error('BIS_APPROVED_DATAFLOW_REQUIRED');

const sourceUrl = buildBisDataUrl({ dataflow, startPeriod, endPeriod,
  countryCodes: countries, componentFilters, lastNObservations: Number(lastN) });
const headers = {
  Accept: 'application/vnd.sdmx.data+csv;version=1.0.0',
  'User-Agent': 'GPIR-ResearchBot/1.0 (+https://fintechoisis.com)'
};
const response = await fetch(sourceUrl, { headers });
if (!response.ok) throw new Error(`BIS_FETCH_FAILED_HTTP_${response.status}`);
let releaseDates = {};
if (config.releaseType) {
  const releaseUrl = buildBisReleaseCalendarUrl({ category: config.releaseCategory,
    releaseType: config.releaseType, startPeriod, endPeriod });
  const releaseResponse = await fetch(releaseUrl, { headers });
  if (!releaseResponse.ok) throw new Error(`BIS_RELEASE_CALENDAR_FETCH_FAILED_HTTP_${releaseResponse.status}`);
  releaseDates = parseBisReleaseCalendarCsv(await releaseResponse.text(), {
    category: config.releaseCategory, releaseType: config.releaseType
  });
}
const observations = parseBisSdmxCsv(await response.text(), { dataflow, sourceUrl,
  maxObservations: Number(maxObservations), releaseDates });
const discoveredAt = new Date().toISOString();
const records = observations.map(observation => {
  const dimensions = observation.dimensions;
  const identity = JSON.stringify([dataflow, observation.period, Object.entries(dimensions)]);
  const providerReleaseDate = observation.providerReleaseDate;
  return {
    source_id: 'BIS-GLOBAL-001', discovered_url: sourceUrl, canonical_url: sourceUrl,
    raw_title: String(dimensions.TITLE || `${config.title} — ${observation.period}`).slice(0, 400),
    raw_content: JSON.stringify({ dataflow, period: observation.period, value: observation.value,
      dimensions, observation_date: observation.observationDate,
      provider_release_date: providerReleaseDate }),
    discovered_at: discoveredAt,
    source_published_at: providerReleaseDate ? `${providerReleaseDate}T00:00:00Z` : null,
    http_status: response.status,
    content_hash: createHash('sha256').update(identity).digest('hex'),
    ingestion_status: 'PROCESSED',
    metadata: {
      engine: 'M39-BIS-SDMX-V2', parser_profile: 'bis-sdmx-csv-v2',
      acquisition_method: 'A', provider: 'BIS', data_class: 'STATISTICAL_REFERENCE',
      dataflow, dataflow_version: '1.0', topic: config.topic,
      observation_period: observation.period, observation_date: observation.observationDate,
      provider_release_date: providerReleaseDate,
      release_date_status: providerReleaseDate ? 'VERIFIED_RELEASE_CALENDAR'
        : config.releaseType ? 'UNAVAILABLE_OR_NOT_YET_RELEASED' : 'AMBIGUOUS_BY_RELEASE_TYPE',
      country_dimension: config.countryDimension,
      country_code: dimensions[config.countryDimension] || null,
      frequency: dimensions.FREQ || null, unit_measure: dimensions.UNIT_MEASURE || null,
      unit_multiplier: dimensions.UNIT_MULT || null, dimensions, value: observation.value,
      source_url: sourceUrl, terms_url: BIS_TERMS_URL,
      publication_eligible: false, alert_eligible: false, dry_run: false
    }
  };
});
process.stdout.write(JSON.stringify({ dataflow, startPeriod, endPeriod, countries,
  sourceUrl, records }));
