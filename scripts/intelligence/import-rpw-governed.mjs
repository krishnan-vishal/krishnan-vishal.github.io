#!/usr/bin/env node
// M39 RPW: idempotent, statistical-reference-only import into EXISTING GPIR staging.
// Supabase source_registry authority, existing raw ingestion and run ledger; no CMS or ticker writes.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_ID = "WORLD-BANK-RPW-001";
const PROVIDER_URL = "https://datacatalogfiles.worldbank.org/ddh-published/0037898/DR0095523/rpw_dataset_2011_2025_q3.xlsx";
const CATALOG_URL = "https://datacatalog.worldbank.org/search/dataset/0037898/remittance-prices-worldwide";
const BATCH_SIZE = 80;
const EXPECTED_MIN = 1000;
const EXPECTED_MAX = 20000;
function quarterEnd(period) {
  const match = String(period).match(/^(\d{4})-Q([1-4])$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) * 3, 0)).toISOString().slice(0, 10) : null;
}

export function validateRpwRecords(records) {
  if (!Array.isArray(records) || records.length < EXPECTED_MIN || records.length > EXPECTED_MAX)
    throw new Error("RPW_UNEXPECTED_RECORD_COUNT");
  const seen = new Set();
  for (const r of records) {
    const m = r?.metadata || {};
    const p = m.observation_period;
    const expectedHash = createHash("sha256").update(JSON.stringify([
      "WORLD_BANK_RPW", p, m.sending_country_code, m.receiving_country_code, "cc1_total_cost_percent"
    ])).digest("hex");
    let raw;
    try { raw = JSON.parse(r.raw_content); } catch { throw new Error("RPW_INVALID_RAW_CONTENT"); }
    if (r.source_id !== SOURCE_ID || r.discovered_url !== PROVIDER_URL || r.canonical_url !== CATALOG_URL ||
        r.ingestion_status !== "PROCESSED" || r.source_published_at !== null || r.http_status !== null ||
        m.provider !== "WORLD_BANK_RPW" || m.data_class !== "STATISTICAL_REFERENCE" ||
        m.record_type !== "RPW_CORRIDOR_QUARTER" ||
        m.source_url !== PROVIDER_URL || m.catalog_url !== CATALOG_URL ||
        m.publication_eligible !== false || m.alert_eligible !== false ||
        m.observation_period < "2021-Q4" || m.observation_period > "2025-Q3" ||
        m.observation_date !== quarterEnd(p) ||
        raw.observation_date_basis !== "quarter_end_not_survey_date" ||
        raw.aggregation !== "unweighted_mean_of_surveyed_service_quotes" ||
        raw.metric !== "cc1_total_cost_percent" || raw.denomination_usd !== 200 ||
        !Number.isFinite(m.value) || m.value < 0 ||
        !Number.isInteger(m.quote_count) || m.quote_count < 1 ||
        !/^[A-Z]{3}$/.test(m.sending_country_code) ||
        !/^[A-Z]{3}$/.test(m.receiving_country_code) ||
        r.content_hash !== expectedHash || seen.has(r.content_hash)) throw new Error("RPW_GOVERNANCE_VALIDATION_FAILED");
    seen.add(r.content_hash);
  }
  return { count: records.length, unique_hashes: seen.size,
    earliest_period: records[0].metadata.observation_period,
    latest_period: records.at(-1).metadata.observation_period };
}

function client(env = process.env) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(base) || !key)
    throw new Error("GPIR_SUPABASE_PRODUCTION_CREDENTIALS_REQUIRED");
  return { base, headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" } };
}

async function rest(config, table, method, params = {}, body = undefined, prefer = undefined) {
  const url = new URL(config.base + "/rest/v1/" + table);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers = { ...config.headers };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error("RPW_SUPABASE_" + table + "_HTTP_" + response.status + "_" + text.slice(0, 240));
  return text ? JSON.parse(text) : null;
}

async function importRpw(file, reportPath) {
  const input = JSON.parse(readFileSync(file, "utf8"));
  const validated = validateRpwRecords(input.records);
  const config = client();
  const registry = await rest(config, "source_registry", "GET", {
    select: "source_id,trust_tier,source_status,parser_profile",
    source_id: "eq." + SOURCE_ID
  });
  if (registry.length !== 1 || registry[0].source_status !== "GREEN" ||
      registry[0].trust_tier !== "T1" || registry[0].parser_profile !== "world-bank-rpw-xlsx-v1")
    throw new Error("RPW_GOVERNED_SOURCE_NOT_REGISTERED");
  const run = await rest(config, "intelligence_ingestion_runs", "POST", { select: "id" },
    { source_id: SOURCE_ID, run_status: "RUNNING", records_discovered: validated.count, records_candidate: 0,
      records_published: 0, metadata: { milestone: "M39-RPW-FIVE-YEAR", provider: "WORLD_BANK_RPW",
        acquisition_run: 43017126016, reference_only: true, alert_eligible: false, publication_eligible: false } },
    "return=representation");
  if (!Array.isArray(run) || run.length !== 1 || !run[0].id) throw new Error("RPW_RUN_LEDGER_FAILED");
  const runId = run[0].id;
  let inserted = 0, skipped = 0;
  try {
    for (let offset = 0; offset < input.records.length; offset += BATCH_SIZE) {
      const batch = input.records.slice(offset, offset + BATCH_SIZE);
      const existing = await rest(config, "intelligence_raw_ingestion", "GET", {
        select: "content_hash", source_id: "eq." + SOURCE_ID,
        content_hash: "in.(" + batch.map(r => r.content_hash).join(",") + ")"
      });
      if (!Array.isArray(existing)) throw new Error("RPW_DEDUP_READ_FAILED");
      const hashes = new Set(existing.map(x => x.content_hash));
      const pending = batch.filter(r => !hashes.has(r.content_hash))
        .map(r => ({ ...r, ingestion_run_id: runId }));
      skipped += batch.length - pending.length;
      if (pending.length) {
        await rest(config, "intelligence_raw_ingestion", "POST", {},
          pending, "return=minimal");
        inserted += pending.length;
      }
      if ((offset + batch.length) % 800 < BATCH_SIZE || offset + batch.length === input.records.length)
        console.log("RPW_PROGRESS " + (offset + batch.length) + "/" + input.records.length);
    }
    await rest(config, "intelligence_ingestion_runs", "PATCH", { id: "eq." + runId },
      { run_status: "SUCCESS", completed_at: new Date().toISOString(), records_discovered: validated.count,
        records_candidate: 0, records_rejected: 0,
        records_published: 0, error_message: null,
        metadata: { milestone: "M39-RPW-FIVE-YEAR", provider: "WORLD_BANK_RPW",
          acquisition_run: 43017126016, reference_only: true,
          alert_eligible: false, publication_eligible: false, inserted, skipped, filtered_source_quotes: input.statistics?.records_rejected || 0 } },
      "return=minimal");
    const report = { status: "SUCCESS", source_id: SOURCE_ID, ...validated, inserted, skipped,
      publication_attempted: false, global_announcements_modified: false, cms_modified: false };
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } catch (error) {
    const message = String(error?.message || error).slice(0, 400);
    try {
      await rest(config, "intelligence_ingestion_runs", "PATCH", { id: "eq." + runId },
        { run_status: inserted ? "PARTIAL" : "FAILED", completed_at: new Date().toISOString(),
          error_message: message, metadata: { milestone: "M39-RPW-FIVE-YEAR", inserted, skipped,
            reference_only: true, publication_eligible: false, alert_eligible: false } },
        "return=minimal");
    } catch { /* preserve original error */ }
    writeFileSync(reportPath, JSON.stringify({ status: "INCOMPLETE", source_id: SOURCE_ID,
      inserted, skipped, publication_attempted: false, error: message }, null, 2) + "\n");
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  importRpw(process.argv[2] || "", process.argv[3] || "rpw-import-report.json")
    .catch(e => { console.error("RPW_IMPORT_FAILED:", e.message); process.exitCode = 1; });
}
