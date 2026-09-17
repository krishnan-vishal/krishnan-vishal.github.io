#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FORWARD_PATH = path.join(ROOT, "migrations", "m33-g1", "m33-g1-gate2-staging.sql");
const ROLLBACK_PATH = path.join(ROOT, "migrations", "m33-g1", "m33-g1-gate2-staging-rollback.sql");
const BEHAVIOR_PATH = path.join(ROOT, "migrations", "m33-g1", "m33-g1-gate2-isolated-regression.sql");
const FIXTURE_PATH = path.join(ROOT, "tests", "fixtures", "m33-g1-regression-cases.json");
const REQUIRED_FIELDS = [
    "inputClass",
    "expectedGate1",
    "expectedGate2",
    "expectedStagingState",
    "publicationEligibility",
    "expectedLineage",
    "expectedFailureReturnResult"
];
const TAXONOMY_FAMILIES = [
    "PAYMENTS",
    "BANKING",
    "REGULATION",
    "FINTECH",
    "CROSS_BORDER_PAYMENTS",
    "REMITTANCES",
    "RTP_A2A",
    "CARDS_SCHEMES",
    "WALLETS",
    "PSP_MTO_MSB_AGGREGATORS",
    "OPEN_BANKING_OPEN_FINANCE",
    "STABLECOINS_DIGITAL_ASSETS",
    "CBDC",
    "AML_KYC_KYB_SANCTIONS",
    "FRAUD_CYBER_TPRM",
    "PAYMENT_INFRASTRUCTURE",
    "ISO_20022_MESSAGING",
    "FX_TREASURY_SETTLEMENT",
    "MERCHANT_ACQUIRING",
    "DIGITAL_IDENTITY",
    "AI_AGENTIC_PAYMENTS",
    "BNPL"
];

let checks = 0;

function check(condition, message) {
    assert.ok(condition, message);
    checks += 1;
}

function read(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function compactSql(source) {
    return String(source)
        .replace(/--[^\r\n]*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function functionBody(source, name) {
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.notStrictEqual(start, -1, `${name} definition must exist`);
    const bodyStart = source.indexOf("AS $function$", start);
    const end = source.indexOf("$function$;", bodyStart + 13);
    assert.notStrictEqual(bodyStart, -1, `${name} body start must exist`);
    assert.notStrictEqual(end, -1, `${name} body end must exist`);
    return source.slice(start, end + 11);
}

function publicationMutationErrors(source) {
    const sql = compactSql(source);
    const patterns = [
        /\binsert\s+into\s+(?:public\.)?global_announcements\b/i,
        /\bupdate\s+(?:public\.)?global_announcements\b/i,
        /\bdelete\s+from\s+(?:public\.)?global_announcements\b/i,
        /\btruncate(?:\s+table)?\s+(?:public\.)?global_announcements\b/i,
        /\bdrop\s+table(?:\s+if\s+exists)?\s+(?:public\.)?global_announcements\b/i
    ];
    return patterns.filter(pattern => pattern.test(sql));
}

function rawDestructionErrors(source) {
    const sql = compactSql(source);
    const patterns = [
        /\bdelete\s+from\s+(?:public\.)?intelligence_raw_ingestion\b/i,
        /\btruncate(?:\s+table)?\s+(?:public\.)?intelligence_raw_ingestion\b/i,
        /\bdrop\s+table(?:\s+if\s+exists)?\s+(?:public\.)?intelligence_raw_ingestion\b/i
    ];
    return patterns.filter(pattern => pattern.test(sql));
}

function runSelfTests() {
    check(publicationMutationErrors("UPDATE public.global_announcements SET title = 'unsafe'").length === 1,
        "self-test must reject publication updates");
    check(publicationMutationErrors("INSERT INTO global_announcements (title) VALUES ('unsafe')").length === 1,
        "self-test must reject publication inserts");
    check(rawDestructionErrors("DELETE FROM public.intelligence_raw_ingestion").length === 1,
        "self-test must reject RAW deletion");
    check(publicationMutationErrors("ALTER TABLE public.global_announcements ALTER COLUMN ticker_eligible SET DEFAULT false").length === 0,
        "self-test must allow the approved default-only correction");
}

function validateFixture(fixture) {
    check(fixture.schemaVersion === "1.0.0", "fixture schema version must remain frozen");
    check(fixture.runtimeImported === false, "fixture must remain non-runtime");
    check(fixture.taxonomyVersion === "M33-G1-TAXONOMY-1", "fixture taxonomy version must match the migration");
    check(Array.isArray(fixture.cases) && fixture.cases.length === 35, "fixture must contain exactly 35 cases");

    const expectedIds = Array.from({ length: 35 }, (_, index) => `T${String(index + 1).padStart(2, "0")}`);
    const actualIds = fixture.cases.map(testCase => testCase.id);
    check(JSON.stringify(actualIds) === JSON.stringify(expectedIds), "fixture IDs must be contiguous T01 through T35");
    check(new Set(actualIds).size === 35, "fixture IDs must be unique");

    fixture.cases.forEach(testCase => {
        check(Boolean(testCase.description), `${testCase.id} must have a description`);
        REQUIRED_FIELDS.forEach(field => check(field in testCase, `${testCase.id} must declare ${field}`));
    });

    const byId = Object.fromEntries(fixture.cases.map(testCase => [testCase.id, testCase]));
    ["T01", "T02", "T03", "T04"].forEach(id =>
        check(byId[id].expectedGate2 === "SKIPPED", `${id} must stop before Gate 2`));
    ["T13", "T21"].forEach(id =>
        check(byId[id].expectedGate2.startsWith("REVIEW"), `${id} must cover REVIEW quarantine`));
    ["T14"].forEach(id =>
        check(byId[id].expectedGate2 === "REJECT", `${id} must cover Gate 2 rejection`));
    ["T15", "T22"].forEach(id =>
        check(byId[id].expectedGate2.startsWith("CANDIDATE"), `${id} must cover Gate 2 candidate routing`));
    ["T27", "T28", "T29"].forEach(id =>
        check(byId[id].publicationEligibility === "NONE", `${id} must prohibit handoff/publication`));
    check(byId.T30.publicationEligibility === "M30_EVALUATION_ONLY", "T30 must authorize M30 evaluation only");
    check(byId.T31.expectedFailureReturnResult === "HANDOFF_EXISTS", "T31 must require idempotency");
    check(byId.T32.expectedFailureReturnResult.includes("LKG_UNCHANGED"), "T32 must preserve Last-Known-Good publication");
    check(byId.T33.publicationEligibility === "NONE_FROM_PROCESSOR", "T33 must prohibit processor publication");
    check(byId.T34.expectedStagingState.includes("IDENTICAL"), "T34 must protect existing publication rows");
    check(byId.T35.expectedStagingState === "LEGACY_BASELINE_UNCHANGED", "T35 must preserve the legacy baseline");
}

function validateForwardMigration(source) {
    const sql = compactSql(source);
    check(/^BEGIN;/i.test(sql) && /COMMIT;$/i.test(sql), "forward migration must be transactional");
    check(publicationMutationErrors(source).length === 0, "forward migration must not mutate existing announcement rows");
    check(rawDestructionErrors(source).length === 0, "forward migration must not delete, truncate or drop RAW evidence");
    check(/ALTER TABLE public\.global_announcements ALTER COLUMN ticker_eligible SET DEFAULT false;/i.test(sql),
        "forward migration must set only the approved ticker default");
    check(!/global_announcements\s+ALTER COLUMN ticker_eligible SET DEFAULT true/i.test(sql),
        "forward migration must not restore the unsafe ticker default");
    check(/ADD COLUMN IF NOT EXISTS ingestion_run_id uuid/i.test(sql), "RAW run lineage must be additive and nullable");
    check(/ADD COLUMN IF NOT EXISTS assessment_id uuid/i.test(sql), "assessment lineage must be additive");
    check(/ADD COLUMN IF NOT EXISTS taxonomy_version text/i.test(sql), "taxonomy version must be stored");
    check(/ADD COLUMN IF NOT EXISTS secondary_categories text\[\]/i.test(sql), "multi-topic taxonomy must be stored");
    check(/ADD COLUMN IF NOT EXISTS validation_version text/i.test(sql), "validation version must be stored");
    check(/ON DELETE RESTRICT/i.test(sql), "lineage foreign keys must prevent destructive parent deletion");
    check(/BEFORE DELETE ON public\.intelligence_raw_ingestion/i.test(sql), "RAW delete prevention trigger must exist");
    check(/CREATE TABLE IF NOT EXISTS public\.intelligence_canonical_handoffs/i.test(sql), "handoff staging table must exist");
    check(/CREATE UNIQUE INDEX IF NOT EXISTS uq_m33_handoff_key/i.test(sql), "handoff key must be unique");
    check(/ON CONFLICT \(handoff_key\) DO NOTHING/i.test(sql), "handoff creation must be idempotent");
    check(/candidate_record\.candidate_status <> 'APPROVED'/i.test(sql), "handoff must require validated candidate status");
    check(/candidate_record\.ticker_eligible IS DISTINCT FROM false/i.test(sql), "handoff must require staging ticker false");
    check(/CASE WHEN decision = 'REVIEW' THEN 'REVIEW' ELSE 'PENDING' END/i.test(sql), "processor must implement REVIEW/CANDIDATE routing");
    check(/'GATE2:LOW_INTELLIGENCE_SCORE'/i.test(sql), "Gate 2 rejection must be distinguishable");
    check(/ticker_eligible, validation_notes[\s\S]*?false,/i.test(source), "candidate insert must explicitly set ticker eligibility false");
    check(/least\(1000, greatest\(1, coalesce\(p_limit, 1\)\)\)/i.test(sql), "batch limit must remain bounded 1..1000");
    check(/ORDER BY raw\.discovered_at ASC, raw\.id ASC/i.test(sql), "batch must process oldest RAW first");
    check(/M33-G1-TAXONOMY-1/i.test(sql), "taxonomy must be versioned");
    check(/'UNKNOWN'/i.test(sql), "taxonomy must preserve UNKNOWN");
    TAXONOMY_FAMILIES.forEach(family => check(source.includes(`'${family}'`), `taxonomy must include ${family}`));

    const recordProcessor = functionBody(source, "gpir_process_raw_record");
    const batchProcessor = functionBody(source, "gpir_process_raw_batch");
    const handoffFunction = functionBody(source, "gpir_create_canonical_handoff");
    [recordProcessor, batchProcessor].forEach((body, index) => {
        check(/SECURITY DEFINER/i.test(body), `processor ${index + 1} must retain SECURITY DEFINER`);
        check(/SET search_path = pg_catalog/i.test(body), `processor ${index + 1} must fix search_path`);
        check(!/\bEXECUTE\b/i.test(body), `processor ${index + 1} must not use dynamic SQL`);
        check(!/global_announcements/i.test(body), `processor ${index + 1} must not reference publication storage`);
    });
    check(/SECURITY INVOKER/i.test(handoffFunction), "handoff function must use invoker rights");
    check(/SET search_path = pg_catalog/i.test(handoffFunction), "handoff function must fix search_path");
    check(!/global_announcements/i.test(handoffFunction), "handoff function must not reference publication storage");
    check(/REVOKE ALL ON FUNCTION public\.gpir_process_raw_record\(uuid\) FROM PUBLIC/i.test(sql),
        "generic record-processor execution must be revoked");
    check(/REVOKE ALL ON FUNCTION public\.gpir_process_raw_batch\(integer\) FROM PUBLIC/i.test(sql),
        "generic batch-processor execution must be revoked");
    check(!/\bGRANT\s+EXECUTE\b/i.test(sql), "unverified production roles must not be invented");
}

function validateRollback(source) {
    const sql = compactSql(source);
    check(/^BEGIN;/i.test(sql) && /COMMIT;$/i.test(sql), "rollback must be transactional");
    check(publicationMutationErrors(source).length === 0, "rollback must not mutate announcement rows");
    check(rawDestructionErrors(source).length === 0, "rollback must preserve RAW evidence");
    check(!/\bDROP\s+(?:TABLE|COLUMN)\b/i.test(sql), "rollback must retain additive evidence structures");
    check(!/\bDELETE\s+FROM\b/i.test(sql), "rollback must not delete intelligence history");
    check((source.match(/M33_G1_ROLLBACK_DISABLED/g) || []).length >= 2,
        "rollback must fail closed by disabling new mutation paths");
    check(/retained handoff evidence is immutable/i.test(source), "rollback must document retained handoff evidence");
    check(/restore owner-captured prior definition/i.test(source), "rollback must require verified prior-definition restoration");
}

function validateBehaviorHarness(source) {
    check(/current_setting\('m33_g1\.isolated_test'/i.test(source), "behavior harness must require an isolated-test opt-in");
    check(/^BEGIN;/im.test(source) && /ROLLBACK;\s*$/i.test(source), "behavior harness must roll back its transaction");
    Array.from({ length: 35 }, (_, index) => `T${String(index + 1).padStart(2, "0")}`).forEach(id =>
        check(source.includes(`'${id}'`) || source.includes(`-- ${id}`), `behavior harness must cover ${id}`));
    check(!/COMMIT;/i.test(source), "behavior harness must never commit fixture data");
}

function main() {
    runSelfTests();
    const fixture = JSON.parse(read(FIXTURE_PATH));
    validateFixture(fixture);
    validateForwardMigration(read(FORWARD_PATH));
    validateRollback(read(ROLLBACK_PATH));
    validateBehaviorHarness(read(BEHAVIOR_PATH));

    console.log(`M33-G1 Step 6A static migration validation: PASS (${checks} checks)`);
    console.log("M33-G1 regression fixture contract: PASS (35/35 cases)");
    console.log("M33-G1 isolated PostgreSQL harness: BUILT (T01-T35)");
    console.log("BEHAVIORAL SQL TESTS: NOT EXECUTED — ISOLATED POSTGRES REQUIRED");
}

try {
    main();
} catch (error) {
    console.error(`M33-G1 Step 6A validation: FAIL - ${error.message}`);
    process.exitCode = 1;
}
