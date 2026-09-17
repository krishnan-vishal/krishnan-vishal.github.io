"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const edge = read("supabase", "functions", "gpir-intelligence-fetch", "index.ts");
const claimSql = read("migrations", "m33-g1", "m33-g1-source-run-claim.sql");
const rollbackSql = read("migrations", "m33-g1", "m33-g1-source-run-claim-rollback.sql");
const schedulerSql = read("migrations", "m33-g1", "m33-g1-scheduler-activation.sql");
const disableSql = read("migrations", "m33-g1", "m33-g1-scheduler-emergency-disable.sql");

// Controlled source policy and existing acquisition/publication boundaries.
assert.match(edge, /CONTROLLED_SOURCE_IDS = \[TEST_SOURCE_ID, RBI_SOURCE_ID, PYMNTS_SOURCE_ID\]/);
assert(!/CONTROLLED_SOURCE_IDS = \[[^\]]*FINTECH_FUTURES_SOURCE_ID/.test(edge));
assert.match(edge, /MAX_PAGE_FETCHES = 3/);
assert.match(edge, /\.insert\(\{ \.\.\.rawRecord, ingestion_run_id: runId \}\)[\s\S]*gpir_process_raw_record/);
assert(!/gpir_process_raw_batch/.test(edge));
assert(!/gpir_create_canonical_handoff/.test(edge));
assert(!/\.from\("global_announcements"\)/.test(edge));
assert(!/cron\.job|pg_cron/.test(edge));

// Claim happens after registry validation but before run creation/fetch, and
// an overlap cannot initiate fetch, RAW insertion or processing.
const claimAt = edge.indexOf('rpc("gpir_claim_intelligence_source_run"');
const runAt = edge.indexOf('.from("intelligence_ingestion_runs")');
const fetchAt = edge.indexOf("const indexResponse = await fetch");
assert(claimAt > 0 && claimAt < runAt && claimAt < fetchAt);
assert.match(edge, /mode: "SKIPPED_OVERLAP"[\s\S]*outcome: "SOURCE_RUN_ALREADY_ACTIVE"[\s\S]*external_fetch_attempted: false[\s\S]*raw_records_inserted: 0[\s\S]*processor_invoked: false/);
assert.match(edge, /finally \{[\s\S]*gpir_release_intelligence_source_run/);
assert.match(edge, /SOURCE_RUN_CLAIM_TTL_SECONDS = 900/);

// The persistent finite lease is atomically serialized, permits a different
// source, records skip observability, releases only its owner and reclaims a
// stale lease. A database session advisory lock is only transaction scoped.
assert.match(claimSql, /CREATE TABLE IF NOT EXISTS public\.intelligence_source_run_claims/);
assert.match(claimSql, /source_id text PRIMARY KEY/);
assert.match(claimSql, /pg_advisory_xact_lock/);
assert.match(claimSql, /FOR UPDATE/);
assert.match(claimSql, /existing_claim\.expires_at <= pg_catalog\.clock_timestamp\(\)/);
assert.match(claimSql, /overlap_skipped_count = claim\.overlap_skipped_count \+ 1/);
assert.match(claimSql, /WHERE source_id = p_source_id\s+AND claim_token = p_claim_token/);
assert.match(claimSql, /least\(1800, pg_catalog\.greatest\(60/);
assert.match(claimSql, /ENABLE ROW LEVEL SECURITY/);
assert.match(claimSql, /REVOKE ALL ON FUNCTION public\.gpir_claim_intelligence_source_run/);
assert.match(rollbackSql, /DROP TABLE IF EXISTS public\.intelligence_source_run_claims/);
assert(!/intelligence_raw_ingestion|intelligence_candidates|global_announcements/.test(rollbackSql));

// Scheduler remains an owner-only prepared artifact. It uses the existing
// Edge Function path and Vault lookup at job runtime; it cannot run with the
// guarded endpoint placeholder and only creates/deletes named M33 jobs.
for (const [name, minute, source] of [
  ["m33-g1-sfa-ingestion", "5", "SFA-APAC-001"],
  ["m33-g1-rbi-ingestion", "25", "CB-APAC-010"],
  ["m33-g1-pymnts-ingestion", "45", "PYMNTS-GLOBAL-004"],
]) {
  assert(schedulerSql.includes(name));
  assert(schedulerSql.includes(`'${minute} * * * *'`));
  assert(schedulerSql.includes(`'${source}'`));
  assert(disableSql.includes(name));
}
assert.match(schedulerSql, /__OWNER_VERIFIED_EDGE_FUNCTION_URL__/);
assert.match(schedulerSql, /vault\.decrypted_secrets[\s\S]*gpir_edge_function_secret/);
assert.match(schedulerSql, /'dry_run', false/);
assert.match(schedulerSql, /cron\.unschedule[\s\S]*cron\.schedule/);
assert(!/FS-GLOBAL-003/.test(schedulerSql));
assert(!/global_announcements|intelligence_raw_ingestion|intelligence_candidates/.test(disableSql));
assert(!/Bearer [A-Za-z0-9_-]{20,}/.test(schedulerSql));

console.log("M33-G1 Step 7A orchestration safety: PASS (static claim, overlap, scheduler and disable contracts)");
