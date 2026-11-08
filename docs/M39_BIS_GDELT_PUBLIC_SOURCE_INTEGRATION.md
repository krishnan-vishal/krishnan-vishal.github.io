# M39 — BIS and GDELT public-source integration (staged, not deployed)

## Purpose
Reuse the existing GPIR Supabase source registry → acquisition → raw staging → candidate governance → publisher → Global Alerts and Smart Intelligence APIs. No separate reader API, no Contentful changes.

## Stage 1 — proposal-only code included in this branch
- `scripts/intelligence/public-source-adapters.cjs` builds bounded GDELT DOC 2.0 ArticleList queries and converts responses into **unverified discovery candidates** with original URLs, a GDELT seen timestamp, topic and provenance.
- Discovery time is **not** an authoritative original-publication timestamp. Candidates are `NOT_PUBLISHED` and `SOURCE_VERIFICATION_REQUIRED`. They cannot be relayed to the homepage or reader history without existing GPIR validation.
- BIS is **statistical reference data**, not a source of individual licensing decisions. The BIS descriptor intentionally requires a chosen SDMX dataflow and reuse assessment before a fetch/backfill.
- Test: `node tests/m39-public-source-adapters.test.cjs`.

## Stage 2 — pending before production activation
1. Select BIS dataflows, dimensions and observations appropriate for central-bank and cross-border payment statistics; verify reuse terms and citation requirements. Implement SDMX parsing and date-aware idempotent backfill.
2. Wire GDELT discovery into the existing controlled acquisition route, with bounded polling, source-domain verification, canonical URL deduplication and existing governance/rejection logging. GDELT is not an authoritative publisher.
3. Backfill only within supported provider windows; DOC 2.0 historical query windows are limited (commonly the last three months). Do not claim January 2026 coverage from this endpoint.
4. Activate new source_registry entries only after parser and source-specific tests pass. Do not weaken T1/T1.5/T2 thresholds or allow unverified GDELT hits into live alerts.
5. Verify public `gpir-public-alerts` 12-hour freshness and `gpir-public-intelligence?scope=history` against actual governed records; then validate homepage ticker and 36-topic Smart Cards in a single acceptance.

## Deferred
Crunchbase API and OpenSanctions API require a separate access/terms review; no keys or accounts are assumed.

## Official references
- BIS SDMX v2: https://stats.bis.org/api-doc/v2/
- BIS API and permitted use: https://data.bis.org/help/legal
- GDELT DOC 2.0: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
