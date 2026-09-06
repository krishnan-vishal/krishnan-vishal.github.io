#!/usr/bin/env node

const { resolveAnnouncementIntent } = require("../assets/js/content-search.js");

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

console.log(`Announcement intent validation passed: ${tests.length} checks.`);
