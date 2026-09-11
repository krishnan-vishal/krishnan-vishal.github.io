#!/usr/bin/env node
/*
 * GPIR FX regression suite (mirrors scripts/test-intelligence-radar.js
 * conventions -- assert-based, mocked fetch for network paths).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
    isWeekend, resolvePreviousBusinessDate, resolvePreviousBusinessClose, computeVariance
} = require("./fx/business-day.js");
const { buildRecord, validateRecord, findDuplicateRecords } = require("./fx/normalize-validate.js");
const { formatRate, formatPercentChange, formatTickerLine } = require("./fx/ticker-format.js");
const { buildWeeklySummary } = require("./fx/weekly-summary.js");
const referenceProvider = require("./fx/providers/reference.js");
const xeProvider = require("./fx/providers/xe.js");

/* ---------------------------------------------------------------------
 * Previous-business-day resolution + weekend rollover.
 * ------------------------------------------------------------------- */

// 2026-09-05 is a Saturday, 2026-09-06 a Sunday, 2026-09-07 a Monday.
assert.strictEqual(isWeekend("2026-09-05"), true, "Saturday must be a weekend");
assert.strictEqual(isWeekend("2026-09-06"), true, "Sunday must be a weekend");
assert.strictEqual(isWeekend("2026-09-07"), false, "Monday must not be a weekend");

// Monday must resolve back to the preceding Friday, not Sunday, even
// though Sunday has its own (irrelevant) calendar date.
const mondayLookback = resolvePreviousBusinessDate("2026-09-07", ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
assert.strictEqual(mondayLookback, "2026-09-04", "Monday's previous business day must be Friday, never a weekend date");

// Missing previous close: no valid prior business day in the archive.
const missingClose = resolvePreviousBusinessClose("2026-09-07", {});
assert.strictEqual(missingClose.previousBusinessDate, null, "no archived close must resolve to null, not a guess");
assert.strictEqual(missingClose.previousBusinessClose, null);

// Holiday handling: a declared market holiday must be skipped too.
const holidayLookback = resolvePreviousBusinessDate("2026-09-09", ["2026-09-07", "2026-09-08"], ["2026-09-08"]);
assert.strictEqual(holidayLookback, "2026-09-07", "a declared holiday must be skipped even though it is a weekday with data");

const sameDayRejected = resolvePreviousBusinessClose("2026-09-08", { "2026-09-08": 94.6 });
assert.strictEqual(sameDayRejected.previousBusinessDate, null, "a second snapshot from the same provider business day must never become the variance baseline");
const previousDayClose = resolvePreviousBusinessClose("2026-09-09", { "2026-09-08": 94.6 });
assert.deepStrictEqual(previousDayClose, { previousBusinessDate: "2026-09-08", previousBusinessClose: 94.6 }, "the prior validated business day must resolve automatically");

console.log("PASS business-day: weekend rollover, missing-close and holiday handling are correct.");

/* ---------------------------------------------------------------------
 * Percentage variance.
 * ------------------------------------------------------------------- */

const variance = computeVariance(94.70, 94.51);
assert.ok(Math.abs(variance.absoluteChange - 0.19) < 1e-9);
assert.ok(Math.abs(variance.percentageChange - 0.20103692730927702) < 1e-9);
assert.strictEqual(variance.direction, "up");

const noComparison = computeVariance(94.70, null);
assert.strictEqual(noComparison.absoluteChange, null, "missing previous close must never manufacture a zero-change reading");
assert.strictEqual(noComparison.percentageChange, null);

const unchanged = computeVariance(94.70, 94.70);
assert.strictEqual(unchanged.direction, "unchanged");
assert.strictEqual(unchanged.percentageChange, 0);

const negativeVariance = computeVariance(94.50, 94.70);
assert.strictEqual(negativeVariance.direction, "down");
assert.ok(negativeVariance.percentageChange < 0, "a lower current observation must produce a negative percentage variance");

console.log("PASS variance: absolute/percentage change and the no-comparison case are correct.");

/* ---------------------------------------------------------------------
 * Record validation: numeric, bid>ask, ISO codes, future timestamp,
 * staleness, extreme movement.
 * ------------------------------------------------------------------- */

const now = new Date("2026-09-08T12:00:00Z");

const cleanRecord = buildRecord({
    pair: "USD/INR", base: "USD", quote: "INR", timestamp: "2026-09-08T11:55:00Z",
    provider: "reference-open-er-api", providerType: "reference", mid: 88.2, last: 88.2,
    previousBusinessClose: 88.0, dataStatus: "REFERENCE"
});
assert.deepStrictEqual(validateRecord(cleanRecord, { now }), [], "a well-formed record must pass with no anomalies");

const nonNumeric = buildRecord({ pair: "USD/INR", base: "USD", quote: "INR", timestamp: "2026-09-08T11:55:00Z", provider: "x", providerType: "reference", mid: "not-a-number", dataStatus: "REFERENCE" });
assert.ok(validateRecord(nonNumeric, { now }).includes("NON_NUMERIC_MID"), "a non-numeric rate must be rejected");

const badBidAsk = buildRecord({ pair: "EUR/USD", base: "EUR", quote: "USD", timestamp: "2026-09-08T11:55:00Z", provider: "x", providerType: "live", bid: 1.20, ask: 1.10, dataStatus: "LIVE" });
assert.ok(validateRecord(badBidAsk, { now }).includes("BID_EXCEEDS_ASK"), "bid greater than ask must be rejected");

const malformedIso = buildRecord({ pair: "US/INR", base: "US", quote: "INR", timestamp: "2026-09-08T11:55:00Z", provider: "x", providerType: "reference", mid: 88.2, dataStatus: "REFERENCE" });
const malformedReasons = validateRecord(malformedIso, { now });
assert.ok(malformedReasons.includes("MALFORMED_PAIR") && malformedReasons.includes("MALFORMED_BASE_CURRENCY"), "a malformed ISO currency code must be rejected");

const futureTimestamp = buildRecord({ pair: "USD/INR", base: "USD", quote: "INR", timestamp: "2026-09-09T00:00:00Z", provider: "x", providerType: "reference", mid: 88.2, dataStatus: "REFERENCE" });
assert.ok(validateRecord(futureTimestamp, { now }).includes("FUTURE_TIMESTAMP"), "a timestamp in the future must be rejected");

const staleLive = buildRecord({ pair: "USD/INR", base: "USD", quote: "INR", timestamp: "2026-09-08T09:00:00Z", provider: "x", providerType: "live", mid: 88.2, dataStatus: "LIVE" });
assert.ok(validateRecord(staleLive, { now, staleAfterMinutes: 60 }).includes("STALE_LIVE_QUOTE"), "a live quote older than the stale threshold must be flagged");
// A reference-tier quote at the same age must NOT be flagged stale --
// staleness only applies to providerType "live" (a daily reference
// feed is expected to be hours old).
const notStaleReference = buildRecord({ pair: "USD/INR", base: "USD", quote: "INR", timestamp: "2026-09-08T09:00:00Z", provider: "x", providerType: "reference", mid: 88.2, dataStatus: "REFERENCE" });
assert.deepStrictEqual(validateRecord(notStaleReference, { now, staleAfterMinutes: 60 }), [], "a reference-tier quote must not be judged by the live staleness threshold");

const extremeMove = buildRecord({ pair: "USD/INR", base: "USD", quote: "INR", timestamp: "2026-09-08T11:55:00Z", provider: "x", providerType: "reference", mid: 100, previousBusinessClose: 88, dataStatus: "REFERENCE" });
assert.ok(validateRecord(extremeMove, { now, extremeMovePercent: 8 }).includes("EXTREME_MOVEMENT_BEYOND_THRESHOLD"), "a movement beyond the configured threshold must be flagged, not silently published");

const derivedCrossMissingLegs = buildRecord({ pair: "AED/INR", base: "AED", quote: "INR", timestamp: "2026-09-08T11:55:00Z", provider: "x", providerType: "reference", mid: 24.0, rateType: "derived-cross", dataStatus: "REFERENCE" });
assert.ok(validateRecord(derivedCrossMissingLegs, { now }).includes("DERIVED_CROSS_MISSING_SOURCE_LEGS"), "a derived cross-rate must record its source legs or be rejected");

console.log("PASS validation: numeric/bid-ask/ISO/future-timestamp/staleness/extreme-movement anomalies are all caught, and legitimate records pass.");

/* ---------------------------------------------------------------------
 * Duplicate rate records.
 * ------------------------------------------------------------------- */

const otherPairRecord = buildRecord({ pair: "EUR/USD", base: "EUR", quote: "USD", timestamp: "2026-09-08T11:55:00Z", provider: "reference-open-er-api", providerType: "reference", mid: 1.17, dataStatus: "REFERENCE" });
const repeatedRecord = buildRecord({ pair: "USD/INR", base: "USD", quote: "INR", timestamp: "2026-09-08T11:55:00Z", provider: "reference-open-er-api", providerType: "reference", mid: 88.2, dataStatus: "REFERENCE" });
const duplicateIndexes = findDuplicateRecords([cleanRecord, otherPairRecord, repeatedRecord]);
assert.deepStrictEqual(duplicateIndexes, [2], "the later duplicate (same pair/provider/timestamp) must be flagged, the first occurrence kept, and an unrelated pair must not be flagged");

console.log("PASS duplicate detection: repeated pair/provider/timestamp records are identified.");

/* ---------------------------------------------------------------------
 * Ticker formatting.
 * ------------------------------------------------------------------- */

assert.strictEqual(formatRate(88.2, 4), "88.2000");
assert.strictEqual(formatRate(null, 4), "N/A", "a missing rate must render N/A, never a fabricated value");
assert.strictEqual(formatPercentChange(0.34), "▲ +0.34%");
assert.strictEqual(formatPercentChange(-0.21), "▼ -0.21%");
assert.strictEqual(formatPercentChange(0), "— 0.00%", "unchanged must use the em-dash glyph, not an arrow");
assert.strictEqual(formatPercentChange(null), "—", "no comparison available must render as an em dash, never 0.00%");
assert.strictEqual(
    formatTickerLine({ pair: "USD/JPY", base: "USD", quote: "JPY", mid: 153.443, percentageChange: 0.31 }),
    "USD/JPY 153.44 ▲ +0.31%"
);
assert.strictEqual(
    formatTickerLine({ pair: "USD/INR", base: "USD", quote: "INR", mid: 94.6998, percentageChange: -0.21 }),
    "USD/INR 94.6998 ▼ -0.21%"
);

console.log("PASS ticker formatting: rate/percentage rendering matches the compact visual target, direction never relies on colour alone.");

/* ---------------------------------------------------------------------
 * Reader freshness: mutable FX publications bypass browser caches,
 * while immutable dated history retains its stable URL.
 * ------------------------------------------------------------------- */

const tickerReaderSource = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "fx-ticker.js"), "utf8");
const fxAppSource = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "fx-app.js"), "utf8");
const homepageSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const marketCssSource = fs.readFileSync(path.join(__dirname, "..", "assets", "css", "market.css"), "utf8");
assert.match(tickerReaderSource, /current\.json\?v=.*Date\.now\(\)/, "homepage current.json must use a per-request cache key");
assert.match(tickerReaderSource, /fetch\(fxCurrentSnapshotUrl\(\), \{ cache: "no-store" \}\)/, "homepage current.json must bypass the browser cache");
assert.match(fxAppSource, /fetchMutableFxJson\("current\.json"\)/, "FX reader current.json must use the mutable-data fetch path");
assert.match(fxAppSource, /fetchMutableFxJson\("weekly-summary\.json"\)/, "weekly summaries must refresh with the current publication");
assert.match(fxAppSource, /history\/\$\{year\}\/\$\{month\}\/\$\{date\}\.json`\)/, "immutable dated history must retain its stable cacheable URL");
assert.doesNotMatch(fxAppSource, /history\/\$\{year\}\/\$\{month\}\/\$\{date\}\.json\?v=/, "immutable history must not receive mutable cache-busting");
assert.match(homepageSource, />\s*FX SNAPSHOT\s*</, "the reference snapshot ticker must not be labelled live");
assert.match(tickerReaderSource, /LAST VALIDATED/, "a failed refresh must be visibly labelled as last validated");
assert.match(tickerReaderSource, /if\(fxSnapshotCache\)\{[\s\S]*fxRefreshFailed = true;[\s\S]*renderTicker\(\);/, "a failed browser refresh must retain and relabel the last validated snapshot");
assert.match(tickerReaderSource, /Math\.max\(5, Math\.min\(15, configuredMinutes\)\)/, "browser refresh must stay within the configured 5-15 minute capability");
assert.match(tickerReaderSource, /setTimeout\(loadRates, browserMinutes \* 60 \* 1000\)/, "the ticker must re-fetch current.json without reloading the page");
assert.match(tickerReaderSource, /ageMinutes <= refreshIntervalMinutes \* 2/, "live-provider freshness must be calculated from observation age");
assert.match(tickerReaderSource, /updated\.textContent = `\$\{statusText\} · Updated \$\{dateText\} · \$\{timeText\}`/, "ticker status and timestamp must render as one dynamic compact line");
assert.match(tickerReaderSource, /track\.innerHTML = html \+ html/, "the ticker must duplicate exactly one sequence for a seamless loop");
assert.match(marketCssSource, /#fx-ribbon\{[\s\S]*?height:36px/, "the FX ticker must remain a thin 36px strip");
assert.match(marketCssSource, /@keyframes tickerMove\{[\s\S]*?translateX\(-50%\)/, "the doubled ticker sequence must move exactly one sequence width");
assert.match(marketCssSource, /#fx-ribbon \.ticker-track:hover\{[\s\S]*?animation-play-state:paused/, "pointer hover must pause ticker motion");
assert.match(marketCssSource, /#fx-ribbon \.ticker-track:focus-within\{[\s\S]*?animation-play-state:paused/, "keyboard focus must pause ticker motion");
assert.match(marketCssSource, /@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?#fx-ribbon \.ticker-track\{[\s\S]*?animation:none/, "reduced-motion readers must receive a non-animated ticker");

const fxWorkflowSource = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "fx-market-data.yml"), "utf8");
assert.match(fxWorkflowSource, /cron: "7 \* \* \* \*"/, "the sustainable hourly provider refresh must avoid exact top-of-hour concentration");
assert.doesNotMatch(fxWorkflowSource, /cron: "0 \* \* \* \*"/, "the FX schedule must not remain concentrated at minute zero");

console.log("PASS reader freshness: mutable current/weekly JSON revalidates, immutable history stays cacheable, and stale data is not labelled live.");

/* ---------------------------------------------------------------------
 * Provider failover (mocked network), including a stub licensed
 * provider that reports NOT_CONFIGURED without attempting a call.
 * ------------------------------------------------------------------- */

async function providerTests(){
    // A licensed provider with no credential must report NOT_CONFIGURED
    // for every requested pair without throwing or attempting a fetch.
    const xeResult = await xeProvider.fetchPairs(["USD/INR"], { env: {} });
    assert.strictEqual(xeResult.length, 1);
    assert.strictEqual(xeResult[0].dataStatus, "NO_PROVIDER_CONFIGURED");
    assert.strictEqual(xeResult[0].provider, "xe");

    // A licensed provider with a credential present, but no verified
    // request implementation, must fail loudly rather than fabricate.
    await assert.rejects(
        () => xeProvider.fetchPairs(["USD/INR"], { env: { FX_XE_API_KEY: "present-but-unimplemented" } }),
        /PROVIDER_INTEGRATION_NOT_YET_IMPLEMENTED/,
        "a configured-but-unimplemented provider must fail explicitly, never silently return fabricated data"
    );

    // The reference provider succeeds when the network does; a real
    // record with correct cross-rate math comes back.
    const mockFetchOk = async () => ({
        ok: true,
        json: async () => ({ result: "success", time_last_update_utc: "Tue, 08 Sep 2026 00:00:01 +0000", rates: { INR: 88.20, AED: 3.6725 } })
    });
    const okRecords = await referenceProvider.fetchPairs(["USD/INR", "AED/INR", "AED/USD"], { fetchImpl: mockFetchOk, retrievedAt: "2026-09-08T00:05:00Z" });
    const usdInr = okRecords.find(record => record.pair === "USD/INR");
    const aedInr = okRecords.find(record => record.pair === "AED/INR");
    const aedUsd = okRecords.find(record => record.pair === "AED/USD");
    assert.strictEqual(usdInr.rateType, "provider-native");
    assert.strictEqual(aedInr.rateType, "derived-cross");
    assert.ok(Math.abs(aedInr.mid - (88.20 / 3.6725)) < 1e-9);
    assert.deepStrictEqual(aedInr.sourceLegs.map(leg => leg.pair), ["USD/AED", "USD/INR"]);
    assert.strictEqual(aedUsd.rateType, "derived-cross", "a GPIR-computed reciprocal must be labelled derived rather than provider-native");
    assert.deepStrictEqual(aedUsd.sourceLegs.map(leg => leg.pair), ["USD/AED"]);
    assert.deepStrictEqual(okRecords.currencyUniverse.currencies, ["AED", "INR", "USD"], "the complete validated provider currency universe must survive alongside the curated pair records");
    assert.strictEqual(okRecords.currencyUniverse.rates.USD, 1);
    assert.strictEqual(okRecords.currencyUniverse.validationStatus, "VALIDATED");

    // Provider failure (network/HTTP error) must reject cleanly so the
    // orchestrator's priority walk can move to the next provider,
    // never surface a partial/corrupted record.
    const mockFetchFail = async () => ({ ok: false, status: 503 });
    await assert.rejects(() => referenceProvider.fetchPairs(["USD/INR"], { fetchImpl: mockFetchFail }), /REFERENCE_PROVIDER_UNAVAILABLE/);

    console.log("PASS provider failover: unconfigured providers report cleanly, a configured-but-unimplemented provider fails loudly, the reference provider computes correct derived-cross rates, and a provider failure rejects so failover can proceed.");
}

/* ---------------------------------------------------------------------
 * Historical immutability: the orchestrator must never overwrite an
 * existing daily history file.
 * ------------------------------------------------------------------- */

function historicalImmutabilityTest(){
    const { freezeOutgoingSnapshotIfNewDay, historyFilePath } = require("./fx/generate-fx-snapshot.js");
    // freezeOutgoingSnapshotIfNewDay resolves paths relative to the
    // module's own ROOT constant (the repository root), so exercise it
    // against the real repository history directory using a throwaway
    // date far in the past that will not collide with any real
    // archived file, and always clean up afterward.
    const outgoing = { publicationDate: "2001-01-01", generatedAt: "2001-01-01T23:59:00Z", status: "current", dataStatus: "OK", pairs: [] };
    const target = historyFilePath("2001-01-01");
    try{
        if(fs.existsSync(target)) fs.unlinkSync(target);
        const first = freezeOutgoingSnapshotIfNewDay(outgoing, "2001-01-02");
        assert.strictEqual(first.frozen, true, "the first freeze of a new day must succeed");
        assert.ok(fs.existsSync(target), "a history file must be written on first freeze");
        const original = fs.readFileSync(target, "utf8");

        const tampered = { ...outgoing, dataStatus: "TAMPERED_ATTEMPT" };
        const second = freezeOutgoingSnapshotIfNewDay(tampered, "2001-01-03");
        assert.strictEqual(second.frozen, false, "an already-frozen day must never be overwritten");
        assert.strictEqual(fs.readFileSync(target, "utf8"), original, "the archived file's bytes must be unchanged after a repeat freeze attempt");
    } finally {
        if(fs.existsSync(target)) fs.unlinkSync(target);
    }
    console.log("PASS historical immutability: a day is frozen once and never overwritten by a later run.");
}

/* ---------------------------------------------------------------------
 * Weekly summary: deterministic observation only, no invented
 * commentary, honest about insufficient history.
 * ------------------------------------------------------------------- */

function weeklySummaryTest(){
    const summary = buildWeeklySummary("USD/INR", [
        { date: "2026-09-01", rate: 87.90 }, { date: "2026-09-07", rate: 88.20 }
    ]);
    assert.strictEqual(summary.direction, "up");
    assert.deepStrictEqual(summary.observations.map(point => point.date), ["2026-09-01", "2026-09-07"], "weekly evidence must retain only the genuine observations used in its calculation");
    assert.ok(summary.statements.every(statement => !/because|due to|driven by|amid/i.test(statement)), "weekly statements must never imply causation");

    const empty = buildWeeklySummary("USD/INR", []);
    assert.strictEqual(empty.dataCompleteness, "NO_DATA");
    assert.strictEqual(empty.weeklyChange, null, "insufficient history must never manufacture a change figure");

    console.log("PASS weekly summary: quantitative-only observations, honest about insufficient history.");
}

async function main(){
    await providerTests();
    historicalImmutabilityTest();
    weeklySummaryTest();
    console.log("GPIR FX regression suite passed.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
