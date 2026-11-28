import { Annotation, END, START, StateGraph } from "npm:@langchain/langgraph@1.7.5";

const OperationalState = Annotation.Root({
  request: Annotation<Request>(),
  response: Annotation<Response | null>(),
  stages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => []
  })
});

type PublicationHandler = (request: Request) => Promise<Response>;

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
export function createOperationalPublicationGraph(handler: PublicationHandler) {
  return new StateGraph(OperationalState)
    .addNode("observe", async () => ({ stages: ["OBSERVE"] }))
    .addNode("curator", async state => {
      if (!(state.request instanceof Request)) throw new Error("GPIR_GRAPH_REQUEST_REQUIRED");
      return { stages: ["CURATE"] };
    })
    .addNode("validateAndPublish", async state => ({
      response: await handler(state.request),
      stages: ["VALIDATE", "PUBLISH"]
    }))
    .addNode("interpret", async state => {
      if (!(state.response instanceof Response)) throw new Error("GPIR_GRAPH_RESPONSE_REQUIRED");
      // Interpretation here is an operational receipt only. Reader-facing
      // intelligence stays deterministic and source-backed when LLM quota is 0.
      return { stages: ["INTERPRET_NO_LLM"] };
    })
    .addNode("indexAndEvidence", async state => ({
      response: receipt(state.response as Response,
        [...state.stages, "INDEX", "EVIDENCE"]),
      stages: ["INDEX", "EVIDENCE"]
    }))
    .addEdge(START, "observe")
    .addEdge("observe", "curator")
    .addEdge("curator", "validateAndPublish")
    .addEdge("validateAndPublish", "interpret")
    .addEdge("interpret", "indexAndEvidence")
    .addEdge("indexAndEvidence", END)
    .compile();
}

export function createOperationalPublicationHandler(handler: PublicationHandler) {
  const graph = createOperationalPublicationGraph(handler);
  return async (request: Request) => {
    const result = await graph.invoke({ request, response: null, stages: [] });
    if (!(result.response instanceof Response))
      return new Response(JSON.stringify({ status: "ERROR", code: "ORCHESTRATION_RESPONSE_MISSING" }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    return result.response;
  };
}
