#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { formatCountryRows, syncCountryIntelligence } = require("./sync-country-intelligence.js");

async function main(){
    const countryData = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../assets/data/country-intelligence.json"), "utf8"));
    const rows = formatCountryRows(countryData);
    assert.equal(rows.length, 6);
    assert.equal(new Set(rows.map(row => row.country_code)).size, 6);
    assert.equal(rows.find(row => row.country_code === "IN").country_name, "India");
    assert.equal(rows.find(row => row.country_code === "QA").metadata.sections.regulatory, "DEVELOPING");
    assert.ok(rows.every(row => !("intelligence_summary" in row) && !("risk_level" in row) && !("fx_market_snapshot" in row)));

    const futureRows = formatCountryRows({ schemaVersion: "1.0", records: [{
        isoAlpha2: "ZZ", name: "Example", intelligenceSummary: "# Verified summary",
        securityIndex: 3, tracking: [{ checkedAt: "2026-09-13" }]
    }] });
    assert.equal(futureRows[0].intelligence_summary, "# Verified summary");
    assert.equal(futureRows[0].risk_level, "3");
    assert.deepEqual(futureRows[0].metadata.tracking, [{ checkedAt: "2026-09-13" }]);
    assert.ok(!("securityIndex" in futureRows[0].metadata));

    let table;
    let upsertOptions;
    let upsertRows;
    const count = await syncCountryIntelligence({
        env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" },
        createClient: () => ({ from(name){
            table = name;
            return { async upsert(value, options){
                upsertRows = value;
                upsertOptions = options;
                return { error: null };
            } };
        } })
    });
    assert.equal(count, 6);
    assert.equal(table, "country_intelligence");
    assert.equal(upsertOptions.onConflict, "country_code");
    assert.deepEqual(upsertRows, rows);

    await assert.rejects(syncCountryIntelligence({ env: {} }), /requires SUPABASE_URL/);
    assert.throws(() => formatCountryRows({ records: [
        { isoAlpha2: "IN", name: "India" }, { isoAlpha2: "IN", name: "Duplicate" }
    ] }), /Duplicate country code/);
    await assert.rejects(syncCountryIntelligence({
        env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" },
        createClient: () => ({ from: () => ({ upsert: async () => ({ error: { code: "42P10" } }) }) })
    }), /UNIQUE constraint/);
    console.log("Country intelligence sync contract passed.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
