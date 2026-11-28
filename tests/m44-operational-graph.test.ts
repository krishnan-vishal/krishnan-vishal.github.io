import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createOperationalPublicationHandler } from "../supabase/functions/_shared/gpir-operational-graph.ts";
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
