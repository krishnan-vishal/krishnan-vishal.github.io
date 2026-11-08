const BIS_API_ORIGIN = 'https://stats.bis.org';
export const BIS_TERMS_URL = 'https://data.bis.org/help/legal';
export const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

export const BIS_DATAFLOWS = Object.freeze({
  WS_CPMI_CASHLESS: Object.freeze({
    title: 'CPMI cashless payments', topic: 'Payments', countryDimension: 'REP_CTY',
    releaseCategory: 'CPMI_CT', releaseType: 'S', defaultFilters: Object.freeze({})
  }),
  WS_CPMI_SYSTEMS: Object.freeze({
    title: 'CPMI payment systems', topic: 'Payment infrastructure', countryDimension: 'REP_CTY',
    releaseCategory: 'CPMI_FMI', releaseType: 'S', defaultFilters: Object.freeze({})
  }),
  WS_CBPOL: Object.freeze({
    title: 'Central bank policy rates', topic: 'Monetary policy', countryDimension: 'REF_AREA',
    releaseCategory: 'CBPOL', releaseType: null, defaultFilters: Object.freeze({})
  }),
  WS_LBS_D_PUB: Object.freeze({
    title: 'Locational banking statistics', topic: 'Cross-border banking', countryDimension: 'L_REP_CTY',
    releaseCategory: 'LBS', releaseType: 'S',
    defaultFilters: Object.freeze({
      L_MEASURE: 'S', L_INSTR: 'A', L_DENOM: 'TO1', L_CURR_TYPE: 'A',
      L_PARENT_CTY: '5J', L_REP_BANK_TYPE: 'A', L_CP_SECTOR: 'A',
      L_CP_COUNTRY: '5J', L_POS_TYPE: 'N'
    })
  })
});

export const GDELT_TOPICS = Object.freeze({
  remittances: '"remittances" OR "money transfer"',
  'cross-border-payments': '"cross-border payments"',
  wallets: '"digital wallet" OR "mobile money"',
  bnpl: '"buy now pay later" OR "BNPL"',
  fintech: '"fintech" AND (payments OR banking)'
});

function approvedFlow(dataflow) {
  const value = String(dataflow || '').trim().toUpperCase();
  if (!Object.hasOwn(BIS_DATAFLOWS, value)) throw new Error('BIS_APPROVED_DATAFLOW_REQUIRED');
  return [value, BIS_DATAFLOWS[value]];
}

function validPeriod(value) {
  return /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|-(?:Q[1-4]|S[12]))?$/.test(String(value || ''));
}

function validDimensionValue(value) {
  return /^[A-Z0-9_.-]{1,32}(?:\+[A-Z0-9_.-]{1,32})*$/i.test(String(value || ''));
}

export function buildBisDataUrl({ dataflow, startPeriod, endPeriod, countryCodes,
  componentFilters = {}, lastNObservations = 4 } = {}) {
  const [flow, config] = approvedFlow(dataflow);
  if (!validPeriod(startPeriod) || !validPeriod(endPeriod) || startPeriod > endPeriod)
    throw new Error('BIS_INVALID_PERIOD_WINDOW');
  if (!Number.isInteger(lastNObservations) || lastNObservations < 1 || lastNObservations > 24)
    throw new Error('BIS_INVALID_OBSERVATION_WINDOW');
  const countries = Array.isArray(countryCodes)
    ? [...new Set(countryCodes.map(value => String(value || '').trim().toUpperCase()))]
    : [];
  if (!countries.length || countries.length > 8 || countries.some(value => !/^[A-Z0-9]{2,3}$/.test(value)))
    throw new Error('BIS_BOUNDED_COUNTRY_FILTER_REQUIRED');
  const filters = { ...config.defaultFilters, ...componentFilters,
    [config.countryDimension]: countries.join('+') };
  for (const [dimension, value] of Object.entries(filters)) {
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(dimension) || !validDimensionValue(value))
      throw new Error('BIS_INVALID_COMPONENT_FILTER');
  }
  const url = new URL(`/api/v2/data/dataflow/BIS/${flow}/1.0/*`, BIS_API_ORIGIN);
  for (const [dimension, value] of Object.entries(filters))
    url.searchParams.set(`c[${dimension}]`, value);
  url.searchParams.set('c[TIME_PERIOD]', `ge:${startPeriod}+le:${endPeriod}`);
  url.searchParams.set('lastNObservations', String(lastNObservations));
  return url.toString();
}

export function buildBisReleaseCalendarUrl({ category, releaseType, startPeriod, endPeriod } = {}) {
  if (!/^[A-Z0-9_]{2,32}$/.test(String(category || '')) ||
      (releaseType != null && !/^[A-Z0-9_]{1,16}$/.test(String(releaseType))) ||
      !validPeriod(startPeriod) || !validPeriod(endPeriod) || startPeriod > endPeriod)
    throw new Error('BIS_RELEASE_CALENDAR_FILTER_INVALID');
  const url = new URL('/api/v2/data/dataflow/BIS/BIS_REL_CAL/1.0/*', BIS_API_ORIGIN);
  url.searchParams.set('c[CATEGORY]', category);
  if (releaseType) url.searchParams.set('c[RELEASE_TYPE]', releaseType);
  url.searchParams.set('c[TIME_PERIOD]', `ge:${startPeriod}+le:${endPeriod}`);
  return url.toString();
}

export function csvRows(text, { maxBytes = 8_000_000, maxRows = 20_001 } = {}) {
  if (typeof text !== 'string' || text.length > maxBytes) throw new Error('BIS_CSV_SIZE_INVALID');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (!quoted && field === '') quoted = true;
      else if (quoted) quoted = false;
      else throw new Error('BIS_CSV_QUOTING_INVALID');
    } else if (character === ',' && !quoted) { row.push(field); field = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(value => value.trim())) rows.push(row);
      row = []; field = '';
      if (rows.length > maxRows) throw new Error('BIS_CSV_ROW_LIMIT');
    } else field += character;
  }
  if (quoted) throw new Error('BIS_CSV_UNTERMINATED_QUOTE');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function table(text, options) {
  const rows = csvRows(text, options);
  if (!rows.length) throw new Error('BIS_EMPTY_CSV');
  const headers = rows[0].map(value => value.trim().toUpperCase());
  if (new Set(headers).size !== headers.length) throw new Error('BIS_DUPLICATE_COLUMNS');
  return { headers, rows: rows.slice(1) };
}

export function observationDate(period) {
  if (!validPeriod(period)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  if (/^\d{4}$/.test(period)) return `${period}-12-31`;
  const quarter = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarter) {
    const month = Number(quarter[2]) * 3;
    return new Date(Date.UTC(Number(quarter[1]), month, 0)).toISOString().slice(0, 10);
  }
  const half = period.match(/^(\d{4})-S([12])$/);
  if (half) return `${half[1]}-${half[2] === '1' ? '06-30' : '12-31'}`;
  const month = period.match(/^(\d{4})-(\d{2})$/);
  if (month) return new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).toISOString().slice(0, 10);
  return null;
}

export function parseBisSdmxCsv(csv, { dataflow, sourceUrl, maxObservations = 2000,
  releaseDates = {} } = {}) {
  const [flow, config] = approvedFlow(dataflow);
  if (!Number.isInteger(maxObservations) || maxObservations < 1 || maxObservations > 10_000)
    throw new Error('BIS_INVALID_LIMIT');
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'stats.bis.org' ||
      url.pathname !== `/api/v2/data/dataflow/BIS/${flow}/1.0/*`)
    throw new Error('BIS_SOURCE_URL_NOT_OFFICIAL');
  const { headers, rows } = table(csv);
  for (const required of ['DATAFLOW', 'TIME_PERIOD', 'OBS_VALUE'])
    if (!headers.includes(required)) throw new Error('BIS_MISSING_SDMX_COLUMNS');
  const timeIndex = headers.indexOf('TIME_PERIOD');
  const valueIndex = headers.indexOf('OBS_VALUE');
  const dataflowIndex = headers.indexOf('DATAFLOW');
  const seen = new Set();
  const observations = [];
  for (const cells of rows) {
    if (cells.length !== headers.length) throw new Error('BIS_CSV_COLUMN_MISMATCH');
    const responseFlow = cells[dataflowIndex].trim();
    if (responseFlow !== `BIS:${flow}(1.0)`) throw new Error('BIS_DATAFLOW_RESPONSE_MISMATCH');
    const period = cells[timeIndex].trim();
    if (!validPeriod(period)) throw new Error('BIS_TIME_PERIOD_INVALID');
    const rawValue = cells[valueIndex].trim();
    if (rawValue === '' || rawValue === '_' || /^NaN$/i.test(rawValue)) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new Error('BIS_OBSERVATION_INVALID');
    const dimensions = {};
    headers.forEach((name, index) => {
      if (!['OBS_VALUE', 'TIME_PERIOD', 'DATAFLOW'].includes(name)) dimensions[name] = cells[index].trim();
    });
    const identity = JSON.stringify([flow, period, Object.entries(dimensions)]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    observations.push(Object.freeze({
      provider: 'BIS', dataflow: flow, dataflowVersion: '1.0', period,
      observationDate: observationDate(period), value, dimensions,
      providerReleaseDate: releaseDates[period] || null,
      sourceUrl: url.toString(), termsUrl: BIS_TERMS_URL, topic: config.topic,
      dataClass: 'STATISTICAL_REFERENCE', publicationStatus: 'NOT_PUBLISHED',
      alertEligible: false
    }));
    if (observations.length > maxObservations) throw new Error('BIS_OBSERVATION_LIMIT');
  }
  return observations;
}

export function parseBisReleaseCalendarCsv(csv, { category, releaseType = null,
  now = Date.now() } = {}) {
  const { headers, rows } = table(csv, { maxBytes: 1_000_000, maxRows: 5000 });
  for (const required of ['CATEGORY', 'RELEASE_TYPE', 'TIME_PERIOD', 'OBS_VALUE'])
    if (!headers.includes(required)) throw new Error('BIS_RELEASE_CALENDAR_COLUMNS_MISSING');
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  const dates = {};
  for (const cells of rows) {
    if (cells.length !== headers.length || cells[index.CATEGORY] !== category ||
        (releaseType && cells[index.RELEASE_TYPE] !== releaseType)) continue;
    const compact = cells[index.OBS_VALUE];
    if (!/^\d{8}$/.test(compact)) continue;
    const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    const timestamp = Date.parse(`${iso}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || timestamp > now) continue;
    const period = cells[index.TIME_PERIOD];
    if (!dates[period] || dates[period] < iso) dates[period] = iso;
  }
  return Object.freeze(dates);
}

export function buildGdeltQueryUrl(topic, { start, end, maxRecords = 20 } = {}) {
  if (!Object.hasOwn(GDELT_TOPICS, topic)) throw new Error('UNAPPROVED_GDELT_TOPIC');
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 50)
    throw new Error('INVALID_MAX_RECORDS');
  const url = new URL(GDELT_ENDPOINT);
  url.searchParams.set('query', GDELT_TOPICS[topic]);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'datedesc');
  url.searchParams.set('maxrecords', String(maxRecords));
  if (start || end) {
    if (!start || !end || !/^\d{14}$/.test(start) || !/^\d{14}$/.test(end) || start >= end)
      throw new Error('INVALID_DATE_WINDOW');
    const duration = Date.parse(`${end.slice(0,4)}-${end.slice(4,6)}-${end.slice(6,8)}T${end.slice(8,10)}:${end.slice(10,12)}:${end.slice(12,14)}Z`) -
      Date.parse(`${start.slice(0,4)}-${start.slice(4,6)}-${start.slice(6,8)}T${start.slice(8,10)}:${start.slice(10,12)}:${start.slice(12,14)}Z`);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 7 * 86400000)
      throw new Error('GDELT_WINDOW_EXCEEDS_SEVEN_DAYS');
    url.searchParams.set('startdatetime', start);
    url.searchParams.set('enddatetime', end);
  } else url.searchParams.set('timespan', '24h');
  return url.toString();
}

function gdeltTimestamp(value) {
  const stamp = String(value || '');
  if (!/^\d{14}$/.test(stamp)) return null;
  const iso = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:${stamp.slice(12,14)}Z`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

export function parseGdeltDiscovery(payload, topic, { maxRecords = 50 } = {}) {
  if (!Object.hasOwn(GDELT_TOPICS, topic)) throw new Error('UNAPPROVED_GDELT_TOPIC');
  if (!Array.isArray(payload?.articles)) throw new Error('GDELT_INVALID_RESPONSE');
  const seen = new Set();
  return payload.articles.flatMap(item => {
    let url;
    try {
      url = new URL(item?.url);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return [];
      url.hash = '';
    } catch { return []; }
    const gdeltSeenAt = gdeltTimestamp(item?.seendate);
    const title = String(item?.title || '').trim();
    if (!title || !gdeltSeenAt || seen.has(url.href)) return [];
    seen.add(url.href);
    return [Object.freeze({
      title: title.slice(0, 400), url: url.href, indexPublishedAt: null,
      discovery: Object.freeze({
        discoverySource: 'GDELT', topic, gdeltSeenAt,
        sourcePublicationTimestamp: null,
        originalDomain: url.hostname.toLowerCase(),
        providerDomain: typeof item.domain === 'string' ? item.domain.slice(0, 255) : null,
        language: typeof item.language === 'string' ? item.language.slice(0, 80) : null,
        sourceCountry: typeof item.sourcecountry === 'string' ? item.sourcecountry.slice(0, 80) : null,
        verificationStatus: 'SOURCE_VERIFICATION_REQUIRED', publicationStatus: 'NOT_PUBLISHED'
      })
    })];
  }).slice(0, maxRecords);
}
