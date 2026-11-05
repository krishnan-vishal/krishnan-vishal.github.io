'use strict';
/* Official ECB CSV fallback. Never invent dates or rates. */
const URL = 'https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A';
const SOURCE = 'ecb-official-csv';
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === value;
}
function csvFields(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index=0; index<line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      fields.push(field.trim());
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('FX_HISTORY_INVALID_ECB_CSV');
  fields.push(field.trim());
  return fields;
}
function parseCsv(text, from, to) {
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('FX_HISTORY_INVALID_DATE_RANGE');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error('FX_HISTORY_INVALID_ECB_CSV');
  const headers = csvFields(lines[0]);
  const required = ['FREQ','CURRENCY','CURRENCY_DENOM','EXR_TYPE','EXR_SUFFIX',
    'TIME_PERIOD','OBS_VALUE'];
  if (new Set(headers).size !== headers.length ||
      !required.every(header => headers.includes(header))) {
    throw new Error('FX_HISTORY_INVALID_ECB_CSV');
  }
  const at = Object.fromEntries(headers.map((header,index) => [header,index]));
  const observations = new Map();
  const firstDates = new Map();
  for (const line of lines.slice(1)) {
    const fields = csvFields(line);
    const currency = fields[at.CURRENCY];
    const date = fields[at.TIME_PERIOD];
    const value = Number(fields[at.OBS_VALUE]);
    if (fields.length !== headers.length || fields[at.FREQ] !== 'D' ||
        !/^[A-Z]{3}$/.test(currency || '') || fields[at.CURRENCY_DENOM] !== 'EUR' ||
        fields[at.EXR_TYPE] !== 'SP00' || fields[at.EXR_SUFFIX] !== 'A' ||
        !validDate(date) || !Number.isFinite(value) || value <= 0) {
      throw new Error('FX_HISTORY_INVALID_ECB_CSV');
    }
    if (date < from || date > to) continue;
    if (!observations.has(date)) observations.set(date, new Map());
    if (observations.get(date).has(currency)) throw new Error('FX_HISTORY_CONFLICTING_SOURCE_RATE');
    observations.get(date).set(currency, value);
    if (!firstDates.has(currency) || date < firstDates.get(currency)) firstDates.set(currency, date);
  }
  if (!observations.size) throw new Error('FX_HISTORY_NO_SOURCE_OBSERVATIONS');
  const catalog = new Map([['EUR', {code:'EUR', name:'Euro', startDate:from, endDate:null}]]);
  for (const [code, startDate] of firstDates) {
    catalog.set(code, {code, name:code, startDate, endDate:null});
  }
  return {catalog, observations};
}
async function recoverFromEcbCsv({config,from,to,fetchImpl,buildRecovery,windows}) {
  const observations = new Map();
  const catalog = new Map([['EUR', {code:'EUR',name:'Euro',startDate:from,endDate:null}]]);
  for (const window of windows || [{from,to}]) {
    const query = new URLSearchParams({startPeriod:window.from,endPeriod:window.to,
      format:'csvdata'});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),30000);
    try {
      const response = await fetchImpl(`${URL}?${query}`, {headers:{accept:'text/csv',
        'user-agent':'FINTECHOISIS-GPIR-FX/1.0'},signal:controller.signal});
      if (!response.ok) throw new Error('FX_HISTORY_ECB_CSV_HTTP_' + response.status);
      const parsed = parseCsv(await response.text(),window.from,window.to);
      for (const [code,metadata] of parsed.catalog) {
        if (!catalog.has(code) || metadata.startDate < catalog.get(code).startDate) {
          catalog.set(code,metadata);
        }
      }
      for (const [date,rates] of parsed.observations) {
        if (observations.has(date)) throw new Error('FX_HISTORY_CONFLICTING_SOURCE_RATE');
        observations.set(date,rates);
      }
    } finally {clearTimeout(timer);}
  }
  if (!observations.size) throw new Error('FX_HISTORY_NO_SOURCE_OBSERVATIONS');
  return buildRecovery({config,catalog,observations,from,to,source:SOURCE,
    sourceName:'European Central Bank official Data API CSV',sourceUrl:URL});
}
module.exports = {URL,SOURCE,csvFields,parseCsv,recoverFromEcbCsv};
