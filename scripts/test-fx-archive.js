#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { archiveAndBuildWeekly, archiveRows, readSevenDays, summarizeRows, buildHourlyArchive } = require("./fx/archive-supabase.js");
const { generateSnapshot, requestedPairs } = require("./fx/generate-fx-snapshot.js");
const reference = require("./fx/providers/reference.js");
const publicHistory = require("../assets/js/fx-public-history.js");

const productionConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "data", "fx", "fx-config.json"), "utf8"));
const historicalPage = fs.readFileSync(path.join(__dirname, "..", "pages", "fx", "historical.html"), "utf8");
assert.match(historicalPage, /id="fx-hourly-heading"/);
assert.match(historicalPage, /id="dynamic-ticker-grid"/);
assert.match(historicalPage, /fx-public-history\.js/);
assert.doesNotMatch(historicalPage, /fx-history-nav|data-fx-history-date|hourly-archive\.json\?v=/);
assert.doesNotMatch(historicalPage, /SUPABASE_SERVICE_ROLE_KEY/, "public pages must not contain private database credentials");
const weeklyPage = fs.readFileSync(path.join(__dirname, "..", "pages", "fx", "weekly.html"), "utf8");
assert.match(weeklyPage, /id="dynamic-ticker-grid"/);
assert.match(weeklyPage, /fx-public-history\.js/);
assert.deepStrictEqual(productionConfig.targetRegionalCurrencies, {
    "SOUTH ASIA / APAC": ["INR", "PKR", "BDT", "LKR", "CNY", "JPY", "AUD", "SGD", "HKD"],
    "EURO / GBP / CIS": ["EUR", "GBP", "CHF", "RUB", "KZT", "UZS"],
    "LATAM / AFRICA": ["BRL", "MXN", "ARS", "ZAR", "NGN", "KES", "EGP"],
    "FAR EAST / ASEAN / OCEANIC": ["THB", "MYR", "IDR", "PHP", "VND", "NZD"]
});
const regional = requestedPairs(productionConfig);
assert.strictEqual(regional.targetCurrencies.length, 28);
regional.targetCurrencies.forEach(code => assert.ok(regional.pairs.includes(`USD/${code}`), `${code} needs a USD rate`));
assert.ok(regional.pairs.includes("INR/PKR") && regional.pairs.includes("EUR/KZT") && regional.pairs.includes("THB/VND"));

const config = {
    featuredPairs: ["USD/INR", "INR/PKR"],
    targetRegionalCurrencies: { "SOUTH ASIA / APAC": ["INR", "PKR"] },
    marketRegions: {}
};
const snapshot = {
    dataStatus: "OK",
    pairs: [
        { pair: "USD/INR", base: "USD", quote: "INR", mid: 88.2, provider: "reference-open-er-api", validationStatus: "VALIDATED" },
        { pair: "INR/PKR", base: "INR", quote: "PKR", mid: 3.1543218, provider: "reference-open-er-api", validationStatus: "VALIDATED" },
        { pair: "USD/NGN", base: "USD", quote: "NGN", mid: 1500, provider: "reference-open-er-api", validationStatus: "QUARANTINED" }
    ]
};
const expectedRows = archiveRows(snapshot, config);
assert.strictEqual(expectedRows.length, 2);
assert.deepStrictEqual(Object.keys(expectedRows[0]).sort(), ["base_currency", "rate", "region", "source", "target_currency"]);
assert.strictEqual(expectedRows[1].rate, 3.154322);
assert.strictEqual(expectedRows[1].region, "SOUTH ASIA / APAC");

const history = [
    { id: 1, timestamp: "2026-09-12T08:00:00+00:00", base_currency: "USD", target_currency: "INR", rate: "88.1" },
    { id: 2, timestamp: "2026-09-12T09:00:00+00:00", base_currency: "USD", target_currency: "INR", rate: "88.2" },
    { id: 3, timestamp: "2026-09-13T09:00:00+00:00", base_currency: "USD", target_currency: "INR", rate: "88.4" }
];
const summary = summarizeRows(history, config.featuredPairs);
assert.deepStrictEqual(summary[0].observations, [
    { date: "2026-09-12", rate: 88.2 }, { date: "2026-09-13", rate: 88.4 }
]);
assert.strictEqual(summary[1].dataCompleteness, "NO_DATA");
const hourlyResult = buildHourlyArchive([
    { ...history[0], timestamp: "2026-09-12T09:00:00Z", region: "SOUTH ASIA / APAC", source: "reference-open-er-api" },
    { ...history[1], timestamp: "2026-09-12T09:30:00Z", region: "SOUTH ASIA / APAC", source: "reference-open-er-api" }
], "2026-09-14T10:00:00Z");
assert.strictEqual(hourlyResult.captures.length, 1);
assert.strictEqual(hourlyResult.captures[0].pairs[0].rate, 88.2, "a retried hour retains its latest validated pair rate");

async function main(){
    const publicNow = new Date("2026-09-14T10:00:00Z");
    const publicRows = [
        { id: 1, timestamp: "2026-09-12T08:00:00Z", base_currency: "USD", target_currency: "INR", rate: "88.100000", region: "APAC" },
        { id: 2, timestamp: "2026-09-13T08:00:00Z", base_currency: "USD", target_currency: "INR", rate: "88.400000", region: "APAC" },
        { id: 3, timestamp: "2026-09-13T08:00:00Z", base_currency: "USD", target_currency: "BRL", rate: "5.200000", region: "LATAM" },
        { id: 4, timestamp: "2026-09-05T08:00:00Z", base_currency: "USD", target_currency: "EUR", rate: "0.9" }
    ];
    const normalized = publicHistory.normalizeRows(publicRows, publicNow.getTime() - 7 * 86400000, publicNow.getTime());
    assert.strictEqual(normalized.length, 3, "out-of-window rates must not reach the public cards");
    assert.deepStrictEqual([...publicHistory.groupByPair(normalized).keys()], ["USD/INR", "USD/BRL"]);
    assert.deepStrictEqual(publicHistory.distinctTimestamps(normalized), ["2026-09-13T08:00:00.000Z", "2026-09-12T08:00:00.000Z"]);
    const stats = publicHistory.pairStats(publicHistory.groupByPair(normalized).get("USD/INR"));
    assert.strictEqual(stats.high, 88.4);
    assert.strictEqual(stats.low, 88.1);
    assert.ok(Math.abs(stats.delta - 0.3) < 1e-10);
    const previousDocument = global.document;
    global.document = { createElement(tag){ return {
        tag, children: [], appendChild(child){ this.children.push(child); }
    }; } };
    try{
        const grid = { children: [], replaceChildren(){ this.children = []; }, appendChild(child){ this.children.push(child); } };
        publicHistory.renderCards(grid, normalized.filter(row => row.timestamp === "2026-09-12T08:00:00.000Z"), normalized);
        assert.strictEqual(grid.children.length, 2, "all distinct pairs need cards even when a capture omits one");
        assert.ok(grid.children.some(card => card.children.some(item => item.textContent === "No rate in selected capture")));
    } finally {
        global.document = previousDocument;
    }
    let publicPage = 0;
    const fetched = await publicHistory.fetchSevenDays(async (url, options) => {
        const request = new URL(url);
        assert.strictEqual(request.origin, "https://qlnvhfapctcpzqyuhhth.supabase.co");
        assert.strictEqual(request.pathname, "/rest/v1/fx_historical_archive");
        assert.deepStrictEqual(request.searchParams.getAll("timestamp"), ["gte.2026-09-07T10:00:00.000Z", "lte.2026-09-14T10:00:00.000Z"]);
        assert.strictEqual(request.searchParams.get("order"), "timestamp.asc,id.asc");
        assert.ok(options.headers.get("apikey").startsWith("sb_publishable_"));
        assert.strictEqual(options.headers.get("Authorization"), null, "public requests must not carry a private bearer credential");
        assert.strictEqual(request.searchParams.get("offset"), String(publicPage * 1000));
        publicPage++;
        return { ok: true, json: async () => publicPage === 1 ? Array(1000).fill(publicRows[0]) : publicRows.slice(1, 3) };
    }, publicNow);
    assert.strictEqual(publicPage, 2);
    assert.strictEqual(fetched.length, 1002);

    const currentPath = path.join(__dirname, "..", "assets", "data", "fx", "current.json");
    const currentBeforeFailure = fs.readFileSync(currentPath, "utf8");
    await assert.rejects(generateSnapshot({
        env: {}, retrievedAt: "2026-09-14T10:00:00Z",
        fetchImpl: async () => ({ ok: false, status: 503 })
    }), /FX_PROVIDER_UNAVAILABLE/);
    assert.strictEqual(fs.readFileSync(currentPath, "utf8"), currentBeforeFailure, "provider failure must not advance the on-disk publication");

    let referenceCalls = 0;
    const mockRates = Object.fromEntries(regional.targetCurrencies.map((code, index) => [code, index + 2]));
    Object.assign(mockRates, { AED: 3.6, CAD: 1.4, SAR: 3.7, QAR: 3.6, KWD: 0.3, BHD: 0.37, OMR: 0.38 });
    const referenceRecords = await reference.fetchPairs(regional.pairs, {
        targetCurrencies: regional.targetCurrencies,
        retrievedAt: "2026-09-14T10:00:00Z",
        fetchImpl: async () => {
            referenceCalls++;
            return { ok: true, json: async () => ({ result: "success", time_last_update_utc: "Mon, 14 Sep 2026 00:00:01 +0000", rates: mockRates }) };
        }
    });
    assert.strictEqual(referenceCalls, 1);
    assert.strictEqual(referenceRecords.length, regional.pairs.length);
    assert.ok(referenceRecords.every(record => Number.isFinite(record.mid) && record.mid > 0));

    let pageCount = 0;
    const pagedClient = { from(){ return {
        select(){ return this; }, gte(){ return this; }, lte(){ return this; }, order(){ return this; },
        async range(){ pageCount++; return { data: pageCount === 1 ? Array(1000).fill(history[0]) : [history[1]], error: null }; }
    }; } };
    assert.strictEqual((await readSevenDays(pagedClient, "2026-09-14T10:00:00Z")).length, 1001);
    assert.strictEqual(pageCount, 2);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpir-fx-archive-"));
    const weeklyPath = path.join(tempDir, "weekly.json");
    const hourlyPath = path.join(tempDir, "hourly.json");
    let inserted = null;
    const client = {
        from(table){
            assert.strictEqual(table, "fx_historical_archive");
            return {
                async insert(rows){ inserted = rows; return { error: null }; },
                select(){ return this; },
                gte(column, value){ assert.strictEqual(column, "timestamp"); assert.ok(value.startsWith("2026-09-07")); return this; },
                lte(){ return this; },
                order(){ return this; },
                async range(from, to){ assert.strictEqual(from, 0); assert.strictEqual(to, 999); return { data: history, error: null }; }
            };
        }
    };
    try{
        const result = await archiveAndBuildWeekly({
            env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" },
            createClient: () => client, snapshot, config, weeklyPath, hourlyPath, now: "2026-09-14T10:00:00Z"
        });
        assert.deepStrictEqual(inserted, expectedRows);
        assert.strictEqual(result.archivedPairCount, 2);
        assert.strictEqual(result.summaryCount, 2);
        const weekly = JSON.parse(fs.readFileSync(weeklyPath, "utf8"));
        assert.strictEqual(weekly.source, "fx_historical_archive");
        assert.deepStrictEqual(weekly.summaries[0].observations, summary[0].observations);
        assert.strictEqual(weekly.summaries[1].pair, "INR/PKR");
        const hourly = JSON.parse(fs.readFileSync(hourlyPath, "utf8"));
        assert.strictEqual(hourly.captures.length, 3);
        assert.strictEqual(hourly.source, "fx_historical_archive");
        await assert.rejects(archiveAndBuildWeekly({ env: {}, snapshot, config, weeklyPath }), /requires SUPABASE_URL/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    console.log("GPIR FX Supabase archive contract passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
