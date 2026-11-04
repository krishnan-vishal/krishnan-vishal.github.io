#!/usr/bin/env node
/* Read-only evidence generator for the official ECB historical CSV. */

const fs = require("fs");
const path = require("path");
const { buildRecovery, renderCoverageMarkdown } = require("./historical-reference.js");

const ROOT = path.resolve(__dirname, "..", "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "data", "fx", "fx-config.json"), "utf8"));
const supportedCodes = "AUD BRL CAD CHF CNY EUR GBP HKD IDR INR JPY MXN MYR NZD PHP SGD THB USD ZAR".split(" ");

function evidenceFromCsv(csv, from, to){
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines.shift().split(",");
    const supported = new Set(supportedCodes);
    const catalog = new Map(supportedCodes.map(code => [code,
        { code, name: code, startDate: "1999-01-04", endDate: null }]));
    const observations = new Map();
    lines.forEach(line => {
        const values = line.split(",");
        const date = values[0];
        if(date < from || date > to) return;
        const rates = new Map();
        headers.forEach((code, index) => {
            const rate = Number(values[index]);
            if(supported.has(code) && code !== "EUR" && Number.isFinite(rate) && rate > 0)
                rates.set(code, rate);
        });
        if(rates.size) observations.set(date, rates);
    });
    return { catalog, observations };
}

function formatRate(value){
    return Number(value).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

function renderReport(csv, from = "2026-01-01", to = "2026-11-04"){
    const { catalog, observations } = evidenceFromCsv(csv, from, to);
    const recovery = buildRecovery({ config, catalog, observations, from, to });
    recovery.report.generatedAt = "2026-11-04";
    const eurJpy = buildRecovery({ config: {
        featuredPairs: ["EUR/JPY"], targetRegionalCurrencies: {}, marketRegions: {}
    }, catalog, observations, from, to });
    const coverageFor = pair => recovery.report.coverage.find(item => item.pair === pair);
    const rowFor = (rows, pair, date) => rows.find(row =>
        `${row.base_currency}/${row.target_currency}` === pair && row.observation_date === date);
    const representatives = [
        ["USD/JPY", coverageFor("USD/JPY"), recovery.rows],
        ["EUR/JPY", eurJpy.report.coverage[0], eurJpy.rows],
        ["USD/INR", coverageFor("USD/INR"), recovery.rows],
        ["AED/INR", coverageFor("AED/INR"), recovery.rows]
    ];
    const pairTable = renderCoverageMarkdown(recovery.report);
    const marker = "| Pair | Status | Method | Earliest | Latest | Dates | Missing periods |";
    const representativeRows = representatives.map(([pair, item, rows]) => {
        const first = item.earliestDate ? rowFor(rows, pair, item.earliestDate) : null;
        const latest = item.latestDate ? rowFor(rows, pair, item.latestDate) : null;
        const universe = pair === "EUR/JPY" ? "Supported source; not in configured 134" : "Configured";
        const status = item.supported ? universe : `Unsupported (${item.unsupportedCurrencies.join(", ")})`;
        return `| ${pair} | ${status} | ${item.rateMethod || "—"} | ${item.earliestDate || "—"} | ${item.latestDate || "—"} | ${item.distinctObservationDates} | ${first ? formatRate(first.rate) : "—"} | ${latest ? formatRate(latest.rate) : "—"} |`;
    });
    return `# M39-FX Stage 1 Historical Coverage

## Evidence and boundary

- Read-only Production inventory on 4 November 2026: 536 legacy capture rows, 134 pairs, two capture dates, one source (\`reference-open-er-api\`), and no observation-date or deduplication key.
- Historical evidence: the official ECB \`eurofxref-hist.csv\` dataset, read without modifying Production. The existing runtime recovery contract remains Frankfurter/ECB; its public endpoint returned HTTP 522 during this run, so the official underlying ECB dataset was used only to verify coverage and rates.
- Requested interval: 1 January through 4 November 2026. The first available ECB fixing is 2 January; the latest is 3 November. Weekends and TARGET closing days are not gaps.
- No Production migration or row write was performed. No authentication, authorization, PayPal, subscription, checkout, or reader entitlement code changed.

## Coverage summary

- Configured archive pairs: **${recovery.report.pairUniverse}**
- ECB-supported configured pairs: **${recovery.report.supportedPairs}**
- Unsupported configured pairs: **${recovery.report.unsupportedPairs}**
- Genuine ECB observation dates: **${recovery.report.sourceObservationDates}**
- Planned idempotent rows: **${recovery.report.plannedRows.toLocaleString("en-US")}**
- Unsupported currencies: **${recovery.report.unsupportedCurrencies.join(", ")}**
- Calculated cross/inverse rows use same-date ECB legs and are labelled; no missing dates or rates are synthesized.

## Representative validation

| Pair | Universe status | Source method | Earliest | Latest | Dates | First rate | Latest rate |
|---|---|---|---|---|---:|---:|---:|
${representativeRows.join("\n")}

## Pair-level coverage

${pairTable.slice(pairTable.indexOf(marker))}
## Production backfill approval checkpoint

Production remains unchanged. A separate owner approval must authorize this controlled sequence:

1. Apply \`20261104093000_m39_fx_historical_observation_identity.sql\` to add \`observation_date\`, \`rate_method\`, and the unique observation key.
2. Manually dispatch \`GPIR FX Market Data Refresh\` with \`historical_reference_action=apply-approved\`.
3. After the post-backfill counts pass, set repository variable \`FX_HISTORY_OBSERVATION_IDENTITY_ENABLED=true\` so future scheduled captures use the new idempotent identity.

The variable is absent/false by default, so merging the PR cannot make the scheduled writer depend on an unapplied migration. The apply path uses \`upsert(..., ignoreDuplicates: true)\` on the unique observation identity and never updates an existing valid row. After approval, verify 60 supported pairs, 12,900 source rows, 215 dates, the four representative outcomes above, and unchanged legacy capture rows before enabling the variable or declaring the backfill complete.
`;
}

if(require.main === module){
    const csvPath = process.argv[2];
    if(!csvPath) throw new Error("ECB CSV path required");
    process.stdout.write(renderReport(fs.readFileSync(csvPath, "utf8")));
}

module.exports = { evidenceFromCsv, renderReport };
