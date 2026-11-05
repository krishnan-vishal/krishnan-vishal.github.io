#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { insertArchiveRows, legacyArchiveRows } = require("./fx/archive-supabase.js");
const { argumentsFrom, main: backfillMain } = require("./fx/backfill-historical-reference.js");
const { buildRecovery, monthWindows, recoverHistoricalReference,
    renderCoverageMarkdown } = require("./fx/historical-reference.js");

const ROOT = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "data", "fx", "fx-config.json"), "utf8"));
const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "fx-market-data.yml"), "utf8");
const migration = fs.readFileSync(path.join(ROOT, "supabase", "migrations",
    "20261104093000_m39_fx_historical_observation_identity.sql"), "utf8");
const committedReport = fs.readFileSync(path.join(ROOT, "docs",
    "M39_FX_STAGE1_HISTORICAL_COVERAGE.md"), "utf8");
const supported = "AUD BRL CAD CHF CNY EUR GBP HKD IDR INR JPY MXN MYR NZD PHP SGD THB USD ZAR".split(" ");
const catalog = supported.map(code => ({ iso_code: code, name: code,
    start_date: "1999-01-04", end_date: null }));
const sourceRates = Object.fromEntries(supported.filter(code => code !== "EUR")
    .map((code, index) => [code, index + 2]));

async function mockFetch(url){
    const request = new URL(url);
    if(request.pathname === "/v2/currencies"){
        assert.strictEqual(request.searchParams.get("providers"), "ecb");
        return { ok: true, json: async () => catalog };
    }
    assert.strictEqual(request.pathname, "/v2/providers/ecb/rates");
    assert.strictEqual(request.searchParams.get("base"), "EUR");
    assert.strictEqual(request.searchParams.get("from"), "2026-01-01");
    assert.strictEqual(request.searchParams.get("to"), "2026-01-05");
    const quotes = request.searchParams.get("quotes").split(",");
    return { ok: true, json: async () => ["2025-12-31", "2026-01-02", "2026-01-05"].flatMap(date =>
        quotes.map(quote => ({ date, base: "EUR", quote, rate: sourceRates[quote] }))) };
}

async function main(){
    assert.deepStrictEqual(monthWindows("2026-01-30", "2026-03-02"), [
        { from: "2026-01-30", to: "2026-01-31" },
        { from: "2026-02-01", to: "2026-02-28" },
        { from: "2026-03-01", to: "2026-03-02" }
    ]);
    assert.deepStrictEqual(argumentsFrom([]), {
        apply: false, plan: true, from: "2026-01-01",
        to: new Date().toISOString().slice(0, 10), reportPath: null
    });
    assert.throws(() => argumentsFrom(["--plan", "--apply"]), /SELECT_ONE_MODE/);
    await assert.rejects(backfillMain({ args: { apply: true, plan: false,
        from: "2026-01-01", to: "2026-01-05", reportPath: null }, env: {}, config,
        fetchImpl: async () => { throw new Error("must not fetch before approval"); } }),
    /FX_HISTORY_BACKFILL_APPROVAL_REQUIRED/);
    assert.match(workflow, /refresh-fx-snapshot:\s*\n\s+if:.*historical_reference_action == 'none'/);
    assert.match(workflow, /historical-reference-recovery:/);
    assert.match(workflow, /FX_HISTORY_OBSERVATION_IDENTITY_ENABLED:\s*\$\{\{\s*vars\.FX_HISTORY_OBSERVATION_IDENTITY_ENABLED\s*\}\}/);
    assert.match(migration, /unique index if not exists uq_fx_historical_archive_observation/i);
    assert.match(migration, /observation_date, source, rate_method/);
    const committedPairLines = committedReport.split("\n")
        .filter(line => /^\| [A-Z]{3}\/[A-Z]{3} \| (SUPPORTED|UNSUPPORTED)/.test(line));
    assert.strictEqual(committedPairLines.length, 134);
    assert.strictEqual(committedPairLines.filter(line => line.includes("| SUPPORTED |")).length, 60);
    assert.strictEqual(committedPairLines.filter(line => line.includes("| UNSUPPORTED ")).length, 74);
    assert.ok(committedPairLines.filter(line => line.includes("| SUPPORTED |")).every(line =>
        line.includes("| 2026-01-02 | 2026-11-04 | 216 | None |")));
    assert.match(committedReport, /Planned idempotent rows: \*\*12,960\*\*/);
    assert.match(committedReport, /\| EUR\/JPY \| Supported source; not in configured 134 \|/);

    const recovery = await recoverHistoricalReference({ config, from: "2026-01-01",
        to: "2026-01-05", fetchImpl: mockFetch });
    assert.strictEqual(recovery.report.pairUniverse, 134);
    assert.strictEqual(recovery.report.supportedPairs, 60);
    assert.strictEqual(recovery.report.unsupportedPairs, 74);
    assert.strictEqual(recovery.report.sourceObservationDates, 2);
    assert.strictEqual(recovery.rows.length, 120);
    const usdJpy = recovery.report.coverage.find(item => item.pair === "USD/JPY");
    const usdInr = recovery.report.coverage.find(item => item.pair === "USD/INR");
    const aedInr = recovery.report.coverage.find(item => item.pair === "AED/INR");
    assert.deepStrictEqual([usdJpy.rateMethod, usdInr.rateMethod],
        ["derived-cross", "derived-cross"]);
    assert.strictEqual(aedInr.supported, false);
    assert.deepStrictEqual(aedInr.unsupportedCurrencies, ["AED"]);
    const firstUsdJpy = recovery.rows.find(row => row.base_currency === "USD" &&
        row.target_currency === "JPY" && row.observation_date === "2026-01-02");
    assert.strictEqual(firstUsdJpy.rate, sourceRates.JPY / sourceRates.USD);
    assert.strictEqual(firstUsdJpy.source, "frankfurter-ecb");
    assert.strictEqual(firstUsdJpy.rate_method, "derived-cross");
    assert.deepStrictEqual(Object.keys(legacyArchiveRows([firstUsdJpy])[0]).sort(),
        ["base_currency", "rate", "region", "source", "target_currency"]);
    const eurJpyRecovery = await recoverHistoricalReference({ config: {
        featuredPairs: ["EUR/JPY"], targetRegionalCurrencies: {}, marketRegions: {}
    }, from: "2026-01-01", to: "2026-01-05", fetchImpl: mockFetch });
    assert.strictEqual(eurJpyRecovery.report.coverage[0].rateMethod, "provider-native");
    assert.strictEqual(eurJpyRecovery.rows[0].rate, sourceRates.JPY);
    const markdown = renderCoverageMarkdown(recovery.report);
    assert.match(markdown, /USD\/JPY \| SUPPORTED \| derived-cross/);
    assert.match(markdown, /AED\/INR \| UNSUPPORTED \(AED\)/);
    const inactiveRecovery = buildRecovery({ config: { featuredPairs: ["EUR/RUB"],
        targetRegionalCurrencies: {}, marketRegions: {} }, catalog: new Map([
        ["EUR", { code: "EUR", name: "Euro", startDate: "1999-01-04", endDate: null }],
        ["RUB", { code: "RUB", name: "Russian Rouble", startDate: "2005-04-01",
            endDate: "2022-03-01" }]
    ]), observations: new Map([["2026-01-02", new Map()]]), from: "2026-01-01",
    to: "2026-01-05" });
    assert.strictEqual(inactiveRecovery.report.supportedPairs, 0);
    assert.deepStrictEqual(inactiveRecovery.report.unsupportedCurrencies, ["RUB"]);

    const calls = [];
    const client = { from(table){
        assert.strictEqual(table, "fx_historical_archive");
        return { async upsert(rows, options){ calls.push({ rows, options }); return { error: null }; } };
    } };
    await insertArchiveRows(client, recovery.rows);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].rows.length, 120);
    assert.strictEqual(calls[0].options.ignoreDuplicates, true);
    await assert.rejects(insertArchiveRows(client, [recovery.rows[0], recovery.rows[0]]),
        /FX_ARCHIVE_DUPLICATE_INPUT/);
    process.stdout.write("FX historical reference backfill tests passed.\n");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
