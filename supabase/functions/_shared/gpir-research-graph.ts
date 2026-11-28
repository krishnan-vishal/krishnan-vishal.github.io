import { Annotation, END, START, StateGraph } from "npm:@langchain/langgraph@1.7.5";
import { filterResearchGeographies, rankResearchEvidence } from "../gpir-public-intelligence/handler.mjs";

type Records = Parameters<typeof filterResearchGeographies>[0];

const ResearchState = Annotation.Root({
  records: Annotation<Records>(),
  query: Annotation<string>(),
  terms: Annotation<string[]>(),
  geographies: Annotation<string[]>()
});

// The public handler supplies only records already allowed by the reader's entitlement.
export function createResearchEvidenceRetriever() {
  const graph = new StateGraph(ResearchState)
    .addNode("countryEvidence", state => ({
      records: filterResearchGeographies(state.records, state.geographies)
    }))
    .addNode("rankCitedEvidence", state => ({
      records: rankResearchEvidence(state.records, state.query, state.terms, state.geographies.length > 0)
    }))
    .addEdge(START, "countryEvidence")
    .addEdge("countryEvidence", "rankCitedEvidence")
    .addEdge("rankCitedEvidence", END)
    .compile();
  return async (input: typeof ResearchState.State) => (await graph.invoke(input)).records;
}
