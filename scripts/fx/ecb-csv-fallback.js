'use strict';
/* Official ECB CSV fallback. Never invent dates or rates. */
const URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.csv';
const SOURCE = 'ecb-official-csv';
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === value;
}
function parseCsv(text, from, to) {
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('FX_HISTORY_INVALID_DATE_RANGE');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error('FX_HISTORY_INVALID_ECB_CSV');
  const headers = lines[0].split(',').map(x => x.trim());
  if (headers[0] !== 'Date' || new Set(headers).size !== headers.length ||
      !headers.slice(1).every(x => x === '' || /^[A-Z]{3}$/.test(x)) ||
      !headers.includes('USD')) throw new Error('FX_HISTORY_INVALID_ECB_CSV');
  const observations = new Map();
  const firstDates = new Map();
  const lastDates = new Map();
  for (const line of lines.slice(1)) {
    const fields = line.split(',').map(x => x.trim());
    if (fields.length !== headers.length || !validDate(fields[0])) throw new Error('FX_HISTORY_INVALID_ECB_CSV');
    const date = fields[0];
    if (date < from || date > to) continue;
    if (observations.has(date)) throw new Error('FX_HISTORY_CONFLICTING_SOURCE_RATE');
    const rates = new Map();
    for (let i=1; i<headers.length; i++) {
      const code = headers[i], raw = fields[i];
      if (!code || !raw || raw === 'N/A') continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) throw new Error('FX_HISTORY_INVALID_ECB_CSV');
      rates.set(code, value);
      if (!firstDates.has(code) || date < firstDates.get(code)) firstDates.set(code, date);
      if (!lastDates.has(code) || date > lastDates.get(code)) lastDates.set(code, date);
    }
    if (rates.size) observations.set(date, rates);
  }
  if (!observations.size) throw new Error('FX_HISTORY_NO_SOURCE_OBSERVATIONS');
  const catalog = new Map([['EUR', {code:'EUR', name:'Euro', startDate:from, endDate:null}]]);
  for (const [code, startDate] of firstDates) {
    catalog.set(code, {code, name:code, startDate, endDate:null});
  }
  return {catalog, observations};
}
async function recoverFromEcbCsv({config,from,to,fetchImpl,buildRecovery}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetchImpl(URL, {headers:{accept:'text/csv','user-agent':'FINTECHOISIS-GPIR-FX/1.0'},signal:controller.signal});
    if (!response.ok) throw new Error('FX_HISTORY_ECB_CSV_HTTP_' + response.status);
    const {catalog,observations} = parseCsv(await response.text(),from,to);
    return buildRecovery({config,catalog,observations,from,to,source:SOURCE,
      sourceName:'European Central Bank official historical CSV',sourceUrl:URL});
  } finally {clearTimeout(timer);}
}
module.exports = {URL,SOURCE,parseCsv,recoverFromEcbCsv};
