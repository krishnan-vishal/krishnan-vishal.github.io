import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createOperationalPublicationHandler } from "../supabase/functions/_shared/gpir-operational-graph.ts";
import { createAdaptiveAcquisition, nextHistoryWindow } from "../supabase/functions/_shared/gpir-adaptive-acquisition.mjs";
import { createResearchEvidenceRetriever } from "../supabase/functions/_shared/gpir-research-graph.ts";
import { createPublicationPipeline } from "../supabase/functions/gpir-intelligence-publish/handler.mjs";

Deno.env.set("LANGSMITH_CONFIG_FILE", fileURLToPath(new URL("./fixtures/m44-langsmith.json", import.meta.url)));
Deno.env.set("LANGSMITH_TRACING", "false");
Deno.env.set("LANGCHAIN_TRACING_V2", "false");

const env = { SUPABASE_URL: "https://fixturefixture123456.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-only" };

Deno.test("publisher graph executes bounded candidate and editorial work", async () => {
  const calls: string[] = [];
  const pipeline = createPublicationPipeline({
    env,
    repository: {
      candidates: async ({ limit }: { limit: number }) => { calls.push(`candidates:${limit}`); return []; },
      editorialEntries: async () => { calls.push("editorial"); return []; }
    }
  });
  const run = createOperationalPublicationHandler(pipeline);
  const response = await run(new Request("https://fixture.test", {
    method: "POST", body: JSON.stringify({ batchSize: 5 })
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["candidates:5", "editorial"]);
  assert.equal(response.headers.get("x-gpir-orchestrator"), "langgraph-oss-1.7.5");
  assert.equal(response.headers.get("x-gpir-graph-stages"),
    "OBSERVE,CURATE,VALIDATE,PUBLISH,INTERPRET_NO_LLM,INDEX,EVIDENCE");
  assert.equal((await response.json()).editorial.status, "OK");
});

Deno.test("failed candidate reads stop the graph before editorial or publication", async () => {
  let editorialCalls = 0;
  const pipeline = createPublicationPipeline({
    env, logger: { error() {} },
    repository: {
      candidates: async () => { throw new Error("fixture"); },
      editorialEntries: async () => { editorialCalls += 1; return []; }
    }
  });
  const response = await createOperationalPublicationHandler(pipeline)(
    new Request("https://fixture.test", { method: "POST", body: "{}" })
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "CANDIDATE_QUERY_FAILED");
  assert.equal(response.headers.get("x-gpir-graph-stages"), "OBSERVE,CURATE");
  assert.equal(editorialCalls, 0);
});

Deno.test("research graph ranks cited country records by topic and excludes source domicile", async () => {
  const retrieve = createResearchEvidenceRetriever();
  const documents = [
    { id: "domicile", title: "Payments", geography: "Global", source: { country: "JP" } },
    { id: "summary", title: "Updates", geography: "Japan", summary: "payments changes" },
    { id: "title", title: "Payments guidance", geography: "Japan", source: { name: "Authority" } }
  ];
  const records = await retrieve({ records: documents, query: "", terms: ["payments"], geographies: ["JP", "Japan"] });
  assert.deepEqual(records, [documents[2], documents[1]]);
});

Deno.test("the scheduled publisher progresses after an approved source is empty", async () => {
  const called: string[] = [];
  const acquisition = createAdaptiveAcquisition({
    now: () => Date.parse("2026-11-28T13:30:00Z"),
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, env.SUPABASE_URL);
      if (url.pathname.endsWith("source_registry")) return Response.json([
        { source_id: "CB-APAC-002", parser_profile: "mas-rss" },
        { source_id: "FS-GLOBAL-003", parser_profile: "universal-finance" },
        { source_id: "NEW-SOURCE", parser_profile: "universal-finance" }
      ]);
      if (url.pathname.endsWith("intelligence_ingestion_runs")) return Response.json([]);
      assert.equal(url.pathname, "/functions/v1/gpir-intelligence-fetch");
      assert.equal(new Headers(init?.headers).get("apikey"), "verified-scheduler-fixture");
      const body = JSON.parse(String(init?.body));
      called.push(body.source_id);
      return Response.json({ ok: true, statistics: { raw_records_inserted: called.length - 1 } });
    }
  });
  const pipeline = createPublicationPipeline({ env, acquisition, repository: { candidates: async () => [] } });
  const run = createOperationalPublicationHandler(pipeline);
  const headers = new Headers();
  headers.set("apikey", "verified-scheduler-fixture");
  const request = (body: object) => new Request("https://fixture.test", { method: "POST", body: JSON.stringify(body), headers });
  const receipt = await run(request({ batchSize: 5 }));
  assert.deepEqual(called, ["CB-APAC-002", "FS-GLOBAL-003"]);
  assert.deepEqual((await receipt.json()).acquisition.attempts.map((item: { inserted: number }) => item.inserted), [0, 1]);
  assert.match(receipt.headers.get("x-gpir-graph-stages") || "", /SCOUT/);
  const scoped = await run(request({ from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" }));
  assert.equal((await scoped.json()).acquisition, undefined);
  assert.equal(called.length, 2);
});

Deno.test("historical acquisition resumes gaps and splits a capped parent window", () => {
  const run = (from: string, to: string, truncated = false, remainder = 0) => ({ run_status: "SUCCESS", metadata: {
    start_datetime: from, end_datetime: to, window_truncated: truncated, unseen_remaining: remainder
  } });
  const now = Date.parse("2026-11-28T13:30:00Z");
  const end = "2026-11-28T00:00:00.000Z";
  const start = "2026-11-01T00:00:00.000Z";
  const middle = "2026-11-14T12:00:00.000Z";
  const capped = run(start, end, true);
  assert.deepEqual(nextHistoryWindow([capped], now), { start_datetime: middle, end_datetime: end, max_records: 100 });
  assert.deepEqual(nextHistoryWindow([capped, run(middle, end, false, 1)], now),
    { start_datetime: middle, end_datetime: end, max_records: 100 });
  assert.deepEqual(nextHistoryWindow([capped, run(middle, end)], now),
    { start_datetime: start, end_datetime: middle, max_records: 100 });
});
