# GPIR Development Backlog

Permanent register of requirements and their current governance state. Every
item has an explicit status; vague states such as "maybe" or "later" are not
used.

Status values: `ACTIONABLE`, `IN PROGRESS`, `PARKED`, `BLOCKED`, `COMPLETED`,
`SUPERSEDED`.

## Completed foundation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GOV-001 | 2026-08-28 | Establish content schema and architecture guardrail | GOVERNANCE, ARCHITECTURE, DATA | High | COMPLETED | Existing static architecture | Stage 0 | `docs/CONTENT_SCHEMA.md`, `docs/ARCHITECTURE_GUARDRAIL.md` | Document current data and change contracts and add structural validation. | Documents exist; validator passes current JSON. | Delivered in prior governance increment. | 2026-08-28 | Uncommitted; last verified `c25ff96047dba7a688e0c7d374bc162abce22737` | M-08 |
| GOV-002 | 2026-08-28 | Establish permanent project memory and change governance | GOVERNANCE, ARCHITECTURE | High | COMPLETED | GOV-001 | Stage 0 | `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`, `docs/PROJECT_STATUS.md`, `docs/DEVELOPMENT_GOVERNANCE.md` | Create append-only history, current status, backlog and agent operating rules. | Four documents exist, links resolve, status and milestone are recorded. | Delivered by Prompt 09. | 2026-08-28 | No new commit; last verified `c25ff96047dba7a688e0c7d374bc162abce22737` | M-09 |
| REG-001 | 2026-08-28 | Establish a canonical structured content registry pilot | DATA, ARCHITECTURE, SCALING | High | COMPLETED | GOV-001, GOV-002 | Stage 1 | `assets/data/content-registry.json`, `scripts/validate-content.js` | Create one reference-based catalog for typed records, relationships and page/source pointers without duplicating content. | Pilot records validate; source references, relationships and page targets resolve; existing generator and search remain functional. | Pilot delivered; broader data migration and registry-driven generation remain outstanding. | 2026-08-28 | `7813132e2fd21a746932778b8c8459bb62dafaab` | M-10 PARTIAL |
| M-26A | 2026-09-05 | Public repository activation | READER EXPERIENCE, DATA, ARCHITECTURE | High | COMPLETED | Existing validated GPIR assets and registry relationships | Stage 1 | `index.html`, `assets/js/*`, `assets/data/*.json`, `pages/regions/*.html`, `pages/countries/*.html` | Activate the current GPIR portfolio as a coherent public repository without waiting for full country or dashboard coverage. | Existing content is discoverable, connected and honest about availability; no new research or infrastructure is created. | Public activation achieved using the repository's existing registry, search, ASK GPIR, dashboard and narrative assets. | 2026-09-05 | `bfb08fb7e12bee4cbd36c6a84921cbc55a981141` | M-26A |
| M-26B | 2026-09-05 | Publicly connected intelligence repository | READER EXPERIENCE, DATA, ARCHITECTURE | High | COMPLETED | M-26A public activation; canonical registry relationships | Stage 1 | `assets/js/script.js`, `assets/css/chapter-page.css`, `pages/countries/*.html`, `pages/regions/*.html` | Surface deterministic region, country and dashboard relationships in the public reader using the existing registry rather than inventing missing links. | Country and region pages present connected GPIR links and honest readiness states without new data or backend work. | Country and region pages now render connected intelligence panels based on canonical registry relationships and the live production routes are HTTP 200 verified. | 2026-09-05 | Final M-26B release commit | M-26B |
| M-27A.1 | 2026-09-05 | Navigation hierarchy and registry-driven Dashboard Gallery release | READER EXPERIENCE, DATA, ARCHITECTURE, GOVERNANCE | High | COMPLETED | M-27A; canonical registry relationships | Stage 1 | `index.html`, `assets/js/generate-dashboard-gallery.js`, `assets/js/script.js`, `docs/*.md` | Preserve Global -> Region -> Country while making Dashboard Gallery a presentation/view layer over existing dashboard-country-region relationships. | All five dashboard identities resolve Dashboard -> Country -> Region; existing routes, metadata, narratives, image assets and historical assets remain intact; no new research is introduced. | Implemented, locally validated and live HTTP verified. Release SHA: `69b928f9952b242c4fd164908394634394a2a89d`. | 2026-09-05 | `69b928f9952b242c4fd164908394634394a2a89d` | M-27A.1 |
| M24 | 2026-09-08 | Global Intelligence Coverage & Reader Integration | INTELLIGENCE, READER EXPERIENCE, DATA, GOVERNANCE | High | IN PROGRESS | M20-M23.1A radar/candidate pipeline; M22 canonical country/region metadata; GPIR-OPS-01 | Stage 1 | `assets/data/trusted-sources.json`, `assets/data/content-registry.json`, `scripts/propose-intelligence-candidates.js`, `scripts/gpir-source-health-report.js`, `scripts/test-m24-reader-integration.js` | Expand the trusted-source radar beyond APAC into GCC, Europe/UK, North America, LATAM, Africa and CIS/Central Asia; add REGION registry records connecting the existing europe/americas/latam/africa country-metadata files and pages; extend deterministic payments-relevance keywords; add read-only source-health reporting; prove one qualified record already connects to Global Announcements, Country/Region association, Search GPIR indexing, ASK GPIR context and lifecycle/provenance without duplication. | Registry/content-registry validate; radar regression, new relevance and new M24 reader-integration tests pass; no new machine-readable endpoint is claimed without live verification; no historical record is altered. | New sources added inactive/manual-discovery-only (network egress unavailable in this session to live-verify any new endpoint); region:europe/americas/latam/africa wired into the canonical registry; country:united-kingdom gained its first REGION relationship, closing REGION-002. | PENDING | Pending push/PR | M24 |

| M-27A.2 | 2026-09-05 | Correct dashboard publication status and reader links | READER EXPERIENCE, DATA, GOVERNANCE | High | COMPLETED | M-27A.1; existing dashboard metadata and assets | Stage 1 | `assets/js/script.js`, `assets/css/chapter-page.css`, `pages/countries/*.html`, `docs/*.md` | Separate country editorial status from dashboard publication status and resolve connected dashboard links through existing metadata image paths. | Country draft notices remain outside dashboard readers; five published dashboard statuses come from metadata; all five connected links resolve to existing publication assets without homepage fallback. | Implemented, locally validated and live HTTP verified. No dashboard research, source, image, metadata, narrative, registry or historical content changed. | 2026-09-05 | `6e9f5d7b9d73519e5e699d6adc8ab22b26b78f5d` | M-27A.2 |

| M-27A.3 | 2026-09-05 | Search result overlay close and navigation UX fix | READER EXPERIENCE, GOVERNANCE | High | COMPLETED | M-27A.2; existing search close/reset mechanism | Stage 1 | `assets/js/script.js`, `docs/*.md` | Close and reset Search GPIR when a normal result is selected while preserving existing routing, indexing, ranking, ASK GPIR and hierarchy. | Mouse and keyboard result selection invoke the existing close/reset path before navigation; search indexing and ranking remain unchanged; validators pass. | Implemented, locally validated and live HTTP verified. Final release SHA: `c818f4f3023ae41a8db183c81fd9159476429dc6`. | 2026-09-05 | `c818f4f3023ae41a8db183c81fd9159476429dc6` | M-27A.3 |

| M-27A.4 | 2026-09-05 | India country status and search route consistency fix | READER EXPERIENCE, GOVERNANCE | High | COMPLETED | M-27A.3; active India registry status; canonical route | Stage 1 | `pages/countries/india.html`, `docs/*.md` | Remove stale generic India country scaffold warning while preserving the Country editorial status != Dashboard publication status architecture and canonical Search/Markets routes. | India warning is removed; India menu/search routes remain canonical; dashboard embed/disclaimer/research remain unchanged; other country pages are untouched. | ACHIEVED — stale India country-page scaffold warning removed; dashboard publication architecture unchanged. Live HTTP verified. | 2026-09-05 | `4a7720af2c678cfebad8a8d1f3c5cdd3eea57957` | M-27A.4 |

| M-27A.5 | 2026-09-05 | Remove stale draft status from five published country readers | READER EXPERIENCE, GOVERNANCE | High | COMPLETED | M-27A.4; active published country/dashboard readers | Stage 1 | `pages/countries/*.html`, `docs/*.md` | Remove only the generic scaffold warning from UAE, Saudi Arabia, Qatar, India and Singapore while keeping country editorial status separate from dashboard publication status. | No generic warning remains on the five pages; dashboard readers, disclaimers, research, routes, metadata, narratives and canonical Search/Markets paths remain unchanged; future draft status requires explicit designation. | Implemented, locally validated and live HTTP verified. Final release SHA: `ca4513b9dab7bdfd0d2e52827a15b4b442839090`. | 2026-09-05 | `ca4513b9dab7bdfd0d2e52827a15b4b442839090` | M-27A.5 |

## M-27C Phase 1 — Reader Intelligence Architecture Gate

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-27C-P1 | 2026-09-06 | Reader Intelligence Architecture Gate | READER EXPERIENCE, ARCHITECTURE, GOVERNANCE, PRIVACY | High | ACHIEVED | M-27A.5; live-reader observations; existing static architecture | Stage 1 | `docs/MASTER_PROJECT_LOG.md`, `docs/PROJECT_STATUS.md`, `docs/GPIR_BACKLOG.md` | Record verified root causes, safe boundaries and a controlled roadmap for dashboard reader controls, ticker continuity, navigation, historical preservation, visitor measurement, subscription, World Map routing and mega-menu intent behaviour. | Findings and constraints are recorded; no production implementation or data migration occurs; M-18/M-19 and protected content remain separate; next diagnostic is M-27B.1. | Diagnostic / architecture gate complete. No production implementation authorised. | 2026-09-06 | Documentation-only update; no implementation commit | M-27C Phase 1 |

## M-27C Pending Objectives

The M-27C Phase 1 gate is complete, but the following objectives remain
pending and require separate review and authorisation before implementation:

| ID | Objective | Status | Safe boundary |
|---|---|---|---|
| M-27C.1 | Dashboard Reader Controls | ACTIONABLE | Extend the existing lightbox with zoom, zoom-out, reset, fit, pan, fullscreen, keyboard/accessibility support and reduced-motion handling. Preserve images, research, metadata, narratives and disclaimers. |
| M-27C.2 | Global Announcement Ticker | ACTIONABLE | Replace the non-measured marquee boundary with a deterministic two-copy track using exact content width, responsive recalculation, appropriate pause behaviour and reduced-motion fallback. M-18 remains separately governed. |
| M-27C.3 | Navigation | ACTIONABLE | Establish one contract for Home-to-top, hash destinations, sticky-header offset, initial hash load, `hashchange` and browser history. Preserve existing routes and Search GPIR. |
| M-27C.4 | Historical Architecture | ACTIONABLE | Apply immutable version/lifecycle fields: `CURRENT`, `HISTORICAL`, `referenceId`, `recordId`, `canonicalId`, `editionVersion`, `publicationDate`, `lifecycleStatus`, `supersedes` and `supersededBy`. Never delete superseded information. |
| M-27C.5 | Visitor Measurement | ACTIONABLE | Select and document legitimate privacy-preserving measurement. Do not fabricate visitor numbers or claim unique visitors without a provider-defined methodology. |
| M-27C.6 | Subscription | ACTIONABLE | Define subscription page, email capture, interests, double opt-in, unsubscribe, privacy/legal controls and repository-history-based weekly digest delivery. |
| M-27C.7 | World Map | ACTIONABLE | Resolve existing map markers through canonical `GLOBAL -> REGION -> COUNTRY -> EXISTING INTELLIGENCE -> DASHBOARD` relationships without duplicate routes or new research. |
| M-27C.8 | Mega-menu | ACTIONABLE | Implement deliberate pointer intent with opening delay, close grace period, stable in-menu movement, keyboard access and touch compatibility without changing hierarchy. |

### M-27C Permanent UX Principle

> Intent-driven interaction: GPIR should remain visually calm during passive
> reading. Interactive components should respond predictably to deliberate
> reader intent and should not compete for attention through excessive hover
> sensitivity, animation, automatic expansion or unsolicited movement.

The intended reader flow is `CALM -> DISCOVER -> INTENTION -> INTERACT ->
INTELLIGENCE -> NAVIGATE`.

### M-27C Deferred Controls

No visitor analytics provider, subscription provider, subscriber data
architecture, external LLM/API, backend, database or historical migration is
approved by this gate. Dashboard research, images, metadata, narratives,
disclaimers, country research, registry relationships, search ranking, M-18,
M-19, CNAME/domain configuration and existing content remain preserved.

The next action is **M-27B.1 — LIVE READER INTERACTION DIAGNOSTIC**, diagnose
only. Its recommendations must not be implemented until separately authorised.

## Actionable next work

The Prompt 22A foundation increment adds a validated shared vocabulary in
`assets/data/content-model.json` and indexes the three remaining active country
pages in the canonical registry. It does not migrate page prose, dashboards or
coming-soon records.

Prompt 23A adds source, announcement and intelligence registry identities for
three existing classified records: SAMA licensing, RBI Payments Vision 2028
and MAS/ABS PayNow Generation 2. The records resolve to existing trusted-source
entries, announcement records and generated intelligence pages; no new facts or
pages were created.

Prompt 24A adds a deterministic ASK GPIR reader mode to the existing search
dialog. It uses the static search index, canonical registry and current-page
headings only. It is not a generative AI service, stores no queries and makes no
external model calls. Broader intent coverage, source/evidence expansion and
dashboard controls remain future work.

M-25A extends that reader mode with route-aware registry context, validated
related page links, source/provenance metadata and existing-page topic
exploration. It does not create content, infer relationships, change dashboards
or call an AI service. M-25A is PARTIAL until browser QA and the remaining
source/dashboard reader surfaces are completed.

M-25B adds source-aware search cards, native Source / Evidence disclosures,
bounded depth-two registry navigation and deterministic Read Next behavior. It
uses only existing registry relationships and repository metadata. M-25B is
PARTIAL until browser QA and broader non-registry provenance coverage are
available. M-25C dashboard intelligence remains deferred.

M-25C begins the dashboard reader milestone with five existing homepage cards
represented in `assets/data/dashboard-metadata.json`. Only existing title,
country, region, edition, status, description and paths are populated. Missing
period, direction, use-case, metric, unit, source, methodology and disclaimer
fields remain explicitly unavailable. The existing dashboard images and lightbox
are unchanged. M-25C is PARTIAL; dashboard intelligence and browser QA remain
pending.

M-25D is a governance checkpoint: a read-only diagnostic audit of the dashboard
publication, provenance and evidence architecture inherited from M-25C, later
corrected in scope. No dashboard, metadata, registry, route or content-model
files were changed. The audit confirmed the five `dashboard-*` records and
their `null` structured metadata fields, and recorded architecture gaps: a
metadata schema mismatch against `content-model.json`, `imagePath` values
requiring technical reconciliation against existing image assets, four empty
`pages/dashboards/*.html` route placeholders, no `DASHBOARD` content type or
country-to-dashboard relationship in the canonical registry, dashboard-related
intelligence already present in `search-index.json` under different reference
IDs, and `trusted-sources.json` correctly remaining a source-domain registry
rather than a dashboard registry. A representative existing dashboard (Taiwan,
Reference ID `VK-GPIR-TWN-INB-C2C-2026-001`) confirmed that existing GPIR
dashboards are already validated research publications, with validation
occurring before publication; the diagnostic findings are therefore a
technical publication/reader integration gap, not a dashboard
research-validation deficiency. M-25D's corrected objective is public live
activation of the existing GPIR portfolio and its reader utilities
(Search, ASK GPIR, Explain, Explore, related content, Source/Evidence,
navigation), proceeding in parallel with the dashboard programme rather than
gated on it, alongside a CURRENT/HISTORICAL content-preservation model. M-25D
is PARTIALLY ACHIEVED — DIAGNOSTIC COMPLETE; STRATEGIC IMPLEMENTATION SCOPE
CORRECTED. Implementation authorised from baseline
`e062bf22a532e033e27bfe6b7c09c166a7ce0883` delivered: a `DASHBOARD` registry
content type with 5 records deterministically connected to their existing
country records, a `country:united-kingdom` registry record connecting the
previously unregistered but already-live `uk.html`, existing dashboards made
discoverable in the existing search UI, an ASK GPIR country→dashboard link via
the registry relationship, and the `content-model.json` schema reconciliation.
On inspection, the `imagePath` finding required no repair. Regional dashboard
route architecture, a Europe/SEPA region record, further portfolio content
gaps and browser QA remain open.

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DATA-001 | 2026-08-28 | Expand structured content registry coverage | DATA, CONTENT, SCALING | High | ACTIONABLE | Content owners and verified evidence | Stage 1 | `assets/data/*.json` | Extend the existing country, regulator, licence, rail, company and corridor metadata using the current JSON patterns. | New records validate, use stable IDs, avoid duplication and cite required evidence where applicable. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| REG-002 | 2026-08-28 | Extend registry-driven page generation beyond the pilot | ARCHITECTURE, AUTOMATION, SCALING | High | ACTIONABLE | REG-001; template parity test and generator design | Stage 1 | `scripts/generate-intelligence-pages.js`, country templates | Make the existing generator consume registry references where this preserves current output and URLs. | Representative country and intelligence pages compare equal in required structure, links, metadata and visible behaviour. | Not started; deliberately excluded from Prompt 10 to protect the existing build. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| SEARCH-001 | 2026-08-28 | Enhance indexed repository search | SEARCH, READER EXPERIENCE | Medium | ACTIONABLE | DATA-001; measured search use or latency evidence | Stage 1 | `assets/js/content-search.js`, `assets/data/search-index.json` | Improve discovery using the existing lazy client-side index only where measured needs justify it. | Search remains lazy, section-linked, accessible and within documented size/performance thresholds. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| READER-001 | 2026-08-28 | Add a reader-facing intelligence layer | READER EXPERIENCE, INTELLIGENCE | Medium | ACTIONABLE | Structured content relationships and UX evidence | Stage 1 | Existing templates and shared JS | Improve compare, related-content and evidence discovery using existing relationships. | Changes preserve URLs, source labels, reduced motion and mobile layout; focused UX validation passes. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| GOV-003 | 2026-08-28 | Expand governance and monitoring checks | GOVERNANCE, AUTOMATION, PERFORMANCE | Medium | ACTIONABLE | Existing validation scripts | Stage 1 | `scripts/` and `docs/` | Add only low-cost repository checks that reflect documented contracts and known thresholds. | Checks are repeatable, documented and do not fabricate external verification. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| DASH-001 | 2026-09-05 | Connect published dashboards to their existing country records | DATA, ARCHITECTURE | High | COMPLETED | M-25D diagnostic findings; explicit deterministic mapping only | Stage 1 | `assets/data/content-registry.json`, `assets/data/dashboard-metadata.json` | Connect each `dashboard-*` record (an already validated GPIR publication) to its existing country registry record only where the relationship is explicit and deterministic. | Registry relationship entries resolve; no inferred or invented mapping; dashboard validation status is not restated or challenged. | Added `DASHBOARD` content type and 5 registry records with `COUNTRY` relationships, using only the pre-existing `pagePath`/`page` matches. | 2026-09-05 | Pending commit | M-25D |
| DASH-002 | 2026-09-05 | Connect published dashboards to existing intelligence references | DATA, ARCHITECTURE | Medium | ACTIONABLE | M-25D diagnostic findings; explicit evidence only | Stage 1 | `assets/data/search-index.json`, `assets/data/dashboard-metadata.json` | Link dashboard records to existing search-index intelligence only where a reference ID or explicit citation already ties them together. | Links use only already-evidenced references; no new facts introduced. | Not started; diagnosed only. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| DASH-003 | 2026-09-05 | Reconcile dashboard identity scheme | DATA, ARCHITECTURE | Medium | ACTIONABLE | DASH-002 | Stage 1 | `assets/data/dashboard-metadata.json`, `assets/data/search-index.json` | Reconcile `dashboard-*` IDs in `dashboard-metadata.json` against the differing reference-ID scheme (e.g. `IND-2026-005`) already used in `search-index.json`. | A single documented identity mapping exists; no ID is silently duplicated or renamed without record. | Not started; diagnosed only. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| DASH-004 | 2026-09-05 | Reconcile dashboard image asset paths | DATA, ARCHITECTURE | High | COMPLETED | Content owners to confirm correct asset locations | Stage 1 | `assets/data/dashboard-metadata.json`, `assets/images/`, `assets/dashboards/` | Resolve the mismatch between `imagePath` values in `dashboard-metadata.json` and the actual image assets under `assets/images/`. | Every `imagePath` resolves to an existing file; no path is invented. | On direct inspection, every `imagePath` already resolves correctly under `assets/dashboards/`; the original diagnostic search omitted that folder. No file was changed. | 2026-09-05 | Pending commit | M-25D |
| DASH-005 | 2026-09-05 | Reconcile dashboard metadata schema with content-model contract | DATA, ARCHITECTURE | Medium | COMPLETED | Content owners to decide canonical field set | Stage 1 | `assets/data/dashboard-metadata.json`, `assets/data/content-model.json` | Align the fields actually present in `dashboard-metadata.json` with the `dashboardMetadataFields` contract in `content-model.json`, or update the contract to match. | Schema and data agree; validator reflects the reconciled contract. | Updated `content-model.json` `dashboardMetadataFields` to match the actual keys already present in `dashboard-metadata.json`. | 2026-09-05 | Pending commit | M-25D |
| DASH-006 | 2026-09-05 | Decide empty dashboard route architecture | ARCHITECTURE, READER EXPERIENCE | Low | ACTIONABLE | Product decision on route purpose | Stage 1 | `pages/dashboards/*.html` | Decide whether the four empty dashboard route placeholders are populated, retired or redirected. | A documented decision exists before any route content is added. | Not started; diagnosed only. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| DASH-007 | 2026-09-05 | Add `DASHBOARD` content type to canonical registry | ARCHITECTURE, DATA | Medium | COMPLETED | DASH-001 | Stage 1 | `assets/data/content-registry.json` | Add a `DASHBOARD` content type and relationship support to the canonical registry once the identity/relationship reconciliation above is resolved. | Registry validates with the new content type; no unrelated record is altered. | Added to `supportedContentTypes`; `node scripts/validate-content.js` passes with 25 registry records. | 2026-09-05 | Pending commit | M-25D |
| REGION-002 | 2026-09-05 | Add a Europe/SEPA REGION registry record | DATA, ARCHITECTURE | Low | COMPLETED | Content owners to confirm region identity/slug | Stage 1 | `assets/data/content-registry.json`, `assets/data/sepa-countries.json` | Add a `region:europe` (or `region:sepa`) REGION record so `country:united-kingdom` and future SEPA countries can carry an explicit REGION relationship, matching the existing `region:middle-east`/`region:apac` pattern. | Registry validates; `country:united-kingdom` gains a REGION relationship without inventing region content. | Added `region:europe` (sourceRef `sepa-countries.json`) plus `region:americas`, `region:latam`, `region:africa` on the same pattern; `country:united-kingdom` now carries a `REGION` relationship to `region:europe`. | 2026-09-08 | Pending commit | M24 |
| PORTFOLIO-001 | 2026-09-05 | Public live portfolio completeness audit | CONTENT, READER EXPERIENCE | High | IN PROGRESS | M-25D scope correction | Stage 1 | Existing country, intelligence, regulatory and research pages | Confirm all existing GPIR country, intelligence, regulatory and research content is publicly accessible, navigable and discoverable, independent of dashboard coverage. | Every existing published page is reachable via navigation and/or search; no page is gated on dashboard availability. | Audit found `uk.html` live but unregistered (now added to the registry); `australia.html`/`japan.html`/`united-kingdom.html` are 0-byte placeholders with no content — left unchanged, no research created. | Not available in repository record. | Pending commit | M-25D |
| READER-002 | 2026-09-05 | Activate existing reader utilities as an integrated experience | READER EXPERIENCE, INTELLIGENCE | High | IN PROGRESS | Existing Search, ASK GPIR, related-content and Source/Evidence code | Stage 1 | `assets/js/*`, existing templates | Review and connect the existing Search, ASK GPIR, Explain/Explore, related-content, Source/Evidence and navigation utilities into one coherent reader experience without new frameworks. | Existing utilities remain functional and are demonstrably cross-linked; no new infrastructure is introduced. | Search now indexes existing dashboards; ASK GPIR now links a country page to its existing dashboard via the registry relationship. Explain/Explore/Source-Evidence integration otherwise unchanged. | Not available in repository record. | Pending commit | M-25D |
| HIST-001 | 2026-09-05 | Design CURRENT / HISTORICAL content-preservation model | ARCHITECTURE, DATA, GOVERNANCE | Medium | IN PROGRESS | Content owners; applies across dashboards, country intelligence, regulatory, AML/CFT, payments, research, announcements, forecasts | Stage 1 | `assets/data/*.json`, `docs/CONTENT_SCHEMA.md` | Define how a superseded validated edition moves from CURRENT to HISTORICAL while preserving reference ID, edition/version, publication date and context, without deleting valid content. | A documented model exists and existing records can be classified as CURRENT or HISTORICAL without data loss. | Documented an unapplied `editionLifecycleFields` contract in `content-model.json` (lifecycle statuses, reference/edition/date/supersedes fields). No existing record migrated; none currently has explicit multi-edition data. | Not available in repository record. | Pending commit | M-25D |
| DASH-008 | 2026-09-05 | Dashboard publication presentation controls | READER EXPERIENCE, SECURITY | Low | ACTIONABLE | DASH-001, DASH-004 | Stage 1 | Existing dashboard/lightbox CSS and JS | Present published dashboards as view-first publications with normal technical controls that discourage casual copying, without claiming absolute DRM or impossible downloading. | Presentation controls are documented as best-effort deterrents, not absolute prevention. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |

## EXTERNAL / OTHER AI ENGINE — PENDING INTAKE

## M-25E Outcome

M-25E.2 promoted the existing dashboard library activation to `origin/main`
in commit `07bab9d016aebe4ac06a218db96c461d3d239267`. Validation passed and
the required production pages and representative image returned HTTP 200, but
the production narrative JSON URL returned a cached HTTP 404 although the
committed/raw file is available. Browser QA was unavailable, so production
closure remains partial pending Pages verification.

M-25E inventories the existing dashboard library and activates the five
deterministically mapped country dashboards through the existing APAC and
Middle East/GCC country directories and country pages. The implementation
adds a local deterministic Smart Narrative dataset and ASK GPIR intent
handling, using existing dashboard metadata and existing country publication
context only. The three UAE/KSA/Qatar migration publication families remain
preserved and discoverable on their existing pages, but are not relabelled as
separate country dashboards. No additional dashboard identities, historical
relationships or new research were invented. Full validation, browser QA,
production live verification and push remain pending for this working tree.

| Status | Requirement | Implementation rule |
|---|---|---|
| AWAITING SOURCE PROMPT | Additional actionable work is known to exist outside the current Codespace development stream. Exact prompt statements and outcomes have not yet been supplied to this repository. | Do not implement until the source prompts/results are captured and reconciled. |

This is an intake placeholder only. It is not an actionable implementation
item and does not imply any particular missing feature.

## Reconciliation and priority order

Prompt 11 found no duplicate or conflicting requirement among the repository
records. The priority order below follows current dependencies and the
protected-build rules:

| Priority | Work | Reason |
|---|---|---|
| P0 | Protection and blocked conflicts | Reconcile external work first and preserve existing pages, URLs, generators and runtime behaviour. API-001 and MON-001 remain blocked pending approval and operational dependencies. |
| P1 | M-10 completion work | REG-002 is the next direct registry step, but only after external intake and a page-parity design/check. DATA-001 supplies the governed records it needs. |
| P2 | Approved architecture increment | DATA-001, then REG-002 and GOV-003, are approved Stage 1 foundation work extending existing JSON, templates and scripts. |
| P3 | Reader experience | SEARCH-001 and READER-001 follow measured needs and governed relationships while preserving lazy loading and current page behaviour. |
| P4 | Intelligence automation | SOURCE-001, INGEST-001, CHANGE-001, AI-001, ENGINE-001 and AUTO-001 require verified sources, review workflow, change governance and evaluation. |
| P5 | Future/experimental scale | COUNTRY-001 and CORRIDOR-001 remain later scale work until the registry pilot and evidence model are proven. |

## Next safe development gate

**Current milestone:** M-10 PARTIAL.
**Current objective:** Complete the scalable registry foundation only after
pending external work has been reconciled.
**Next development gate:** Reconcile all known pending work before starting the
next implementation prompt.

## Prompt 12 deployment audit findings

These findings were observed and documented by the deployment audit. They are
not fixed by Prompt 12.

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUDIT-001 | 2026-08-28 | Repair generated intelligence-page legal footer links | FIX, DEPLOYMENT | P1 | COMPLETED | Explicit fix prompt and generator/template decision | Stage 1 | `scripts/generate-intelligence-pages.js`, `pages/intelligence/*.html` | Generated intelligence pages link to sibling legal paths that return 404 instead of the existing `pages/legal/` paths. | All five legal links on every generated intelligence page resolve to deployed 200 routes; regeneration produces no unrelated diff. | Fixed at generator source and regenerated all 9 affected pages. | 2026-08-28 | `fea8228b4d52363a92dcd61ea48224f2f74a0a01` | M-13 |
| AUDIT-002 | 2026-08-28 | Reconcile legacy research-page navigation | FIX, DEPLOYMENT, READER EXPERIENCE | P1 | COMPLETED | Decision to restore, redirect or retire the legacy research targets | Stage 1 | `pages/research/global-payments-landscape.html` | The legacy research page links to eight missing sibling pages, each returning 404 in deployment. | Every retained research link resolves, or each intentionally retired link is removed/redirected and documented. | Fixed by retargeting the 8 stale links plus 2 related broken breadcrumbs to existing canonical GPIR routes; page content and taxonomy preserved. | 2026-08-28 | `fea8228b4d52363a92dcd61ea48224f2f74a0a01` | M-13 |
| AUDIT-003 | 2026-08-28 | Clarify stale SEPA route expectation | DEPLOYMENT, READER EXPERIENCE | P5 | PARKED | Product/navigation decision; current canonical route is Europe / SEPA | Stage 1 | `pages/regions/europe.html`, route references | `pages/regions/sepa.html` is absent and returns 404, while repository navigation uses the valid `pages/regions/europe.html` route. | Decide whether a compatibility redirect/alias is required; no action is justified from current internal references alone. | Classified as stale external expectation, not an internal navigation break. | Not available in repository record. | Not available in repository record. | Future navigation decision |

## Parked work

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SOURCE-001 | 2026-08-28 | Expand and maintain the source registry | DATA, INTELLIGENCE, SECURITY | High | PARKED | Human verification of each organisation and official domain | Stage 1 | `assets/data/trusted-sources.json`, `assets/js/trust-engine.js` | Grow the existing allowlist only when source ownership is manually verified. | Each entry has evidence, official domains, tier, source type and verification date; trust remains separate from content review. | Valid requirement, intentionally deferred until verified source candidates exist. | Not available in repository record. | Not available in repository record. | Future source-governance milestone |
| INGEST-001 | 2026-08-28 | Controlled source ingestion | AUTOMATION, INTELLIGENCE | High | PARKED | Approved workflow, real source inventory and an implementation outside GitHub Pages runtime | Stage 2 | Future ingestion tooling | Define a reviewed, human-gated process for discovering and staging source material. | No auto-publication; every accepted record has traceable evidence and audit metadata. | Parked to protect the static build and avoid pretending runtime ingestion exists. | Not available in repository record. | Not available in repository record. | Future Stage 2 milestone |
| CHANGE-001 | 2026-08-28 | Source and content change detection | AUTOMATION, INTELLIGENCE | Medium | PARKED | Controlled ingestion and versioned record storage | Stage 2 | Future ingestion/version tooling | Detect material changes in cited publications or GPIR records. | Changes produce reviewable events and preserve original values and correction history. | Parked until ingestion and version storage exist. | Not available in repository record. | Not available in repository record. | Future Stage 2 milestone |
| AI-001 | 2026-08-28 | AI classification and structured extraction | AI, INTELLIGENCE, DATA | High | PARKED | Human-reviewed source pipeline, evaluation set and governance policy | Stage 2 | Future AI processing layer | Classify and extract candidate intelligence while keeping humans responsible for publication. | Evaluation results, provenance, review state and rejection path are recorded. | Parked; no AI processing is implemented by Prompt 09. | Not available in repository record. | Not available in repository record. | Future Stage 2 milestone |
| ENGINE-001 | 2026-08-28 | GPIR intelligence engine | INTELLIGENCE, ARCHITECTURE | High | PARKED | Structured registry scale, relationship model and measured reader needs | Stage 2 | Future knowledge/intelligence layer | Add computed intelligence only after inputs, definitions and validation are available. | Outputs are reproducible, evidence-linked and do not imply unsupported facts. | Parked until the knowledge layer has sufficient governed data. | Not available in repository record. | Not available in repository record. | Future Stage 2 milestone |
| COUNTRY-001 | 2026-08-28 | Reusable country engine for 200+ countries | SCALING, DATA, READER EXPERIENCE | High | PARKED | Country schema expansion, verified content and template capacity | Stage 2 | Country templates and `assets/data/*-countries.json` | Scale the existing country-page pattern without duplicating presentation logic. | New country pages use shared templates, stable URLs, evidence metadata and performance rules. | Parked to sequence content quality before broad scale-out. | Not available in repository record. | Not available in repository record. | Future Stage 2 milestone |
| CORRIDOR-001 | 2026-08-28 | Reusable corridor engine for thousands of corridors | SCALING, DATA, INTELLIGENCE | High | PARKED | Governed corridor schema, source coverage and measured map/search needs | Stage 3 | Future corridor data and map extensions | Represent corridor participants, rails, currencies and evidence as reusable relationships. | Corridor records are deduplicated, source-linked and render through existing performance tiers. | Parked as a later scale phase. | Not available in repository record. | Not available in repository record. | Future Stage 3 milestone |
| AUTO-001 | 2026-08-28 | Production automation for governed refreshes | AUTOMATION, GOVERNANCE | High | PARKED | Controlled ingestion, change detection, review workflow and free GitHub-native tooling | Stage 3 | GitHub Actions or equivalent | Automate repeatable validation and reviewed artifact generation. | Automation is reproducible, auditable, zero-budget and cannot publish unreviewed high-risk content. | Parked until the preceding governance dependencies exist. | Not available in repository record. | Not available in repository record. | Future Stage 3 milestone |

## Blocked work

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| API-001 | 2026-08-28 | Public intelligence API or backend knowledge store | ARCHITECTURE, SCALING | Medium | BLOCKED | Backend hosting, operational ownership, security model and explicit approval | Stage 3+ | Not implemented | Provide queryable server-side records beyond static GitHub Pages delivery. | Approved architecture, cost/security review, migration plan and measured need are documented. | Blocked because the current repository has no backend and no approved need to add one. | Not available in repository record. | Not available in repository record. | Future architecture decision |
| MON-001 | 2026-08-28 | Production observability and uptime monitoring | MONITORING, AUTOMATION | Low | BLOCKED | Approved free monitoring mechanism and privacy/ownership decision | Stage 3+ | Not implemented | Monitor production errors, freshness and availability. | Ownership, privacy, alert thresholds and retention are approved before adoption. | Blocked; current docs explicitly state observability is not implemented. | Not available in repository record. | Not available in repository record. | Future operations milestone |

## Phase 2 security disposition

| ID | Control | Status | Evidence / limitation | Next action |
|---|---|---|---|---|
| SEC-001 | CSP and browser security response headers | BLOCKED | GitHub Pages serves HTTPS/HSTS but does not expose repository-level custom response-header configuration. No false meta-CSP claim was added. | Evaluate an approved compatible edge/hosting option; not required for current static implementation. |
| SEC-002 | GitHub Actions security/integrity workflow | COMPLETED | `.github/workflows/security-integrity.yml` runs least-privilege content, link, syntax and secret-pattern checks; implementation commit `b326c4501008e857e1efd48db6f59a8a10e31aa6`. | Maintain with future schema changes. |
| SEC-003 | Google Fonts dependency | PARKED | External HTTPS fonts remain to preserve current typography and avoid an unverified licensing/vendor migration. | Reassess local vendoring with licensing and visual regression evidence. |
| SEC-004 | FX API dependency | PARKED | `fx-ticker.js` requests only public FX rates over HTTPS, stores no submitted data, and renders a failure state. | Reassess only with a safe, free alternative and data-integrity evidence. |
| SEC-005 | Security disclosure mechanism | COMPLETED | Repository-native `SECURITY.md` documents safe reporting and avoids exposing new private contact data; implementation commit `b326c4501008e857e1efd48db6f59a8a10e31aa6`. | Keep reporting instructions current. |
| SEC-006 | Source-health/change detection | PARKED | No uncontrolled crawler or monitoring engine was introduced. | Design only after an approved source inventory and workflow exist. |
| SEC-007 | AI-agent security policy | PARKED | Phase 2 did not enter AI governance; existing development governance remains the applicable boundary. | Address in the separately authorized AI governance phase. |
| SEC-008 | Content-tamper detection/publish gate | PARTIAL | GitHub Actions now blocks malformed content, broken HTML links, syntax failures and high-confidence secret patterns; it does not independently detect all legitimate/illegitimate content changes. | Extend only with measured, low-noise protected-file checks. |
| SEC-009 | Limited localStorage use | PARKED | Only language and currency preferences were observed; no sensitive visitor data was added. | Document privacy implications in the authorized privacy phase. |
| SEC-010 | Google Fonts SRI | PARKED | Fonts remain external and no SRI was added because the stylesheet is third-party dynamic CSS. | Reassess if fonts are vendored locally. |

Phase 2 does not close SEC-001, SEC-003, SEC-004, SEC-006, SEC-007, SEC-009 or
SEC-010. Their statuses are explicit and no later phase has been started.

## Prompt 17 privacy baseline

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PRIV-001 | 2026-08-28 | Establish accurate current-state privacy transparency | PRIVACY, GOVERNANCE, SECURITY | High | COMPLETED | Verified static-site implementation | Stage 1 | `pages/legal/privacy-policy.html`, `pages/legal/cookie-policy.html` | Align public privacy/cookie wording with the actual static site: no accounts, forms, analytics, trackers, payment collection or intentional HTTP cookies; limited localStorage and external requests are disclosed. | Legal pages state current practice separately from future possibilities, preserve existing routes, and pass link/content/HTML validation. | Privacy baseline implemented without adding collection, consent SaaS or backend infrastructure. | 2026-08-28 | `391501d70790b963a58eb36a5b2f170632020231` | M-17 |

Phase 3 does not introduce a cookie-consent platform, analytics, tracking,
accounts, forms, personal-data collection, new contact channel or Trust Centre.
Future privacy/legal review may address jurisdiction-specific wording and any
change to the current external-resource or browser-storage model.

## Prompt 18 Global Announcements ticker remediation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TICKER-001 | 2026-08-28 | Repair announcement ticker overflow and freshness wording | FIX, READER EXPERIENCE, CONTENT INTEGRITY | High | COMPLETED | Existing ticker markup/data/CSS/JS | Stage 1 | `index.html`, `assets/css/page.css` | Keep long announcement cards inside the allocated ribbon and avoid implying continuous ingestion. | Scoped overflow contract passes; truthful status is displayed; content, animation, pause and reduced-motion behavior remain preserved. | Replaced the unsupported status claim with `Verified Dataset` and added scoped min-width/max-content rules to the announcement ribbon. | 2026-08-28 | `71e35efdc12df0decdcf61bf144863f643ec8ac1` | M-18 |

## M-27B.2 — World Map Interaction & Performance Repair

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-27B.2 | 2026-09-06 | World Map interaction and performance repair | READER EXPERIENCE, PERFORMANCE, NAVIGATION, GOVERNANCE | High | PARTIAL — BROWSER RUNTIME PENDING | M-27B.1 diagnostic; explicit implementation authorization | Stage 1 | `assets/js/world-map.js`, `assets/css/global.css`, `index.html` | Schedule initial map construction, preserve active country routing, activate existing region legend routes and remove marker hit-area ambiguity without new content or routes. | Map build no longer performs the full initial land-dot workload in one blocking turn; five active country markers retain canonical country destinations; six region legends are keyboard-accessible canonical links; no invented content or routes; validators pass; browser and live verification recorded separately. | Implemented and pushed. Land-dot work is frame-scheduled, region legend links are active, hit-area padding is reduced, caption is accurate, Australia remains coming soon. Repository validators and live HTTP/resource verification passed. Browser runtime acceptance remains pending because tooling is unavailable. | 2026-09-06 | `30260a7` | M-27B.2 |

## Backlog maintenance

When an item changes, update its status, outcome, completion date, commit and
milestone in the same prompt log entry. Superseded items remain in this file
with status `SUPERSEDED`; they are not silently removed.

## M-27B.3 — Final Human Live Acceptance Record

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-27B.3 | 2026-09-06 | Final human live acceptance of World Map repair | READER EXPERIENCE, PERFORMANCE, NAVIGATION, GOVERNANCE | High | ACHIEVED | M-27B.2 implementation and deployment; owner public-browser test | Stage 1 | `docs/MASTER_PROJECT_LOG.md`, `docs/PROJECT_STATUS.md`, `docs/GPIR_BACKLOG.md` | Record successful human acceptance of the deployed World Map without changing production implementation. | Public browser confirms five active country markers, six region legend destinations, responsive interaction, resolved initial lag and resolved India/UAE/Qatar hit-area conflict. | Human public-browser acceptance completed with PASS at `https://krishnan-vishal.github.io/`. Automated browser execution remained unavailable in Codespace; no automated browser claim is made. M-27B.2 is finalized as ACHIEVED. | 2026-09-06 | `30260a7`; governance record `d42df24` | M-27B.3 |

## M-18 — Global Announcements Ticker Integrity

## M-21 — Continuous Intelligence Pipeline Foundation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-21 | 2026-09-07 | Establish scheduled, trusted-source candidate discovery | AUTOMATION, INTELLIGENCE, SECURITY, GOVERNANCE | High | IMPLEMENTED / PENDING CI | M-18-4C safeguards and M-20 lifecycle model | Stage 1 | refresh/proposal scripts, candidate queue, GitHub Actions | Discover only configured official machine-readable endpoints and propose deduplicated DEVELOPING candidates for review. | Every candidate is non-public, source-bound, deduplicated and review-gated; no-change runs create no PR; failures preserve public content. | Implemented on `work/m21-continuous-intelligence-pipeline`; CI and PR review pending. | 2026-09-07 | Pending commit | M-21 |

## M-20 — Intelligence Lifecycle Foundation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-20 | 2026-09-07 | Establish deterministic CURRENT / DEVELOPING / HISTORICAL intelligence lifecycle | ARCHITECTURE, DATA, CONTENT INTEGRITY, GOVERNANCE | High | IMPLEMENTED / PENDING CI | M-18-4C protections merged to `main` | Stage 1 | `content-model.json`, announcement data/validators, generation and search | Add a backward-compatible lifecycle contract that keeps review state, publication state, validation and source trust distinct. | Developing material is excluded from public CURRENT intelligence; historical records retain reciprocal lineage, URLs and sitemap discoverability; legacy records remain valid. | Implemented on `work/m20-intelligence-lifecycle-foundation`; CI and PR review pending. | 2026-09-07 | Pending commit | M-20 |

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-18 | 2026-09-06 | Fix global announcements ticker continuity | READER EXPERIENCE, PERFORMANCE, CONTENT INTEGRITY | High | IMPLEMENTED / LIVE ACCEPTANCE PENDING | Existing announcements renderer, data and scoped ticker CSS | Stage 1 | `assets/js/announcements.js`, `assets/css/page.css` | Remove the deterministic blank interval by rendering the unchanged ordered announcement sequence twice and animating the doubled track from 0 to -50%. | Existing 10 records, IDs, content, order and source references remain unchanged; doubled sequences are identical; validators pass; live resources deploy; browser confirms no blank interval before achievement. | Production fix implemented and pushed. Static validation, data comparison and live HTTP/resource verification passed. Automated browser execution is unavailable, so visual continuity remains pending and M-18 is not closed. | 2026-09-06 | `8c1ba3c` | M-18 |

## M-18 Phase 1 — Global Announcements Intelligence

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-18.1 | 2026-09-06 | Ticker continuity | READER EXPERIENCE, PERFORMANCE | High | IMPLEMENTED / LIVE ACCEPTANCE PENDING | Existing M-18 ticker fix | Stage 1 | `assets/js/announcements.js`, `assets/css/page.css` | Preserve doubled sequence continuity. | Sequence duplicates exactly once and animates 0 to -50%; browser confirms no blank interval. | Implemented in `8c1ba3c`; browser acceptance remains pending. | 2026-09-06 | `8c1ba3c` | M-18 |
| M-18.2 | 2026-09-06 | Announcement data and lifecycle | DATA, GOVERNANCE | High | ACHIEVED FOR PHASE 1 | Existing announcements and content model | Stage 1 | `assets/data/announcements.json`, `assets/data/content-model.json` | Add explicit lifecycle/publication fields without invented dates or supersession. | 10 records validate; no record is historical by age; source/date integrity preserved. | Implemented and validated. | 2026-09-06 | `52c3ce6` | M-18 |
| M-18.3 | 2026-09-06 | Current and historical archive | READER EXPERIENCE, CONTENT INTEGRITY | High | IMPLEMENTED / LIVE HTTP VERIFIED | M-18.2 lifecycle contract | Stage 1 | `pages/intelligence/index.html`, `scripts/generate-intelligence-pages.js` | Preserve current alerts and future validated historical publications. | Current and historical sections exist; unresolved records remain outside publication; no historical record is deleted. | Archive implemented with 9 current and 0 validated historical publications; browser acceptance pending. | 2026-09-06 | `52c3ce6` | M-18 |
| M-18.4 | 2026-09-06 | Announcement search and ASK GPIR | SEARCH, READER EXPERIENCE | High | IMPLEMENTED / STATICALLY VALIDATED | Existing search index and ASK GPIR shell | Stage 1 | `assets/js/content-search.js`, `assets/js/script.js` | Retrieve structured announcement fields and intelligence links through existing consumers. | Required announcement queries resolve deterministically from published records without generated facts. | Implemented and validated; browser interaction pending. | 2026-09-06 | `52c3ce6` | M-18 |
| M-18.5 | 2026-09-06 | Automated refresh foundation | AUTOMATION, GOVERNANCE | Medium | FOUNDATION ONLY / NOT SCHEDULED | Explicit source registry and future architecture decision | Stage 1 | `scripts/refresh-announcements.js` | Produce report-only source/endpoint/discovery status without mutating content or claiming a cadence. | Machine-readable report records approved sources, endpoint configuration, discovery status and zero mutations. | Report-only foundation added; no endpoints or scheduler exist; no 8-hour/real-time claim made. | 2026-09-06 | `52c3ce6` | M-18 |

| M-18.4A | 2026-09-06 | Production release + live acceptance of announcement archive and search intent | READER EXPERIENCE, SEARCH, GOVERNANCE, DEPLOYMENT | High | IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING | Existing M-18 archive/search/ASK GPIR assets, canonical registry, announcement trust rules and repository validators | Stage 1 | `index.html`, `scripts/generate-intelligence-pages.js`, `assets/css/page.css`, `assets/js/content-search.js`, `assets/js/script.js`, `scripts/test-announcement-intent.js` | Close the announcement archive and search-intent release without changing the static architecture or source data contract. | Six expected files change only; repository validators pass; GitHub Pages returns HTTP 200; archive and announcement search are live; browser acceptance remains pending. | Implemented in commit `49751cdf215071d550d58682b31dafc397fad446`; `origin/main` updated; live HTTP verified. Browser QA remains pending because browser tooling is unavailable. | 2026-09-06 | `49751cdf215071d550d58682b31dafc397fad446` | M-18.4A |

| M-18.4B | 2026-09-06 | Final reader intelligence refinement | READER EXPERIENCE, SEARCH, CONTENT INTEGRITY, GOVERNANCE | High | IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING | M-18.4A production release; existing announcement data, registry relationships and homepage footer | Stage 1 | `assets/css/header.css`, `assets/css/page.css`, `assets/js/announcements.js`, `assets/js/content-search.js`, `assets/js/script.js`, `scripts/generate-intelligence-pages.js`, generated `pages/intelligence/*.html` | Correct freshness wording, narrative structure, lifecycle labels, Search cards, related intelligence and footer integration without changing ticker architecture, source data or refresh automation scope. | Truthful freshness wording; current/archive/pending lifecycle boundaries preserved; historical records remain searchable; FATF benchmark retains source-grounded content; shared footer classes are used; validators pass; live HTTP verified; browser acceptance recorded separately. | Implemented and pushed in `51210bec14750deb7bbda9e27cd5ad513aa1c797`; live HTTP verified; human browser acceptance remains pending because no browser interaction evidence is available in this environment. | 2026-09-06 | `51210bec14750deb7bbda9e27cd5ad513aa1c797` | M-18.4B |

## M-22 — Country Intelligence Scale Foundation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-22 | 2026-09-07 | Establish canonical, scalable country-intelligence metadata | ARCHITECTURE, DATA, SCALING, GOVERNANCE | High | IMPLEMENTED / PENDING CI | M-20 lifecycle and M-21 candidate pipeline | Stage 1 | country metadata, content validator, candidate proposal builder | Provide country identity, regional aggregation, availability, lifecycle and native/generated-page compatibility without mass rewriting country pages. | Existing country URLs resolve; native content remains untouched; metadata validates; future candidates can carry country/region association. | Implemented on `work/m22-country-intelligence-scale`; CI and PR review pending. | 2026-09-07 | Pending commit | M-22 |

## M-23 — Global Announcements Continuous Intelligence

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-23 | 2026-09-07 | Activate verified official Global Announcements discovery | AUTOMATION, INTELLIGENCE, CONTENT INTEGRITY, SECURITY | High | IMPLEMENTED / PENDING CI | M-18-4C, M-20, M-21 and M-22 | Stage 1 | trusted-source registry, candidate proposal builder, content validator, existing M21 workflow | Activate a small, repeatable official RSS source set without creating a second scheduler or publication path. | Only approved endpoints are fetched; redirect and item domains validate; candidates retain authority, item URL, endpoint, dates and review state; no candidate is public automatically. | RBI press releases, RBI notifications and ECB MID RSS endpoints are configured as candidate-only sources; additional authority expansion remains deferred. | 2026-09-07 | Pending commit | M-23 |

## M-23.1 — Global Intelligence Radar Expansion

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-23.1 | 2026-09-07 | Scale continuous Global Intelligence Radar controls | AUTOMATION, INTELLIGENCE, SCALING, SECURITY | High | IMPLEMENTED / PENDING CI | M-23 merged source activation | Stage 1 | trusted-source registry, candidate proposal builder, workflow, content contract | Establish bounded, data-driven source readiness, payment relevance and deterministic event identity without a second scheduler or publication system. | Rolling <=24-hour target is documented without a real-time claim; healthy sources continue after failures; only relevant, new, non-public candidates are proposed; public current/historical content remains untouched. | Adds HKMA official JSON press releases, registry operational metadata, relevance filtering, event-fingerprint deduplication and workflow source-health reporting. Wider verified source coverage is deferred. | 2026-09-07 | Pending commit | M-23.1 |

## GPIR-OPS-01 — operations control

- Raised: 2026-09-08. Category: GOVERNANCE / AUTOMATION. Owner: Vishal Krishnan.
- Status: IN PROGRESS; review readiness is tracked in PROJECT_STATUS.md.
- Objective: cloud-first, tool-neutral GitHub branch handoff; preserve production isolation and human approval.
- Branch: `work/gpir-ops-01-cloud-handoff-master-control`; base `7190552`.
- Acceptance: existing governance extended; durable handoff fields and recovery SOP discoverable through AGENTS; recent milestones reconciled without fabrication; documentation checks pass; branch/PR/Actions states recorded honestly.
- Delivered: documentation implementation in AGENTS and the existing governance/status/master-log/backlog files; no new service or framework.
- Remaining: final review, commit/push, PR, Actions and owner approval. Completion date/PR: PENDING.
- Blocker: authentication may prevent local push; no claim of remote durability before confirmed.
- Next dependency: authenticated GitHub handoff and human-controlled merge. No application feature work authorized by this item.
