"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "gpir-intelligence-fetch", "index.ts"), "utf8");

const checks = [
  ["T6E-01", /if \(!dryRun\) \{[\s\S]*intelligence_ingestion_runs/],
  ["T6E-02", /requestedSource !== TEST_SOURCE_ID/], ["T6E-03", /MAX_PAGE_FETCHES = 3/],
  ["T6E-04", /intelligence_ingestion_runs[\s\S]*intelligence_raw_ingestion/], ["T6E-05", /ingestion_run_id: runId/],
  ["T6E-06", /\.insert\(\{ \.\.\.rawRecord, ingestion_run_id: runId \}\)[\s\S]*gpir_process_raw_record/],
  ["T6E-07", /retain evidence before processor-owned Gate 1\/Gate 2/], ["T6E-08", /gpir_process_raw_record/],
  ["T6E-09", /result === "REVIEW"/], ["T6E-10", /result === "CANDIDATE"/],
  ["T6E-11", /p_raw_id: insertedRaw.id/], ["T6E-12", /content_hash[\s\S]*skippedExisting\+\+/],
  ["T6E-13", () => !/\.from\("intelligence_candidates"\)/.test(source)], ["T6E-14", () => !/gpir_create_canonical_handoff/.test(source)], ["T6E-15", () => !/\.from\("global_announcements"\)/.test(source)],
  ["T6E-16", () => !/cron\.job|pg_cron/.test(source)], ["T6E-17", /discoverNewsLinks[\s\S]*cardRegex/],
  ["T6E-18", /ARTICLE_METADATA[\s\S]*NEWS_INDEX/], ["T6E-19", /PDF_DEFERRED/],
  ["T6E-20", /records_discovered[\s\S]*records_published: 0/], ["T6E-21", /run_status: "FAILED"[\s\S]*raw_inserted_count/],
  ["T6E-22", () => !/ticker_eligible:\s*true/.test(source)],
];
for (const [id, expectation] of checks) assert(typeof expectation === "function" ? expectation() : expectation.test(source), `${id} contract failed`);
console.log(`M33-G1 Step 6E-B2 contract: PASS (${checks.length}/22 static checks)`);
