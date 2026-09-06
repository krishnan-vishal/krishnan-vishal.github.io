#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { resolveAnnouncementIntent } = require("../assets/js/content-search.js");

const ROOT = path.resolve(__dirname, "..");
const announcements = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/announcements.json"), "utf8"));
const archiveHtml = fs.readFileSync(path.join(ROOT, "pages/intelligence/index.html"), "utf8");
const fatfHtml = fs.readFileSync(path.join(ROOT, "pages/intelligence/fatf-r16-consultation-2026.html"), "utf8");

function assert(condition, message){
  if(!condition){
    console.error(`FAIL CONTRACT: ${message}`);
    process.exitCode = 1;
  }
}

const tests = [
  ["show india announcements", { mode: "ANNOUNCEMENT", country: "India", lifecycle: null }],
  ["show regulatory announcements", { mode: "ANNOUNCEMENT", category: "Regulatory", lifecycle: null }],
  ["show AML announcements", { mode: "ANNOUNCEMENT", category: "AML / CFT", lifecycle: null }],
  ["show historical announcements", { mode: "ANNOUNCEMENT", lifecycle: "HISTORICAL" }],
  ["show current announcements", { mode: "ANNOUNCEMENT", lifecycle: "CURRENT" }],
  ["August 2026 announcements", { mode: "ANNOUNCEMENT", month: "08", year: "2026" }],
  ["show payment infrastructure announcements", { mode: "ANNOUNCEMENT", category: "Payment Infrastructure" }],
  ["show M&A announcements", { mode: "ANNOUNCEMENT", category: "M&A" }],
  ["show FATF announcements", { mode: "ANNOUNCEMENT", sourceText: "FATF" }],
  ["show india research", { mode: "GENERAL" }],
  ["show payment details", { mode: "GENERAL" }]
];

let failed = 0;
for (const [query, expected] of tests) {
  const actual = resolveAnnouncementIntent(query);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      console.error(`FAIL QUERY: ${query}`);
      console.error(`  expected ${key}=${value}`);
      console.error(`  actual   ${key}=${actual[key]}`);
      failed += 1;
    }
  }
  if (actual.mode !== expected.mode) {
    console.error(`FAIL QUERY: ${query}`);
    console.error(`  expected mode=${expected.mode}`);
    console.error(`  actual   mode=${actual.mode}`);
    failed += 1;
  }
}

if (failed) {
  process.exit(1);
}

const currentRecords = announcements.records.filter(record => record.status === "GPIR_CLASSIFIED" && record.lifecycleStatus !== "HISTORICAL");
const historicalRecords = announcements.records.filter(record => record.lifecycleStatus === "HISTORICAL");
currentRecords.forEach(record => {
  const page = fs.readFileSync(path.join(ROOT, "pages/intelligence", `${record.id}.html`), "utf8");
  assert(!page.includes("ARCHIVED PUBLICATION"), `${record.id} must not display ARCHIVED PUBLICATION`);
  assert(page.includes(`href="https://`) || page.includes("Read Original Source"), `${record.id} must retain original source presentation`);
});
historicalRecords.forEach(record => {
  const pagePath = path.join(ROOT, "pages/intelligence", `${record.id}.html`);
  assert(fs.existsSync(pagePath), `${record.id} historical page must remain searchable and present`);
  assert(fs.readFileSync(pagePath, "utf8").includes("ARCHIVED PUBLICATION"), `${record.id} historical page must display ARCHIVED PUBLICATION`);
});
assert(archiveHtml.includes("Last validated publication cycle:") && archiveHtml.includes("Refresh automation:</strong> Not yet scheduled"), "archive must use truthful freshness wording");
assert(!archiveHtml.includes("Verified Dataset") && !archiveHtml.includes("Refreshed:"), "archive must not present stale data as a current refresh");
assert(announcements.records.every(record => fs.existsSync(path.join(ROOT, "pages/intelligence", `${record.id}.html`)) || record.status !== "GPIR_CLASSIFIED"), "published announcement search targets must resolve");
const fatf = announcements.records.find(record => record.id === "fatf-r16-consultation-2026");
assert(fatf && fatf.summary && fatf.whyItMatters, "FATF benchmark must retain summary and whyItMatters");
const escapedSummary = fatf.summary.replace(/'/g, "&#39;");
const escapedWhy = fatf.whyItMatters.replace(/'/g, "&#39;");
assert(fatfHtml.includes(escapedSummary) && fatfHtml.includes(escapedWhy) && fatfHtml.includes(fatf.source.url), "FATF page must preserve summary, whyItMatters and original source");
assert(archiveHtml.includes('class="footer-container"') && archiveHtml.includes('class="footer-grid"'), "archive must use the shared GPIR footer architecture");
assert(fatfHtml.includes('class="footer-container"') && fatfHtml.includes('class="footer-grid"'), "intelligence pages must use the shared GPIR footer architecture");
assert(fs.readFileSync(path.join(ROOT, "assets/js/content-search.js"), "utf8").includes("record.lifecycleStatus !== \"HISTORICAL\"" ) === false, "historical announcements must remain searchable");

if (process.exitCode) process.exit(1);

console.log(`Announcement intent validation passed: ${tests.length} checks.`);
