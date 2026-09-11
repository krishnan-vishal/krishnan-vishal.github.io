# FINTECHOISIS / GPIR Master Project Log

Permanent chronological record of repository development prompts and verified
outcomes. Entries are append-only. Where the repository does not contain a
reliable prompt-level record, that fact is stated rather than inferred.

## Record conventions

- Dates use `YYYY-MM-DD`.
- A commit SHA identifies a committed repository state. Uncommitted work is
  labelled as such.
- A milestone is declared only after implementation, validation, known outcome
  and limitations are recorded.
- See [DEVELOPMENT_GOVERNANCE.md](DEVELOPMENT_GOVERNANCE.md) and
  [GPIR_BACKLOG.md](GPIR_BACKLOG.md).

## M30 — Final Global Announcements Production Closure

- **Date / base / branch:** `2026-09-10`; `2411e99`; `work/m30-global-announcements-production-closure`.
- **Objective:** finish the existing canonical Global Announcements reader and deterministic publication path without redesigning Search, ASK, FX, source taxonomy, navigation or the static architecture, and without beginning Wave B.
- **Root causes corrected:** Global Announcements had been changed to a static manually scrollable track; the archive’s large filter/card layout was not Month/Year-first; compact archive rules were in an unloaded homepage stylesheet; and `publishedAt` (GPIR processing time) overrode source publication evidence in LIVE classification. Date-only candidates could also clear automatic publication despite lacking an exact source instant.
- **Reader implementation:** the canonical ticker sequence is cloned once, the duplicate is accessibility-hidden/non-focusable, and a measured one-sequence translation produces a seamless compact loop with hidden overflow and ellipsis. Fallback records are labelled ARCHIVE. The archive generator now emits a compact Year/Month index with dynamic counts, a one-line record layout, secondary metadata filters and an embedded generated snapshot of the canonical dataset; all filtering is local and server-rendered LKG records remain present.
- **Integrity implementation:** source publication evidence exclusively drives the 24-hour window; GPIR `publishedAt` remains provenance only. Future T1 auto-publication requires an exact timezone-qualified publication timestamp. Invalid/inexact, duplicate, irrelevant or unhealthy-source candidates remain queued/quarantined.
- **Source outcome:** the bounded report-only pass evaluated all 113 approved sources, including 43 configured acquisition endpoints. Local network access returned no source items, so 0 records were discovered, 0 proposed and 0 auto-published; canonical publication was not mutated. A separate report-only publication gate retained all 14 existing candidates and quarantined 7 eligible-source candidates for failed deterministic gates. No event was fabricated to force LIVE.
- **Reader proof:** current canonical output is 0 LIVE and 14 archived. Year 2026 contains all 14 records with generated month counts: September 1, August 2, July 2, June 6, May 1 and March 2. Search emits all 14 through the canonical announcement loader; ASK uses the same published corpus and lifecycle query.
- **Validation:** the new 24-check M30 suite passes, alongside content/announcement/source/Wave A validation; P1 degradation simulations; lifecycle, publication, Search/ASK intent, radar, M24, M29 and source-activation tests; 104-file link validation; all JS syntax checks; and `git diff --check`. Browser QA at a narrow viewport verified the compact archive and no clipping; timed ticker captures verified active motion and no visible scrollbar. The advisory performance audit reports only four pre-existing warnings.
- **Delivery:** implementation commit `bf14d59`; pushed handoff `8e18f0b`; PR #356 open and mergeable against `main`; initial Security and Integrity workflow passed. Owner-controlled merge remains required.

## P1 — Continuous Intelligence Discovery Recovery

- **Date:** `2026-09-10`.
- **Starting SHA / branch:** `7709bba` on `fix/p1-continuous-intelligence-discovery`.
- **Incident diagnosis:** scheduled run #15 (`34430213835`) failed in `Discover trusted-source candidates` / `Validate changed intelligence artifacts`. `node scripts/validate-content.js` passed, then `node scripts/validate-announcements.js` returned exit code 1 with five violations: missing single ticker sequence, duplicated sequence, incomplete archive lifecycle sections, blank server fallback containers, and missing dynamic archive timestamp. No individual source was involved.
- **Classification:** deterministic reader/generated-artifact validation (schema/contract consistency), not endpoint/network, parser, source-health, candidate generation, publication, GitHub Actions environment or Node compatibility. The run executed SHA `8b19163`; M29 subsequently corrected the stale ticker/archive artifacts on `main` before this branch began.
- **Reliability change:** source-health generation and persistence is now an isolated best-effort artifact update using staged atomic promotion. Failure retains the exact prior snapshot and reports `DEGRADED_LAST_KNOWN_GOOD_RETAINED`; it cannot fail an otherwise safe cycle. Candidate queue updates use the same atomic single-artifact promotion. The publication gate also treats source-health reconciliation as isolated, while genuine canonical publication errors remain fatal and uncommitted.
- **Zero-result contract:** the proposal report and workflow summary explicitly state `0 new records` and `existing published corpus retained`; zero qualifying records is successful.
- **Reader verification:** source health does not control ticker visibility. The reader selects LIVE records first, falls back to retained validated published records, labels non-live detail as archived/historical, and retains a truthful empty state if the corpus is empty.
- **Tests:** a dedicated deterministic harness covers A healthy discovery, B all endpoints unavailable, C one parser failure, D zero qualifying records and E source-health generation failure. In degraded cases it verifies exact hashes of announcements, canonical registry, archive and ticker inputs remain unchanged, covering the shared Search/ASK corpus without changing those architectures.
- **Node/action finding:** `actions/checkout@v4` and `actions/setup-node@v4` completed successfully in run #15. GitHub's Node 20-to-24 action-runtime warning was non-causal; project Node remains 20 and no unnecessary action/dependency upgrade was made.
- **Scope:** no merge, no PR #351 change, no Wave B work, and no Global Announcements, Wave A, Search, ASK, FX, source-taxonomy or canonical-intelligence redesign.
- **Delivery:** implementation committed at `6011fd3`; branch pushed with documented head `f8d761c`; PR #353 is open, mergeable and its initial Security and Integrity check passed. Final merge remains owner-controlled.

## Historical repository record

## Global Announcements — Authoritative Source Activation & Freshness

- **Date:** `2026-09-09`.
- **Starting SHA:** `1fdc381` (`origin/main`, including merged PR #336).
- **Objective:** Expand the existing announcement radar with reliable official machine-readable sources across the global coverage grid, strengthen source-health reporting and run the requested `2026-08-15` through `2026-09-09` backfill strictly in report-only mode.
- **Activation outcome:** Seven already-registered Tier-1 authorities gained live-verified official endpoints: RBA, Bank of England, Federal Reserve Board, Bank of Canada, Banco Central do Brasil, South African Reserve Bank and National Bank of Kazakhstan. The total active machine-readable set increased from 6 to 13. No credential, scraping, browser-automation, undocumented endpoint or new runtime dependency was introduced.
- **Regional coverage:** Active endpoints are APAC 3, South Asia 2, Europe 2, North America 2, Africa 1, LATAM 1, CIS 1 and Oceania 1. GCC / Middle East remains 0 because tested public surfaces did not provide a reliable supported official feed; the gap is recorded rather than guessed around.
- **Backfill outcome:** 88 sources evaluated; 87 in-window records discovered; 5 relevant candidate proposals; 82 non-relevant rejections; no duplicate or invalid-source suppression; all 5 proposals routed to archive review because they are older than 24 hours; no public record changed. A single HKMA timeout was isolated and did not affect the remaining endpoints.
- **Data and parser integrity:** Existing knowledge was not overwritten. Original publication dates and URLs are retained. SARB relative links are resolved against its approved endpoint origin. NBK's observed official-feed field layout is handled by a source-specific deterministic profile rather than inferred data.
- **Health reporting:** Read-only reports now expose region, country, source type, endpoint type, machine-readable state, fetch/parser state, failure reason, last successful fetch and last candidate timestamp for every source.
- **Lifecycle and reader outcome:** Current partition remains 0 live, 9 archived and 1 developing/awaiting validation. Search GPIR and ASK GPIR continue to retrieve only published validated records, and their intent/resilience suite passes.
- **Publication control:** Work is confined to `work/global-announcements-source-activation`. No merge is authorised or performed. The existing two-hour candidate proposal workflow and human review gate remain authoritative.
- **Validation:** Source-activation, intelligence-radar, announcement-lifecycle, Search/ASK intent, announcement/content validation, edited JavaScript syntax and `git diff --check` pass locally. Remote Actions and owner review remain pending.

## M-26A — Public Repository Activation

- **Date:** `2026-09-05`.
- **Starting SHA:** `a00b19e9bc9a69177096391eb256fad328375ac0`.
- **Objective:** Activate the existing GPIR portfolio as a public, discoverable
  and consumable repository without waiting for full country coverage, full
  dashboard coverage or new research generation.
- **Strategic transition:** Move from audit and preservation into public
  activation, consumption and learning while retaining the static GitHub Pages
  architecture, deterministic local-first behaviour and no new infrastructure.
- **Implementation streams:** M-26A.1 Public Navigation Activation; M-26A.2
  Global Existing-Content Discovery; M-26A.3 Dashboard Consumption Layer;
  M-26A.4 Smart Narrative Reader Layer; M-26A.5 Search + ASK GPIR
  Integration; M-26A.6 Source / Evidence / Trust Presentation; M-26A.7
  Current / Historical Reader Architecture; M-26A.8 Public Production Release.
- **Files changed:** Existing GPIR assets already in repository were used and
  preserved; governance files updated to record the activation milestone.
  No new research or dashboard assets were created.
- **Functionality activated:** Public navigation, region/country directory
  routes, dashboard discoverability, search, ASK GPIR reader guidance,
  narrative presentation, source/evidence surface and honest availability
  status for material not yet published.
- **Dashboard asset activation:** Existing dashboard records remain published
  as validated GPIR research assets and are connected to the repository through
  the canonical registry, metadata, search and reader context rather than being
  gated or duplicated.
- **Country activation:** Existing country pages remain independently
  discoverable without requiring dashboards or complete content coverage.
- **Region activation:** Existing region navigation continues to connect the
  public reader to country pages, dashboards and intelligence while showing
  honest readiness states for upcoming markets.
- **Search activation:** Local low-latency static search and dashboard search
  remain available through the existing search layer without adding a backend.
- **ASK GPIR activation:** Reader utility continues to answer deterministic
  repository questions using existing data and page context only.
- **Smart Narrative activation:** Dashboard narratives remain local-first and
  metadata-driven, with clear availability when no narrative exists.
- **Source / evidence activation:** Existing source metadata is surfaced as-is
  from the repository without inventing independent verification.
- **Current / historical status:** The architecture continues to preserve
  current content and avoid deleting historical information when superseded.
- **Validation results:** JSON parsing, JavaScript syntax, repository content
  validation, link validation, registry consistency, dashboard integrity,
  search index integrity and `git diff --check` were reviewed against the
  current repository state. Existing validators passed in the current static
  build. Production HTTP checks were also performed for the live site.
- **Live HTTP results:** `https://krishnan-vishal.github.io/` and the relevant
  canonical pages returned HTTP 200 for the current public deployment.
- **Security results:** No API keys, secrets, credentials, external AI calls,
  telemetry, query storage or new infrastructure were introduced.
- **Browser QA status:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **Achieved:** Public repository activation is now in place using the existing
  repository assets; the reader can discover and consume GPIR content without
  waiting for complete coverage.
- **Partially achieved:** Some future coverage gaps remain intentionally open and
  read ethically as not yet available rather than fabricated.
- **Deferred:** Major content expansion beyond the current repository remains in
  future milestones and does not block public activation.
- **Not yet added / to do:** New research, new dashboard fabrication, new
  regional research or backend services remain out of scope for M-26A.
- **M-18 status:** OPEN.
- **M-19 status:** OPEN.
- **CNAME status:** ABSENT.
- **Custom domain:** DEFERRED.
- **Final commit SHA:** Working tree updated in the current session; exact final
  commit SHA will be recorded after the implementation is committed in the
  repository branch.
- **Next recommended milestone:** Continue consumption, learning and scale using
  the already activated repository; do not begin another audit milestone.

## M-26B — Publicly Connected Intelligence Repository

- **Date:** `2026-09-05`.
- **Starting SHA:** `bfb08fb7e12bee4cbd36c6a84921cbc55a981141`.
- **Objective:** Add the missing public connectivity layer to the already-activated GPIR repository by surfacing deterministic region, country and dashboard links on live pages and reinforcing the reader's ability to traverse the existing content graph without fabricating unsupported relationships.
- **Strategic transition:** Move from public activation into connected consumption: readers can follow the repository's own relationships rather than being stranded on isolated country or region pages.
- **Implementation streams:** M-26B.1 Country-page connected intelligence panel; M-26B.2 Region-page connected coverage panel; M-26B.3 Registry-driven cross-link rendering; M-26B.4 Lightweight CSS support for connected reader cards.
- **Files changed:** `assets/js/script.js`, `assets/css/chapter-page.css`, plus the existing registry and page assets already in the repository. No new content or fabricated relations were introduced.
- **Functionality added:** Country pages now show a connected GPIR intelligence panel linking to the parent region, published dashboard and related registry items. Region pages show a regional coverage panel linking to active country entries and dashboard status. All links are derived from the canonical `content-registry.json` relationships already validated in the repo.
- **Validation results:**
  - `node --check assets/js/script.js` — passed
  - `node scripts/validate-content.js` — passed
  - `node scripts/validate-links.js` — passed
  - `git --no-pager diff --check` — passed
  - Registry duplicate ID and missing relationship checks — passed
- **Live HTTP results:**
  - `https://krishnan-vishal.github.io/` — HTTP 200
  - `https://krishnan-vishal.github.io/pages/countries/uae.html` — HTTP 200
  - `https://krishnan-vishal.github.io/pages/regions/apac.html` — HTTP 200
  - `https://krishnan-vishal.github.io/assets/js/script.js` — HTTP 200
  - `https://krishnan-vishal.github.io/assets/css/chapter-page.css` — HTTP 200
  - `https://krishnan-vishal.github.io/assets/data/content-registry.json` — HTTP 200
- **Browser QA:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **Security results:** No API keys, secrets, external model calls, telemetry or query storage were introduced.
- **Achieved:** M-26B is implemented and live-verified on production routes. The repository is now a connected public reader using existing registry relationships without fabricated content.
- **Deferred:** Broader semantic relationship expansion, additional dashboard intake, migration publication integration and custom-domain work remain future milestones, but do not block this M-26B release.
- **M-18 status:** OPEN.
- **M-19 status:** OPEN.
- **CNAME status:** ABSENT.
- **Custom domain:** DEFERRED.
- **Next recommended milestone:** Continue with measured reader-graph improvements on the same canonical registry rather than creating a second data layer.

## M-25E — Existing Dashboard Library Activation & Regional Smart Narrative

- **Starting SHA:** `6543423245ea4f9babbf72345e6da0b3516edd25`.
- **Objective:** Inventory and activate existing dashboard publications through
  deterministic country and regional navigation, with source-grounded local
  reader summaries and no new research generation.
- **Diagnostic findings:** `assets/dashboards/` contains 123 image files: 63
  PNG and 60 WebP, representing five country dashboard identities and three
  existing migration publication families. No additional country dashboard
  identity was found for the example APAC markets named in the prompt. The
  five country records already had valid image paths, registry relationships
  and runtime search integration; country pages and region tiles did not yet
  expose a shared Smart Narrative or explicit dashboard availability state.
- **Implementation:** Added `assets/data/dashboard-narratives.json`; rendered
  it after the existing view-first dashboard image on five country pages;
  extended ASK GPIR to resolve country dashboard questions and expose the
  same narrative; and labelled dashboard availability in APAC and
  Middle East/GCC directory tiles. Dashboard artwork, routes, DNS, CNAME,
  external services and research content were unchanged.
- **Inventory:** See [M-25E-DASHBOARD-INVENTORY.md](M-25E-DASHBOARD-INVENTORY.md).
  Five country dashboard identities are registry-backed; three migration
  families remain preserved related publication assets without fabricated
  dashboard identities. No current/historical relationship was inferred.
- **Smart Narrative:** 5 created from existing metadata and existing page
  context; unsupported source, methodology, period, metric and outlook fields
  remain unavailable.
- **Validation:** Focused JavaScript syntax and narrative JSON parsing passed;
  full content, link, image-path, duplicate-ID, performance and diff checks,
  plus browser/live verification, are recorded after implementation.
- **Security / performance:** No API keys, secrets, external LLM, telemetry,
  query storage or third-party dependency was introduced. Existing lazy image
  loading, responsive variants and lightbox presentation remain in use.
- **Outcome:** Partially achieved pending full validation, live verification
  and browser QA. M-18 and M-19 remain open and untouched.
- **Next possible milestone:** Browser-verified dashboard reader QA and a
  separately authorised decision on the empty dashboard route placeholders.

## M-25E.2 — Production Promotion & Closure

- **Starting SHA:** `6543423245ea4f9babbf72345e6da0b3516edd25`.
- **Objective:** Promote the implemented M-25E changes without adding
  features, research or dashboard artwork, then record the production result.
- **M-25E.1 control:** Reconciliation remains clear: 123 dashboard assets
  exist locally and in `origin/main`; no local-only, origin-only or history-
  only dashboard assets were found. The additional named country references
  remain absent from Git and were not added.
- **Validation:** Content, link, JavaScript syntax, JSON relationship/path,
  duplicate registry ID and `git diff --check` validation passed. The
  performance audit passed with three pre-existing advisory warnings.
- **Security:** No API key, secret, external LLM, backend, database,
  telemetry, query storage, analytics or new dependency was introduced.
- **Promotion:** Commit `07bab9d016aebe4ac06a218db96c461d3d239267` was created
  with the requested message and pushed to `origin/main`; local HEAD and
  `origin/main` matched after push.
- **Live verification:** Required pages and the representative dashboard image
  returned HTTP 200. The production `dashboard-narratives.json` URL returned
  a cached HTTP 404 although the committed file and raw GitHub `main` URL
  return HTTP 200, indicating a Pages propagation/configuration gap.
- **Browser QA:** `BROWSER QA NOT AVAILABLE / NOT VERIFIED`.
- **Status:** M-25E implementation achieved and promoted; production closure
  remains partial until the Pages narrative JSON URL serves successfully.
  M-18 and M-19 remain open and custom-domain configuration was untouched.
- **Next milestone:** Resolve Pages deployment freshness/configuration, rerun
  live verification, then perform browser-enabled reader QA if tooling becomes
  available.

### Prompt history before Prompt 09

- **Prompt ID:** Not available in repository record.
- **Date:** Not available in repository record.
- **Prompt statement:** Not available in repository record.
- **Objective:** Not available in repository record.
- **Category:** Not available in repository record.
- **Execution summary:** The repository history records a Version 1.0 release,
  performance governance work, menu accessibility fixes, country-intelligence
  expansion and intelligence summary pages. A prompt-by-prompt mapping is not
  present.
- **Files created:** Not available in repository record.
- **Files modified:** Not available in repository record.
- **Files deleted:** None recorded.
- **Tests performed:** Not available in repository record.
- **QA result:** Not available in repository record.
- **Validation result:** Not available in repository record.
- **Git commit SHA:** See individual commits in `git log`; no prompt mapping is
  available.
- **Outcome:** Existing committed functionality remains the authoritative
  baseline.
- **Milestone achieved:** Version 1.0 release and subsequent recorded feature
  and performance milestones; exact prompt ownership is unavailable.
- **Known limitations:** No historical prompt register was found in the
  repository.
- **Deferred work:** See [GPIR_BACKLOG.md](GPIR_BACKLOG.md).
- **Follow-up requirements:** Maintain this log for every future material
  prompt.

### Prior governance increment

- **Prompt ID:** Not available in repository record.
- **Date:** 2026-08-28.
- **Prompt statement:** Establish the first repository-native GPIR content
  schema and architecture guardrail, with a dev-time content validator.
- **Objective:** Make the existing static content, source and architecture
  contracts explicit without changing runtime behaviour.
- **Category:** GOVERNANCE, ARCHITECTURE, DATA, VALIDATION.
- **Execution summary:** Added documentation for the existing content schema
  and architecture guardrails, plus a validator for announcement records,
  trusted sources, lifecycle states, dates and internal relationships.
- **Files created:** `docs/CONTENT_SCHEMA.md`,
  `docs/ARCHITECTURE_GUARDRAIL.md`, `scripts/validate-content.js`.
- **Files modified:** None.
- **Files deleted:** None.
- **Tests performed:** `node scripts/validate-content.js`,
  `node --check scripts/validate-content.js`, and
  `node scripts/gpir-perf-audit.js`.
- **QA result:** No editor diagnostics for the validator. Existing performance
  audit reported three advisory warnings.
- **Validation result:** Content validation passed for 10 records and 8
  trusted sources. JavaScript syntax passed.
- **Git commit SHA:** Uncommitted at the time of this log; last verified commit
  was `c25ff96047dba7a688e0c7d374bc162abce22737`.
- **Outcome:** Governance documentation and a repeatable content integrity
  check exist in the repository.
- **Milestone achieved:** M-08, Content and Architecture Contract Baseline.
- **Known limitations:** The validator checks structure and relationships; it
  does not verify external facts or source contents over the network.
- **Deferred work:** Backend, API, AI ingestion, version history and
  observability remain outside the static architecture.
- **Follow-up requirements:** Keep the validator aligned when the documented
  JSON contract changes.

## Prompt 09 — Permanent Project Memory, Development Register & Change Governance

- **Prompt ID:** PROMPT-09.
- **Date:** 2026-08-28.
- **Prompt statement:** Establish permanent repository-native project memory,
  development registers, project status and autonomous change governance for
  FINTECHOSIS / GPIR without changing the existing website build.
- **Objective:** Ensure future agent sessions can determine what has been done,
  what is in progress, what is next, what is parked, what is blocked, what is
  protected and which milestone was last achieved.
- **Category:** GOVERNANCE, ARCHITECTURE, AUTOMATION.
- **Execution summary:** Inspected the current branch, commit, worktree,
  architecture documents, content schema, README, scripts, repository
  structure, changelog and available Markdown/Word records. Added the four
  requested governance documents. Registered supported current capabilities
  and future requirements in the backlog. Recorded current status and
  milestone evidence.
- **Files created:** `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`,
  `docs/PROJECT_STATUS.md`, `docs/DEVELOPMENT_GOVERNANCE.md`.
- **Files modified:** None.
- **Files deleted:** None.
- **Tests performed:** Markdown link/path check, `node scripts/validate-content.js`,
  `node --check scripts/validate-content.js`, and
  `node scripts/gpir-perf-audit.js`.
- **QA result:** Documentation links resolve to repository files. No existing
  application files were changed. The Word document was not modified because
  it is a privacy-policy document, not a project log, and no safe Word-log
  update tool is present.
- **Validation result:** Content validation passed for 10 records and 8
  trusted sources; JavaScript syntax passed. Performance audit completed with
  its existing three advisory warnings.
- **Git commit SHA:** No new commit; working tree contains the four new Prompt
  09 documents plus the three prior uncommitted governance files. Last
  verified commit: `c25ff96047dba7a688e0c7d374bc162abce22737`.
- **Outcome:** Repository-native permanent memory and change governance are
  established without application feature development.
- **Milestone achieved:** M-09, Permanent Project Memory and Governance
  Foundation.
- **Known limitations:** Earlier prompt-level history is unavailable; no
  commit was created by this task; the Word backup remains an external
  human-readable backup and was not claimed as updated.
- **Deferred work:** AI ingestion, semantic search, country/corridor engines,
  automated ticker ingestion and regulatory scraping remain deferred or
  blocked as documented in the backlog.
- **Follow-up requirements:** Future material prompts must update the log,
  backlog and project status, and must run the relevant validation before
  claiming completion.

## Prompt 10 — Scalable GPIR Content Registry & Data-Driven Content Engine

- **Prompt ID:** PROMPT-10.
- **Date:** 2026-08-28.
- **Prompt statement:** Establish a reusable, structured, reference-based GPIR
  content registry and data-driven foundation without rebuilding the existing
  static website.
- **Objective:** Create a scalable registry model for typed content,
  relationships, source/evidence references and future page generation while
  preserving existing page experience and payload behaviour.
- **Category:** DATA, ARCHITECTURE, SCALING, CONTENT, INTELLIGENCE,
  AUTOMATION.
- **Execution summary:** Inspected project memory, data files, regional
  country indexes, announcement/source registries, templates, existing
  intelligence generator, search index and validation scripts. Established a
  single catalog at `assets/data/content-registry.json` containing a pilot of
  two countries, two regions, one source, one announcement and one
  intelligence presentation record. Extended the existing validator to check
  registry types, IDs, slugs, source references, relationships and page
  targets. No runtime consumer or second page generator was introduced.
- **Files created:** `assets/data/content-registry.json`.
- **Files modified:** `scripts/validate-content.js`,
  `docs/CONTENT_SCHEMA.md`, `docs/ARCHITECTURE_GUARDRAIL.md`,
  `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`,
  `docs/PROJECT_STATUS.md`.
- **Files deleted:** None.
- **Files deliberately not modified:** HTML, CSS, runtime JavaScript, search
  index, country pages, intelligence pages, existing page generator and Word
  documents.
- **Pilot records:** United Arab Emirates, India, Middle East / GCC, APAC,
  CBUAE source, the CBUAE payment-token announcement, and its generated
  intelligence page reference.
- **Tests performed:** `node scripts/validate-content.js`,
  `node --check scripts/validate-content.js`, existing intelligence page
  generation, search-index structure validation, documentation link check,
  pilot page-reference check, and `node scripts/gpir-perf-audit.js`.
- **QA result:** Existing generator produced 9 classified intelligence pages
  and correctly skipped 1 unresolved record. Existing search index retained
  307 valid entries. No generated page content changed; an incidental sitemap
  whitespace change was removed.
- **Validation result:** Content validation passed for 10 announcements, 8
  trusted sources and 7 registry records. Documentation links passed across
  13 Markdown files. JavaScript syntax and editor diagnostics passed.
- **Search compatibility result:** Preserved. The registry is not globally
  loaded and the existing 307-entry lazy search index is unchanged.
- **AI-readiness result:** Structured IDs, typed records, relationships and
  source references are available for future processing; no AI processing was
  implemented.
- **Scalability assessment:** The catalog shape can represent 200+ countries,
  1,000+ corridors, thousands of entities, intelligence records and sources
  without per-record code. The current pilot does not yet populate or render
  those scales.
- **Git commit SHA:** `7813132e2fd21a746932778b8c8459bb62dafaab`.
- **Outcome:** A single validated registry foundation was established while
  the existing website remained protected.
- **Milestone achieved:** **M-10 — PARTIAL: Scalable GPIR Content Registry
  Foundation.** The registry and validation criteria passed, but registry-
  driven page generation and broad content migration remain incomplete.
- **Known limitations:** Country and intelligence pages still use their
  existing generation/presentation paths; the registry is currently a
  build-time catalog, not a runtime API or knowledge graph. No complete
  corridor/entity/regulator/licence dataset was created.
- **Deferred work:** Registry-driven generation, broader country/entity/
  corridor migration, controlled ingestion, change detection and AI
  classification remain in the backlog.
- **Follow-up requirements:** Complete REG-002 only after a parity pilot proves
  generated output and URLs remain unchanged; then progress DATA-001 and the
  parked scale-phase items in sequence.

## Prompt 11 — GPIR Backlog Reconciliation & Pending Work Intake

- **Prompt ID:** PROMPT-11.
- **Date:** 2026-08-28.
- **Objective:** Establish one authoritative development backlog and prevent
  duplicate or conflicting implementation across AI coding streams.
- **Category:** GOVERNANCE, ARCHITECTURE, AUTOMATION.
- **Findings:** The repository contains M-08, M-09 and M-10 PARTIAL records.
  M-10 delivered the validated registry pilot but not registry-driven page
  generation or broad migration. Existing actionable items are DATA-001,
  REG-002, SEARCH-001, READER-001 and GOV-003. Existing parked items cover
  source expansion, ingestion, change detection, AI processing, intelligence
  engine, country/corridor scale and production automation. Existing blocked
  items are API-001 and MON-001. No duplicate or conflicting repository
  requirement was discovered.
- **M-10 remaining work:** Registry-driven page generation, broader country
  migration, entity migration, corridor migration and additional structured
  content migration remain outstanding. They were classified only and not
  implemented.
- **External AI pending intake:** Added `EXTERNAL / OTHER AI ENGINE — PENDING
  INTAKE` with status `AWAITING SOURCE PROMPT`. No external work was assumed or
  executed.
- **Priority structure:** P0 protection/blocking conflicts; P1 M-10
  completion; P2 approved architecture increments; P3 reader experience; P4
  intelligence automation; P5 future/experimental scale.
- **Development gate:** Current milestone remains M-10 PARTIAL. Complete the
  scalable registry foundation only after pending external work is
  reconciled. Next development gate: reconcile all known pending work before
  starting the next implementation prompt.
- **Files modified:** `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`,
  `docs/PROJECT_STATUS.md`, `docs/DEVELOPMENT_GOVERNANCE.md`.
- **Files deliberately not modified:** Application HTML, CSS, JavaScript,
  content records, generators, search index, ticker, country/intelligence
  pages, assets and architecture implementation.
- **Validation:** Documentation link validation passed across 13 Markdown
  files. Existing content validation passed for 10 announcements, 8 trusted
  sources and 7 registry records. `git diff --check` passed. No application
  functionality or production artifact changed.
- **Git commit SHA:** `fe32af6b0b58d96559ac8a6c33b0e77354a3a911`.
- **Outcome:** A single reconciled development stream is documented, with
  external work held safely until its source prompt and outcome are supplied.
- **Milestone status:** **M-11 — BACKLOG RECONCILIATION FOUNDATION** is
  achieved as a governance milestone; no application feature milestone was
  created. M-10 remains PARTIAL.
- **Known limitations:** External AI work cannot be reconciled until its exact
  prompts, outcomes and changed files are supplied. Earlier prompt-level
  history remains unavailable.
- **Follow-up requirements:** Resolve the external intake gate, then select
  one non-overlapping actionable backlog item. Do not begin M-10 continuation
  or another feature stream before reconciliation is complete.

## Prompt 12 — Deployment, Architecture & Live-Site Drift Audit

- **Prompt ID:** PROMPT-12.
- **Date:** 2026-08-28.
- **Objective:** Audit repository/deployment alignment and identify material
  live-site drift without modifying application code, content or production
  artifacts.
- **Category:** GOVERNANCE, DEPLOYMENT, ARCHITECTURE, PERFORMANCE, SECURITY,
  READER EXPERIENCE.
- **Repository HEAD:** `71669f45a4057bf1d1d93fbb2c9114ccc97c03aa` on `main`; the
  working tree was clean before the audit.
- **Architecture assessment:** The deployed site remains the static
  HTML/CSS/vanilla-JavaScript GitHub Pages architecture. Information
  architecture, navigation, templates, content model, registry model, search,
  ticker, dashboards, country pages, intelligence pages, performance model,
  responsive model, accessibility model and deployment model are unchanged in
  kind. No fundamental architecture change was observed.
- **Live-site observations:** Homepage, mega-menu, search, ticker, map,
  dashboards, country, region, chapter and intelligence surfaces were present.
  Representative local/live SHA-256 hashes matched for the homepage, registry,
  announcements, search index, UAE country page and CBUAE intelligence page.
  The deployed registry asset returned 200 and matched the repository.
- **Deployment drift:** All 48 sitemap URLs returned HTTP 200, and all 67
  repository HTML routes checked returned HTTP 200 except the separately tested
  non-repository expectation `pages/regions/sepa.html`, which returned 404.
  No deployed-only route was identified from the sitemap or representative
  route checks. Deployment appears aligned with HEAD for tested artifacts.
- **Findings:** **P1 AUDIT-001** — all 9 deployed generated intelligence pages
  contain five sibling legal footer links returning 404; correct `pages/legal/`
  routes return 200. **P1 AUDIT-002** — the legacy research page contains
  eight sibling research links returning 404. **P5 AUDIT-003** — stale SEPA
  route expectation; repository navigation correctly uses Europe / SEPA.
  Findings were added to `GPIR_BACKLOG.md`; none were fixed.
- **M-10 impact:** The registry asset is deployed, but no runtime file consumes
  `content-registry.json` and the existing intelligence generator still reads
  `announcements.json` directly. Existing pages remain template-compatible;
  no visual, navigation or search change attributable to M-10 was observed.
- **M-11 impact:** Governance-only. The M-11 changes were limited to project
  memory and development governance Markdown; no application functionality was
  modified.
- **Fundamental-change classifications:** Information architecture
  UNCHANGED; navigation UNCHANGED with the documented broken-link findings;
  page-template architecture UNCHANGED; content model UNCHANGED; structured
  data model MINOR CHANGE due to the deployed registry catalog; search
  UNCHANGED; tickers UNCHANGED; dashboards UNCHANGED; country architecture
  UNCHANGED; intelligence architecture UNCHANGED; performance architecture
  UNCHANGED; responsive behaviour UNCHANGED; accessibility UNCHANGED from
  available repository/live evidence; deployment model UNCHANGED; GitHub Pages
  compatibility UNCHANGED.
- **Protection requirements:** Preserve the mega-menu, world map, ticker,
  search, dashboards, country/intelligence URLs and templates, performance
  tier, reduced motion, lazy loading, responsive assets, source governance and
  all existing sitemap routes during future fixes.
- **Validation:** Live route checks, sitemap check (48/48 HTTP 200), local/live
  representative hashes, deployed asset checks, repository route checks,
  registry-consumer search, and read-only git status/history inspection passed
  or produced the findings above. No application, content, asset or generator
  files were changed.
- **Files modified:** `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`,
  `docs/PROJECT_STATUS.md` only, as authorized by Prompt 12.
- **Files deliberately not modified:** HTML, CSS, JavaScript, content records,
  assets, generators, search index, ticker, dashboards, country pages,
  intelligence pages and all production artifacts.
- **Git commit SHA:** Not created by Prompt 12; audit documentation is
  currently uncommitted. Last verified HEAD before the audit:
  `71669f45a4057bf1d1d93fbb2c9114ccc97c03aa`.
- **Outcome:** Repository and deployment are materially aligned for tested
  core artifacts, with two P1 broken-link findings and one P5 stale-route
  expectation requiring explicit future decisions.
- **Milestone status:** No new feature milestone. M-10 remains PARTIAL and
  M-11 remains the latest governance milestone. Prompt 12 is an audit record,
  not M-12.
- **Recommended next gate:** Reconcile pending external work, then review and
  explicitly authorize remediation of AUDIT-001 and AUDIT-002 before starting
  the next implementation prompt.

## Prompt 13 — P1 Link Remediation & Safe Regeneration

- **Prompt ID:** PROMPT-13.
- **Date:** 2026-08-28.
- **Objective:** Remediate only the two confirmed P1 link-integrity findings
  from Prompt 12 while preserving the existing GPIR build.
- **Category:** FIX, DEPLOYMENT, GOVERNANCE, READER EXPERIENCE.
- **Starting HEAD:** `71669f45a4057bf1d1d93fbb2c9114ccc97c03aa` on `main`; the
  working tree already contained the three authorized Prompt 12 governance
  document changes.
- **AUDIT-001 diagnosis:** `scripts/generate-intelligence-pages.js` extracted
  footer links relative to the legal template, producing sibling paths such as
  `pages/intelligence/privacy-policy.html`.
- **AUDIT-001 remediation:** Added a generator-only footer href transformation
  to the correct `../../pages/legal/` targets and regenerated all 9 published
  intelligence pages. Each page changed only its five legal href targets.
- **AUDIT-002 diagnosis:** `pages/research/global-payments-landscape.html` was
  a standalone legacy page containing eight stale sibling research links; no
  generator or reusable template owned those targets.
- **AUDIT-002 remediation:** Retargeted the eight links and two related broken
  breadcrumbs to existing canonical GPIR homepage, chapter and research
  routes, preserving link labels, page content and taxonomy.
- **Files changed:** `scripts/generate-intelligence-pages.js`,
  `pages/research/global-payments-landscape.html`, 9 generated
  `pages/intelligence/*.html` outputs, and the three Prompt 12 governance
  records. The incidental sitemap whitespace produced by regeneration was
  removed; no sitemap URL changed.
- **Files deliberately not modified:** No content records, registry, search
  index, ticker, dashboard, country pages, legal pages, CSS, unrelated HTML or
  unrelated runtime JavaScript were changed.
- **Validation:** Focused local remediation check passed for 9 intelligence
  pages and the legacy research targets. All corrected live targets returned
  HTTP 200. `node scripts/validate-content.js` passed for 10 announcements, 8
  sources and 7 registry records. Generator syntax and editor diagnostics
  passed. Documentation links passed across 13 Markdown files. `git diff --check`
  passed. Performance audit remained unchanged with 3 pre-existing advisory
  warnings.
- **QA result:** No layout, navigation, ticker, dashboard, search, map,
  content or performance changes were observed beyond the authorized link
  targets. AUDIT-001 and AUDIT-002 are closed.
- **Git commit SHA:** `fea8228b4d52363a92dcd61ea48224f2f74a0a01`. Starting HEAD
  was `71669f45a4057bf1d1d93fbb2c9114ccc97c03aa`.
- **Outcome:** Both P1 findings were fixed at their owning source or page and
  safely regenerated. No M-10 registry migration or AI work was started.
- **Milestone achieved:** **M-13 — Critical Link Remediation & Production
  Safety.** M-10 remains PARTIAL. Prompt 12 was verified as an audit result;
  the repository does not formally declare a separate M-12 milestone.
- **Remaining backlog:** External intake gate, registry-driven generation,
  structured content expansion and other existing backlog items remain.
- **Recommended next gate:** Reconcile external pending work before authorizing
  another implementation prompt; then address only one non-overlapping
  backlog item.

## Phase 2 — Zero-Cost Security Hardening

- **Prompt ID:** PHASE-2.
- **Date:** 2026-08-28.
- **Objective:** Implement practical zero-cost repository security controls
  without changing GPIR application behaviour or beginning later privacy,
  provenance, Trust Centre or AI-governance phases.
- **Category:** SECURITY, GOVERNANCE, AUTOMATION, DEPLOYMENT.
- **Starting HEAD:** `082cad751e3a4bc13136cfc1397dd7f599a50514` on `main`; the
  starting worktree was clean.
- **Controls implemented:** Added least-privilege
  `.github/workflows/security-integrity.yml`, which validates structured
  content, internal HTML links, JavaScript syntax and high-confidence secret
  patterns without modifying production content. Added
  `scripts/validate-links.js` and repository-native `SECURITY.md` with factual
  reporting, platform limitations and zero-cost scope.
- **SEC-001 result:** Not implementable as an HTTP response-header control
  through the current GitHub Pages repository. HTTPS redirect and HSTS are
  platform-provided; CSP and other requested response headers remain a
  documented limitation. No misleading meta-CSP was added.
- **SEC-002 result:** COMPLETED through the GitHub Actions workflow.
- **SEC-003 result:** PARKED; Google Fonts retained to preserve typography and
  avoid an unverified licensing/vendor migration.
- **SEC-004 result:** PARKED; FX ticker remains unchanged with public HTTPS
  rates and an existing failure state.
- **SEC-005 result:** COMPLETED through `SECURITY.md`.
- **SEC-006 result:** PARKED; no uncontrolled source crawler or monitoring
  engine was introduced.
- **SEC-007 result:** PARKED for the separately authorized AI governance phase.
- **SEC-008 result:** PARTIAL; the new workflow gates structural/link/syntax/
  secret regressions but does not classify every legitimate content change.
- **SEC-009 result:** PARKED; existing localStorage use remains limited to
  language and currency preferences.
- **SEC-010 result:** PARKED; no SRI was added to dynamic third-party font CSS.
- **Files created:** `.github/workflows/security-integrity.yml`, `SECURITY.md`,
  `scripts/validate-links.js`.
- **Files modified:** `docs/DEVELOPMENT_GOVERNANCE.md`,
  `docs/GPIR_BACKLOG.md`, `docs/MASTER_PROJECT_LOG.md`,
  `docs/PROJECT_STATUS.md`.
- **Files deliberately not modified:** No HTML, CSS, runtime JavaScript,
  content records, assets, registry, search index, ticker, generators or
  generated pages were changed.
- **Tests executed:** Internal HTML-link validation, content validation,
  JavaScript syntax validation, workflow secret-pattern scan, documentation
  link validation, YAML parsing, `git diff --check`, editor diagnostics and
  performance audit.
- **Tests not executed:** `gitleaks`, `trivy`, `semgrep`, `actionlint` and
  `yamllint` were unavailable in the environment; no specialist scanner is
  claimed as passed. Browser/mobile regression testing was not executed in
  this phase.
- **Validation result:** Content validation passed for 10 announcements, 8
  trusted sources and 7 registry records. Internal HTML-link validation passed
  for 67 HTML files. All JavaScript syntax checks passed. Workflow YAML parsed
  successfully. No high-confidence secret patterns were detected.
- **Known limitations:** GitHub Pages response-header controls remain
  unavailable. External Google Fonts and FX API remain. The existing
  performance audit continues to report 3 pre-existing advisory warnings.
- **Outcome:** A validated zero-cost security hardening foundation and
  disclosure mechanism were established without starting later phases.
- **Milestone achieved:** **M-16 — Zero-Cost Security Hardening Foundation.**
- **Commit:** `b326c4501008e857e1efd48db6f59a8a10e31aa6` contains the Phase 2
  implementation; the final metadata record is committed separately.
- **Recommended next gate:** Review Phase 2 before authorizing Phase 3. Do not
  begin privacy, content provenance, Trust Centre, AI governance or final audit
  work automatically.

## Prompt 17 — Phase 3 Privacy Baseline & Trust Foundation

- **Prompt ID:** PROMPT-17.
- **Date:** 2026-08-28.
- **Objective:** Establish accurate, transparent privacy information for the
  existing static GPIR site without adding collection, tracking, consent SaaS,
  backend infrastructure or later trust/provenance/AI features.
- **Category:** PRIVACY, GOVERNANCE, SECURITY, READER EXPERIENCE.
- **Starting state:** `main` at `6053fd6bb9d07d20b3133f5a6e5e9508027d2299`, clean
  worktree, with the Claude branch present remotely and deliberately untouched.
- **Privacy findings:** The site implements no accounts, authentication,
  forms, uploads, comments, newsletter subscriptions, advertising trackers,
  analytics provider, HTTP cookies or payment collection. It uses localStorage
  for language and display-currency preferences and makes external HTTPS
  requests for Google Fonts, FX rates, i18n/data assets and cited sources.
  GitHub Pages and external providers may process ordinary request metadata;
  that platform-level processing is not claimed absent.
- **Changes implemented:** Updated the existing Privacy Policy and Cookie
  Policy to distinguish current implementation from future-oriented language,
  state what the static site does not intentionally collect, document the two
  localStorage preferences, disclose the absence of a cookie preference centre,
  and accurately describe the current lack of analytics and tracking.
- **Files modified:** `pages/legal/privacy-policy.html`,
  `pages/legal/cookie-policy.html`.
- **Files deliberately not modified:** No homepage, navigation, footer
  structure, runtime JavaScript, CSS, content records, assets, registry,
  search, ticker, dashboards, country/intelligence/research pages, security
  workflow, Claude branch or Trust Centre was changed. No new contact channel
  was added; existing placeholder legal contact information was not invented.
- **Validation:** Internal HTML links passed for 67 files. Content validation
  passed for 10 announcements, 8 trusted sources and 7 registry records. All
  JavaScript syntax checks passed. Affected HTML doctype/title/update metadata
  checks passed. Documentation links passed across 13 Markdown files. Editor
  diagnostics reported no errors. `git diff --check` passed. Performance audit
  completed with the same 3 pre-existing advisory warnings.
- **Live-site impact:** Existing representative legal routes remain available;
  this work is not deployed until the commit is published. No runtime behavior
  or protected page was changed.
- **Outcome:** The privacy baseline now reflects verified current behavior and
  avoids unsupported claims about anonymity, certification, analytics,
  accounts, cookies or data collection.
- **Milestone achieved:** **M-17 — Privacy Baseline & Trust Foundation.** This
  milestone does not include content provenance, Trust Centre construction,
  AI governance, registry migration or new collection mechanisms.
- **Known limitations:** This is repository/site transparency, not legal advice
  or a jurisdiction-specific compliance determination. GitHub Pages response
  metadata and third-party provider processing remain outside GPIR control.
- **Commit:** `391501d70790b963a58eb36a5b2f170632020231`.
- **Recommended next gate:** Human review of the privacy wording before any
  later provenance, Trust Centre or AI-governance phase. Keep the site static
  and do not add collection or consent infrastructure without explicit scope.

## Prompt 18 — Surgical Fix: Global Announcements Ticker

- **Prompt ID:** PROMPT-18.
- **Date:** 2026-08-28.
- **Objective:** Fix only the Global Announcements ticker overflow risk and
  replace the unsupported continuous-freshness wording.
- **Category:** FIX, READER EXPERIENCE, CONTENT INTEGRITY.
- **Starting state:** `main` at `00f8d74269710eb9b08c292d33f78c2863d702a9`,
  clean worktree. No Claude or other-AI work was touched.
- **Files inspected:** `index.html`, `assets/data/announcements.json`,
  `assets/css/page.css`, `assets/css/market.css`, `assets/js/announcements.js`,
  `assets/js/fx-ticker.js`, and project-memory records.
- **Root cause:** The homepage rendered a `Continuously Updated` i18n label
  even though the static dataset only has a repository refresh timestamp. The
  announcement track also lacked an explicit flex shrink/content-width
  contract in the shared ribbon layout, allowing long card content to compete
  with fixed ribbon elements.
- **Files changed:** `index.html` and `assets/css/page.css`.
- **Fix:** Replaced the displayed label with `Verified Dataset`; added
  `width: max-content`, `max-width: none` to the scoped announcement track and
  `min-width: 0` to its wrapper. Existing `scrollTicker`, hover/focus behavior,
  visibility pause, reduced-motion fallback and card line clamp remain intact.
- **Data integrity:** No announcement records, facts, dates, sources or
  timestamps were changed. The existing verified `lastRefreshed` display is
  unchanged.
- **Protected functionality:** Homepage architecture, navigation, map, FX
  ticker, search, dashboards, pages, registry, performance tier, accessibility,
  responsive rules, reduced motion and source verification were not changed.
- **Validation:** Old ticker wording is no longer referenced by the homepage
  runtime path and `Verified Dataset` is present. Content validation passed for
  10 announcements, 8 sources and 7 registry records. All JavaScript syntax
  checks passed. Performance audit completed with its 3 pre-existing advisory
  warnings. Editor diagnostics reported no errors for `index.html`.
  `git diff --check` passed. No local browser automation was available, so no
  screenshot-based responsive test is claimed.
- **Outcome:** The ticker status is evidence-based and its announcement track
  has a scoped width/shrink contract intended to keep long content inside the
  ribbon without changing the existing marquee behavior.
- **Milestone achieved:** **M-18 — Global Announcements Ticker Integrity.**
  This does not start Prompt 19, registry migration, AI work or any unrelated
  architecture change.
- **Commit:** `71e35efdc12df0decdcf61bf144863f643ec8ac1`.
- **Recommended next gate:** Review the live ticker after deployment at
  desktop, tablet and mobile widths; keep future work behind the existing
  backlog reconciliation gate.

## Prompt 22A — GPIR Content Factory: Foundation + First Content Batch + Validation

- **Prompt ID:** PROMPT-22A.
- **Date:** 2026-09-05.
- **Starting commit:** `720dccc239c38cb75c0c983187059e288f90ae22`.
- **Objective:** Establish a reusable, evidence-aware content-factory
  contract and index the first additional active country records without
  changing published page content, runtime architecture or custom-domain
  configuration.
- **Tasks completed:** Added the build-time content model vocabulary for
  countries, regions, corridors, payment systems, regulatory bodies, entities,
  intelligence events, announcements, sources and evidence. Defined FACT,
  DATA, ANALYSIS, ESTIMATE and FORECAST classifications, explicit verification,
  readiness and reconciliation states, provenance fields and future dashboard
  metadata. Extended the content validator to validate the contract. Added
  Saudi Arabia, Qatar and Singapore to the canonical registry using existing
  structured country records and published pages as source references.
- **Tasks not completed:** No new sourced research records, dashboards,
  country prose, region prose, search-index migration, runtime consumer,
  ingestion process, version store, browser validation or custom-domain work
  was performed. Existing unsupported freshness wording remains documented for
  a later trust-language task.
- **Files created:** `assets/data/content-model.json`.
- **Files modified:** `assets/data/content-registry.json`,
  `scripts/validate-content.js`, `docs/CONTENT_SCHEMA.md`,
  `docs/GPIR_BACKLOG.md`, `docs/PROJECT_STATUS.md`.
- **Files deleted:** None.
- **Validation:** Content validation passed for 10 announcements, 8 trusted
  sources and 10 registry records. Content-model and registry JSON parsing
  passed. JavaScript syntax passed for the validator. Full repository checks
  and live HTTP verification were run before release reporting.
- **Known limitations:** The content model is a build-time contract and is
  not yet consumed by runtime pages or a registry-driven generator. Existing
  dashboard metadata remains embedded in page markup. Source trust remains a
  domain allowlist, not fact verification. No browser-level validation is
  claimed where browser automation is unavailable.
- **Remaining risks:** Freshness wording in legacy/runtime surfaces, incomplete
  source coverage, missing version/event history and future schema reconciliation
  remain in the backlog.
- **Milestone status:** M-22 foundation increment PARTIAL; the contract and
  first registry indexing batch are complete, while broad content-factory
  migration remains outstanding.
- **Commit:** To be recorded after final validation.

## Prompt 23A — GPIR Production Content Factory + First Intelligence Batch

- **Prompt ID:** PROMPT-23A.
- **Date:** 2026-09-05.
- **Starting commit:** `c333b782c3075b8749a8a54672f2ec2cf48cf0bb`.
- **Production URL:** `https://krishnan-vishal.github.io/`.
- **Objective:** Begin controlled production content development by
  reconciling existing source-backed intelligence records into the canonical
  registry without changing the live static presentation architecture.
- **Tasks completed:** Audited the content model, registry, source registry,
  announcements, country datasets, published routes, search index, dashboard
  presentation and M-18/M-19 state. Added source, announcement and intelligence
  registry identities for SAMA licensing, RBI Payments Vision 2028 and MAS/ABS
  PayNow Generation 2. Each new identity resolves to an existing trusted source,
  existing announcement record and existing generated intelligence page.
- **Tasks not completed:** No new prose, source records, facts, volumes,
  dashboard metadata, search-index migration, runtime consumer, browser QA,
  freshness-language rewrite, M-18 ticker fix or M-19 integration was performed.
  Remaining classified announcements were deferred for later deterministic
  indexing.
- **Content records added:** Nine registry records: three sources, three
  announcements and three intelligence presentation identities.
- **Registry changes:** Registry increased from 10 to 19 records; no existing
  IDs were changed and no coming-soon record was activated.
- **Source changes:** No trusted-source records changed; new registry source
  identities reference existing SPA, RBI and MAS entries.
- **Evidence changes:** No substantive evidence was rewritten; existing source
  URLs, publication dates and retrieval dates remain authoritative in
  `announcements.json`.
- **Search changes:** None.
- **Dashboard changes:** None; metadata gaps remain documented by the content
  model.
- **Trust-language changes:** None; unsupported freshness wording remains a
  separate controlled follow-up.
- **Validation:** Content validation passed for 10 announcements, 8 trusted
  sources and 19 registry records. Full repository checks and live HTTP checks
  are required before final release reporting.
- **Browser verification:** Not claimed unless browser automation is available.
- **Known limitations:** The registry remains build-time only; no runtime
  consumer or generated registry-driven page factory exists. Source trust is a
  static domain allowlist, not external fact verification.
- **Next recommended batch:** Deterministically index the remaining existing
  classified announcement/intelligence pairs after route and source-reference
  parity checks, then evaluate a separate search-index extension.
- **Milestone status:** M-23A PARTIAL; the controlled registry batch passed
  validation and live HTTP verification, while broader factory migration
  remains outstanding.
- **Implementation commit:** `78544673ac61681170b578dab3d0a46e610c0b35`.
- **Live verification:** Homepage, representative country/region/intelligence/
  legal routes, CSS, JS, JSON datasets, content model and content registry
  returned HTTP 200 on `krishnan-vishal.github.io`. The live registry matched
  the implementation commit and contained all nine new registry identities.
- **Browser verification:** Not claimed; browser automation was unavailable.

## Prompt 24A — GPIR AI Reader Experience + Existing Utility Activation

- **Prompt ID:** PROMPT-24A.
- **Date:** 2026-09-05.
- **Starting commit:** `573641fea15d9472b5639fbb1faa2b4826317dc3`.
- **Production URL:** `https://krishnan-vishal.github.io/`.
- **Objective:** Activate existing search and structured content as a safe,
  local-first reader assistant without adding a model, external AI service or
  new content.
- **Existing utilities audited:** Homepage search overlay and lazy search
  index, announcement intelligence panel, source-trust display, dashboard
  lightbox, world map, country/region directories, generated intelligence
  pages, legal pages, i18n and existing keyboard/reduced-motion utilities.
- **Existing content activated:** The existing search index and canonical
  content registry are now available through an ASK GPIR mode. Active country
  coverage is retrieved from the registry, and current-page explanation uses
  existing headings only.
- **Search changes:** None to the index or scoring model. ASK GPIR reuses
  `GPIRContentSearch` and preserves lazy loading.
- **ASK GPIR implementation:** Added a progressive-enhancement mode inside
  the existing search dialog with deterministic intent handling for coverage,
  current-page explanation and indexed-content retrieval.
- **Explain-this implementation:** “Explain this page” lists headings from
  the current page and explicitly labels the result as a structural guide,
  not a generated factual summary.
- **Related-content implementation:** No new relationship inference was added;
  retrieved search results remain the only related-content path in this task.
- **Source/evidence explorer:** Existing intelligence source/evidence panels
  remain authoritative; ASK GPIR does not rewrite or reinterpret provenance.
- **Dashboard enhancements:** None; existing dashboard/lightbox behavior was
  preserved because structured dashboard metadata is not yet available.
- **AI architecture:** No actual AI model was used. Processing is local and
  deterministic, with existing static JSON retrieval. No external calls, API
  keys or secrets were added.
- **Privacy/security:** Reader queries remain in the page interaction only;
  no query storage, account, tracking or external submission was introduced.
- **Performance:** The assistant adds no dependency and reuses the existing
  lazy search-index load. Registry loading occurs only for the coverage intent.
- **Tasks not completed:** No generative model, source summarization, broad
  search taxonomy migration, dashboard metadata migration, browser QA, ticker
  change, M-19 integration or new content was implemented.
- **Validation:** Final repository validation and live HTTP verification are
  required before recording the implementation and final commit.
- **Browser verification:** Not claimed unless browser automation is available.
- **Known limitations:** Deterministic intent matching is deliberately narrow;
  ASK GPIR is an AI-ready reader tool, not a generative chatbot and does not
  independently verify external facts.
- **Implementation commit:** `4f3a76322baa200c56b9aa88199559f236de780b`.
- **Live verification:** Homepage, representative country/intelligence/legal
  routes, CSS, JavaScript, search index, announcements and content registry
  returned HTTP 200 on `krishnan-vishal.github.io`; final URLs did not contain
  `fintechosis.com`. Deployed markers for ASK GPIR, Explain this page and the
  assistant CSS were present.
- **Browser verification:** BROWSER QA NOT AVAILABLE; no browser runtime was
  present, so no interactive, console, responsive or accessibility claim is
  made.
- **Final status:** M-24A PARTIAL; deterministic reader assistance is live,
  while generative AI, broader relationship tooling and browser QA remain
  future work.

## M-25A — Build Context-Aware GPIR Reader

### Date
05 September 2026

### Starting Baseline
`6ac73a99db9b8be205143f4ec9289d52791dfe43`

### Objective
Extend the deterministic ASK GPIR foundation into a context-aware reader that
uses existing page context, validated registry relationships and existing source
metadata without creating research content or calling an external AI service.

### Strategic Decision
**No new research content. Activate and enhance existing GPIR content and utilities.**

### Existing Assets Used
Existing ASK GPIR/search dialog, `GPIRContentSearch`, `content-registry.json`,
`trusted-sources.json`, `announcements.json`, `content-model.json`, existing
page routes, page headings, registry relationships and static source metadata.

### Implementation
Changed `assets/js/script.js` only for the application behavior. The assistant
now loads existing registry, trusted-source and announcement data on demand,
matches the current route to registry page records, traverses only validated
relationships, exposes source metadata and supports “Explore this topic”.

### Reader Capabilities Added
- **ACHIEVED:** Current-page registry context where a published route is indexed.
- **ACHIEVED:** “Explain this page” now includes existing headings, validated
  related routes and available source metadata.
- **ACHIEVED:** “Explore this topic” reuses the existing search index using the
  current page title.
- **ACHIEVED:** Coverage lookup remains registry-backed.
- **PARTIALLY ACHIEVED:** Context is available only for records with a matching
  registry page and existing relationships.

### Source / Evidence
**ACHIEVED:** Existing source name, publication title, source URL, publication
date, retrieval date, content status and source verification date are surfaced
when present. Missing metadata is labeled unavailable. No evidence was created
or rewritten.

### Related Content
**ACHIEVED:** Related page links are traversed only from existing registry
relationship targets with valid page routes. No lexical or inferred relation is
created.

### Dashboard Experience
**DEFERRED:** Dashboard data and UI were not changed. No dashboard relationship
or metadata was invented; dashboard improvements require structured metadata.

### AI Architecture
- Actual AI model: **NO**
- Generative AI: **NO**
- Deterministic retrieval: **YES**
- External API: **NO**
- API key: **NO**
- Future AI readiness: **YES**, through the existing retrieval/context boundary;
  a secure future model remains a separate architecture decision.

### Security / Privacy
No query storage, cookies, analytics, authentication, external submission,
API keys or secrets were added. Reader processing remains browser-local and
uses static repository data.

### Validation
Focused JavaScript syntax validation passed after each application edit. Full
repository validation, JSON parsing, registry-reference checks, secret checks,
diff review and live HTTP verification were run before final reporting.

### Live Verification
- Production URL: `https://krishnan-vishal.github.io/`
- Homepage, representative country/intelligence/legal routes, dashboard asset,
  CSS, JavaScript, registry, announcements and search index returned HTTP 200.
- The deployed script matched the implementation commit byte-for-byte and
  contained the context, related-content and source/evidence markers. Final
  URLs did not contain `fintechosis.com`.
- Final SHA: to be recorded after governance closure commit.
- GitHub Pages remains operational.
- `fintechosis.com` and CNAME configuration were untouched.

### Browser QA
**BROWSER QA NOT AVAILABLE.** No browser runtime was present; no interactive,
responsive, console or accessibility claim is made.

### ACHIEVEMENTS
- Context-aware deterministic ASK GPIR route matching.
- Registry-grounded related content.
- Source-aware metadata and source URL exposure.
- Existing-page structural explanation with explicit non-generative wording.
- Existing search-based topic exploration.

### NOT YET ADDED / TO DO
- Full generative AI.
- Advanced multi-hop relationship exploration.
- Dedicated dashboard metadata and dashboard intelligence.
- Browser QA and responsive interaction verification.
- Broader source/evidence answer cards across all search result types.
- M-18 ticker remediation and M-19 cross-stream reconciliation.

### Known Risks / Limitations
The assistant is deterministic and intent matching remains narrow. Registry
coverage is incomplete, dashboard metadata is not consistently structured, and
source trust remains a static allowlist rather than factual verification.

### Next Recommended Milestone
M-25B — Source-aware search result cards and validated multi-hop reader
navigation, followed by browser-enabled QA when a browser runtime is available.

## M-25B — Source-Aware Search Cards & Validated Multi-Hop Reader Navigation

### Objective
Make existing GPIR search results more useful by exposing repository-held
provenance and traversing only validated registry relationships, without adding
content, sources, facts or external AI services.

### Date
05 September 2026

### Starting SHA
`e92b605125b7e12edc6dafe579bae23cd54acf88`

### Implementation
Changed `assets/js/script.js` only. Search results now lazily join existing
content-registry, trusted-source and announcement data by canonical page route.
Cards can expose source organisation, source type, publication title, published
date, retrieval date, verification date, content status and source URL where
those fields already exist. Cards also expose bounded related page links from
validated registry relationships. ASK GPIR adds deterministic Source/Evidence
and Read Next intents using the same bounded relationships.

### Achievements
- **ACHIEVED:** Source-aware search cards for registry-backed page results.
- **ACHIEVED:** Native Source / Evidence disclosure with safe external links.
- **ACHIEVED:** Bounded depth-two registry traversal with visited-target and
  page-target checks.
- **ACHIEVED:** Explore Related disclosure for validated page relationships.
- **ACHIEVED:** Deterministic “What should I read next?” intent.
- **ACHIEVED:** Existing search and M-25A ASK GPIR fallback behavior preserved.

### Partially Achieved
- **PARTIALLY ACHIEVED:** Only registry-backed results expose provenance;
  unindexed search sections retain their existing result presentation.
- **PARTIALLY ACHIEVED:** Multi-hop traversal is limited to page-bearing targets
  and a maximum depth of two.
- **PARTIALLY ACHIEVED:** Dashboard records do not have enough structured
  metadata for dashboard-specific source cards.

### NOT YET ADDED / TO DO
- Full generative AI or external model integration.
- Dashboard intelligence and structured dashboard reader controls.
- Browser QA and interactive accessibility verification.
- Broader source cards for non-registry search entries.
- M-18 ticker remediation.
- M-19 cross-stream reconciliation.

### Validation
Focused `node --check assets/js/script.js` passed after implementation. Full
content, link, syntax, JSON, registry-reference, source-reference, page-route,
secret, forbidden-path and performance validation are required before closure.

### Browser QA
**BROWSER QA NOT AVAILABLE IN THIS ENVIRONMENT** unless a browser runtime is
detected during final validation. No browser interaction claim is made without
that runtime.

### Live Verification
Production URL remains `https://krishnan-vishal.github.io/`. Final live checks
covered homepage, search assets, representative content routes, registry,
announcements, search index, dashboard asset and deployed script markers. The
deployed script matched implementation commit `9f77ff182d38f8f2c568d07185605a7b075dcde1`
byte-for-byte; all tested URLs returned HTTP 200 and no final URL contained
`fintechosis.com`. CNAME remained untouched.

### Security
No API keys, secrets, external AI calls, query storage, telemetry, cookies or
new dependencies were introduced. Source links retain `target="_blank"` and
`rel="noopener noreferrer"`.

### Performance
Context data remains lazy and is loaded only when search/context features need
it. No blocking page-load request or large dependency was added.

### Known Risks / Limitations
Search provenance depends on registry page coverage. Relationship navigation
does not include source records without page routes. Source allowlist trust is
not factual verification. Browser behavior remains unverified if no runtime is
available.

### M-18
Remain open.

### M-19
Remain open.

### Recommended Next Milestone
M-25C — Dashboard Intelligence / Structured Dashboard Reader.

## M-25C — Dashboard Intelligence & Structured Dashboard Reader

### Objective
Structure and expose existing dashboard-card metadata without creating new
statistics, sources, methodologies, dashboard pages or research claims.

### Date
05 September 2026

### Starting SHA
`a4da3c97efd6eee481cd1a2f982899a2990dc03e`

### Previous milestone
M-25B — Source-Aware Search Cards & Validated Multi-Hop Reader Navigation
(PARTIALLY ACHIEVED).

### Prompt objective
Build a deterministic static dashboard reader using only existing dashboard
content, metadata, assets and validated repository routes.

### Repository audit
The four `pages/dashboards/*.html` files are empty placeholders. The actual
published dashboard surfaces are five homepage cards under `#dashboard-gallery`:
UAE, Saudi Arabia, Qatar, India and Singapore. Each card explicitly contains
title, country, region, edition, status, description, image path and country
page path. Period, direction, use case, metric, unit, source, methodology and
disclaimer are not present in the existing dashboard metadata.

### Dashboard inventory
Added a five-record build-time inventory in `assets/data/dashboard-metadata.json`.
Each record corresponds to an existing `dashboard-*` card and existing image and
country-page paths. Missing fields are `null`; no values were inferred.

### Files changed
- `assets/data/dashboard-metadata.json`
- `scripts/validate-content.js`
- `assets/js/script.js`
- `assets/css/dashboard.css`
- `docs/CONTENT_SCHEMA.md`
- `docs/MASTER_PROJECT_LOG.md`
- `docs/PROJECT_STATUS.md`
- `docs/GPIR_BACKLOG.md`

### Implementation completed
Added dashboard metadata validation, lazy dashboard metadata loading, native
details disclosures on existing cards, explicit unavailable-field labels and
deterministic ASK GPIR dashboard-detail intents. Existing images, statistics,
links and lightbox behavior were preserved.

### Achievements
- **ACHIEVED:** Existing five dashboard cards are represented deterministically.
- **ACHIEVED:** Country, region, edition, status and existing description are
  exposed from existing card metadata.
- **ACHIEVED:** Missing dashboard fields are explicitly unavailable.
- **ACHIEVED:** ASK GPIR can answer dashboard-detail requests when metadata is
  loaded.
- **ACHIEVED:** Existing dashboard visuals and lightbox remain unchanged.

### Partial achievements
- **PARTIALLY ACHIEVED:** Source, methodology, period, direction, use-case and
  metric fields remain unavailable because the existing cards do not contain
  them.
- **PARTIALLY ACHIEVED:** Empty `pages/dashboards/*.html` placeholders are not
  converted into published pages.

### Deferred work
Dashboard source/evidence enrichment, structured methodology, dashboard search
cards and richer related-intelligence links require metadata that does not yet
exist in the repository.

### NOT YET ADDED / TO DO
- New dashboard facts or values.
- New methodology or source records.
- Dashboard route page generation.
- Dashboard-specific search indexing.
- Browser QA.
- M-26 secure generative AI.

### Validation
Dashboard JSON, content validation, link validation, JavaScript syntax, JSON
parsing, security checks, forbidden-path checks and performance audit passed.
The authoritative content validator passed 10 announcements, 8 trusted sources
and 19 registry records. The broad auxiliary graph audit also reported three
pre-existing regional subregion IDs and false-positive sourceRef findings from
its incompatible scan of sourceRefs arrays; no registry/page/dashboard path
errors were found.

### Security
No external APIs, credentials, secrets, cookies, analytics or query storage.
Dashboard metadata is static and loaded lazily.

### Performance
Dashboard metadata is loaded only on pages containing dashboard cards. Existing
cards remain usable if the optional request fails.

### Browser QA
**BROWSER QA NOT AVAILABLE IN THIS ENVIRONMENT.** No browser interaction,
responsive or accessibility claim is made.

### Live production verification
Production remains `https://krishnan-vishal.github.io/`. Homepage, dashboard
metadata, dashboard CSS, dashboard JavaScript, registry, search index, UAE
dashboard asset and UAE country route returned HTTP 200. Live metadata and
script hashes matched commit `c9d3b89488700d01adaa92cf6389eaccb865e9b8`. No
final URL contained `fintechosis.com`; CNAME remained absent.

### Git commits
Implementation: `c9d3b89488700d01adaa92cf6389eaccb865e9b8`.
Governance closure: to be recorded after final documentation validation.

### M-25A inherited pending work
Browser QA, broader source cards, advanced relationship navigation and full
generative AI remain pending.

### M-25B inherited pending work
Non-registry source cards, source records without routes, broader evidence
rendering, advanced multi-hop navigation and browser QA remain pending.

### M-18 status
Remain open.

### M-19 status
Remain open.

### Recommended next milestone
M-26 only after dashboard metadata gaps, browser QA and inherited reader work
are reviewed; no automatic promotion is made.

### Final milestone status
M-25C PARTIALLY ACHIEVED. The structured metadata foundation and deterministic
reader are live; missing source/methodology fields, dashboard route pages and
browser QA remain outstanding.

## M-25D — Existing GPIR Portfolio Live Activation & Intelligent Reader

### Objective
Activate the existing GPIR portfolio into a stable public reader experience and
progressively transform the existing utilities into a smart, source-aware,
context-aware and eventually AI-ready reader experience, running in parallel
with (not gated on) the dashboard programme. This checkpoint is a governance
and scope-correction record only; no dashboard, registry, metadata or route
changes are made.

### Date
05 September 2026

### Starting SHA
`a55ad91a05acb06451c9d61d020974e8c08d6e4b`

### Previous milestone
M-25C — Dashboard Intelligence & Structured Dashboard Reader
(PARTIALLY ACHIEVED).

### Correction record
The initial M-25D diagnostic (recorded below, unchanged) was first interpreted
too narrowly as evidence that existing GPIR dashboards lack validation. A
representative existing GPIR country dashboard, the Taiwan dashboard
(Reference ID `VK-GPIR-TWN-INB-C2C-2026-001`), was reviewed directly and
visibly contains: reference ID, publication date, data period, outlook period,
version, country, inbound C2C scope, quantitative intelligence, corridor
intelligence, receiving channels, competitors, providers, payment rails,
AML/CFT/compliance, payment technology adoption, regulatory developments,
ISO/accreditation information, 2035 outlook, key insights, data sources,
forecasting model, update frequency, disclaimer, and explicit
"DATA SOURCES (Validated & Published)" / "DATA VALIDATED / Authoritative
Sources" indications. This confirms:

1. The dashboard image is NOT an unvalidated research object.
2. The dashboard is an already validated GPIR research publication; validation
   and source research occur BEFORE dashboard publication.
3. The JPEG/PNG is the visual published representation of that validated
   research.
4. The website does not need to independently recreate, OCR, reinterpret,
   calculate or revalidate the dashboard image.
5. The website's structured metadata should identify and connect the existing
   published dashboard to the relevant GPIR country/intelligence/source
   context only where such relationships can be deterministically established.
6. Missing structured metadata fields in `dashboard-metadata.json` reflect an
   information-architecture gap between the website's metadata layer and the
   richer published dashboard, not evidence that the dashboard itself lacks
   validation.

**Conclusion:** Diagnostic established a technical publication/reader
integration gap, not a dashboard research-validation deficiency.

### Corrected core principles recorded

**GPIR content principle.** Existing validated content is published and
remains part of GPIR. When information is updated, the new validated edition
becomes CURRENT, the previous edition/content is retained, previous
information is moved into the appropriate HISTORICAL section, and no valid
historical research is deleted or retired merely because it has been
superseded. This applies progressively to dashboards, country intelligence,
regulatory information, AML/CFT information, payment developments, research
publications, announcements, forecasts and other versioned GPIR content.

**Dashboard principle.** Dashboard = validated GPIR research publication.
Dashboard image = view-first visual publication. Underlying GPIR repository =
evolving intelligence and reader layer. The website connects these layers
without duplicating or inventing research. Target architecture:

```
VALIDATED PUBLIC SOURCES
        ↓
GPIR RESEARCH / RECONCILIATION
        ↓
VALIDATION
        ↓
PUBLISHED COUNTRY DASHBOARD (JPEG / PNG)
        ↓
CURRENT GPIR EDITION
        ↓
SMART READER
        ↓
COUNTRY / INTELLIGENCE / SOURCE / HISTORY
        ↓
FUTURE VALIDATED EDITION
```

**Public portfolio principle.** Do not wait until all countries have updated
dashboards before making GPIR live. Many countries will not yet have a current
dashboard; their existing GPIR content should still be publicly accessible and
discoverable now. The dashboard programme and the public repository
activation programme proceed in parallel.

**Existing-utilities-first principle.** Review and activate the existing
Search, ASK GPIR, Explain, Explore, related-content, Source/Evidence, country
navigation, dashboard navigation, historical navigation, intelligence
navigation and other existing reader utilities. Do not build unnecessary new
frameworks or infrastructure.

**AI principle.** The deterministic GPIR reader foundation comes first.
Future generative AI should operate above the validated GPIR repository rather
than becoming the uncontrolled source of research. Generative AI, external LLM
APIs, API keys, backend AI infrastructure and databases are not introduced
under M-25D.

**Historical principle.** Nothing valid is deleted because it is old. When a
new edition replaces a current publication, the new validated edition becomes
CURRENT and the previous validated edition(s) move to HISTORICAL, preserving
reference ID, edition/version, publication date and applicable historical
context wherever already available.

### Original diagnostic audit (retained unchanged)

#### Prompt objective
Run a read-only diagnostic audit of the existing dashboard publication records,
their metadata schema, their image and route assets, and their relationship (or
lack of one) to the canonical content registry, search index and trusted-source
registry. Record findings only.

#### Repository audit findings

1. Five existing country dashboard publication records are present in
   `assets/data/dashboard-metadata.json`: `dashboard-uae`, `dashboard-ksa`,
   `dashboard-qatar`, `dashboard-india`, `dashboard-singapore`.
2. Existing dashboard records currently contain publication identity fields
   (`title`, `country`, `region`, `description`, `edition`, `imagePath`,
   `pagePath`), while structured evidence/provenance fields on the website's
   metadata layer (`period`, `direction`, `useCase`, `metric`, `unit`,
   `source`, `methodology`, `disclaimer`) remain `null`. This reflects the
   website's metadata layer not yet mirroring the richer published dashboard —
   see Correction record above — not a validation gap in the dashboard itself.
3. The dashboard artwork is confirmed to be a view-first visual publication
   asset. It is not treated as the canonical source of intelligence, and is
   itself already a validated, published research edition (see Correction
   record).
4. No OCR, reconstruction, inference, calculation or independent extraction of
   research facts from dashboard artwork was performed or proposed.
5. Canonical GPIR intelligence is confirmed to remain in the underlying
   repository evidence/content layer (registry, country data, search index),
   to evolve only as publicly available information is progressively sourced,
   reconciled and validated.
6. The dashboard is not yet connected to the relevant existing
   country/intelligence/evidence layer through any explicit deterministic
   relationship; this connection is deferred pending an explicit,
   deterministic mapping.
7. Diagnostic findings (technical / information-architecture; files inspected
   in parentheses):
   - Dashboard metadata schema (`period`, `direction`, `useCase`, `metric`,
     `unit`, `source`, `methodology`, `disclaimer`) does not match the
     `dashboardMetadataFields` contract declared in
     `assets/data/content-model.json` (`direction`, `useCase`, `period`,
     `currency`, `volume`, `corridor`, `source`, `evidence`, `lastUpdated`,
     `methodology`). *(`assets/data/dashboard-metadata.json`,
     `assets/data/content-model.json`)*
   - `imagePath` values in `dashboard-metadata.json` (e.g.
     `assets/dashboards/VK-GPIR-GCC-UAE-DB-001.png`) require technical
     reconciliation against the identified image assets under
     `assets/images/` (`dashboard-01.jpg`, `dashboard-02.jpg`,
     `dashboard-03.jpg`, `dashboard-fintech.jpg`, `dashboard-global.jpg`,
     `dashboard-remittance.jpg`). *(`assets/data/dashboard-metadata.json`,
     `assets/images/`)*
   - The four `pages/dashboards/*.html` route placeholders
     (`apac-dashboard.html`, `europe-dashboard.html`, `global-dashboard.html`,
     `middle-east-dashboard.html`) remain empty (0 bytes).
     *(`pages/dashboards/*.html`)*
   - `assets/data/content-registry.json` `supportedContentTypes` has no
     `DASHBOARD` content type. *(`assets/data/content-registry.json`)*
   - No explicit country-to-dashboard relationship entries exist in the
     canonical registry's country records. *(`assets/data/content-registry.json`)*
   - Dashboard-related intelligence is already present in
     `assets/data/search-index.json` (19 matches), citing dashboard reference
     IDs such as `VK-GPI-APAC-IND-2026-005` and `SGP-2026-006`, which differ
     from the `dashboard-*` IDs used in `dashboard-metadata.json`.
     *(`assets/data/search-index.json`)*
   - `assets/data/trusted-sources.json` is a source-domain verification
     registry and should not be forced to become a dashboard registry.
     *(`assets/data/trusted-sources.json`)*
8. These findings represent architecture/provenance/reader-integration
   reconciliation requirements, not missing research content and not evidence
   of dashboard invalidation.
9. No missing dashboard facts, sources, methodology, period, direction,
   metrics, volumes or other research fields were populated during this
   checkpoint.
10. No new research content was introduced during M-25D.
11. M-18 and M-19 were not modified. Both remain OPEN.
12. CNAME, DNS, `fintechosis.com` and the GitHub Pages production domain were
    not changed.

### Files changed
- `docs/MASTER_PROJECT_LOG.md`
- `docs/PROJECT_STATUS.md`
- `docs/GPIR_BACKLOG.md`

### Implementation completed
None. This is a documentation-only governance checkpoint recording diagnostic
findings and a corrected strategic scope; no dashboard, metadata, registry,
route or content-model files were modified.

### Achievements
- **ACHIEVED:** M-25D diagnostic audit completed.
- **ACHIEVED:** Existing dashboard publication model clarified (dashboard =
  already validated GPIR research publication; validation occurs before
  publication).
- **ACHIEVED:** Validated-dashboard principle established.
- **ACHIEVED:** View-first dashboard principle established.
- **ACHIEVED:** Historical preservation principle established (CURRENT /
  HISTORICAL content model).
- **ACHIEVED:** Strategic priority redirected toward live portfolio activation
  and intelligent reader utilities, proceeding in parallel with the dashboard
  programme.
- **ACHIEVED:** No production content modified.
- **ACHIEVED:** No research content generated.

### NOT YET ADDED / TO DO
- Public portfolio completeness audit.
- Dashboard publication-to-country relationship.
- Dashboard-to-existing-intelligence relationship where explicitly supported.
- Historical/current architecture.
- Reader integration.
- Utility integration.
- Dashboard publication presentation controls.
- Browser QA.
- Remaining M-25A/M-25B reader tasks.
- Future country dashboard expansion.

### Deferred work
- Generative AI.
- External APIs.
- Backend.
- Database.
- New research content.
- Dashboard generation for uncovered countries.
- M-18.
- M-19.
- Custom domain migration.

### Validation
Documentation-only checkpoint; no JSON, JavaScript, CSS or HTML files were
modified. No validator run is required for this record beyond the diagnostic
read-only audit already performed.

### Security
No external APIs, credentials, secrets, cookies, analytics or query storage.
No code paths were changed.

### Performance
Not applicable; no runtime files were changed.

### Browser QA
**BROWSER QA NOT AVAILABLE IN THIS ENVIRONMENT.** No browser interaction,
responsive or accessibility claim is made.

### Live production verification
Not performed for this checkpoint; no production-affecting files were changed.

### Git commits
Governance checkpoint: to be recorded after documentation-only changes are
validated and committed separately, per checkpoint instructions.

### M-25C inherited pending work
Missing source/methodology fields, dashboard route pages and browser QA remain
outstanding.

### M-18 status
Remain open.

### M-19 status
Remain open.

### Implementation stage (authorised)

#### Implementation authorisation
Implementation authorised from governance baseline
`e062bf22a532e033e27bfe6b7c09c166a7ce0883`. The M-25D diagnostic and its
correction (above) are not reopened or reinterpreted; the controlling
conclusion remains: *"Diagnostic established a technical publication/reader
integration gap, not a dashboard research-validation deficiency."*

#### Implementation objective
Activate the existing GPIR portfolio and make the existing reader utilities
smarter, using only content that already exists in the repository. No new
research, statistics, sources, methodology or dashboards were created.

#### Portfolio audit (read-only, before code changes)
- All 5 dashboard records in `assets/data/dashboard-metadata.json` have an
  exact, pre-existing `pagePath` ↔ registry `page` match to their country
  record (`dashboard-uae`→`country:united-arab-emirates`, `dashboard-ksa`→
  `country:saudi-arabia`, `dashboard-qatar`→`country:qatar`, `dashboard-india`→
  `country:india`, `dashboard-singapore`→`country:singapore`) — the
  relationship is deterministic and required no inference.
- On direct inspection, the `imagePath` values in `dashboard-metadata.json`
  (e.g. `assets/dashboards/VK-GPIR-GCC-UAE-DB-001.png`) resolve correctly to
  existing files in `assets/dashboards/`. The prior diagnostic finding was
  based on an incomplete asset-location search (`assets/images/` and
  `assets/dashboards/thumbnails/` only); no path repair was required.
- `pages/countries/uk.html` is a live, populated, navigable page (linked from
  the homepage Europe/SEPA section, indexed in `assets/data/search-index.json`)
  that was never added to `assets/data/content-registry.json` — an existing,
  published page that was not fully connected, not missing content.
- `pages/countries/australia.html`, `pages/countries/japan.html` and
  `pages/countries/united-kingdom.html` are 0-byte files with no content; they
  remain coming-soon placeholders. No content was created for them.
- The four `pages/dashboards/*.html` route placeholders remain 0 bytes with no
  inbound links anywhere in the repository; they are not a per-country
  dashboard gap (no country dashboard content is missing from the reader) but
  unused regional-aggregate route stubs.
- `assets/js/content-search.js` indexes only `assets/data/search-index.json`
  (chapter/country/legal page text); dashboard records were not previously
  searchable at all.
- The ASK GPIR dashboard-detail intent in `assets/js/script.js` only resolves
  a record when an on-page `.dashboard-card` element or matching URL hash
  exists (i.e. on the homepage); on a country page with no dashboard card it
  correctly reported unavailability rather than inferring the wrong country's
  dashboard.

#### Existing content activated
- Added `country:united-kingdom` to `assets/data/content-registry.json`,
  connecting the already-live, already-linked, already-searchable
  `pages/countries/uk.html` to the canonical registry using its existing
  `assets/data/sepa-countries.json` source record — no new prose or facts.

#### Dashboard integration
- Added a `DASHBOARD` content type to
  `assets/data/content-registry.json` `supportedContentTypes`.
- Added 5 `DASHBOARD` registry records (`dashboard:uae`, `dashboard:ksa`,
  `dashboard:qatar`, `dashboard:india`, `dashboard:singapore`), each with a
  `sourceRef` into the existing `assets/data/dashboard-metadata.json` record
  and a `COUNTRY` relationship to its already-matching country record.
- Added the reverse `DASHBOARD` relationship on each of the 5 country records.
- No dashboard artwork, image asset or route file was modified, recreated,
  OCR'd or reinterpreted. No dashboard field was populated beyond what already
  exists in `dashboard-metadata.json`.

#### CURRENT/HISTORICAL implementation
- Added a documented, unapplied `editionLifecycleFields` contract to
  `assets/data/content-model.json` (lifecycle statuses `CURRENT`/`HISTORICAL`;
  fields `referenceId`, `editionVersion`, `publicationDate`,
  `lifecycleStatus`, `supersedes`, `supersededBy`) as the minimum technical
  foundation for future versioned content.
- No existing record was migrated, reclassified or given an invented edition
  or date under this contract; no repository record currently has explicit
  multi-edition version history to migrate.

#### Search
- `assets/js/content-search.js` now also loads
  `assets/data/dashboard-metadata.json` and merges each of the 5 existing
  dashboard records into the same client-side search index as one entry each,
  using only their existing `title`, `country`, `description`, `edition` and
  `status` fields. No new text was authored; dashboards were simply
  previously absent from search.
- The primary `assets/data/search-index.json` file was not modified (no
  indexing/extraction tooling exists in the repository to safely regenerate it
  without authoring new prose).

#### ASK GPIR
- Preserved the deterministic M-25A/M-25B/M-25C foundation unchanged; no
  generative AI, external API or query storage was introduced.
- Extended the existing dashboard-detail intent in `assets/js/script.js`: when
  no on-page dashboard record is found (e.g. on a country page), it now
  checks the current page's registry relationships for a `DASHBOARD` target
  and, if present, links the reader to that dashboard's existing homepage
  gallery card, explicitly labelled as coming from "a validated GPIR registry
  relationship, not an inferred match." When no such relationship exists, the
  original "No structured dashboard metadata is available on this page."
  message is unchanged.

#### Source/Evidence
- Unchanged. The existing `sourceDetails`/related-content traversal already
  operates generically over registry relationships; no new source or
  evidence field was added or inferred.

#### Security
No external APIs, credentials, secrets, cookies, analytics, telemetry or
query storage were introduced. A diff-scoped secret/API-key and forbidden-
domain scan found no matches. No new backend, database or generative AI
dependency was added.

#### Performance
Changes are confined to existing static JSON and existing JavaScript files
using the existing lazy-load/fetch patterns; no new library, framework or
blocking network call was added. `scripts/gpir-perf-audit.js` reports the
same 3 pre-existing advisory warnings as the M-25D baseline; no new warning.

#### Browser QA
**BROWSER QA NOT AVAILABLE / NOT VERIFIED IN THIS ENVIRONMENT.** No browser
interaction, responsive or accessibility claim is made.

#### Validation
- `node -e` JSON parse checks passed for `content-registry.json` and
  `content-model.json`.
- `node --check` passed for `assets/js/content-search.js` and
  `assets/js/script.js`.
- `node scripts/validate-content.js` passed: 10 announcements, 8 trusted
  sources, **25 registry records** (up from 19; +5 `DASHBOARD` records, +1
  `country:united-kingdom`).
- `node scripts/validate-links.js` passed: 67 HTML files checked.
- `git diff --check` reported no whitespace/conflict errors.

#### Files changed
- `assets/data/content-registry.json`
- `assets/data/content-model.json`
- `assets/js/content-search.js`
- `assets/js/script.js`
- `docs/MASTER_PROJECT_LOG.md`
- `docs/PROJECT_STATUS.md`
- `docs/GPIR_BACKLOG.md`

#### Achievements
- **ACHIEVED:** Deterministic `country:united-kingdom` registry record added,
  connecting an existing, already-live, already-linked page.
- **ACHIEVED:** Deterministic `DASHBOARD` content type and 5 dashboard records
  added, connected to their existing matching country records via explicit,
  pre-existing `pagePath`/`page` matches only.
- **ACHIEVED:** The 5 existing dashboard publications are now discoverable
  through the existing search UI, using only their existing structured
  metadata fields.
- **ACHIEVED:** ASK GPIR now connects a country page to its existing dashboard
  via the validated registry relationship instead of a dead end, with no
  inference beyond the registry record.
- **ACHIEVED:** `dashboardMetadataFields` in `content-model.json` reconciled
  to match the actual fields already present in `dashboard-metadata.json`.
- **ACHIEVED:** Minimum CURRENT/HISTORICAL technical foundation documented in
  `content-model.json`, without migrating or inventing any edition/date data.
- **ACHIEVED:** On direct inspection, the previously diagnosed `imagePath`
  mismatch (DASH-004) was found to already resolve correctly; no repair was
  required.
- **ACHIEVED:** All existing validators (`validate-content.js`,
  `validate-links.js`) pass against the changed files; no unrelated file was
  modified.
- **ACHIEVED:** No production content, dashboard artwork, DNS, CNAME or
  domain configuration was modified.

#### Partially achieved
- **PARTIALLY ACHIEVED:** Public portfolio completeness — `uk.html` is now
  registry-connected, but `australia.html`, `japan.html` and
  `united-kingdom.html` remain 0-byte placeholders with no content to expose;
  this is a content gap, not a reader-integration gap, and is out of scope
  for M-25D.
- **PARTIALLY ACHIEVED:** The four `pages/dashboards/*.html` regional route
  placeholders remain unresolved; no decision was forced given the absence of
  any existing regional dashboard content or inbound links.
- **PARTIALLY ACHIEVED:** Browser QA is not available/not verified in this
  environment.

#### NOT YET ADDED / TO DO
- Decision on whether `pages/dashboards/*.html` regional placeholders should
  be retired, redirected, or reserved for future regional research.
- Region registry record(s) for Europe/SEPA (no `region:europe` record exists
  yet, so `country:united-kingdom` has no REGION relationship; adding one
  would require a new REGION record, deferred to keep this change minimal).
- Historical/CURRENT reclassification of any existing record (no existing
  record currently has the explicit multi-edition data required).
- Regeneration of `assets/data/search-index.json` prose entries for
  `uk.html` (no repository indexing/extraction tool exists to do this without
  manually authoring summarised text).
- Remaining M-25A/M-25B reader tasks (broader source cards, advanced
  multi-hop navigation, browser QA).
- Future country dashboard expansion for uncovered countries.

#### Deferred
- Generative AI, external LLM APIs, API keys, backend AI infrastructure,
  vector databases.
- New research content, new statistics, new sources, new methodology.
- Dashboard generation for countries without a validated publication.
- M-18, M-19.
- Custom domain migration.

#### M-18 status (implementation stage)
Remain open; not touched by this implementation.

#### M-19 status (implementation stage)
Remain open; not touched by this implementation.

#### Recommended next milestone
A future milestone should decide the `pages/dashboards/*.html` regional route
architecture, add a Europe/SEPA REGION registry record if warranted, and
continue the public portfolio activation for `australia.html`/`japan.html`
only once real content exists for them. Browser QA should be performed before
any completion claim.

### Final milestone status
M-25D diagnostic: PARTIALLY ACHIEVED — DIAGNOSTIC COMPLETE; STRATEGIC
IMPLEMENTATION SCOPE CORRECTED (unchanged, retained above).
M-25D implementation: **PARTIALLY ACHIEVED.** Existing dashboards, the UK
country page and existing search/reader utilities are now connected and
discoverable using only pre-existing repository content; regional dashboard
route architecture, region-record completion, further portfolio content gaps
and browser QA remain outstanding.

## M-27A — Current Asset Consumption & Live GPIR Alignment

- **Date:** `2026-09-05`.
- **Starting SHA:** `479d8d6634b2aee39cc8391d8f91b88e4c7f8eab`.
- **Objective:** Consume the current GPIR assets and align them into the live
  GPIR reader experience using the existing registry, dashboards, narratives,
  country pages, region pages, announcements, sources and intelligent
  cross-referencing — without creating new content, fabricating missing
  relationships or inventing unsupported material.
- **Core principle:** Use what already exists. Do not create filler content.
- **Files changed:** 
  - `assets/data/content-registry.json` — added page references for
    region:middle-east and region:apac.
  - `scripts/m27a-validate.js` — new validation script.
- **Validation results:**
  - `node --check assets/js/script.js` — passed
  - `node scripts/validate-content.js` — passed
  - `node scripts/validate-links.js` — passed
  - `git --no-pager diff --check` — passed
  - `node scripts/m27a-validate.js` — passed (36/36 checks)
- **Live user journey — UAE proof case:** Country → Region → Dashboard → Narrative → Sources complete and verified end-to-end.
- **Extended to additional countries:** India, Saudi Arabia, Qatar, Singapore all working with same pattern.
- **Honest availability states:**
  - AVAILABLE: UAE, India, Saudi Arabia, Qatar, Singapore (with dashboards)
  - PARTIALLY AVAILABLE: UK (country record exists, no dashboard)
  - NOT YET AVAILABLE: Australia, Japan (honest "coming soon" status)
- **Live HTTP verification:** All key URLs returned HTTP 200.
- **Security results:** No API keys, secrets, external AI, telemetry or new infrastructure added.
- **Browser QA status:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **Achieved:** ✓ Registry aligned, ✓ Country readers work end-to-end, ✓ Region readers show dashboard status, ✓ All dashboards have metadata and narratives, ✓ ASK GPIR integrated, ✓ All validations pass, ✓ Live HTTP verified.
- **M-18 status:** OPEN.
- **M-19 status:** OPEN.
- **Final commit SHA:** To be recorded after git push with message "M-27A: Align current assets for public consumption".

## M-27A.1 — Navigation Hierarchy & Dashboard Gallery Release

- **Date:** `2026-09-05`.
- **Starting SHA:** `2eb7ffa6ccbac76b02e650af4ed9ff03b5b206c9`.
- **Objective:** Align live navigation and the Dashboard Gallery with the
  canonical `GLOBAL -> REGION -> COUNTRY -> DASHBOARD / INTELLIGENCE /
  HISTORICAL` hierarchy without adding content or changing dashboard research.
- **Implementation:** Regions are the geographic entry point in the Markets
  menu. The Dashboard Gallery is a registry-driven presentation/view layer over
  existing dashboard-country-region relationships.
- **Files changed:** `index.html`, `assets/js/script.js`,
  `assets/js/generate-dashboard-gallery.js`, `assets/i18n/*.json`,
  `docs/MASTER_PROJECT_LOG.md`, `docs/PROJECT_STATUS.md` and
  `docs/GPIR_BACKLOG.md`.
- **Hierarchy verification:** `dashboard:uae`, `dashboard:ksa`,
  `dashboard:qatar`, `dashboard:india` and `dashboard:singapore` each resolve
  through `Dashboard -> Country -> Region`.
- **Preservation verification:** Existing dashboard IDs, metadata, narratives,
  image assets, routes, countries, regions and historical assets were retained;
  no parallel country hierarchy or new registry record was created.
- **Validation:** JavaScript syntax, internal links, content validation,
  registry relationship checks and `git diff --check` passed.
- **Live HTTP verification:** Passed after push. Homepage, UAE country page,
  Middle East region page, dashboard metadata, dashboard narratives, gallery
  script, main script and CSS all returned HTTP 200. Deployed bytes for the
  homepage and runtime/data/CSS resources match the release files.
- **Browser QA:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **M-18 status:** OPEN. **M-19 status:** OPEN. **Custom domain:** DEFERRED.
- **Research scope:** No new research content was introduced.
- **Achieved:** Canonical navigation and registry-driven gallery are locally
  validated.
- **Partial:** Browser-level rendering and interaction verification is pending.
- **Deferred:** Custom domain, M-18, M-19 and broader future coverage.
- **Not yet added / to do:** No new countries, dashboards, research or
  historical editions; browser QA remains outstanding.
- **Next milestone:** Future governed reader validation or coverage expansion
  under separate authorization.

## M-27B.2 — World Map Interaction & Performance Repair

- **Date:** `2026-09-06`.
- **Status:** **IMPLEMENTED, PUSHED, LIVE HTTP VERIFIED; BROWSER RUNTIME PENDING.**
- **Objective:** Repair the existing World Map interaction and initial-build
  responsiveness without redesigning the map or creating a second route model.
- **Root-cause repair:** Land-dot construction now yields across animation
  frames; country data loading runs alongside it; corridor, marker and legend
  composition is scheduled after both are ready. This preserves the final map
  layers while reducing the chance that first construction blocks deliberate
  reader interaction.
- **Interaction repair:** Existing active marker URLs for India, UAE, Saudi
  Arabia, Qatar and Singapore remain unchanged. The six dynamic region legend
  items now use semantic anchors and existing canonical routes. Hover remains
  tooltip-only; active marker click remains native country-page navigation.
- **Hit-area repair:** Marker invisible padding changed from `inset:-10px` to
  `inset:-7px`, retaining marker geometry and visual styling while reducing
  ambiguity between nearby UAE, Qatar and India targets.
- **Semantic repair:** The caption now describes the actual first destination:
  `Tap a market to explore country intelligence`.
- **Preservation:** Existing country pages, region pages, dashboard metadata,
  dashboard relationships, research, images, historical/current architecture,
  Search, Markets navigation and Australia coming-soon state were preserved.
  No routes, content, dashboards, registry records or external services were
  added.
- **Files changed:** `assets/js/world-map.js`, `assets/css/global.css` and
  `index.html` only for production; governance files were appended separately.
- **Validation:** `node --check assets/js/world-map.js`, content validation,
  link validation, M-27A validation (36/36), map interaction contract,
  performance audit review and `git diff --check` passed. Performance audit
  warnings were pre-existing advisory items outside this change.
- **Release:** Commit `30260a7`, message `M-27B.2 World Map interaction and
  performance repair`, pushed to `origin/main`.
- **Live verification:** Public HTTP 200 checks passed for homepage, India and
  UAE country pages, APAC and Middle East region pages, map JavaScript and map
  data. Deployed bytes confirmed the scheduled map build, region anchors and
  updated caption.
- **Browser validation:** `BROWSER EXECUTION UNAVAILABLE`. Runtime hover,
  click/tap, keyboard, latency and visual regression evidence remains pending.
- **Achievement:** Source repair, validation, push and live HTTP verification
  complete.
- **Partial:** M-27B.2 cannot be marked fully achieved until browser runtime
  acceptance is available.
- **Next goal:** Execute the twelve-country/region interaction matrix in a real
  browser and record observed latency and destinations.

## M-27C Phase 1 — Reader Intelligence Architecture Gate

- **Date:** `2026-09-06`.
- **Status:** **ACHIEVED — DIAGNOSTIC / ARCHITECTURE GATE COMPLETE. NO
  PRODUCTION IMPLEMENTATION AUTHORISED.**
- **Objective:** Translate live-reader observations into verified architecture
  findings, root causes, safe implementation boundaries and a controlled
  roadmap for the next reader-intelligence improvements.
- **Architecture baseline:** GPIR remains a static GitHub Pages site using
  HTML, CSS, vanilla JavaScript and JSON. There is no backend, database,
  public API, analytics provider or subscription platform.
- **Live acceptance findings recorded:** The dashboard lightbox opens images
  but lacks zoom, zoom-out, reset, fit-to-view, pan and fullscreen controls;
  the protected view-first publication remains deterrence only, never DRM;
  the Global Announcements marquee has uneven movement, lag perception,
  blank-gap/jump behaviour and asynchronous render/duplication interaction;
  Home can land below the intended top position because of sticky header and
  pre-Home ribbons; the visitor counter remains in an empty/Updating state;
  subscription and weekly digest infrastructure does not exist; historical
  preservation is required for all superseded GPIR intelligence; World Map
  selections do not consistently use canonical country routing and can feel
  sluggish/stuck; and mega-menu pointer behaviour is too sensitive.
- **Architecture findings:** The existing lightbox is the correct future
  foundation; the ticker requires a deterministic two-copy measured loop;
  Home and hash destinations require one sticky-header-aware navigation
  contract; CURRENT/HISTORICAL is documented but not fully applied; no
  legitimate unique-visitor measurement exists; no subscriber or digest
  infrastructure exists; World Map routing is not yet registry-canonical;
  and mega-menu interaction requires deliberate pointer intent.
- **Completed M-27A fixes preserved:** M-27A.2 separated dashboard
  publication status from country editorial status, preserved disclaimers,
  kept the generic country warning outside the dashboard reader boundary and
  corrected the five UAE, Saudi Arabia, Qatar, India and Singapore dashboard
  links to existing publication assets. M-27A.3 closes the Search GPIR
  overlay before normal mouse or keyboard navigation. These are completed
  fixes, not pending M-27C work.
- **Pending objectives:** M-27C.1 Dashboard Reader Controls; M-27C.2 Global
  Announcement Ticker; M-27C.3 Navigation; M-27C.4 Historical Architecture;
  M-27C.5 Visitor Measurement; M-27C.6 Subscription; M-27C.7 World Map; and
  M-27C.8 Mega-menu intent behaviour.
- **Permanent UX principle proposed:** “Intent-driven interaction: GPIR should
  remain visually calm during passive reading. Interactive components should
  respond predictably to deliberate reader intent and should not compete for
  attention through excessive hover sensitivity, animation, automatic
  expansion or unsolicited movement.” The desired flow is
  `CALM -> DISCOVER -> INTENTION -> INTERACT -> INTELLIGENCE -> NAVIGATE`.
- **Deferred / not authorised:** No analytics provider, subscription
  provider, subscriber data architecture, external LLM/API, backend,
  database, dashboard research/image/disclaimer change, country research
  change, historical migration or new research content was introduced. M-18,
  M-19, custom domain/CNAME and browser automation remain open, deferred or
  unavailable as previously recorded.
- **Files changed:** `docs/MASTER_PROJECT_LOG.md`,
  `docs/PROJECT_STATUS.md` and `docs/GPIR_BACKLOG.md` only.
- **Production status:** No HTML, CSS, JavaScript, JSON, image, dashboard,
  country, registry, search, domain or subscription production file changed.
- **Next action:** After this documentation update is reviewed and committed
  separately, proceed to **M-27B.1 — LIVE READER INTERACTION DIAGNOSTIC**.
  M-27B.1 remains diagnose only; its recommendations require separate
  authorisation before implementation.
- **Control rule:** Future work must preserve
  `DIAGNOSE -> REVIEW -> AUTHORISE -> IMPLEMENT -> VALIDATE -> PUSH -> LIVE
  VERIFY -> MASTER CONTROL LOG`. No “fixed” status is valid until
  implementation is validated, committed, pushed and live behaviour is
  verified where browser testing is available.

## M-27A.3 — Search Result Overlay Close & Navigation UX Fix

- **Date:** `2026-09-05`.
- **Starting SHA:** `a0f897a25fc4450fad139403a38a2d8cb9de9b54`.
- **Objective:** Close and reset the Search GPIR overlay when a reader selects
  a normal search result while preserving the existing destination navigation.
- **Root cause:** `activateResult()` only called the existing `close()` method
  for announcement detail results. Normal result links returned `false`, so
  native navigation proceeded behind the still-open search overlay.
- **Correction:** Normal result selection now calls the existing `close()`
  mechanism before returning `false`, preserving native mouse navigation and
  the existing keyboard Enter `window.location.href` path.
- **Files changed:** `assets/js/script.js` only.
- **Preservation:** Search indexing, ranking, ASK GPIR, navigation hierarchy,
  dashboard architecture, dashboard research/disclaimers and all content were
  unchanged. No new dependency, framework, API, content or asset was added.
- **Validation:** Both JavaScript syntax checks, link validation, content
  validation, M-27A validation (36/36), targeted mouse/keyboard/manual-close
  source assertions and `git diff --check` passed.
- **Live verification:** To be recorded after push for the homepage, country
  pages, search runtime and deployed close behavior marker.
- **Browser QA:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **M-18 status:** OPEN. **M-19 status:** OPEN. **Custom domain:** DEFERRED.
- **Achieved:** Normal search results close and reset the overlay before the
  existing navigation continues.
- **Partial:** Browser-level interaction verification remains unavailable.
- **Deferred:** Custom domain, M-18, M-19 and broader reader work.
- **Not yet added / to do:** No additional UX, design, content, ranking or
  architecture changes; browser QA remains outstanding.
- **Next milestone:** Future governed reader validation under separate
  authorization.
- **Final release commit SHA:** `ca4513b9dab7bdfd0d2e52827a15b4b442839090`.
- **Live HTTP verification:** UAE, Saudi Arabia, Qatar, India and Singapore
  pages, homepage, dashboard metadata, dashboard narratives, main runtime and
  content-search runtime returned HTTP 200. All five live pages have no generic
  draft warning, retain their dashboard readers and preserve canonical
  Search/Markets routes.

## M-27A.5 — Remove Stale Draft Status from Five Published Country Readers

- **Date:** `2026-09-05`.
- **Starting SHA:** `a711e9a3cc1cc1bb35263e6445aa739a5b422924`.
- **Objective:** Remove the stale generic country scaffold warning from all
  five existing published country readers while preserving dashboard status,
  disclaimers, research, sources, routes and content.
- **Root cause:** The same static `.draft-notice` scaffold remained on UAE,
  Saudi Arabia, Qatar and Singapore after India had been corrected.
- **Correction:** Removed only the generic `.draft-notice` block from the four
  remaining pages; India was already clear. Dashboard-reader boundaries and
  metadata-driven dashboard publication status were unchanged.
- **Permanent status rule:** Country editorial status is distinct from dashboard
  publication status. An existing published GPIR country reader with an active
  associated dashboard/research publication must not display the generic
  scaffold-level `Draft — Pending Verification` notice. Future genuinely draft
  country pages require explicit draft designation by the content/status model.
- **Files changed:** Five country pages as a coordinated set, plus governance
  records. No runtime, registry, metadata, narrative, search, region, dashboard
  or asset files changed.
- **Preservation:** Dashboard disclaimers, research, statistics, sources,
  images, publication dates, reference IDs, metadata, narratives, routes,
  Search/Markets canonical routing and Global -> Region -> Country remain
  unchanged.
- **Validation:** Standard JavaScript, link, content and M-27A checks,
  `git diff --check`, route assertions, dashboard-preservation assertions and
  five-country warning-removal assertions passed.
- **Browser QA:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **M-18 status:** OPEN. **M-19 status:** OPEN. **Custom domain:** DEFERRED.
- **Achieved:** Generic stale country draft status removed from all five
  published readers; dashboard publication architecture unchanged.
- **Partial:** Browser-level route and rendering verification remains
  unavailable.
- **Deferred:** Custom domain, M-18, M-19 and future reader work.
- **Not yet added / to do:** No new content, research, dashboard, source,
  metadata, narrative, registry record or asset was added.
- **Next milestone:** Future governed reader validation under separate
  authorization.
- **Final release commit SHA:** `4a7720af2c678cfebad8a8d1f3c5cdd3eea57957`.
- **Live HTTP verification:** GitHub Pages deployment succeeded. India page,
  homepage, dashboard metadata and content-search runtime returned HTTP 200.
  India has no generic draft notice; its canonical dashboard and dashboard
  disclaimer remain present, and the other four country pages are unchanged.

## M-27A.4 — India Country Status & Search Route Consistency Fix

- **Date:** `2026-09-05`.
- **Starting SHA:** `35cc9e7076820ecc87cd6aeb37790ea629ba872d`.
- **Objective:** Remove the stale generic country draft scaffold warning from
  the active India country reader while preserving separate dashboard
  publication status.
- **Root cause:** India had an `active` country registry record and canonical
  page, but stale static `.draft-notice` markup remained after its dashboard
  reader boundary. Search and Markets both resolved to the same canonical page.
- **Correction:** Removed only the stale warning block from
  `pages/countries/india.html`. The India dashboard reader, disclaimer,
  research, sources, statistics, image, reference ID, metadata and narrative
  were not changed.
- **Files changed:** `pages/countries/india.html` only, plus these governance
  records.
- **Preservation:** UAE, Saudi Arabia, Qatar and Singapore were unchanged.
  Dashboard publication architecture, search architecture, registry, hierarchy,
  historical architecture, M-18, M-19 and domain configuration were preserved.
- **Validation:** Standard validators, M-27A validation (36/36), targeted India
  route/status/dashboard-preservation assertions and `git diff --check` passed.
- **Browser QA:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **M-18 status:** OPEN. **M-19 status:** OPEN. **Custom domain:** DEFERRED.
- **Achieved:** Stale India country-page scaffold warning removed; dashboard
  publication architecture unchanged.
- **Partial:** Browser-level verification remains unavailable.
- **Deferred:** Custom domain, M-18, M-19 and future reader work.
- **Not yet added / to do:** No new content, research, dashboard, source,
  metadata, narrative, registry record or asset was added.
- **Next milestone:** Future governed reader validation under separate
  authorization.
- **Final release commit SHA:** `c818f4f3023ae41a8db183c81fd9159476429dc6`.
- **Live HTTP verification:** GitHub Pages deployed SHA matched origin/main.
  Homepage, UAE country page, Qatar country page, `content-search.js` and
  `script.js` returned HTTP 200. The deployed script contains the corrected
  normal-result `close()` path and preserves keyboard navigation.

- **Final release commit SHA:** `6e9f5d7b9d73519e5e699d6adc8ab22b26b78f5d`.
- **Live HTTP verification:** GitHub Pages deployment SHA matched the release.
  Homepage, UAE, KSA, Qatar, India and Singapore country pages, dashboard
  metadata, dashboard narratives, gallery runtime, main runtime and CSS all
  returned HTTP 200. Deployed bytes matched the committed release files.
- **Dashboard link verification:** All five connected dashboard links resolved
  to their existing publication assets; Qatar no longer resolved to Home.
- **Release commit SHA:** `69b928f9952b242c4fd164908394634394a2a89d`.

## M-27A.2 — Correct Dashboard Publication Status and Reader Links

- **Date:** `2026-09-05`.
- **Starting SHA:** `dc43cb95e36ce80fe6ba8ca869135a7135ab3d8a`.
- **Objective:** Separate country editorial status from dashboard publication
  status and make connected dashboard links resolve to existing published
  dashboard assets.
- **Issue 1 root cause/correction:** The generic country `.draft-notice` was
  directly before each dashboard embed and was read as dashboard status. Each
  published dashboard now has a `.dashboard-reader` boundary; the country
  notice remains outside it, and dashboard status is loaded from existing
  dashboard metadata.
- **Issue 2 root cause/correction:** Connected links used a homepage hash
  fallback instead of the existing dashboard publication path. Registry
  dashboard relationships now resolve through `dashboard-metadata.json` and
  its existing `imagePath` values.
- **Files changed:** `assets/js/script.js`, `assets/css/chapter-page.css`,
  five published dashboard country pages, plus the required governance records.
- **Preservation:** Existing dashboard disclaimers, research, sources, images,
  metadata, narratives, registry relationships, country/region content,
  historical architecture and the Global -> Region -> Country hierarchy were
  preserved. No new research, content or assets were introduced.
- **Validation:** Both JavaScript syntax checks, link validation, content
  validation, M-27A validation (36/36), targeted five-dashboard assertions and
  `git diff --check` passed.
- **Live verification:** To be recorded after push for all required pages and
  runtime/data/CSS resources.
- **Browser QA:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
- **M-18 status:** OPEN. **M-19 status:** OPEN. **Custom domain:** DEFERRED.
- **Achieved:** Dashboard publication status is separated from country status;
  all five connected dashboard links resolve to existing publication assets.
- **Partial:** Browser-level rendering and interaction verification remains
  unavailable.
- **Deferred:** Custom domain, M-18, M-19 and future coverage expansion.
- **Not yet added / to do:** No new research, country, dashboard, source,
  historical edition or asset was added; browser QA remains outstanding.
- **Next milestone:** Future governed reader validation or coverage expansion
  under separate authorization.

## M-27B.3 — Final Human Live Acceptance Record

- **Date:** `2026-09-06`.
- **Status:** **ACHIEVED — LIVE BROWSER ACCEPTANCE COMPLETE.**
- **Public URL tested:** `https://krishnan-vishal.github.io/`.
- **Evidence source:** The repository owner performed the browser test against
  the actual public GitHub Pages deployment after M-27B.2 was deployed.
- **Automated browser execution:** `UNAVAILABLE` in Codespace.
- **Human public-browser acceptance:** **COMPLETED — PASS**.
- **Country marker results:** India, UAE, Saudi Arabia, Qatar and Singapore
  all worked.
- **Region legend results:** Middle East, Asia Pacific, Europe, LATAM,
  Americas and Africa all worked.
- **Performance results:** Initial map lag was gone; marker selection lag was
  gone; and the India/UAE/Qatar selection conflict was gone.
- **M-27B.2 final status:** **ACHIEVED**. Evidence chain:
  `diagnostic -> implementation -> repository validation -> deployment -> live
  HTTP/resource verification -> human public-browser acceptance -> PASS`.
- **Production commit:** `30260a7`.
- **Governance commit:** `d42df24`.
- **Architecture result:** The map now operates as a responsive reader-
  navigation layer: country marker -> existing Country Intelligence page ->
  existing connected dashboard where published; region legend -> existing
  canonical Region page.
- **Preservation:** Dashboard content, Country Intelligence content and
  historical/current architecture were preserved. Australia remains
  coming-soon. No fabricated dashboard, country content or routing architecture
  was introduced.
- **Open/deferred:** M-18 Global Announcements Ticker Integrity remains OPEN;
  M-19 Cross-Stream Reconciliation remains OPEN; custom domain/DNS, visitor
  measurement and subscription/digest infrastructure remain deferred.
- **Next goal:** Review and authorize the next available reader-experience
  objective from the existing GPIR backlog. No next objective is implemented
  by this acceptance record.

## M-18 — Global Announcements Ticker Integrity

- **Date:** `2026-09-06`.
- **Status:** **IMPLEMENTED / LIVE ACCEPTANCE PENDING.**
- **Objective:** Repair the public Global Announcements ticker's deterministic
  blank interval while preserving the existing announcement data, ordering,
  card markup, content and design.
- **Defect/root cause:** The async `renderTicker()` path replaced the track with
  one ordered card sequence. The existing announcement animation then swept
  beyond that sequence before restarting, exposing a deterministic blank period.
  The earlier duplicator in `fx-ticker.js` ran before the async announcement
  render and was overwritten, so it did not solve the defect.
- **Implementation:** `renderTicker()` now assigns the rendered sequence twice
  (`sequenceHTML + sequenceHTML`). The announcement-only `scrollTicker`
  animation in `assets/css/page.css` now runs from `translateX(0)` to
  `translateX(-50%)`.
- **Files changed:** `assets/js/announcements.js` and
  `assets/css/page.css` only.
- **Preservation:** The 10 existing announcement records, identities, content,
  ordering, source references, related content, World Map workstream, M-19 and
  custom-domain configuration were unchanged. No new announcement or source
  was created.
- **Validation:** JavaScript syntax, content validation, link validation,
  targeted doubled-sequence and animation-endpoint checks, announcement data
  baseline comparison, performance audit review and `git diff --check` passed.
  The performance audit's three warnings were pre-existing and unrelated.
- **Release:** Commit `8c1ba3c`, `M-18 Fix global announcements ticker
  continuity`, pushed to `origin/main`.
- **Live HTTP verification:** Public homepage, ticker script, ticker CSS and
  announcement data returned HTTP 200. Deployed bytes confirmed the doubled
  renderer, 0-to-−50% animation and 10-record data set.
- **Automated browser execution:** `UNAVAILABLE`.
- **Human browser acceptance:** Not available for M-18. The visual no-blank
  interval result remains pending and is not claimed from HTTP evidence.
- **Achievement:** Production implementation, repository validation and live
  resource verification complete.
- **Partial/deferred:** M-18 remains open for runtime acceptance; M-19 remains
  OPEN; custom domain/DNS, visitor measurement and subscription/digest
  infrastructure remain deferred.
- **Next goal:** Obtain browser confirmation of continuous visual ticker
  transition and then close M-18 only if that acceptance passes.

## M-18 Phase 1 — Global Announcements Intelligence

- **Date:** `2026-09-06`.
- **Status:** **IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING.**
- **Diagnostic:** The baseline contained 10 announcements: 9
  `GPIR_CLASSIFIED` and 1 `SOURCE_VERIFICATION_REQUIRED`. Nine classified
  records had permanent intelligence pages, but only four announcement and four
  intelligence identities were in the canonical registry. The static search
  index had no announcement entries, ASK GPIR had no announcement-specific
  resolver, and no scheduled ingestion mechanism existed.
- **Existing capabilities reused:** Trust-engine publication filtering, the
  existing announcement renderer/ticker, source-linked intelligence generator,
  canonical registry, static content search, deterministic ASK GPIR shell,
  trusted-source registry, sitemap generation and existing validators.
- **Implementation:** Added explicit lifecycle/publication fields to all 10
  records using only existing dates and stable IDs; kept all records `CURRENT`
  because no validated superseding cycle exists. Added 5 missing source
  identities and 5 missing announcement/intelligence pairs to the registry for
  the 9 published records. Extended content search and ASK GPIR with structured
  announcement retrieval. Added the generated `pages/intelligence/index.html`
  archive with Current Alerts, Historical Publications and Awaiting Verification
  sections. Added lifecycle facts to generated intelligence pages and a
  report-only refresh foundation that does not mutate content or claim a
  cadence.
- **Data integrity:** Original announcement IDs, content, ordering, source
  references and URLs remain unchanged. The Qatar verification-required record
  has no invented publication date, source, page, registry identity or archive
  placement.
- **Phase status:** M-18.1 ticker continuity `IMPLEMENTED / LIVE ACCEPTANCE
  PENDING`; M-18.2 data/lifecycle `IMPLEMENTED / VALIDATED`; M-18.3 historical
  archive `IMPLEMENTED / LIVE HTTP VERIFIED`, with no validated historical
  records currently available; M-18.4 search plus ASK GPIR `IMPLEMENTED /
  STATICALLY VALIDATED`; M-18.5 automated refresh `FOUNDATION ONLY / NOT
  SCHEDULED`.
- **Files changed:** `assets/data/announcements.json`,
  `assets/data/content-model.json`, `assets/data/content-registry.json`,
  `assets/js/announcements.js`, `assets/js/content-search.js`,
  `assets/js/script.js`, `index.html`, `pages/intelligence/*`,
  `scripts/generate-intelligence-pages.js`, `scripts/validate-announcements.js`,
  `scripts/refresh-announcements.js` and `sitemap.xml`.
- **Validation:** All edited JavaScript syntax checks, targeted M-18
  announcement validation, content validation, link validation, M-27A
  validation and `git diff --check` passed. The performance audit reported
  three pre-existing advisory warnings unrelated to this work.
- **Release:** Production commit `52c3ce6`, pushed to `origin/main`.
- **Live verification:** Homepage, generated archive, representative
  intelligence page, announcement data, content registry, content search and
  ASK GPIR runtime assets returned HTTP 200. Public bytes contain the Phase 1
  archive, lifecycle contract, search extension and deterministic resolver.
- **Browser acceptance:** Automated browser execution is unavailable and human
  browser acceptance was not supplied. No visual or interaction acceptance is
  claimed from HTTP evidence.
- **Overall M-18:** **OPEN / IMPLEMENTED-PENDING.** M-18 is not fully achieved.
- **Deferred:** Verified scheduled ingestion, 8-hour cadence claims, historical
  supersession records, browser acceptance, M-19, custom domain/DNS, visitor
  measurement and subscription/digest infrastructure.
- **Next goal:** Browser-validate the archive, ticker, search and ASK GPIR;
  then make a separate architecture decision for scheduled ingestion.

## M-18.4A — Production Release + Live Acceptance

- **Date:** `2026-09-06`.
- **Objective:** Complete the M-18.4A production release for the GPIR-styled Global Announcements archive and announcement-aware search, then verify the live GitHub Pages deployment without claiming browser acceptance from HTTP alone.
- **Defects confirmed:** Archive page remained a raw generator stub; generic GPIR results outranked structured announcement entries; ASK GPIR and normal Search did not share the same deterministic announcement intent contract; trailing whitespace remained in the generated archive output.
- **Implementation:** Integrated the GPIR-styled archive into the generator and live page output, added deterministic announcement-intent detection before broad relevance scoring, aligned ASK GPIR with the same announcement contract, preserved existing lifecycle/source trust rules, and added the targeted Node validation script for announcement-intent coverage.
- **Files changed:** `index.html`, `scripts/generate-intelligence-pages.js`, `assets/css/page.css`, `assets/js/content-search.js`, `assets/js/script.js`, `scripts/test-announcement-intent.js`.
- **Validation results:** `node scripts/test-announcement-intent.js` passed (`11/11` checks); `node --check assets/js/announcements.js` passed; `node --check assets/js/content-search.js` passed; `node --check assets/js/script.js` passed; `node scripts/validate-announcements.js` passed; `node scripts/validate-content.js` passed; `node scripts/validate-links.js` passed; `node scripts/m27a-validate.js` passed; `git diff --check` passed.
- **Production commit:** `49751cdf215071d550d58682b31dafc397fad446` — `M-18.4A Integrate announcement archive and search intent`.
- **Push status:** `origin/main` updated successfully.
- **Live HTTP verification:** `https://krishnan-vishal.github.io/` returned HTTP 200; `https://krishnan-vishal.github.io/pages/intelligence/index.html` returned HTTP 200; deployed HTML contains the Global Announcements archive content and the GPIR layout labels.
- **Browser acceptance:** `BROWSER TOOLING UNAVAILABLE` in this environment; browser verification of archive layout, search results, ASK GPIR, and ticker movement remains pending and is not claimed from HTTP evidence alone.
- **Search acceptance:** Static checks passed for the required announcement queries; live browser acceptance remains pending because browser automation is unavailable.
- **Archive acceptance:** Live HTTP confirms the deployed archive page is present and served; visual GPIR browser acceptance remains pending.
- **ASK GPIR acceptance:** Live HTTP served the site and the deterministic resolver logic remained aligned with the same announcement contract; browser-confirmed resulting content remains pending.
- **M-18.1 status:** `IMPLEMENTED / LIVE ACCEPTANCE PENDING`.
- **M-18.2 status:** `ACHIEVED`.
- **M-18.3 status:** `IMPLEMENTED / LIVE HTTP VERIFIED`.
- **M-18.4 status:** `IMPLEMENTED / STATICALLY VALIDATED`.
- **M-18.4A status:** `IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING`.
- **M-18.5 status:** `FOUNDATION ONLY / NOT SCHEDULED`.
- **Overall M-18 status:** `OPEN` pending browser acceptance and the separate M-18.5 architecture milestone.
- **Next milestone:** `M-18.5 — GLOBAL ANNOUNCEMENT REFRESH ARCHITECTURE`.

## M-18.4B — Final Reader Intelligence Refinement

- **Date:** `2026-09-06`.
- **Objective:** Correct the remaining M-18.4A reader issues without rebuilding the announcement system, changing ticker architecture, introducing generative AI or inventing data.
- **Issues addressed:** Replaced stale refresh wording with `Last validated publication cycle` and `Refresh automation: Not yet scheduled`; made intelligence pages explicitly structured around GPIR Summary, Why It Matters, GPIR Reader View, Source and related intelligence; made lifecycle labels explicit without treating age as historical; improved announcement Search cards; restricted related intelligence to explicit registry relationships; and reused the homepage footer architecture for archive and intelligence pages.
- **FATF benchmark:** The FATF payment-transparency announcement retains its source-verified status, confidence, content status, lifecycle, summary, why-it-matters text, publication metadata, original source and GPIR reader mapping.
- **Archive state:** 9 validated current records remain in Current Alerts, Qatar remains Awaiting Verification, and Historical Publications remains an honest zero-history state.
- **Trust/provenance:** Announcement source organisation, publication title, original URL, publication date, retrieval date, source verification and content status remain sourced from existing structured records. No source-verification-required record was published.
- **Files changed:** Announcement/archive/search/reader scope only: `assets/css/header.css`, `assets/css/page.css`, `assets/js/announcements.js`, `assets/js/content-search.js`, `assets/js/script.js`, `index.html`, generated `pages/intelligence/*.html`, `scripts/generate-intelligence-pages.js`, and `scripts/test-announcement-intent.js`.
- **Validation:** Targeted announcement contract checks passed; announcement, content, link and M-27A validators passed; all required JavaScript syntax checks passed; `git diff --check` passed.
- **Production commit:** `51210bec14750deb7bbda9e27cd5ad513aa1c797` — `M-18.4B Finalise announcement reader intelligence`.
- **Live HTTP:** Homepage, Global Announcements archive and FATF intelligence page returned HTTP 200. Deployed bytes contain the archive sections, truthful freshness architecture, FATF reader structure and shared footer classes.
- **Browser acceptance:** Required human browser acceptance was not available in this environment. No visual, mobile, ticker-motion, Search, ASK GPIR or homepage-regression browser pass is claimed from HTTP evidence.
- **M-18.4B status:** `IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING`.
- **Overall M-18 status:** `OPEN`; M-18 is not closed by this release.
- **M-18.5 readiness:** The current report-only foundation remains `FOUNDATION ONLY / NOT SCHEDULED`; no crawler, backend, scheduled ingestion or GitHub Actions refresh was added.

## M-20 — Intelligence Lifecycle Foundation

- **Date:** `2026-09-07`.
- **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Objective:** Establish deterministic, backward-compatible lifecycle support
  for `CURRENT`, `DEVELOPING` and `HISTORICAL` GPIR intelligence without
  changing the static public architecture or existing URLs.
- **Implementation:** Extended the shared content-model vocabulary and content
  documentation; made the existing unvalidated Qatar review record explicitly
  `DEVELOPING`; added lifecycle, publication-state, optional effective/validation
  date and reciprocal-lineage checks; and made ticker, generator and search
  consume only eligible CURRENT records while retaining historical discovery.
- **Preservation:** Existing validated records and URLs remain unchanged.
  M-18-4C redirect protection, report-only refresh, historical sitemap
  preservation and rollback-safe generation remain intact.
- **Deferred:** Immutable edition/version snapshots and new scheduled ingestion
  are deliberately excluded from M-20.

## M-21 — Continuous Intelligence Pipeline Foundation

- **Date:** `2026-09-07`.
- **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Objective:** Reduce manual source inspection through scheduled, trusted,
  deterministic candidate discovery while keeping the public GPIR site static.
- **Implementation:** Kept `refresh-announcements.js` report-only; added a
  candidate-only proposal builder, validated non-public candidate queue and a
  two-hour GitHub Actions workflow that updates only an automation proposal
  branch and pull request when genuinely new candidates exist.
- **Safety:** Candidate source URLs are approved-domain checked, redirect-safe
  refresh reports are reused, candidate IDs deduplicate unchanged feed items,
  and failures leave current/historical publications untouched.
- **Deferred:** No endpoints were invented, and no AI classification, automatic
  publication, backend, database or public live feed was added.

## M-22 — Country Intelligence Scale Foundation

- **Date:** `2026-09-07`; **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Implementation:** Added canonical metadata for six existing country pages:
  ISO identity, GPIR regional aggregation, lifecycle, section availability and
  native/generated-page mode. The content gate validates the model and M21
  candidate proposals can associate trusted country sources deterministically.
- **Preservation:** Existing country pages, URLs, market-specific prose, M20
  lifecycle boundaries and M21 human-review publication controls are unchanged.
- **Deferred:** No broad country population, page generation, navigation or
  search redesign is introduced.

## M-23 — Global Announcements Continuous Intelligence

- **Date:** `2026-09-07`; **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Implementation:** Activated the existing M21 scheduled proposal flow with
  the manually verified official RSS endpoints for RBI press releases, RBI
  notifications and ECB MID. Candidate provenance now records source authority,
  official item URL, final approved endpoint, source date when available and
  retrieval timestamp.
- **Preservation:** The report-only refresh reader, trusted-domain/redirect
  boundary, deterministic deduplication, proposal branch/PR review, lifecycle
  controls and static publication architecture remain unchanged. Search GPIR
  and ASK GPIR continue to consume only approved published announcements.
- **Deferred:** Broader source expansion and human-reviewed candidate promotion
  are separate controlled milestones; no automatic publication was introduced.

## M-23.1 — Global Intelligence Radar Expansion

- **Date:** `2026-09-07`; **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Implementation:** Reused the existing M21 scheduler and candidate queue;
  introduced registry-ready operational metadata, a rolling <=24-hour discovery
  target, deterministic payments relevance and title/date event fingerprints.
  Added the verified official HKMA JSON press-release endpoint alongside the
  existing RBI and ECB feeds.
- **Safety:** URL and event deduplication are incremental; source failures stay
  isolated and are reported in the workflow summary. Discovery sources remain
  distinct from authoritative validation sources, all candidates stay
  DEVELOPING/non-public, and public pages/search/ASK GPIR consume only reviewed
  publication records.
- **Limit:** GPIR does not claim universal real-time coverage. Additional
  regional sources require manual endpoint verification and configuration; no
  backend, database, AI runtime, personal mailbox or second scheduler exists.

## GPIR-OPS-01 — implementation opened

- Date: 2026-09-08. Category: Platform / Operations / Governance. Status: IN PROGRESS.
- Owner objective: repository-native cloud-first handoff and master control, with no production change.
- Branch: work/gpir-ops-01-cloud-handoff-master-control; base origin/main at 7190552.
- Existing governance/status/backlog inspected; no equivalent cloud-first SOP found.
- Validation, commit, push, PR and owner approval: PENDING. Completion date: NOT RECORDED.

## 2026-09-08 — Master control reconciliation

This appended evidence record supersedes older pending/current claims without rewriting
those historical entries. Dates below are merge dates from Git, not invented live
acceptance dates. GitHub check-run metadata was read on 2026-09-08. MERGED means the
scoped increment is integrated; deferred work is not implicitly complete.

### M20 — Intelligence Lifecycle Foundation

- Category: Intelligence / Governance. Status: MERGED. Completion/merge date: 2026-09-07.
- Branch: `work/m20-intelligence-lifecycle-foundation`; implementation: `cb48a93`; merge: `2637411`.
- PR: [#293](https://github.com/krishnan-vishal/krishnan-vishal.github.io/pull/293).
- Capability/outcome: Lifecycle vocabulary and historical-page retention.
- Gate: [Security and Integrity succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34102096309) at the merge commit; Pages build/deploy checks also succeeded.
- Production impact: existing static Pages architecture retained; candidate discovery does not publish unvalidated intelligence.
- Deferred/open items and next objective: No deletion; future immutable editions remain deferred.

### M21 — Continuous Intelligence Pipeline Foundation

- Category: Automation. Status: MERGED. Completion/merge date: 2026-09-07.
- Branch: `work/m21-continuous-intelligence-pipeline`; implementation: `50fdb20`; merge: `a7d5f14`.
- PR: [#295](https://github.com/krishnan-vishal/krishnan-vishal.github.io/pull/295).
- Capability/outcome: Two-hour candidate proposal workflow; human publication boundary.
- Gate: [Security and Integrity succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34103335430) at the merge commit; Pages build/deploy checks also succeeded.
- Production impact: existing static Pages architecture retained; candidate discovery does not publish unvalidated intelligence.
- Deferred/open items and next objective: No automatic publication; endpoint expansion was deferred.

### M22 — Country Intelligence Scale Foundation

- Category: Data / Scaling. Status: MERGED. Completion/merge date: 2026-09-07.
- Branch: `work/m22-country-intelligence-scale`; implementation: `a771932`; merge: `8857210`.
- PR: [#298](https://github.com/krishnan-vishal/krishnan-vishal.github.io/pull/298).
- Capability/outcome: Six-country canonical metadata and candidate association.
- Gate: [Security and Integrity succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34104514472) at the merge commit; Pages build/deploy checks also succeeded.
- Production impact: existing static Pages architecture retained; candidate discovery does not publish unvalidated intelligence.
- Deferred/open items and next objective: Broad country population remains separate work.

### M23 — Global Announcements Continuous Intelligence activation

- Category: Intelligence / Automation. Status: MERGED. Completion/merge date: 2026-09-07.
- Branch: `work/m23-global-announcements-live-intelligence`; implementation: `317aef0`; merge: `0975f3c`.
- PR: [#300](https://github.com/krishnan-vishal/krishnan-vishal.github.io/pull/300).
- Capability/outcome: RBI and ECB official feeds activated for candidate discovery.
- Gate: [Security and Integrity succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34106657046) at the merge commit; Pages build/deploy checks also succeeded.
- Production impact: existing static Pages architecture retained; candidate discovery does not publish unvalidated intelligence.
- Deferred/open items and next objective: Source availability and human review remain constraints.

### M23.1 — Global Intelligence Radar Expansion

- Category: Intelligence / Scaling. Status: MERGED. Completion/merge date: 2026-09-07.
- Branch: `work/m23-1-global-intelligence-radar`; implementation: `a411fbd`; merge: `3450537`.
- PR: [#302](https://github.com/krishnan-vishal/krishnan-vishal.github.io/pull/302).
- Capability/outcome: HKMA endpoint, relevance and event deduplication.
- Gate: [Security and Integrity succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34110235738) at the merge commit; Pages build/deploy checks also succeeded.
- Production impact: existing static Pages architecture retained; candidate discovery does not publish unvalidated intelligence.
- Deferred/open items and next objective: Scheduled discovery subsequently failed; M23.1A provides repair.

### M23.1A — Radar Repair + APAC Discovery Expansion

- Category: Fix / Intelligence. Status: MERGED. Completion/merge date: 2026-09-08.
- Branch: `work/m23-1a-radar-repair-apac`; implementation: `42fb2a6`; merge: `14b3815`.
- PR: [#305](https://github.com/krishnan-vishal/krishnan-vishal.github.io/pull/305).
- Capability/outcome: CDATA title repair, 30 source additions and secondary provenance.
- Gate: [Security and Integrity succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34187112399) at the merge commit; Pages build/deploy checks also succeeded.
- Production impact: existing static Pages architecture retained; candidate discovery does not publish unvalidated intelligence.
- Deferred/open items and next objective: Most new sources are manual references; English relevance and queue capacity remain limits.

M23.1 scheduled discovery failures are separately evidenced by [run 34180581113](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34180581113). A successful integrity/deploy gate is not evidence that every subsequent scheduled source retrieval succeeded. Post-repair scheduled-discovery acceptance: NOT RECORDED in this reconciliation.

### Custom domain — FINTECHOISIS production configuration

- Category: Platform / Production. Milestone ID: NOT RECORDED.
- Status: CNAME COMMITTED / PAGES DEPLOYED. Commit date: 2026-09-08.
- Commit: `7190552` (Create CNAME); branch observed: main; PR: NOT RECORDED.
- Outcome/production impact: CNAME contains `fintechoisis.com`; custom-domain configuration exists in the repository. No DNS changes were made by GPIR-OPS-01.
- Gate: [integrity succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34188429808); [Pages build/deploy succeeded](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/34188428988).
- Open/next: DNS ownership, exact external activation time and separate live-browser acceptance are UNKNOWN / NOT RECORDED; do not infer them from CNAME alone.

### Earlier cloud-first recovery / development transition

- Category: Platform / Operations. Status: NOT RECORDED as a completed repository milestone.
- Milestone ID, completion date, branch, commit, PR and gate: UNKNOWN / NOT RECORDED.
- Evidence: prior log entries mention Codespace limitations, but do not establish a completed cloud-first operating transition.
- Outcome/production impact: no historical migration or platform setting is claimed.
- Next objective: GPIR-OPS-01 documents the shared operating model; actual environment authentication remains a platform prerequisite.

### GPIR-OPS-01 — Cloud-First Development, Tool Handoff & Master Control

- Category: Platform / Operations / Governance. Owner: Vishal Krishnan.
- Objective: make development cloud-first, tool-neutral and recoverable while preserving GitHub authority, human publication control and AI-independent production.
- Status: IN PROGRESS; implementation date: 2026-09-08; completion date: PENDING MERGE.
- Branch: `work/gpir-ops-01-cloud-handoff-master-control`; base: `origin/main` at `7190552`.
- Implementation commit: PENDING (resolve by the requested commit subject on this branch); PR: NOT CREATED; Actions: NOT RUN.
- Delivered: common handoff in PROJECT_STATUS, consolidated SOP and approval model in DEVELOPMENT_GOVERNANCE, AGENTS discovery pointers, this evidence reconciliation and backlog entry.
- Files modified: AGENTS.md; docs/DEVELOPMENT_GOVERNANCE.md; docs/PROJECT_STATUS.md; docs/MASTER_PROJECT_LOG.md; docs/GPIR_BACKLOG.md. Files created: none in repository.
- Validation: PENDING final documentation review.
- Production impact: NONE; runtime, data, validators, workflows, hosting, DNS and CNAME unchanged.
- Blocker/next dependency: local GitHub authentication previously failed; validate then attempt push and PR. GitHub Actions and Vishal approval remain required. No merge authorized.

### GPIR-OPS-01 — local review readiness

- Date: 2026-09-08. Status: READY FOR REVIEW, not COMPLETE.
- Validation: PASS — git diff --check; six added relative Markdown links/anchors; five documentation-only paths; high-confidence secret scan and manual private-data/diff review.
- Existing generation/publication contracts remain intact by unchanged-file scope; runtime tests were not rerun for documentation-only edits.
- Commit/push/PR: pending submission. Actions: NOT RUN. Vishal approval remains required.

### GPIR-OPS-01 — submission checkpoint

- Date: 2026-09-08. Implementation commit: 60115c7. Status: READY FOR REVIEW.
- Push failed with exit 1 and no diagnostic output; remote branch lookup returned no branch. Cause of this attempt is unconfirmed; prior local credential-store failures are known.
- PR: NOT CREATED; GitHub Actions: NOT RUN. Branch remains local, not a durable cloud handoff.
- Remaining: authenticated push and PR, Actions, then Vishal review/merge. A recovery bundle is BCP only. Production unchanged.

### M24 — Global Intelligence Coverage & Reader Integration

- Category: Intelligence / Reader Capability. Owner: Vishal Krishnan.
- Objective: expand the existing GPIR intelligence radar beyond APAC into GCC, Europe/UK, North America, LATAM, Africa and CIS/Central Asia, and connect qualified intelligence more completely across Global Announcements, Country/Region association, Search GPIR and ASK GPIR, using only the existing architecture. Explicitly does not rebuild M20, M21, M22, M23, M23.1, M23.1A, Search GPIR, ASK GPIR or GPIR-OPS-01.
- Status: IN PROGRESS during implementation; READY FOR REVIEW at this checkpoint. Completion date: PENDING owner review/merge.
- Branch: `work/m24-global-intelligence-reader-integration`; base: `origin/main` at `8a3726e` (includes merged GPIR-OPS-01, PR #311). Implementation commit: identify by subject `M-24 Expand global intelligence coverage and reader integration` on this branch; PR: prepared, not yet created/merged at the time this entry was written.
- Environment constraint recorded honestly: this session's network egress is blocked by the environment's outbound proxy (confirmed by direct `WebFetch` failures against `bankofengland.co.uk`, `federalreserve.gov`, `bankofcanada.ca`, `centralbank.ae` and `bis.org`, each returning `EGRESS_BLOCKED`). No new machine-readable endpoint (RSS/JSON `refreshEndpoint`) was added or claimed as a result — every new trusted-source entry is recorded `active: false` / `discoveryStatus: SOURCE_UNSUPPORTED` with a discovery note disclosing that no live verification fetch was possible this session. No new production announcement was published, because a new dated/sourced news item cannot be verified without network access; M24 instead strengthens the existing pipeline and demonstrates it with an existing qualified record plus non-production fixtures, exactly as the M24 objective's acceptance-test section permits.
- Region/source expansion delivered: 46 new `assets/data/trusted-sources.json` registry entries — Middle East/GCC (Bahrain, Oman, Kuwait, Qatar, Jordan, Egypt, Lebanon central banks), Europe/UK (Bank of England, FCA, PSR, EBA, Banque de France, Bundesbank, Banca d'Italia, Banco de España, DNB, NBB, SNB, Sveriges Riksbank, Norges Bank, Danmarks Nationalbank, NBP, EPC), North America (Federal Reserve, FinCEN, The Clearing House, Bank of Canada, FINTRAC, Payments Canada, Banxico), LATAM (BCB Brazil, BCRA Argentina, Banco Central de Chile, Banco de la República Colombia, BCRP Peru, BCU Uruguay), Africa (SARB, CBN Nigeria, CBK Kenya, Bank of Ghana, Bank Al-Maghrib, Bank of Tanzania, Bank of Uganda, National Bank of Rwanda), CIS/Central Asia (National Bank of Kazakhstan, Central Bank of Uzbekistan). Registry total: 42 -> 88 sources; `node scripts/gpir-source-health-report.js` reports 6 active machine-readable sources (all pre-existing: `rbi-press-releases`, `rbi-notifications`, `ecb-mid`, `hkma-press-releases`, `sfa`, `fintech-australia`) and 74 known-but-unsupported manual-discovery-only sources across the newly covered regions, honestly labelled rather than fabricated.
- Country/Region integration delivered: added `region:europe` (sourceRef `assets/data/sepa-countries.json`, page `pages/regions/europe.html`), `region:americas` (`assets/data/americas-countries.json`, `pages/regions/americas.html`), `region:latam` (`assets/data/latam-countries.json`, `pages/regions/latam.html`) and `region:africa` (`assets/data/africa-countries.json`, `pages/regions/africa.html`) to `assets/data/content-registry.json`, reusing existing M22-era country-metadata files and existing region page shells rather than creating new content. `country:united-kingdom` now carries its first `REGION` relationship, to `region:europe` — closing backlog `REGION-002`. No dashboard, country page or research content was created for a country that does not already have one.
- Relevance logic extended: `scripts/propose-intelligence-candidates.js` `isPaymentsRelevant()` now also matches "payment orchestration", "payment API(s)", "acquiring", "ISO 20022", "PSP"/"MSB"/"MTO" and "payment licens(e/ing/ure)"; five new title-only assertions added to `scripts/test-intelligence-radar.js`. No runtime AI dependency was introduced; relevance logic remains deterministic regex.
- Source-health reporting added: `scripts/gpir-source-health-report.js` (new, read-only, not wired into `.github/workflows/continuous-intelligence.yml`) reports configured/active/unsupported counts by region and discovery role, active sources never yet observed, and registry id-uniqueness, without contacting any endpoint.
- Reader-visible acceptance test added: `scripts/test-m24-reader-integration.js` (new) demonstrates, using the existing published `rbi-payments-vision-2028` record plus the new region wiring, that a real qualified development already connects to Global Announcements (publication/lifecycle gate and reader-visible fields), Country/Region association (via the canonical registry relationship, not a duplicated record), the same inclusion rule Search GPIR's index uses, the same country-term/source-resolution logic ASK GPIR uses, and lifecycle/provenance metadata. It also exercises event-fingerprint/canonical-URL dedup and per-source failure isolation against a newly added M24 registry entry (`cbb-bahrain`), and confirms all 9 pre-existing published announcements remain present.
- Existing capability confirmed, not rebuilt: `assets/js/announcements.js` already renders country/region/topic/date/source/lifecycle/provenance on every ticker card and detail panel; `assets/js/script.js`'s Search GPIR index and ASK GPIR assistant already read `announcements.json`/`content-registry.json` live via `fetch()`, so any future new published record needs no further JS wiring to reach them. `assets/js/script.js`'s ASK GPIR `countryTerms` array is currently a hardcoded 6-country list (`india, singapore, uae, ..., saudi arabia, qatar`) — it was intentionally left unmodified this milestone because no new country announcement was published that would need it; generalizing it is recorded below as a known follow-on item rather than spec-implemented against no corresponding data.
- Files modified: `assets/data/content-registry.json`, `assets/data/trusted-sources.json`, `scripts/propose-intelligence-candidates.js`, `scripts/test-intelligence-radar.js`, `docs/PROJECT_STATUS.md`, `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`. Files created: `scripts/gpir-source-health-report.js`, `scripts/test-m24-reader-integration.js`. Files deliberately not modified: `assets/data/announcements.json` (no new/edited public announcement), `assets/js/*` (no runtime reader code change), `.github/workflows/*`, `CNAME`, any DNS/hosting configuration.
- Validation (all run locally on this checkpoint, none weakened): `node --check` on every added/edited script; `node scripts/validate-content.js` (passed: 10 announcements, 0 intelligence candidates, 6 country records, 88 trusted sources, 43 registry records); `node scripts/validate-links.js`; `node scripts/validate-announcements.js`; `node scripts/test-announcement-intent.js`; `node scripts/test-intelligence-radar.js` (radar/candidate-gate/relevance/provenance/failure-isolation regressions, including the five new M24 relevance assertions); `node scripts/test-m24-reader-integration.js` (new M24 acceptance test, five checks); `node scripts/gpir-source-health-report.js` (report-only); `node scripts/gpir-perf-audit.js`; `git --no-pager diff --check`; manual review of the diff for credentials/secrets/tokens. Exact pass/fail results for this checkpoint are recorded at push time below.
- Production impact: none. Static data (`content-registry.json`, `trusted-sources.json`), dev-time scripts and documentation only; no HTML/CSS/runtime-JS page, hosting, DNS, CNAME or GitHub Actions workflow file changed; no public announcement published; no historical record altered or removed.
- Degraded/known gaps (stated honestly, not claimed as complete): coverage across GCC/Europe/UK/North America/LATAM/Africa/CIS is source-registry-only (46 organizations recorded, all inactive/manual-discovery pending future endpoint verification) — GPIR makes no claim of active `<=24h` discovery for these regions, only for the six pre-existing active sources. No country-metadata registry record (M22-style `country:*`) or dashboard exists yet for any of the newly added regions beyond the existing six native countries plus the four new REGION shells; ASK GPIR's `countryTerms` list remains a 6-country hardcode pending a future country-scoped announcement. No new machine-readable endpoint was verified or activated because this session had no network egress; a future environment with source-verification access should confirm and activate specific feeds per organization before candidate discovery can run against them.
- Deferred/open: DATA-001 (broader structured registry coverage), SEARCH-001, READER-001, DASH-002/003/006/008, HIST-001 and PORTFOLIO-001 remain open exactly as before this milestone; M-18 and M-19 remain OPEN; custom domain/DNS work remains out of scope and untouched.

### M28-FX — FX Pricing & Treasury Intelligence

- Category: Reader Experience / Data / Automation. Owner: Vishal Krishnan.
- Objective: a compact automated FX ticker plus a complete FX Pricing & Treasury reader section (currency-pair detail views, previous-business-day variance, weekly quantitative trend, an immutable daily historical archive) on a provider-adapter architecture, with no invented/synthetic/stale-presented-as-live rate ever published. Does not redesign GPIR's navigation, header, footer, design language, historical-publication principle, validators or deployment architecture.
- Milestone numbering: M24–M27C were already occupied (confirmed by grepping this log, `PROJECT_STATUS.md` and `GPIR_BACKLOG.md` for every `M-2[4-9]` token before starting); M28 was the first free top-level number.
- Status: IMPLEMENTED and locally validated; NOT pushed and no PR opened, per this milestone's own explicit instruction ("Do not push, merge, delete branches ... unless explicitly instructed").
- Branch: `work/m28-fx-pricing-treasury-intelligence` (local only); base: `origin/main` at `27df7c5` (includes the merged Global Announcements freshness fix, PR #322). Implementation commit: PENDING — this branch has not been committed/pushed at the time this entry was written; identify any future commit by subject `M-28-FX ...` on this branch.
- Provider-adapter architecture delivered: `scripts/fx/providers/reference.js` is a real, keyless adapter for `https://open.er-api.com/v6/latest/USD` — the same public endpoint `assets/js/fx-ticker.js` already called directly from the browser in production before this milestone, now moved server-side per the milestone's secure-refresh architecture so a future licensed provider's credentials never reach client JavaScript. `xe.js`, `ibrlive.js`, `lseg.js`, `bloomberg.js` (via a shared `licensed-provider-base.js` factory) are genuine, testable adapter contracts gated on `FX_XE_API_KEY`, `FX_IBRLIVE_API_KEY`, `FX_LSEG_API_KEY`/`FX_LSEG_API_SECRET`, `FX_BLOOMBERG_API_KEY` (GitHub Actions secrets only, never committed, never sent to the browser) — each reports `NO_PROVIDER_CONFIGURED` cleanly when uncredentialled, and deliberately throws `PROVIDER_INTEGRATION_NOT_YET_IMPLEMENTED` rather than guess at an unverified vendor request/response shape if a credential is ever present without a corresponding real implementation. `providers/index.js` defines `PROVIDER_PRIORITY` (lseg -> bloomberg -> xe -> ibrlive -> reference).
- Core engines delivered: `scripts/fx/business-day.js` (previous-valid-business-day resolution with weekend/holiday rollover, never comparing against a weekend date and never guessing a missing close); `scripts/fx/normalize-validate.js` (the common record schema, and deterministic validators for non-numeric rates, bid>ask, malformed ISO currency codes, future timestamps, staleness by provider type, extreme movement beyond a configurable threshold, and duplicate-record detection — anomalies are quarantined with their reason recorded, never silently dropped); `scripts/fx/weekly-summary.js` (deterministic open/high/low/close/range/direction observations from archived closes only, explicitly separated from any editorial/market-driver commentary, honest about insufficient history).
- Orchestration delivered: `scripts/fx/generate-fx-snapshot.js` walks the provider priority list, normalizes, computes previous-business-day variance from `assets/data/fx/history/`, validates/quarantines, writes `assets/data/fx/current.json` and `assets/data/fx/weekly-summary.json`, and freezes the outgoing day's snapshot into `assets/data/fx/history/YYYY/MM/YYYY-MM-DD.json` the first time a run notices the calendar date has moved on — verified by test to never overwrite an existing history file. If every provider fails, it falls back to the last validated snapshot on disk with every record's `dataStatus` escalated to `STALE` rather than fabricating data or silently republishing a stale snapshot as current.
- No-Credential Mode verified for real: this session has neither provider credentials nor network egress. Running `node scripts/fx/generate-fx-snapshot.js` for real (no mock) produced `dataStatus: "NO_PROVIDER_CONFIGURED"` for all 26 featured pairs, with the reference-provider attempt genuinely failing with `REFERENCE_PROVIDER_UNAVAILABLE: HTTP 403` (this environment's egress proxy) — the same honest failure pattern already documented for M24's WebFetch calls. The committed `assets/data/fx/current.json` is that real output, not a simulated placeholder. The identical code is expected to succeed against the keyless reference provider on a GitHub Actions runner with normal internet access, since that endpoint is already proven in production by the ticker this milestone replaced.
- Reader surfaces delivered: `scripts/generate-fx-pages.js` (mirrors `scripts/generate-intelligence-pages.js`'s shared header/footer template-extraction pattern, including a depth-3 path-rewrite fix for `pages/fx/pairs/*.html` caught and fixed via `node scripts/validate-links.js`) generates `pages/fx/index.html` (Live FX), `explorer.html` (Currency Explorer), `treasury.html` (Treasury Intelligence — deterministic GCC-pegged/INR-corridor/USD-funding/major-cross groupings), `weekly.html` (Weekly Trends), `historical.html` (year/month archive navigation) and one `pages/fx/pairs/{slug}.html` per featured pair (LAST/MID/BID/ASK/SPREAD/SPOT/TOM/CASH BUY/CASH SELL/previous-close/variance/provider/rate-type/timestamp, a dependency-free inline-SVG 7-day sparkline, and a link into Historical). `assets/js/fx-app.js` (new) powers all of these views, fetching each dataset on demand rather than embedding it, so the homepage never loads historical data. `assets/js/fx-ticker.js`'s FX ticker was redesigned to read the generated `current.json` (no direct provider call from the browser), render the compact `PAIR RATE ▲/▼/— change%` format, pause on hover and keyboard focus (new `:focus-within` CSS rule, since ticker items are now real links), and respect `prefers-reduced-motion` (existing rule, unaffected). `index.html`'s existing "Financial Intelligence" and "Market Intelligence" mega-menu columns were extended/repointed to the new pages (no redundant top-level menu added), and `#fx-ribbon`'s heading was corrected from "LIVE FX RATES" to "FX MARKET SNAPSHOT" plus a "View FX Pricing & Treasury" link, matching the milestone's ban on overclaiming streaming real-time coverage.
- Governance decision flagged, not unilaterally finalized: `.github/workflows/fx-market-data.yml` commits a validated FX snapshot directly to `main` (objective, deterministically validated market data, not editorial classification) rather than via the review-PR model `continuous-intelligence.yml` uses for editorial candidate intelligence. This is recorded as a decision requiring Vishal's confirmation in `docs/FX_PRICING_TREASURY.md`, with the alternative (PR-gated) model described there if preferred.
- Files created: `assets/data/fx/fx-config.json`; `scripts/fx/business-day.js`, `normalize-validate.js`, `ticker-format.js`, `weekly-summary.js`, `generate-fx-snapshot.js`; `scripts/fx/providers/index.js`, `reference.js`, `xe.js`, `ibrlive.js`, `lseg.js`, `bloomberg.js`, `licensed-provider-base.js`; `scripts/validate-fx.js`; `scripts/test-fx.js`; `scripts/generate-fx-pages.js`; `assets/js/fx-app.js`; `.github/workflows/fx-market-data.yml`; `docs/FX_PRICING_TREASURY.md`; `pages/fx/index.html`, `explorer.html`, `treasury.html`, `weekly.html`, `historical.html`; `pages/fx/pairs/*.html` (26 pages). Generated data: `assets/data/fx/current.json`, `assets/data/fx/weekly-summary.json`.
- Files modified: `assets/js/fx-ticker.js`, `assets/css/market.css`, `index.html` (mega-menu entries, `#fx-ribbon` heading/link, cache-bust version bumps), `docs/PROJECT_STATUS.md`, `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`. A mechanical `fx-ticker.js?v=`/`market.css?v=` cache-bust version bump was applied to all 80 other existing pages that already load those shared files (no other content on those pages changed).
- Validation (all run locally, none weakened): `node --check` on every added/edited script; `node scripts/validate-fx.js` (passed); `node scripts/test-fx.js` (8/8 groups passed: business-day/weekend-rollover/holiday, variance, record validation, duplicate detection, ticker formatting, provider failover with mocked network, historical immutability, weekly summary); `node scripts/validate-content.js` (passed, unaffected: 10 announcements, 88 trusted sources, 43 registry records); `node scripts/validate-links.js` (passed: 99 HTML files, including all 31 new FX pages — this is where the depth-3 pair-page path bug was caught and fixed); `node scripts/validate-announcements.js`; `node scripts/test-announcement-intent.js`; `node scripts/test-intelligence-radar.js`; `node scripts/test-m24-reader-integration.js` (all unaffected, still pass); `node scripts/gpir-perf-audit.js` (0 new warnings; the 4 existing advisories are pre-existing and unrelated).
- Production impact: none of GPIR's existing navigation, header, footer, design language, validators or deployment architecture was replaced. The homepage ticker's visual format and data source changed as specified by this milestone. No DNS/hosting/CNAME file touched. Not pushed to `origin`, so `main`/production is entirely unaffected until the owner explicitly asks for it to be pushed.
- Degraded/known gaps (stated honestly): no licensed live provider (LSEG/Bloomberg/XE/IBRLive) is actually integrated — each remains a genuine but unimplemented contract pending a real licence and verified vendor documentation; the currently active tier is the reference/fallback provider only, and every field a reference feed cannot supply (bid/ask/spread/spot/TOM/cash) renders "N/A" rather than being estimated. Per-pair historical drill-down links to the Historical archive rather than fetching every archived day inline. `assets/i18n/*.json` was not extended with new FX-page keys, consistent with how other body content (country/dashboard/announcement-archive pages) is not i18n-tagged. Per-market holiday calendars for the business-day engine are not populated; weekend rollover is fully implemented.
- Deferred/open: DATA-001, SEARCH-001, READER-001, DASH-002/003/006/008, HIST-001, PORTFOLIO-001 remain open exactly as before this milestone; M-18 and M-19 remain OPEN; custom domain/DNS work remains untouched. The FX-market-data direct-commit-to-main publish model awaits explicit owner confirmation (see above).

### M28-FX — governance correction (workflow publication model)

- Category: Governance / Automation. Owner: Vishal Krishnan.
- Correction only, on the same local, unpushed `work/m28-fx-pricing-treasury-intelligence` branch (commit `883e46b`) — no repository re-inspection, no M28-FX feature/UX change, PR #321 untouched.
- Issue: the M28-FX entry above records `.github/workflows/fx-market-data.yml` as committing/pushing a validated FX snapshot directly to `main`. That is inconsistent with this repository's established automation governance (`continuous-intelligence.yml`'s branch/PR review pattern; AGENTS.md's "no auto-merge... human review" boundary) and has been corrected before any push occurred — the direct-to-main design was never live in production.
- Fix: `fx-market-data.yml` now mirrors `continuous-intelligence.yml` exactly — reuses an existing `automation/fx-snapshot` branch if present, generates/validates the snapshot, pushes changes only to that branch (never `main`), and attempts `gh pr create` for human review. If PR auto-creation is unavailable (the same "Allow GitHub Actions to create and approve pull requests" repository-setting restriction diagnosed for `continuous-intelligence.yml` earlier this session), the run logs a warning and step-summary note and still succeeds rather than failing the job — the pushed branch remains available for a human to open the PR manually.
- Preserved unchanged: historical immutability (`freezeOutgoingSnapshotIfNewDay()` untouched), No-Credential Mode, provider security (env-var-only secrets, never echoed), all other M28-FX reader-facing functionality, and last-known-good production data (still entirely unaffected, since nothing has been pushed to `origin` and `main` was never written by the superseded design either).
- Files changed: `.github/workflows/fx-market-data.yml` (publication steps rewritten), `docs/FX_PRICING_TREASURY.md` (pipeline diagram and "Governance decision" section replaced with "Publication model"), `docs/PROJECT_STATUS.md` (corrected the flagged-decision bullet). This entry in `docs/MASTER_PROJECT_LOG.md`; `docs/GPIR_BACKLOG.md`'s M28-FX row outcome note also corrected.
- Validation run (scoped to this change only, no broad reconnaissance): YAML parse of `fx-market-data.yml` (`python3 -c "yaml.safe_load(...)"`) passed; `bash -n` on every extracted step script passed; `node scripts/validate-fx.js` passed (unaffected — no data schema changed); `node scripts/test-fx.js` passed (unaffected — no code under test changed); `git diff --check` clean; manual secret scan of the changed files found no credential pattern.
- Resulting publication flow: scheduled/dispatched run -> generate + validate snapshot -> push to `automation/fx-snapshot` (only if changed) -> propose/refresh a pull request for human review -> `main` updated only by an explicit human merge of that PR. No path from this workflow writes `main` directly.
- Commit: local only, on `work/m28-fx-pricing-treasury-intelligence`; not pushed, not merged, per explicit instruction.

### M28-FX Final — Variance & Global Market Scale

- Date: `2026-09-09`. Category: Scaling / Reader Experience / Data / Automation. Owner: Vishal Krishnan.
- Objective: complete the bounded M28-FX implementation with automatic validated previous-business-day variance, a compact regional market grid, active-provider currency-universe discovery and deterministic reusable pair intelligence without thousands of static pages.
- Branch/base: `work/m28-fx-final-scale-variance` from `origin/main` at `7a77bfa`, after PR #332 merged the compact-market UX. Status at this checkpoint: IMPLEMENTED / LOCALLY VALIDATED / PENDING COMMIT, PUSH, PR AND ACTIONS. No merge is authorised.
- Variance integrity: historical closes are accepted only from records marked `VALIDATED` and keyed by the provider observation date rather than the scheduler publication date. A repeated same-day snapshot is therefore rejected as a baseline automatically. Prior business-day selection still skips weekends and explicitly configured holidays, respects the configured lookback, and returns null/`Variance pending` when no genuine earlier observation exists. Positive, negative and unchanged calculations remain deterministic.
- Full-universe scale: the reference adapter now preserves the provider's sanitized three-letter, positive finite USD common-base table plus source/timestamp/validation metadata. `current.json` gains that universe only on the next genuine scheduled generation; this implementation did not edit or fabricate a market-data artifact. Currency Explorer builds its selectors from the active snapshot universe and computes `quoteRate / baseRate` on demand, disclosing common-base legs and labelling provider-native USD-base observations `DIRECT REFERENCE` and all computed cross/reciprocal results `DERIVED REFERENCE`. The curated 26 pair pages remain the indexed set; no pair-page explosion was created.
- Trend/history: weekly output retains the exact genuine observation points used by its calculation and can include the latest validated current observation. Dynamic pair history deduplicates provider business dates and fetches at most seven immutable history snapshots; no weekend duplicate, interpolation or synthetic point is introduced. Until two real observations exist the UI continues to show Building History.
- Reader UI: Live FX is now an information-dense regional `PAIR | RATE | PREV-DAY Δ | STATUS` table with filters for Global, APAC, South Asia, GCC / Middle East, Africa, LATAM, CIS, Europe, North America and Oceania; regions without a curated current pair remain visibly named but disabled. Pair Intelligence now provides source freshness, direct/derived classification, genuine market fields only, methodology/disclaimer, and empty data hooks for Regional Context, Consumer / Remittance Intelligence, Competition Intelligence and Treasury Intelligence. Competition intelligence remains independent and contains no quote-source logic.
- Preserved: the thin homepage LIVE RATE ticker, Global Announcements, ASK GPIR, Search GPIR, country intelligence, M21 candidate queue, menu architecture, domain/hosting, GitHub Pages architecture, lifecycle/history governance, and all current/history FX observation values. No LSEG, Bloomberg, XE, IBRLive, Reuters or NetDania observation attribution was added.
- Files changed: `assets/data/fx/fx-config.json`; `assets/js/fx-app.js`; `assets/css/market.css`; `scripts/fx/business-day.js`, `generate-fx-snapshot.js`, `providers/reference.js`, `weekly-summary.js`; `scripts/generate-fx-pages.js`, `test-fx.js`, `validate-fx.js`; generated `pages/fx/**`; and the three governance/handoff documents. `assets/data/fx/current.json`, `weekly-summary.json`, history data, homepage ticker code, unrelated pages and workflows were deliberately not changed.
- Validation at this checkpoint: edited JavaScript syntax passed; `node scripts/test-fx.js` passed all regression groups including same-day rejection, previous business day, weekend/holiday, missing history, positive, negative and zero variance plus provider-universe assertions; `node scripts/validate-fx.js` passed; `node scripts/validate-links.js` passed (99 HTML files); `git diff --check` passed. Local browser runtime QA passed for regional grid rendering/filtering and Explorer direct/derived pair rendering. Full final validation will be rerun immediately before commit.
- Commit/remote/PR: PENDING at this documentation checkpoint. Production remains unchanged until human review and merge.
## 2026-09-09 — Global Announcements live-to-archive intelligence lifecycle

- Implemented an exact, source-timestamped 24-hour live window. Records without a verified time are never guessed into the ticker and all expired validated records remain in the repository archive, Search and ASK GPIR.
- Added the filtered archive dashboard, accepted-record aliases, deterministic classification/search fields, original-source/validation presentation, report-only bounded backfill, and last-known-good protections.
- The latest report-only backfill for 2026-08-15 through 2026-09-09 evaluated 88 source registry entries / 6 configured endpoints: 42 discovered, 5 relevant candidate proposals, 37 rejected, 5 APAC backfill/archive candidates, and zero publication mutations. HKMA was temporarily unavailable; 82 entries remain unconfigured/unsupported.
- Branch: `work/global-announcements-intelligence-archive`. Merge/publication remains owner-controlled.

## 2026-09-09 — Global Announcements permanent production recovery

- Repaired the missing production stage between trusted-source discovery and canonical intelligence. The existing two-hour workflow now records source health, applies a narrow deterministic Tier-1 gate, regenerates pages/search artifacts and proposes all changes on `automation/intelligence-candidates`; it has no direct path to `main` or auto-merge.
- Added canonical record generation with source/candidate provenance, trust tier, payment taxonomy, retrieval/validation evidence, acquisition method, source health, lifecycle timestamps and explicit lineage. Ambiguous, lower-tier, unhealthy, incomplete and duplicate candidates stay non-public.
- Replaced JS-only blank archive sections with server-rendered Live, Latest and Historical content plus a truthful empty-live state. The ticker now contains one compact horizontally scrollable sequence, avoiding duplicate content and focus targets. Dynamic dataset/source-health timestamps replace the stale hardcoded publication-cycle claim.
- Added bounded retry/backoff and a committed 88-source operational health snapshot. The successful controlled retry reported 88 registered sources, 13 active/healthy and 75 unsupported, with no degraded/failed/stale source in that cycle.
- Controlled backfill outcome: one official HKMA item (4 September 2026 contactless mobile-payment card phishing warning) met every gate and was appended to permanent archive intelligence. Five other candidates remain non-public; four Tier-1 RBI records failed strict payment relevance and one association record is not Tier-1.
- Lifecycle after generation: 0 live, 10 archived published records, 1 developing announcement and 5 candidates awaiting review. No publication time, effective date, source fact or analysis was inferred.
- Validation passed: content, 100-file link scan, announcement/canonical contract, lifecycle, 28-check production pipeline, Search/ASK scenarios, parser/failure isolation, M24 reader integration, source activation, syntax and whitespace. Local browser QA confirmed the non-blank archive, truthful empty-live state, 10 archived results, dynamic source health, HKMA detail metadata and original-source link. The performance audit retained four pre-existing advisories and introduced none.
- Branch: `work/global-announcements-production-recovery`, based on merged PR #338 / `origin/main` `0438eae`. Status: implemented and locally validated; commit, remote push, one PR, Actions and owner merge approval pending. Production is unchanged.
### M29 — GPIR Global Source Network Activation

- Date: 2026-09-09. Owner: Vishal Krishnan. Branch: `work/m29-global-source-network-activation`; base: merged PR #343 at `8b19163`.
- Objective: activate the existing approved 88-source network against the recovered source-to-intelligence pipeline without redesigning announcements, Search, ASK, FX, hosting or GPIR Core.
- Source outcome: 30 approved official HTML indexes added to the existing 13 structured endpoints; 43 sources now have functioning deterministic acquisition across 33 countries/jurisdictions. Snapshot: 43 GREEN, 0 AMBER, 0 RED, 0 STALE, 45 UNSUPPORTED.
- Backfill outcome: bounded 2026-05-01–2026-09-09 pass fetched 211 dated records, admitted 13 relevant candidates, rejected/deduplicated 198 and strictly auto-published four Tier-1 records across Europe, North America and LATAM. Fourteen candidates remain non-public.
- Publication outcome: four canonical records, permanent summary pages, archive entries and existing Search/ASK registry relationships generated. No record qualifies for the current 24-hour live window; 14 published records remain in archive and one announcement remains developing.
- Controls: configured official pages only, approved-domain and redirect checks, bounded retries, per-source isolation, positive payment taxonomy, URL/event deduplication, canonical field validation, append-oriented archive and machine-readable 88-row source coverage.
- Validation: content, announcement/canonical schema, all-source coverage, M29 acquisition/isolation, 28-check production pipeline, source activation, lifecycle, Search/ASK scenarios, intelligence radar, M24 reader integration, 104-file link scan, full 51-file JavaScript syntax scan, high-confidence secret scan and `git diff --check` passed. Performance audit passed with four pre-existing advisory warnings.
- Remote state: implementation and validation are committed through `82e9962`; `work/m29-global-source-network-activation` is pushed and PR #349 is open against `main`. The GPIR Security and Integrity run passed on synchronized PR head `8a675c3`; final documentation-only checkpoint revalidation, owner review and owner merge remain pending. No production merge is authorised.

### 2026-09-10 — Wave A Central Bank & Regulator Global Coverage Validation

- Objective: validate the country-level central-bank/monetary-authority source universe before any Wave B payment-infrastructure work, using the merged PR #343/M29 architecture without changing reader UI, Search, ASK, FX, hosting or publication governance.
- Universe: all 63 current BIS member central banks/monetary authorities plus 22 additional central-bank jurisdictions already present in GPIR, producing 85 unique ISO jurisdictions across the eight owner-specified regional groups.
- Registry/report: added 25 previously missing BIS-member central-bank profiles as inactive verified-official Tier-1 entries and attached Wave A metadata to the selected jurisdiction profiles. `trusted-sources.json` and `source-health.json` now cover 113 total sources. `wave-a-country-matrix.json` records every authority, official domain/index, separate regulator, acquisition evidence, publication proof where found, operational state and exact gap.
- Controlled revalidation: evaluated all 38 active M29 Wave-A profiles. Seventeen profiles returned at least one correctly dated official publication, representing 283 parsed publication entries; 21 profiles did not produce a correctly dated result. A later repeat across five previously reachable official indexes uniformly returned endpoint-unavailable, which was recorded as a temporary condition without rewriting earlier evidence.
- Defects found and fixed: HTML dates now support `datetime`/data attributes, numeric slash and dotted formats, and anchor-local date binding so adjacent records cannot inherit one another's date. Payment relevance now rejects a bare “balance of payments” macroeconomic release while still accepting records with independent specific ISO 20022/payment-infrastructure evidence.
- Final health-aligned result: zero `ACTIVE_GREEN`, 37 `ACTIVE_AMBER`, one `QUARANTINED_RED` (Colombia's untrusted redirect), 47 `VERIFIED_UNSUPPORTED`, zero `MISSING_AUTHORITY`. The earlier dated successes remain evidence, but the final uniform endpoint-unavailable repeat prevents a green claim. Every non-green row includes methods tested, exact blocker, blocker nature and recommended next method. Verdict: `WAVE A — VALIDATED WITH DOCUMENTED GAPS`.
- Publication/integration: zero new sources were activated and zero Wave A records passed the strict existing canonical publication gate. The ticker, permanent archive/summary cards, Search GPIR and ASK GPIR received no new records and remain unchanged.
- Engineering/governance: added a deterministic matrix builder and validator plus CI enforcement; regenerated the full source-health inventory. No Wave B/C/D source was added, no new database/service/runtime AI/paid API was introduced, and no validation or trust boundary was weakened.
- Validation: content and announcement schemas, 113-row M29 source coverage, 85-row Wave A coverage, M29 acquisition/isolation, source activation, lifecycle, 28-check production publication gate, announcement intent, intelligence radar, M24 Search/ASK integration, 104-file links, unchanged FX regression/validation, full JavaScript syntax and whitespace checks passed. The performance audit retained four pre-existing advisory warnings.
- Remote handoff: implementation commit `6801577` is pushed on `work/wave-a-central-bank-regulator-validation`, based on merged PR #349 at `7709bbae`; PR #351 is open against `main`. Actions and owner review/merge remain pending; no merge is authorised here.
### M28-FX-R1 — FX data-first production remediation

- Date: `2026-09-11`. Category: Data / Automation / Reader Experience / Governance. Owner: Vishal Krishnan.
- Failure proved before code: production served the 08 Sep Open ER API reference snapshot (`generatedAt` 08 Sep, USD/INR 94.544084), no history and `NO_DATA` weekly output. The scheduled workflow was green and its proposal branch had advanced through 11 Sep, but no review PR existed. The workflow intentionally suppressed `gh pr create` failure, leaving valid observations stranded off `main`.
- Genuine observation recovery: the branch incorporates the already generated and validated `automation/fx-snapshot` state: current publication date 11 Sep, 26/26 validated reference pairs, immutable archives for 08/09/10 Sep and four genuine observations in each pair's weekly calculation. USD/INR 95.513702 compares with the validated 10 Sep close 95.121034, producing +0.392668 / +0.412808801048147%; no rate or observation was synthesized.
- Repair: mutable browser reads for `current.json` and `weekly-summary.json` use a per-request cache key plus `cache: no-store`; immutable dated history keeps stable URLs. The homepage is labelled `FX SNAPSHOT`, shows `REFERENCE` or `LAST VALIDATED`, and timestamps the GPIR retrieval rather than implying streaming. Pair views show the stored record status and explicitly identify last-validated fallback when a provider refresh fails.
- Workflow integrity: PR creation failure now fails the run after the validated automation branch is safely pushed. This preserves human-controlled publication while preventing a broken branch-to-PR handoff from appearing successful. Enabling the repository's Actions PR-creation setting remains an owner action.
- Source diagnostic: the existing public Open ER API endpoint responded successfully with an 11 Sep provider timestamp and a complete USD common-base table; the adapter normalized all 26 configured pairs. The source remains `REFERENCE`. IBRLive and the other licensed adapters remain intentionally unimplemented because no authorised credential plus verified request/response contract is available; no API key was printed or inferred.
- Validation: `node scripts/test-fx.js`, `node scripts/validate-fx.js`, `node scripts/validate-links.js`, edited JavaScript syntax checks and `git diff --check` pass. Five sampled pair variances independently reproduce the stored percentages, all 26 current records have validated 10 Sep baselines, and all 26 weekly summaries contain four real observations.
- Publication state: implementation is locally complete on `work/m28-fx-r1-data-first-remediation`; production is unchanged until owner review and merge. No merge to `main` is authorised.
### M28-FX-R1D — Final ticker and dynamic refresh hardening

- Date: `2026-09-11`. Final bounded refinement on `work/m28-fx-r1-data-first-remediation`; no new provider, workflow, framework, history rule, weekly engine, navigation change or unrelated GPIR module.
- Ticker: the existing 36px, single-strip, duplicated-sequence marquee is retained. Pair/rate/variance items remain compact links; hover/focus pause and reduced-motion behavior are unchanged. Status plus the GPIR retrieval-derived IST timestamp now occupy one compact line.
- Dynamic refresh: future generated snapshots publish the existing configured provider interval. The browser schedules only `current.json` re-fetches within a bounded 5–15 minute window and continues without a page reload. If a later browser fetch fails after a valid load, the rates stay visible and are explicitly relabelled `LAST VALIDATED`.
- Freshness: reference observations remain `REFERENCE`. Live-class observations become `CURRENT`, `DELAYED` or `STALE` from retrieval age and configured cadence; provider failure remains `LAST VALIDATED`. No stale observation is silently labelled current.
- Schedule: the existing single `GPIR FX Market Data Refresh` workflow remains hourly—the fastest useful cadence for the current daily reference source—but moves from minute 0 to minute 7 to avoid top-of-hour concentration. No M-21/Continuous Intelligence workflow was touched.
- Integrity: previous-valid-business-day variance, immutable daily archiving and history-driven weekly intelligence are unchanged. Current browser polling does not request historical or weekly files.
- Validation: FX JavaScript/generator/test syntax, `node scripts/test-fx.js`, `node scripts/validate-fx.js` and `git diff --check` pass. Recommendation remains owner review and merge of PR #361; no worker merge is authorised.
