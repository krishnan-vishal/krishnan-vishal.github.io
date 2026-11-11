import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateRpwRecords } from "../scripts/intelligence/import-rpw-governed.mjs";

const SOURCE = "https://datacatalogfiles.worldbank.org/ddh-published/0037898/DR0095523/rpw_dataset_2011_2025_q3.xlsx";
const CATALOG = "https://datacatalog.worldbank.org/search/dataset/0037898/remittance-prices-worldwide";
function iso3(i) {
  return String.fromCharCode(65 + Math.floor(i / 676) % 26,
    65 + Math.floor(i / 26) % 26, 65 + i % 26);
}
function record(i) {
  const send = iso3(i);
  const receive = "IND";
  const period = "2021-Q4";
  const hash = createHash("sha256").update(JSON.stringify([
    "WORLD_BANK_RPW", period, send, receive, "cc1_total_cost_percent"
  ])).digest("hex");
  return {
    source_id: "WORLD-BANK-RPW-001", discovered_url: SOURCE, canonical_url: CATALOG,
    ingestion_status: "PROCESSED", source_published_at: null, http_status: null, content_hash: hash,
    raw_content: JSON.stringify({ observation_date_basis: "quarter_end_not_survey_date",
      aggregation: "unweighted_mean_of_surveyed_service_quotes",
      metric: "cc1_total_cost_percent", denomination_usd: 200 }),
    metadata: { provider: "WORLD_BANK_RPW", data_class: "STATISTICAL_REFERENCE",
      record_type: "RPW_CORRIDOR_QUARTER", source_url: SOURCE, catalog_url: CATALOG,
      publication_eligible: false, alert_eligible: false, observation_period: period,
      observation_date: "2021-12-31", sending_country_code: send, receiving_country_code: receive,
      value: 4, quote_count: 1 }
  };
}
const valid = () => Array.from({ length: 1000 }, (_, i) => record(i));
test("Governed RPW importer accepts a validated, unique historical batch", () => {
  assert.equal(validateRpwRecords(valid()).count, 1000);
});
test("Rejects duplicate content hashes", () => {
  const rows = valid(); rows[1] = rows[0];
  assert.throws(() => validateRpwRecords(rows), /RPW_GOVERNANCE_VALIDATION_FAILED/);
});
test("Rejects unapproved automatic publication", () => {
  const rows = valid(); rows[0].metadata.publication_eligible = true;
  assert.throws(() => validateRpwRecords(rows), /RPW_GOVERNANCE_VALIDATION_FAILED/);
});
test("Rejects falsely described survey dates", () => {
  const rows = valid(); rows[0].metadata.observation_date = "2021-11-15";
  assert.throws(() => validateRpwRecords(rows), /RPW_GOVERNANCE_VALIDATION_FAILED/);
});
test("Rejects tampered RPW corridor identities", () => {
  const rows = valid(); rows[0].metadata.receiving_country_code = "USA";
  assert.throws(() => validateRpwRecords(rows), /RPW_GOVERNANCE_VALIDATION_FAILED/);
});
