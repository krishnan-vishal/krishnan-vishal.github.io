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

## Actionable next work

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DATA-001 | 2026-08-28 | Expand structured content registry coverage | DATA, CONTENT, SCALING | High | ACTIONABLE | Content owners and verified evidence | Stage 1 | `assets/data/*.json` | Extend the existing country, regulator, licence, rail, company and corridor metadata using the current JSON patterns. | New records validate, use stable IDs, avoid duplication and cite required evidence where applicable. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| REG-002 | 2026-08-28 | Extend registry-driven page generation beyond the pilot | ARCHITECTURE, AUTOMATION, SCALING | High | ACTIONABLE | REG-001; template parity test and generator design | Stage 1 | `scripts/generate-intelligence-pages.js`, country templates | Make the existing generator consume registry references where this preserves current output and URLs. | Representative country and intelligence pages compare equal in required structure, links, metadata and visible behaviour. | Not started; deliberately excluded from Prompt 10 to protect the existing build. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| SEARCH-001 | 2026-08-28 | Enhance indexed repository search | SEARCH, READER EXPERIENCE | Medium | ACTIONABLE | DATA-001; measured search use or latency evidence | Stage 1 | `assets/js/content-search.js`, `assets/data/search-index.json` | Improve discovery using the existing lazy client-side index only where measured needs justify it. | Search remains lazy, section-linked, accessible and within documented size/performance thresholds. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| READER-001 | 2026-08-28 | Add a reader-facing intelligence layer | READER EXPERIENCE, INTELLIGENCE | Medium | ACTIONABLE | Structured content relationships and UX evidence | Stage 1 | Existing templates and shared JS | Improve compare, related-content and evidence discovery using existing relationships. | Changes preserve URLs, source labels, reduced motion and mobile layout; focused UX validation passes. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |
| GOV-003 | 2026-08-28 | Expand governance and monitoring checks | GOVERNANCE, AUTOMATION, PERFORMANCE | Medium | ACTIONABLE | Existing validation scripts | Stage 1 | `scripts/` and `docs/` | Add only low-cost repository checks that reflect documented contracts and known thresholds. | Checks are repeatable, documented and do not fabricate external verification. | Not started. | Not available in repository record. | Not available in repository record. | Future Stage 1 milestone |

## EXTERNAL / OTHER AI ENGINE — PENDING INTAKE

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
| PRIV-001 | 2026-08-28 | Establish accurate current-state privacy transparency | PRIVACY, GOVERNANCE, SECURITY | High | COMPLETED | Verified static-site implementation | Stage 1 | `pages/legal/privacy-policy.html`, `pages/legal/cookie-policy.html` | Align public privacy/cookie wording with the actual static site: no accounts, forms, analytics, trackers, payment collection or intentional HTTP cookies; limited localStorage and external requests are disclosed. | Legal pages state current practice separately from future possibilities, preserve existing routes, and pass link/content/HTML validation. | Privacy baseline implemented without adding collection, consent SaaS or backend infrastructure. | 2026-08-28 | Prompt 17 commit | M-17 |

Phase 3 does not introduce a cookie-consent platform, analytics, tracking,
accounts, forms, personal-data collection, new contact channel or Trust Centre.
Future privacy/legal review may address jurisdiction-specific wording and any
change to the current external-resource or browser-storage model.

## Backlog maintenance

When an item changes, update its status, outcome, completion date, commit and
milestone in the same prompt log entry. Superseded items remain in this file
with status `SUPERSEDED`; they are not silently removed.
