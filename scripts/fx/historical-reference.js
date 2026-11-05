#!/usr/bin/env node
/* Frankfurter/ECB historical recovery for the existing GPIR FX universe. */

const { requestedPairs } = require("./generate-fx-snapshot.js");
const { regionForPair } = require("./archive-supabase.js");

const ORIGIN = "https://api.frankfurter.dev";
const SOURCE = "frankfurter-ecb";
const { recoverFromEcbCsv } = require("./ecb-csv-fallback.js");

function validDate(value){
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function monthWindows(from, to){
    if(!validDate(from) || !validDate(to) || from > to) throw new Error("FX_HISTORY_INVALID_DATE_RANGE");
    const windows = [];
    let cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while(cursor <= end){
        const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
        const windowEnd = new Date(Math.min(end.getTime(), nextMonth.getTime() - 86400000));
        windows.push({ from: cursor.toISOString().slice(0, 10), to: windowEnd.toISOString().slice(0, 10) });
        cursor = nextMonth;
    }
    return windows;
}

async function fetchJson(fetchImpl, path){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try{
        const response = await fetchImpl(`${ORIGIN}/v2/${path}`, {
            headers: { accept: "application/json", "user-agent": "FINTECHOISIS-GPIR-FX/1.0" },
            signal: controller.signal
        });
        if(!response.ok) throw new Error(`FX_HISTORY_SOURCE_HTTP_${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function normalizeCatalog(payload){
    if(!Array.isArray(payload) || payload.length === 0) throw new Error("FX_HISTORY_INVALID_CURRENCY_CATALOG");
    const catalog = new Map();
    payload.forEach(item => {
        const code = item?.iso_code;
        if(!/^[A-Z]{3}$/.test(code || "") || typeof item?.name !== "string" ||
            !validDate(item.start_date) || (item.end_date != null &&
            (!validDate(item.end_date) || item.end_date < item.start_date)) || catalog.has(code)){
            throw new Error("FX_HISTORY_INVALID_CURRENCY_CATALOG");
        }
        catalog.set(code, { code, name: item.name.trim(), startDate: item.start_date,
            endDate: item.end_date || null });
    });
    return catalog;
}

function activeOn(metadata, date){
    return Boolean(metadata && metadata.startDate <= date &&
        (!metadata.endDate || metadata.endDate >= date));
}

function rateMethod(pair){
    const [base, quote] = pair.split("/");
    if(base === "EUR") return "provider-native";
    if(quote === "EUR") return "derived-inverse";
    return "derived-cross";
}

function compactMissingPeriods(missing, expected){
    const missingSet = new Set(missing);
    const periods = [];
    let current = null;
    expected.forEach(date => {
        if(!missingSet.has(date)){
            if(current) periods.push(current);
            current = null;
            return;
        }
        if(!current) current = { from: date, to: date, observationDates: 1 };
        else {
            current.to = date;
            current.observationDates++;
        }
    });
    if(current) periods.push(current);
    return periods;
}

function buildRecovery({ config, catalog, observations, from, to, source = SOURCE, sourceName = "European Central Bank via Frankfurter", sourceUrl = "https://frankfurter.dev/providers/ecb/" }){
    const pairs = requestedPairs(config).pairs;
    const expectedDates = [...observations.keys()].sort();
    const rows = [];
    const coverage = pairs.map(pair => {
        const [base, quote] = pair.split("/");
        const unsupportedCurrencies = [base, quote].filter(code => !catalog.has(code));
        const method = rateMethod(pair);
        if(unsupportedCurrencies.length){
            return { pair, supported: false, unsupportedCurrencies, rateMethod: null,
                source, earliestDate: null, latestDate: null,
                distinctObservationDates: 0, missingPeriods: [] };
        }
        const eligibleDates = expectedDates.filter(date => date >= from && date <= to &&
            activeOn(catalog.get(base), date) && activeOn(catalog.get(quote), date));
        const pairRows = [];
        const missing = [];
        eligibleDates.forEach(date => {
            const rates = observations.get(date);
            const baseRate = base === "EUR" ? 1 : rates.get(base);
            const quoteRate = quote === "EUR" ? 1 : rates.get(quote);
            if(!Number.isFinite(baseRate) || baseRate <= 0 ||
                !Number.isFinite(quoteRate) || quoteRate <= 0){
                missing.push(date);
                return;
            }
            const rate = quoteRate / baseRate;
            if(!Number.isFinite(rate) || rate <= 0) throw new Error(`FX_HISTORY_INVALID_DERIVED_RATE: ${pair} ${date}`);
            pairRows.push({ observation_date: date, base_currency: base,
                target_currency: quote, rate, region: regionForPair(pair, config),
                source, rate_method: method });
        });
        rows.push(...pairRows);
        return { pair, supported: true, unsupportedCurrencies: [], rateMethod: method,
            source, earliestDate: pairRows[0]?.observation_date || null,
            latestDate: pairRows.at(-1)?.observation_date || null,
            distinctObservationDates: pairRows.length,
            missingPeriods: compactMissingPeriods(missing, eligibleDates) };
    });
    const unsupportedCurrencies = [...new Set(coverage.flatMap(item => item.unsupportedCurrencies))].sort();
    return { rows, report: {
        generatedAt: new Date().toISOString(), requestedFrom: from, requestedTo: to,
        source, sourceName,
        sourceUrl: "https://frankfurter.dev/providers/ecb/",
        pairUniverse: pairs.length,
        supportedPairs: coverage.filter(item => item.supported).length,
        unsupportedPairs: coverage.filter(item => !item.supported).length,
        unsupportedCurrencies,
        sourceObservationDates: expectedDates.length,
        latestSourceObservationDate: expectedDates.at(-1) || null,
        plannedRows: rows.length,
        missingPeriodRule: "Only missing dates within the provider's actual observation calendar are gaps; weekends and source holidays are not synthesized.",
        coverage
    } };
}

async function recoverHistoricalReferenceFrankfurter({ config, from, to, fetchImpl = globalThis.fetch }){
    const catalog = normalizeCatalog(await fetchJson(fetchImpl, "currencies?providers=ecb"));
    const configuredCurrencies = [...new Set(requestedPairs(config).pairs.flatMap(pair => pair.split("/")))];
    const quotes = configuredCurrencies.filter(code => code !== "EUR" && catalog.has(code)).sort();
    const observations = new Map();
    for(const window of monthWindows(from, to)){
        const query = new URLSearchParams({ base: "EUR", quotes: quotes.join(","),
            from: window.from, to: window.to });
        const payload = await fetchJson(fetchImpl, `providers/ecb/rates?${query}`);
        if(!Array.isArray(payload)) throw new Error("FX_HISTORY_INVALID_RATE_RESPONSE");
        payload.forEach(item => {
            const rate = Number(item?.rate);
            if(!validDate(item?.date) || item.date < window.from || item.date > window.to ||
                item.base !== "EUR" || !quotes.includes(item.quote) || !Number.isFinite(rate) || rate <= 0){
                throw new Error("FX_HISTORY_INVALID_RATE_RESPONSE");
            }
            if(!observations.has(item.date)) observations.set(item.date, new Map());
            const existing = observations.get(item.date).get(item.quote);
            if(existing != null && existing !== rate) throw new Error("FX_HISTORY_CONFLICTING_SOURCE_RATE");
            observations.get(item.date).set(item.quote, rate);
        });
    }
    if(observations.size === 0) throw new Error("FX_HISTORY_NO_SOURCE_OBSERVATIONS");
    return buildRecovery({ config, catalog, observations, from, to });
}

function isTransientSourceFailure(error){
      const message = String(error?.message || "");
      return /^FX_HISTORY_SOURCE_HTTP_5\d\d$/.test(message) ||
        /^FX_HISTORY_SOURCE_HTTP_429$/.test(message) ||
        error?.name === "AbortError" ||
        error?.name === "TimeoutError" ||
        /fetch failed|network error|timed out/i.test(message);
    }

    async function recoverHistoricalReference(options){
      try {
        return await recoverHistoricalReferenceFrankfurter(options);
      } catch(error){
        if(!isTransientSourceFailure(error)) throw error;
        return recoverFromEcbCsv({
          ...options,
          fetchImpl: options.fetchImpl || globalThis.fetch,
          buildRecovery
        });
      }
    }

    function renderCoverageMarkdown(report){
    const lines = [
        "# M39-FX Stage 1 Historical Coverage",
        "",
        `Generated: ${report.generatedAt}`,
        `Requested period: ${report.requestedFrom} through ${report.requestedTo}`,
        `Source: ${report.sourceName} (${report.source})`,
        "",
        `- Configured pairs: ${report.pairUniverse}`,
        `- Supported pairs: ${report.supportedPairs}`,
        `- Unsupported pairs: ${report.unsupportedPairs}`,
        `- Distinct source observation dates: ${report.sourceObservationDates}`,
        `- Latest source observation date: ${report.latestSourceObservationDate || "UNAVAILABLE"}`,
        `- Planned deduplicated rows: ${report.plannedRows}`,
        `- Unsupported currencies: ${report.unsupportedCurrencies.join(", ") || "None"}`,
        "",
        report.missingPeriodRule,
        "",
        "| Pair | Status | Method | Earliest | Latest | Dates | Missing periods |",
        "|---|---|---|---|---|---:|---|"
    ];
    report.coverage.forEach(item => lines.push(`| ${item.pair} | ${item.supported ? "SUPPORTED" : `UNSUPPORTED (${item.unsupportedCurrencies.join(", ")})`} | ${item.rateMethod || "—"} | ${item.earliestDate || "—"} | ${item.latestDate || "—"} | ${item.distinctObservationDates} | ${item.missingPeriods.length ? item.missingPeriods.map(period => `${period.from}..${period.to} (${period.observationDates})`).join("; ") : "None"} |`));
    return `${lines.join("\n")}\n`;
}

module.exports = { SOURCE, activeOn, buildRecovery, compactMissingPeriods, monthWindows,
    normalizeCatalog, rateMethod, recoverHistoricalReference, renderCoverageMarkdown, validDate };
