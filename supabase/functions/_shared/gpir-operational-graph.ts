import { Annotation, END, START, StateGraph } from "npm:@langchain/langgraph@1.7.5";
import type { createPublicationPipeline } from "../gpir-intelligence-publish/handler.mjs";

type Pipeline = ReturnType<typeof createPublicationPipeline>;
type Context = Exclude<Awaited<ReturnType<Pipeline["observe"]>>, Response>;
type Candidates = Exclude<Awaited<ReturnType<Pipeline["curate"]>>, Response>;
type Outcomes = Awaited<ReturnType<Pipeline["validateAndPublish"]>>;
type Editorial = Awaited<ReturnType<Pipeline["interpret"]>>;

const OperationalState = Annotation.Root({
  request: Annotation<Request>(),
  context: Annotation<Context | null>(),
  candidates: Annotation<Candidates | null>(),
  outcomes: Annotation<Outcomes | null>(),
  editorial: Annotation<Editorial | null>(),
  response: Annotation<Response | null>(),
  stages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => []
  })
});

function receipt(response: Response, stages: string[]) {
  const headers = new Headers(response.headers);
  headers.set("x-gpir-orchestrator", "langgraph-oss-1.7.5");
  headers.set("x-gpir-operational-mode", "deterministic-no-llm");
  headers.set("x-gpir-graph-stages", stages.join(","));
  return new Response(response.body, { status: response.status, headers });
}

// LangGraph coordinates the existing deterministic publication path. It does
// not call a model, persist a second knowledge store or bypass any GPIR gate.
// The underlying handler remains authoritative for source verification,
// confidence thresholds, publication, Contentful/Payload evidence and archive
// lifecycle decisions.
export function createOperationalPublicationGraph(pipeline: Pipeline) {
  return new StateGraph(OperationalState)
    .addNode("observe", async state => {
      const result = await pipeline.observe(state.request);
      return result instanceof Response ? { response: result, stages: ["OBSERVE"] }
        : { context: result, stages: ["OBSERVE"] };
    })
    .addNode("curator", async state => {
      if (state.response || !state.context) return {};
      const result = await pipeline.curate(state.context);
      return result instanceof Response ? { response: result, stages: ["CURATE"] }
        : { candidates: result, stages: ["CURATE"] };
    })
    .addNode("validateAndPublish", async state => {
      if (state.response || !state.context || !state.candidates) return {};
      const outcomes = await pipeline.validateAndPublish(state.context, state.candidates);
      return { outcomes, stages: ["VALIDATE", "PUBLISH"] };
    })
    .addNode("interpret", async state => {
      if (state.response || !state.context) return {};
      return { editorial: await pipeline.interpret(state.context), stages: ["INTERPRET_NO_LLM"] };
    })
    .addNode("indexAndEvidence", async state => {
      if (state.response) return { response: receipt(state.response, state.stages) };
      if (!state.candidates || !state.outcomes || !state.editorial)
        throw new Error("GPIR_GRAPH_EVIDENCE_REQUIRED");
      const response = pipeline.evidence(state.candidates, state.outcomes, state.editorial);
      return { response: receipt(response, [...state.stages, "INDEX", "EVIDENCE"]),
        stages: ["INDEX", "EVIDENCE"] };
    })
    .addEdge(START, "observe")
    .addEdge("observe", "curator")
    .addEdge("curator", "validateAndPublish")
    .addEdge("validateAndPublish", "interpret")
    .addEdge("interpret", "indexAndEvidence")
    .addEdge("indexAndEvidence", END)
    .compile();
}

export function createOperationalPublicationHandler(pipeline: Pipeline) {
  const graph = createOperationalPublicationGraph(pipeline);
  return async (request: Request) => {
    const result = await graph.invoke({ request, response: null, context: null, candidates: null,
      outcomes: null, editorial: null, stages: [] });
    if (!(result.response instanceof Response))
      return new Response(JSON.stringify({ status: "ERROR", code: "ORCHESTRATION_RESPONSE_MISSING" }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    return result.response;
  };
}
