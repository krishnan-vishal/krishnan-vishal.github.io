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
const verificationSql = read("migrations", "m33-g1", "m33-g1-step-7c-post-migration-verification.sql");
const claimHotfixSql = read("migrations", "m33-g1", "m33-g1-step-7f1-claim-rpc-hotfix.sql");
const claimHotfixVerificationSql = read("migrations", "m33-g1", "m33-g1-step-7f1-claim-rpc-hotfix-verification.sql");
const claimRuntimeRegressionSql = read("migrations", "m33-g1", "m33-g1-step-7f1-claim-rpc-isolated-regression.sql");

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
assert.match(edge, /if \(!dryRun\) \{[\s\S]*gpir_claim_intelligence_source_run/);

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
assert.match(claimSql, /bounded_ttl := least\(1800, greatest\(60, coalesce\(p_ttl_seconds, 900\)\)\)/);
assert(!/pg_catalog\.(?:greatest|least|coalesce|nullif)\s*\(/i.test(claimSql));
assert.match(claimSql, /ENABLE ROW LEVEL SECURITY/);
assert.match(claimSql, /REVOKE ALL ON FUNCTION public\.gpir_claim_intelligence_source_run/);
assert.match(claimSql, /SET search_path = pg_catalog/g);
assert.match(claimSql, /SECURITY DEFINER/g);
assert.match(claimSql, /FROM PUBLIC, anon, authenticated, service_role/g);
assert.match(claimSql, /GRANT EXECUTE ON FUNCTION public\.gpir_claim_intelligence_source_run\(text, uuid, integer\)[\s\S]*TO service_role/);
assert.match(claimSql, /GRANT EXECUTE ON FUNCTION public\.gpir_release_intelligence_source_run\(text, uuid\)[\s\S]*TO service_role/);
assert.match(claimSql, /REVOKE ALL ON TABLE public\.intelligence_source_run_claims FROM PUBLIC, anon, authenticated, service_role/);
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
assert.match(schedulerSql, /https:\/\/qlnvhfapctcpzqyuhhth\.supabase\.co\/functions\/v1\/gpir-intelligence-fetch/);
assert(!/__OWNER_VERIFIED_EDGE_FUNCTION_URL__/.test(schedulerSql));
assert.match(schedulerSql, /vault\.decrypted_secrets[\s\S]*gpir_edge_function_secret/);
assert.match(schedulerSql, /'apikey', secret\.decrypted_secret/);
assert.match(schedulerSql, /'Authorization', 'Bearer ' \|\| secret\.decrypted_secret/);
assert.match(schedulerSql, /FROM vault\.decrypted_secrets AS secret[\s\S]*secret\.decrypted_secret IS NOT NULL[\s\S]*secret\.decrypted_secret <> ''/);
assert.match(schedulerSql, /'dry_run', false/);
assert.match(schedulerSql, /cron\.unschedule[\s\S]*cron\.schedule/);
assert(!/FS-GLOBAL-003/.test(schedulerSql));
assert(!/global_announcements|intelligence_raw_ingestion|intelligence_candidates/.test(disableSql));
assert(!/Bearer [A-Za-z0-9_-]{20,}/.test(schedulerSql));

// Owner post-migration proof is SELECT-only, never exposes Vault values, and
// covers RLS, function hardening, role grants, Cron absence and fixed baselines.
assert(!/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO)\b/i.test(
  verificationSql.replace(/^\s*--.*$/gm, ""),
));
assert.match(verificationSql, /relrowsecurity AS rls_enabled/);
assert.match(verificationSql, /prosecdef AS security_definer/);
assert.match(verificationSql, /proconfig AS function_configuration/);
assert.match(verificationSql, /public_execute/);
assert.match(verificationSql, /anon_execute/);
assert.match(verificationSql, /authenticated_execute/);
assert.match(verificationSql, /service_role_execute/);
assert.match(verificationSql, /jobname LIKE 'm33-g1-%'/);
assert.match(verificationSql, /jobname ILIKE '%gpir%intelligence%'/);
assert.match(verificationSql, /'RAW'::text, 9::bigint/);
assert.match(verificationSql, /'Candidates', 9::bigint/);
assert.match(verificationSql, /'Global announcements', 39::bigint/);
assert(!/decrypted_secret|vault\.decrypted_secrets/.test(verificationSql));

// Step 7F.1 repairs only the claim function and reasserts its existing grants.
// GREATEST/LEAST are PostgreSQL conditional expressions and must never be
// schema-qualified. The production verifier remains read-only, while the
// isolated harness exercises default/min/max TTL, overlap and matching release.
assert.match(claimHotfixSql, /^BEGIN;/m);
assert.match(claimHotfixSql, /CREATE OR REPLACE FUNCTION public\.gpir_claim_intelligence_source_run\(/);
assert.match(claimHotfixSql, /bounded_ttl := least\(1800, greatest\(60, coalesce\(p_ttl_seconds, 900\)\)\)/);
assert(!/pg_catalog\.(?:greatest|least|coalesce|nullif)\s*\(/i.test(claimHotfixSql));
assert.match(claimHotfixSql, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/);
assert.match(claimHotfixSql, /pg_advisory_xact_lock[\s\S]*FOR UPDATE/);
assert.match(claimHotfixSql, /overlap_skipped_count = claim\.overlap_skipped_count \+ 1/);
assert.match(claimHotfixSql, /REVOKE ALL ON FUNCTION public\.gpir_claim_intelligence_source_run\(text, uuid, integer\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
assert.match(claimHotfixSql, /GRANT EXECUTE ON FUNCTION public\.gpir_claim_intelligence_source_run\(text, uuid, integer\)[\s\S]*TO service_role/);
assert(!/CREATE TABLE|DROP TABLE|ALTER TABLE/i.test(claimHotfixSql));
assert(!/intelligence_raw_ingestion|intelligence_candidates|intelligence_rejection_log|intelligence_canonical_handoffs|global_announcements|cron\./i.test(claimHotfixSql));

assert(!/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO)\b/i.test(
  claimHotfixVerificationSql.replace(/^\s*--.*$/gm, ""),
));
assert.match(claimHotfixVerificationSql, /invalid_greatest_qualification_absent/);
assert.match(claimHotfixVerificationSql, /invalid_least_qualification_absent/);
assert.match(claimHotfixVerificationSql, /'Global announcements', 77::bigint/);
assert(!/decrypted_secret|vault\.decrypted_secrets/.test(claimHotfixVerificationSql));

assert.match(claimRuntimeRegressionSql, /current_setting\('m33_g1\.isolated_test'/);
assert.match(claimRuntimeRegressionSql, /token_default[\s\S]*ttl_seconds < 895/);
assert.match(claimRuntimeRegressionSql, /token_minimum[\s\S]*ttl_seconds < 55/);
assert.match(claimRuntimeRegressionSql, /token_maximum[\s\S]*ttl_seconds < 1795/);
assert.match(claimRuntimeRegressionSql, /overlap_skipped_count <> 1/);
assert.match(claimRuntimeRegressionSql, /Non-owner token unexpectedly released active claim/);
assert.match(claimRuntimeRegressionSql, /Invalid conditional-expression qualification remains/);
assert.match(claimRuntimeRegressionSql, /ROLLBACK;/);

console.log("M33-G1 Step 7F.1 orchestration safety: PASS (claim runtime hotfix, least privilege, overlap, scheduler, disable and verification contracts)");
