# GPIR Development Backlog

Permanent register of requirements and their current governance state. Every
item has an explicit status; vague states such as "maybe" or "later" are not
used.

Status values: `ACTIONABLE`, `IN PROGRESS`, `PARKED`, `BLOCKED`, `COMPLETED`,
`SUPERSEDED`.

## M44 open-source agentic intelligence enhancement

| ID | Date Raised | Requirement | Category | Priority | Status | Dependency | Outcome |
|---|---|---|---|---|---|---|---|
| M44-AGENTIC-INTELLIGENCE | 2026-11-28 | Use LangGraph OSS within the existing GPIR architecture to stabilize Global Alerts and FX first, then extend governed editorial, ASK and country intelligence without added cost or an LLM runtime dependency | INTELLIGENCE, FX, AUTOMATION, READER EXPERIENCE, GOVERNANCE | Critical | IN PROGRESS | PR CI; owner-reviewed Supabase/Edge/Pages release; genuine alert lifecycle; live FX/ASK/country/billing acceptance | Phase 1 release candidate adds a bounded 12-hour relay, deterministic LangGraph wrapper, service-only FX archive projection, cached public FX response and in-place card enrichment. No new service, database or scheduler. Production remains unchanged; Phases 2–4 and live acceptance are not classified complete. See `docs/M44-AGENTIC-INTELLIGENCE.md`. |

## M45 approved Drive publication closure

| ID | Date Raised | Requirement | Category | Priority | Status | Dependency | Outcome |
|---|---|---|---|---|---|---|---|
| M45-DRIVE-PUBLICATION | 2026-11-27 | Publish the 43 eligible hash-bound dashboards through Payload primary, Supabase identity/entitlement authority, Contentful passive BCP and the existing GitHub Pages release while continuing PR #724 only | CMS, CONTENT, ENTITLEMENT, RELEASE, GOVERNANCE | Critical | IN PROGRESS | PR checks; exact-head Worker and Edge deployment; owner-dispatched batch workflow; human merge; live acceptance | Implementation reconciles 48 images/45 rows/44 annotations into 43 eligible, two held and three unmatched; creates/reuses 24 governed categories; reuses media without treating asset presence as a publication duplicate; prepares/stages one immutable edition on PR #724; and retains individual publication/BCP evidence. Production execution and live receipts remain pending. |

## SEP-01 central command controller

| ID | Date Raised | Requirement | Category | Priority | Status | Dependency | Outcome |
|---|---|---|---|---|---|---|---|
| SEP-01-CONSOLIDATED-ACCEPTANCE | 2026-11-20 | Consolidate the failed live attempts into one bounded Gemini edit, verified Git/Supabase checkpoint and fresh-runner recovery path in existing PR #604 | AUTOMATION, GOVERNANCE, SECURITY | Critical | COMPLETED | Owner review and human-controlled merge of draft PR #604 | Repair commit `ce27b82aa36966ecc2af10f67656e9d49ea3cb35`; three PR checks passed. Live run 44726620886 generated and validated the exact isolated fixture edit, pushed checkpoint `4044a5e721483a3e0b7ee84b050c8a54400824ea`, and stored the identical SHA in Supabase revision 14. Fresh-runner run 44726862749 recovered it without a Gemini call or repeated edit. Automatic dispatch and production changes remain disabled. |

## M39 live research sources and five-year intelligence backfill

| ID | Date Raised | Requirement | Category | Priority | Status | Dependency | Outcome |
|---|---|---|---|---|---|---|---|
| M39-LIVE-SOURCE-BACKFILL | 2026-11-20 | Activate verified research sources, complete exact five-year acquisition and drain governed publication without weakening the 95 gate | INTELLIGENCE, DATA, AUTOMATION, GOVERNANCE | Critical | IN PROGRESS | One genuine future qualifying article for source-to-live-to-expired acceptance; owner review/merge | FinTech News Singapore and Atlas are GREEN and hourly; 120 monthly source windows completed with exact 1,680 and 49 record totals, zero missing timestamps and 191 governed historical approvals. Finextra and FXC remain disabled. Empty live relay is truthful; do not manufacture final lifecycle proof. See `docs/GPIR-LIVE-SOURCE-BACKFILL-RECEIPT-20261120.md`. |

## M42 OFAC, FATF and Global Country Risk Monitor

| ID | Date Raised | Requirement | Category | Priority | Status | Dependency | Outcome |
|---|---|---|---|---|---|---|---|
| M42-OFAC-FATF | 2026-11-19 | Governed OFAC sanctions-change and FATF country-classification integration, five-year evidence history and Global Country Risk Monitor | INTELLIGENCE, DATA, AUTOMATION, READER EXPERIENCE, GOVERNANCE | Critical | IN PROGRESS | Required CI; reviewed FATF historical statement manifest; owner-controlled Supabase/Payload release and live acceptance | Branch implementation adds official-host validation, hashes, current snapshots without historical inference, OFAC recent action/delta evidence, bounded restartable checkpoints, separate FATF/GPIR/OFAC classification fields, current 21-jurisdiction reader, filters, cards, sources and ASK context. No deployment or production mutation. OFAC bounded delta backfill is implemented; FATF historical backfill fails closed pending a reviewed manifest. See `docs/M42-OFAC-FATF-COUNTRY-RISK.md`. |

## M39 global typography, topic continuity and ASK GPIR integration

| ID | Date Raised | Requirement | Category | Priority | Status | Dependency | Outcome |
|---|---|---|---|---|---|---|---|
| M39-CONTENT-UNIFORMITY | 2026-11-13 | Normalize shared long-form typography and whitespace; preserve governed topic continuity; expose topic-aware ASK GPIR navigation across the homepage, publications and archive | READER EXPERIENCE, CONTENTFUL, INTELLIGENCE, RELEASE | High | IN PROGRESS | Owner review/merge of PR #575, existing production workflow and one post-deployment live verification | Consolidated implementation is on the existing publication-layout PR. Shared tokens, Rich Text empty-paragraph suppression, responsive chapter/publication rhythm, contextual ASK GPIR links and explicit current/archive/research response groupings are implemented. The existing topic registry, historical API, 12-hour alert lifecycle, publication identities, access controls and entitlements are unchanged. Focused tests, repository validators, both required cloud checks and desktop/mobile preview acceptance pass; owner-controlled publication remains pending. |

## M40 repository aggregate concurrency gate

| ID | Requirement | Status | Dependency | Outcome |
|---|---|---|---|---|
| M40-READER-CURSOR-ACCEPTANCE | Deploy the existing records-only and cursor RPCs and Edge Function to the approved isolated test project, then verify authenticated filtered navigation and service-role-only access | BLOCKED | Restore scoped project management, database connectivity and authenticated reader access | On 2026-11-12 the test project was identified, but both database pooler ports timed out and management tokens returned HTTP 403/401. Compatibility and deployment were not verified; no production deployment occurred. The 2026-11-13 owner request explicitly authorized continued dashboard optimization, not deployment or release. |
| M40-AGGREGATE-PERFORMANCE | Exact governed 500,000-record benchmark at 10/25/50/100 readers; dashboard and cards p95 at most 3 seconds, cursor p95 at most 5 seconds at 100 readers, zero errors; report legacy offset separately | BLOCKED | Reader cursor acceptance, passing benchmark and security checks, operational review and owner approval | PR #574 remains blocked for release. Run 43364458540 on `40c7170` failed dashboard p95 at 17,467.07 ms, with cards 1,703.90 ms and cursor 1,941.39 ms, zero errors. Run 43362611541 on `da85cce` failed dashboard p95 at 12,614.73 ms; the subsequent local two-CPU benchmark also failed. See project status. Run 43191611260 recorded legacy offset p95 18,606.15 ms; run 43179746444 and its historical errors remain documented in the master log. |

## M39 Gate 2 recovery

| ID | Date Raised | Requirement | Category | Priority | Status | Dependency | Outcome |
|---|---|---|---|---|---|---|---|
| M39-GATE2-RECOVERY | 2026-11-08 | Recover RPW and official technical-source acquisition | INTELLIGENCE, DATA, AUTOMATION | High | IN PROGRESS | Owner review, CI, merge, source registration, controlled deployment and runtime verification | Local parser, technical staging and focused validation complete; RPW production acquisition/staging is not enabled. Missing workbook quarters and any API truncation must remain explicit. |

## M39 Smart Intelligence dashboard final completion

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-SMART-DASHBOARD-FINAL | 2026-11-07 | Complete the approved signed-in My Intelligence Dashboard and governed historical connectivity | INTELLIGENCE, READER EXPERIENCE, SUPABASE, RELEASE | Critical | IN PROGRESS | PR checks, merge, source-registry repair, Edge/Pages deployment and live authenticated screenshots | Stage 1 | Smart Intelligence, public intelligence API, source registry, Global Alerts, ASK GPIR | Replace the basic browser with the approved compact dashboard while preserving the 12-hour ticker, long-term history, governance and payment separation. | Six periods; geography; 12 topic filters; top signal; six real-data KPIs; topic comparisons; 12-week heatmap; shared live dataset; ASK context; desktop/mobile verification. | Implementation and focused validation complete. Two fully eligible MAS historical records populate the governed dataset; weaker/null-date legacy rows are excluded. Three official endpoint corrections are prepared with exact guards and rollback. | PENDING release | Current branch | M39 |

## M39 coordinated production closure

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-PRODUCTION-CLOSURE | 2026-11-07 | Complete Global Alerts, distinct FX and Smart Intelligence tools, governed Contentful linkage and the My GPIR three-action journey | FX, INTELLIGENCE, CONTENTFUL, READER EXPERIENCE, RELEASE | Critical | IN PROGRESS | PR checks, owner-authorized merge, Edge/Pages deployment and live authenticated acceptance | Stage 1 | Existing FX archive, reader summary, public intelligence APIs, My GPIR and Contentful index | Reuse the approved architecture; make both tools available to authenticated readers without payment; recover AED/INR from dated supplementary observations; preserve truthful alerts and paid entitlements. | AED/INR renders sparse dated history with limitations; Smart Intelligence is independent; three reader actions are exact and filterable; alerts publish only when eligible; 26 CMS records and RLS/payment controls remain unchanged; live URLs verified. | Implementation and local release gate complete. Production inventory confirms three current AED/INR dated observations, 72/72 healthy ingestion runs and zero threshold-eligible current candidates. No database/CMS mutation or threshold change. | PENDING deployment and live verification | Current branch | M39 |

## M39-FX Contentful editorial activation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-FX-CONTENTFUL-ACTIVATION | 2026-11-05 | Establish the first governed, source-backed pair-specific Contentful publication for Smart FX Intelligence without weakening publication controls | EDITORIAL, CONTENTFUL, FX, GOVERNANCE | High | IN PROGRESS | Fresh Contentful Delivery build; reviewed route/index promotion; owner-controlled merge and Pages deployment | Stage 1 | Existing `gpirPublication` model, M35 delivery workflow, M39 FX editorial bridge | Inspect the delivered estate once; create no duplicate publication; retain Supabase identity and access authority; publish only through the established Contentful and GitHub release path. | Delivery readback matches the approved identity; canonical route returns 200; public FX editorial index contains exactly the approved USD/JPY record; subscriber FX remains protected. | Owner-approved identity now exists: publication `VK-GPIR-P-000000000036-4`, record `399ce347-30ea-408a-8bf5-2fc42fe6f9fa`, lineage `VK-GPIR-L-000000000036-4`, CURRENT/PUBLIC/ACTIVE/EVIDENCED, Contentful entry `5Ihk9crvLzMw02mrCh91Ph`. The stale bridge check is corrected to export only CURRENT/PUBLIC pair research from Delivery. The live route still returns 404 and the production FX editorial index is empty because no post-publication delivery build and reviewed deployment has completed. Subscriber FX remains protected (unauthenticated Edge request 401). | PENDING artifact generation and reviewed deployment | `788797c` / PR #513 | M39-FX |

## M39-FX final UI/UX refinement

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-FX-UI-FINAL | 2026-11-05 | Complete the existing subscriber FX Intelligence UI/UX refinement and evidence presentation without changing architecture or release boundaries | READER EXPERIENCE, DATA, AUTHORIZATION, RELEASE | High | IN PROGRESS | Owner review/merge of PR #503; post-merge Pages verification | Stage 1 | `pages/fx/intelligence.html`, `<gpir-fx-card>`, scoped FX CSS and tests | Align the protected dashboard with homepage chrome; reduce spacing and heavy navy; preserve pair/period state, real fixing dates, converter, peers, access controls and existing data contracts; provide four expandable sourced intelligence briefs and explicit unavailable research states. | Six periods synchronized with chart and URL; compact range ladder and default-collapsed heatmap; four briefs with takeaways/evidence/sources; no fabricated research; desktop/tablet/mobile/foldable acceptance; focused tests and repository validators green; one PR; no merge/deploy. | Implementation and local/browser acceptance complete on `codex/m39-fx-ui-refinement`. 30/30 focused tests and repository validators pass. Seven viewport widths have no horizontal overflow; period, converter, evidence disclosure and mobile menu behaviors are verified. Supabase, recovery, capture, payments, auth, ASK GPIR, alerts, Contentful and ticker contracts are unchanged. Remote implementation SHA `97331d9` is confirmed and PR #503 is open. | PENDING owner review/merge | `97331d9` / PR #503 | M39-FX |

## M39-FX Stage 1 historical reference recovery

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-FX-STAGE1-HISTORY | 2026-11-04 | Recover verified January 2026 onward historical FX reference coverage for the configured GPIR pair universe | DATA, FX, SUPABASE, RELEASE | High | IN PROGRESS | Separate owner approval for one `apply-approved` dispatch; post-write verification before enabling observation identity | Stage 1 | `fx_historical_archive`, FX provider contract, scheduled FX workflow | Reuse the existing architecture and approved ECB/Frankfurter source; retain observation dates and provenance; distinguish direct/cross/inverse; disclose gaps and unsupported pairs; never overwrite valid Production observations. | Reconcile all 134 pairs; verify USD/JPY, EUR/JPY, USD/INR and AED/INR; idempotent deduplicated apply path; pair-level coverage report; focused tests; no Production mutation before approval. | PR #502 merged as `aef4bed9`. It handles valid pre-window carry-in and all required transient/malformed failures using bounded official ECB Data API CSV fallback. Normal and injected-522 plans independently verify 60 supported pairs, 74 unsupported pairs, 216 fixing dates through 4 November and 12,960 planned rows. Production had the additive columns/index and 938 preserved legacy rows but zero dated rows at the last read-only checkpoint; no apply dispatch or variable change is claimed. | PENDING owner-controlled backfill and verification | `aef4bed9` / PR #502 | M39-FX |

## M39-FX-08 subscriber currency-pair intelligence

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-FX-08 | 2026-11-04 | Add an on-demand, subscriber-only historical currency-pair intelligence dashboard following the approved v2 design | READER EXPERIENCE, DATA, AUTHORIZATION, RELEASE | High | IN PROGRESS | Owner-supplied approved test-user UUID and explicit live-acceptance enablement; separately controlled Production checkout activation | Stage 1 | Existing reader authentication, `gpir-reader-summary`, `fx_historical_archive`, FX navigation and homepage | Use ECB-provider Frankfurter history and validated existing GPIR capture metadata without new services, tables, public premium-data endpoints, or transaction quotations. Keep public FX ticker behavior unchanged. | Six observation-based periods; deterministic metrics and tests; multi-pair card contexts; normal ACTIVE/current/confirmed-payment gate; disabled-by-default FX-only registered-reader acceptance; exact environment-approved subscription plan; actual-source provenance and missing-data states; adjacent tickers; selected-pair journey; one PR; controlled deployment; no merge. | PR #499 merged as `1e53d64`. Dashboard, pair state and confirmed-payment authorization remain preserved. The server-only acceptance gate requires exact `true` plus one authenticated Supabase UUID, grants only the FX response and otherwise fails closed. Owner-authorized Production deployment completed as `gpir-reader-summary` version 29 with exact repository-file parity and guest denial verified; no acceptance variable, schema, payment or activation changed. | MERGED / function deployed; live-acceptance enablement and checkout activation remain owner-controlled | `1e53d64` / PR #499 | M39-FX |

## M39-FX-06 selected-pair context and archive repair

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-FX-06 | 2026-11-03 | Correct FX precision and spacing; preserve selected-pair context across Currency Explorer, Weekly Trends and Historical; repair the existing Supabase FX archive path using validated observations | READER EXPERIENCE, DATA, RELEASE | High | IN PROGRESS | GitHub authentication to push the working branch and create the requested PR; owner review before merge | Stage 1 | Existing FX page generator, browser readers, archive workflow and `fx_historical_archive` table | Preserve the existing architecture, public pricing access, entitlement boundaries and merged navigation fixes. Do not invent historical rates, spreads or executable quotations; do not add providers, services, tables or architecture layers. | Correct direct/JPY/inverse precision; compact responsive spacing; selected pair preselected and filtered across all three views; Supabase archive uses existing supported secrets and only validated source observations; focused checks pass; one PR; stop before merge/deployment. | Implementation commit `24aca5c` and focused checks pass on `feat/m39-fx-06`. Read-only public history has one 2026-11-03 capture; earlier probed windows have no rows and cannot be legitimately reconstructed. Screenshot evidence was unavailable. Push failed with `fatal: unable to get password from user`; no remote branch or PR exists. | BLOCKED: GitHub authentication | `24aca5c` / `527aba0` local; `02e74c1` base | M39-FX |

## G1 final Production closure

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G1-FINAL-CLOSURE | 2026-11-02 | Complete one governed intelligence publication and expose an explicit rolling 15-day historical repository | INTELLIGENCE, DATA, GOVERNANCE | Critical | COMPLETED | Continue normal monitored operation; retain truthful empty state until a candidate passes every gate | Stage 1 | `gpir-intelligence-publish`, `gpir-public-intelligence`, Search GPIR, ASK GPIR | Retain the 12-hour Global Alerts lifecycle, return approved Supabase intelligence from the latest 15 days without deleting older rows, and publish only after complete source validation and owner authorization. | Inclusive 15-day boundary; older records retained; Search/ASK record contract preserved; source tiers and duplicate gates enforced; scheduler and public functions verified in Production. | PRs #479/#480 and the later repository corrections are merged. At 2026-11-06 03:13 UTC, cron was active every ten minutes with 144/144 successful runs in 24 hours; Edge logs showed 141 publisher and 71 ingestion HTTP 200 responses. The public 12-hour feed was honestly empty. Two approved MAS records remained ARCHIVED with source attribution. Zero duplicate canonical URLs/fingerprints; 794 T3 candidates remained REVIEW; no threshold was bypassed. 35/35 focused tests and repository validators pass. | 2026-11-06 | Production evidence checkpoint | G1 |

## M39/G1 final homepage repair

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-G1-FINAL-HOMEPAGE | 2026-11-02 | Repair intentional-hover navigation and the homepage payments timeline while verifying both published MAS repository cards | READER EXPERIENCE, INTELLIGENCE, RELEASE | Critical | IN PROGRESS | Current PR CI, merge and GitHub Pages deployment | Stage 1 | homepage header/timeline, intelligence repository | Preserve existing architecture and integrations; prevent scroll-triggered menu opening; contain timeline SVGs; display both MAS cards with original dates, ARCHIVED lifecycle and official links. | Desktop/tablet/mobile behavior and screenshots; Australia/TerraPay search regression; two exact IDs returned by `scope=history`; 38/38 focused tests; one PR and one post-deployment check. | Implementation and local/browser acceptance complete; Production API/cards verified read-only; no database mutation. | PENDING release | Current work branch | M39/G1 |

## M39-G1 Homepage navigation and Global Alerts

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-G1-UI | 2026-10-31 | Correct accidental homepage mega-menu activation and complete the existing read-only Global Alerts integration | READER EXPERIENCE, INTELLIGENCE, SECURITY | High | SUPERSEDED | M39-G1-FINAL-HOMEPAGE | Stage 1 | homepage navigation, `gpir-public-alerts` reader | Make desktop menus click-driven, preserve mobile/keyboard behavior, show only eligible 12-hour public alerts, distinguish unavailable from empty, and retain archive access without exposing private credentials. | Hover never opens; click toggles; outside/Escape close; mobile works; valid alert renders; expired/unapproved/malformed records do not; empty/failure are distinct and readable; no deployment. | PR #479 merged the controller and Global Alerts hardening. The owner's 2026-11-02 release instruction supersedes only the no-hover acceptance rule with movement-gated intentional hover; the Global Alerts and mobile/keyboard contracts remain preserved. | 2026-11-02 | `e50c5d5` / PR #479 | M39-G1 |

## M39-FX-05 Public FX pricing boundary

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-FX-05 | 2026-11-03 | Display validated reference, cash, spot and forward buy/sell rates only when supplied by authorized sources; keep spread analysis, pricing benchmarks, competition comparisons and global benchmark intelligence behind subscriber authorization | READER EXPERIENCE, DATA, AUTHORIZATION | High | IN PROGRESS | Owner review; authorized source data remains a separate provider/licensing prerequisite | Stage 1 | `assets/js/fx-app.js`, FX normalization, existing entitlement architecture | Extend the existing normalized FX record for source-supplied directional rates; show only validated provider-native pricing; remove public spread computation/display; preserve entitlements and all missing-data states. | Focused tests prove validated supplied rates render, missing/unvalidated/derived rates do not fabricate or leak values, and no public FX component computes or renders spread analytics. Existing entitlement code and public URLs remain unchanged. | Implementation complete; focused FX, data, content, link, syntax and whitespace checks pass. No directional prices exist in the committed reference snapshot, no provider integration or entitlement change was made, and no public JS/FX page contains spread calculation or display. Owner review awaits the blocked branch push. | PENDING push and owner review | `9c6f780` local only | M39-FX |

## M39 Reader Summary reliability

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M39-READER-RELIABILITY | 2026-10-29 | Validate primary, restricted PGRST202 fallback and dual-failure Reader Summary responses and prepare controlled Production deployment | READER EXPERIENCE, AUTHORIZATION, SECURITY | High | IN PROGRESS | Owner review/merge and separately controlled Production Edge Function deployment | Stage 1 | `gpir-reader-summary`, M39 reliability tests | Preserve the existing primary/fallback helper, prove resolver-authoritative ALLOW filtering, fail closed on unavailable or malformed candidates, preserve independent account/billing data, and avoid sensitive dependency logs. | Deterministic primary, fallback, malformed-candidate and dual-failure tests pass; M37 payments/subscriptions remain green; repository validators pass; no Production mutation or deployment occurs during preparation. | Implementation and release gate complete on PR #472: M37-M39 tests pass 48/48; validators and secret scan pass; both required GitHub workflows passed; upstream error messages were removed from dependency diagnostics. Six unrelated M35 estate-count tests are reproduced on main. | PENDING owner review/deployment | `9a0f095` / PR #472 | M39 |

## M37 final Production payment integration

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M37-UI-01 | 2026-10-28 | Integrate the existing six-currency one-time PayPal checkout into My GPIR without changing recurring billing | PAYMENTS, AUTHORIZATION, READER EXPERIENCE, SECURITY | High | IN PROGRESS | Owner-authorized GitHub review route and merge; Production deployment remains owner-controlled | Stage 1 | `reader/my-gpir/`, browser payment adapters, existing M37 Edge Functions | Load authenticated Production offers, render only server-approved currencies, create and capture through existing functions, and refresh authoritative account state after verified capture. | Six server-returned 9.99 currencies; authenticated session; no browser-trusted amount; only `SERVER_VERIFIED` capture refreshes access; responsive UI; recurring unchanged; focused checks green. | Implemented on `codex/m37-ui-reader-checkout`; warning defect confirmed and corrected; targeted M37/M38 tests pass 34/34; no real-money payment or Production mutation. PR #469 is already merged, so owner direction is required before opening a follow-on PR. | PENDING owner review route | Work branch | M37 |
| M37-FINAL | 2026-10-28 | Complete international one-time reader payment integration in existing PR #469 while preserving recurring subscriptions and keeping Production offers disabled until acceptance | PAYMENTS, AUTHORIZATION, READER EXPERIENCE, SECURITY | High | IN PROGRESS | Owner review/merge and separately authorized Production deployment/activation | Stage 1 | Production M37 Edge Functions, My GPIR, existing M37 tables/RPCs | Connect Production preparation/attachment/finalization contracts, verified idempotent webhook reconciliation, one 30-day entitlement per capture, six-currency history/access display and fail-closed recovery. | Server-authoritative 9.99 pricing in USD/EUR/GBP/SGD/AUD/CAD; exact verified capture; duplicates and failed states grant nothing; delayed reconciliation recovers; My GPIR reports history/pass expiry; recurring code unchanged; checks green; offers remain disabled. | Implementation complete on PR #469: exact Production RPCs are connected, webhook uses the existing unique event ledger and verified PayPal readback, capture recovery and My GPIR integration are implemented, focused M37/M38 tests pass, and live read-only contract verification confirms zero Production M37 payment rows plus disabled six-currency offers. Publication remains owner-controlled. | PENDING owner merge | PR #469 work branch | M37 |

## Supabase announcement scraper

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUPABASE-ANNOUNCEMENTS-04 | 2026-09-14 | Add standalone HTML/RSS scraper for Supabase announcements | AUTOMATION, DATA, PUBLICATION CONTROL | High | IN PROGRESS | Verified project-owner publication approval/review and live workflow/database verification | Stage 1 | `scraper.js`, `.github/workflows/run-ticker.yml` | Read C/A sources and write duplicate-safe announcement rows with current UTC `MM/YYYY` archive value. Use broad all-anchor fallback, finance keywords and approved/ticker-eligible status as requested. | Focused extraction/batching and announcement regressions pass; live insert and consumer display verified. | Broad fallback implemented on work branch after user reported green runs but empty table. Earlier direct-main auto-review rejection remains in force. Live database result and public-site display unverified. | PENDING | Work branch | SUPABASE-ANNOUNCEMENTS-04 |

## FX regional hourly archive repair

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FX-GLOBAL-ARCHIVE-01 | 2026-09-14 | Cover 28 regional currencies and resume hourly Supabase FX archiving | AUTOMATION, DATA, READER EXPERIENCE | High | IN PROGRESS | Owner-supplied `fx_historical_archive` table and Actions secrets; owner review/merge | Stage 1 | `scripts/fx/generate-fx-snapshot.js`, `scripts/fx/archive-supabase.js`, `.github/workflows/fx-market-data.yml`, `scripts/generate-fx-pages.js` | Build all USD and regional local crosses from one free reference response; archive each validated hourly capture; generate weekly observations from seven days of database rows; remove fixed archive date and stale filesystem rollover. | All target codes covered; no fabricated rates; hourly capture rows use supplied schema; daily deduplicated weekly statistics; static reader survives database outage; local validation and owner-review PR. | Implemented and locally validated; live Actions/DB results and owner review pending. | PENDING | Work branch | FX-GLOBAL-ARCHIVE-01 |
| FX-GLOBAL-ARCHIVE-02 | 2026-09-14 | Render global weekly/historical cards from public seven-day Supabase archive rows | READER EXPERIENCE, DATA | High | IN PROGRESS | Publicly readable archive rows; owner review/merge and scheduled workflow | Stage 1 | `assets/js/fx-public-history.js`, `scripts/generate-fx-pages.js`, `pages/fx/weekly.html`, `pages/fx/historical.html` | Query project REST API by chronological timestamps, group all pairs, calculate seven-day delta/high/low, and derive capture choices from returned timestamps. | Local tests and validators pass; public API returns rows to publishable key; owner reviews branch. | Implemented and locally validated; read-only live probe returned HTTP 200 with zero rows. | PENDING | Work branch | FX-GLOBAL-ARCHIVE-02 |
| FX-BIDIRECTIONAL-03 | 2026-09-14 | Support both sending directions in public FX archive and Treasury cards | READER EXPERIENCE, DATA | High | BLOCKED | Explicit project-owner release authorization or owner-controlled PR merge; publicly readable archive rows | Stage 1 | `assets/js/fx-public-history.js`, `assets/js/fx-app.js`, `pages/fx/historical.html`, `pages/fx/weekly.html` | Derive missing inverse pairs without replacing recorded reverse observations; display six-decimal inverse rates and mathematically inverted movement. | JPY/USD, GBP/EUR and all 28 regional targets resolve; arrows and colors match inverse movement; validations pass. | Implemented and locally validated on the pushed branch; auto-review rejected direct main push because owner authorization was not established. | PENDING | Work branch | FX-BIDIRECTIONAL-03 |

## Phase 3 live country dashboard

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUPABASE-COUNTRY-03 | 2026-09-13 | Use the public Supabase API for live country summaries in the Dashboard Gallery | READER EXPERIENCE, DATA, AUTOMATION | High | BLOCKED | Owner-controlled PR review/merge after auto-review rejected direct main push; publicly readable `publication_status=live` rows for visible content | Stage 1 | `assets/js/generate-dashboard-gallery.js`, `index.html` | Query only live country rows and enhance the existing gallery without making the site depend on Supabase. | Public-key REST filter, safe text rendering, static fallback and focused validators; owner-controlled production release. | Frontend implementation validated and pushed on `codex/phase3-live-country-dashboard`. Public API and CORS returned HTTP 200, but anon-key reads returned zero rows. Direct main push was rejected by automatic approval review; no production release occurred. | PENDING | `06b8f3b` | SUPABASE-COUNTRY-03 |

## Supabase country metadata mirror

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUPABASE-COUNTRY-01 | 2026-09-13 | Mirror canonical country metadata to Supabase by country code | AUTOMATION, DATA, ARCHITECTURE | High | IN PROGRESS | Supabase Actions secrets; owner reports UNIQUE constraint on `country_intelligence.country_code` configured | Stage 1 | `scripts/sync-country-intelligence.js`, `.github/workflows/continuous-intelligence.yml` | Upsert six canonical country records after static workflow validation, retaining GitHub as source of truth. | Exact country-code conflict mapping; real summary/risk fields mapped when present; unknown fields retained in metadata; no static-generation regression; database failure does not block the site. | Local implementation and contract validation completed. Owner confirms unique key installed; live write, Actions run and owner review remain pending. | PENDING | `b02b1de` | SUPABASE-COUNTRY-01 |

## M30 production closure

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M30-ANNOUNCEMENTS-CLOSURE | 2026-09-10 | Final Global Announcements production closure | READER EXPERIENCE, AUTOMATION, INTELLIGENCE, RELIABILITY | High | IN PROGRESS | M29, P1 and Wave A merged; existing canonical announcement architecture | Stage 1 | `assets/js/announcements.js`, `assets/js/announcement-dashboard.js`, `assets/js/announcement-lifecycle.js`, `assets/css/page.css`, `assets/css/chapter-page.css`, `scripts/generate-intelligence-pages.js`, `scripts/publish-intelligence-candidates.js` | Close the existing feature with a seamless compact ticker, compact Month/Year archive, source-timestamp lifecycle, deterministic exact-timestamp T1 gate and full LKG/Search/ASK retention. | Browser-visible continuous motion with no scrollbar; no stale LIVE; dynamic Month/Year counts and local filtering; A–E recovery and all M30/regression tests pass; one branch and PR; no Wave B or unrelated redesign. | Implemented, validated and pushed. PR #356 is open and mergeable; its initial Security and Integrity workflow passed. Report-only discovery: 113 evaluated, 0 discovered/proposed/published; 14 existing candidates retained, 7 quarantined; 0 LIVE and 14 archived. | PENDING owner review | `bf14d59` | M30 |

## P1 reliability recovery

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P1-CONTINUOUS-DISCOVERY | 2026-09-10 | Recover failed Continuous Intelligence Discovery run #15 | AUTOMATION, RELIABILITY, INTELLIGENCE | P1 | IN PROGRESS | M29 merged on `main`; existing candidate/validation workflow | Stage 1 | `.github/workflows/continuous-intelligence.yml`, `scripts/propose-intelligence-candidates.js`, `scripts/publish-intelligence-candidates.js`, `scripts/test-continuous-intelligence-recovery.js` | Diagnose the exact failed command; preserve immutable LKG publication; isolate endpoint/parser and source-health failures; make zero-result discovery successful; verify ticker fallback and Node compatibility without architecture redesign. | A–E simulations pass; health failures retain prior snapshot and exit gracefully; announcements/registry/archive/Search/ASK inputs remain unchanged; exact run failure and Node finding recorded; one branch and one owner-review PR, never merged by the worker. | Implemented, locally validated and pushed; PR #353 is open for owner review and its initial integrity check passed. | PENDING owner merge | `6011fd3` | P1 Continuous Intelligence Discovery Recovery |

## Completed foundation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GOV-001 | 2026-08-28 | Establish content schema and architecture guardrail | GOVERNANCE, ARCHITECTURE, DATA | High | COMPLETED | Existing static architecture | Stage 0 | `docs/CONTENT_SCHEMA.md`, `docs/ARCHITECTURE_GUARDRAIL.md` | Document current data and change contracts and add structural validation. | Documents exist; validator passes current JSON. | Delivered in prior governance increment. | 2026-08-28 | Uncommitted; last verified `c25ff96047dba7a688e0c7d374bc162abce22737` | M-08 |
| GOV-002 | 2026-08-28 | Establish permanent project memory and change governance | GOVERNANCE, ARCHITECTURE | High | COMPLETED | GOV-001 | Stage 0 | `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`, `docs/PROJECT_STATUS.md`, `docs/DEVELOPMENT_GOVERNANCE.md` | Create append-only history, current status, backlog and agent operating rules. | Four documents exist, links resolve, status and milestone are recorded. | Delivered by Prompt 09. | 2026-08-28 | No new commit; last verified `c25ff96047dba7a688e0c7d374bc162abce22737` | M-09 |
| REG-001 | 2026-08-28 | Establish a canonical structured content registry pilot | DATA, ARCHITECTURE, SCALING | High | COMPLETED | GOV-001, GOV-002 | Stage 1 | `assets/data/content-registry.json`, `scripts/validate-content.js` | Create one reference-based catalog for typed records, relationships and page/source pointers without duplicating content. | Pilot records validate; source references, relationships and page targets resolve; existing generator and search remain functional. | Pilot delivered; broader data migration and registry-driven generation remain outstanding. | 2026-08-28 | `7813132e2fd21a746932778b8c8459bb62dafaab` | M-10 PARTIAL |
| M-26A | 2026-09-05 | Public repository activation | READER EXPERIENCE, DATA, ARCHITECTURE | High | COMPLETED | Existing validated GPIR assets and registry relationships | Stage 1 | `index.html`, `assets/js/*`, `assets/data/*.json`, `pages/regions/*.html`, `pages/countries/*.html` | Activate the current GPIR portfolio as a coherent public repository without waiting for full country or dashboard coverage. | Existing content is discoverable, connected and honest about availability; no new research or infrastructure is created. | Public activation achieved using the repository's existing registry, search, ASK GPIR, dashboard and narrative assets. | 2026-09-05 | `bfb08fb7e12bee4cbd36c6a84921cbc55a981141` | M-26A |
| M-26B | 2026-09-05 | Publicly connected intelligence repository | READER EXPERIENCE, DATA, ARCHITECTURE | High | COMPLETED | M-26A public activation; canonical registry relationships | Stage 1 | `assets/js/script.js`, `assets/css/chapter-page.css`, `pages/countries/*.html`, `pages/regions/*.html` | Surface deterministic region, country and dashboard relationships in the public reader using the existing registry rather than inventing missing links. | Country and region pages present connected GPIR links and honest readiness states without new data or backend work. | Country and region pages now render connected intelligence panels based on canonical registry relationships and the live production routes are HTTP 200 verified. | 2026-09-05 | Final M-26B release commit | M-26B |
| M-27A.1 | 2026-09-05 | Navigation hierarchy and registry-driven Dashboard Gallery release | READER EXPERIENCE, DATA, ARCHITECTURE, GOVERNANCE | High | COMPLETED | M-27A; canonical registry relationships | Stage 1 | `index.html`, `assets/js/generate-dashboard-gallery.js`, `assets/js/script.js`, `docs/*.md` | Preserve Global -> Region -> Country while making Dashboard Gallery a presentation/view layer over existing dashboard-country-region relationships. | All five dashboard identities resolve Dashboard -> Country -> Region; existing routes, metadata, narratives, image assets and historical assets remain intact; no new research is introduced. | Implemented, locally validated and live HTTP verified. Release SHA: `69b928f9952b242c4fd164908394634394a2a89d`. | 2026-09-05 | `69b928f9952b242c4fd164908394634394a2a89d` | M-27A.1 |
| M24 | 2026-09-08 | Global Intelligence Coverage & Reader Integration | INTELLIGENCE, READER EXPERIENCE, DATA, GOVERNANCE | High | COMPLETED | M20-M23.1A radar/candidate pipeline; M22 canonical country/region metadata; GPIR-OPS-01 | Stage 1 | `assets/data/trusted-sources.json`, `assets/data/content-registry.json`, `scripts/propose-intelligence-candidates.js`, `scripts/gpir-source-health-report.js`, `scripts/test-m24-reader-integration.js` | Expand the trusted-source radar beyond APAC into GCC, Europe/UK, North America, LATAM, Africa and CIS/Central Asia; add REGION registry records connecting the existing europe/americas/latam/africa country-metadata files and pages; extend deterministic payments-relevance keywords; add read-only source-health reporting; prove one qualified record already connects to Global Announcements, Country/Region association, Search GPIR indexing, ASK GPIR context and lifecycle/provenance without duplication. | Registry/content-registry validate; radar regression, new relevance and new M24 reader-integration tests pass; no new machine-readable endpoint is claimed without live verification; no historical record is altered. | New sources added inactive/manual-discovery-only (network egress unavailable in this session to live-verify any new endpoint); region:europe/americas/latam/africa wired into the canonical registry; country:united-kingdom gained its first REGION relationship, closing REGION-002. | 2026-09-08 | `e91320a`, merged via PR #320 | M24 |
| M28-FX | 2026-09-08 | FX Pricing & Treasury Intelligence | READER EXPERIENCE, DATA, AUTOMATION, ARCHITECTURE | High | IN PROGRESS | Existing GPIR navigation/header/footer/template architecture; no prior FX milestone | Stage 1 | `assets/data/fx/*`, `scripts/fx/**`, `scripts/generate-fx-pages.js`, `scripts/validate-fx.js`, `scripts/test-fx.js`, `assets/js/fx-ticker.js`, `assets/js/fx-app.js`, `pages/fx/**`, `.github/workflows/fx-market-data.yml` | Compact automated FX ticker plus a full FX Pricing & Treasury reader section (Currency Explorer, Treasury Intelligence, Weekly Trends, immutable daily Historical archive) on a provider-adapter architecture; never publish invented/synthetic/stale-as-live rates; mandatory graceful No-Credential Mode. | Provider adapters normalize to the common schema with no fabricated field; previous-business-day variance never fabricates a comparison; validate-fx.js and test-fx.js pass; historical snapshots are immutable; UI never breaks with zero credentials configured. | Full architecture implemented and locally validated (`node scripts/test-fx.js`: 8/8 groups pass); genuinely exercised No-Credential Mode (this session had no provider credentials and no network egress — `assets/data/fx/current.json` is the real `NO_PROVIDER_CONFIGURED` output of an actual run, not a placeholder); licensed-provider adapters remain honest unimplemented contracts pending real vendor documentation; `fx-market-data.yml`'s initial direct-commit-to-main design was corrected before any push to a branch/PR review model matching `continuous-intelligence.yml` (see `docs/FX_PRICING_TREASURY.md`'s "Publication model" section) — main is never written directly. M24-M27C were already occupied milestone numbers (verified before choosing M28). | Not applicable — not merged | Not pushed; local branch `work/m28-fx-pricing-treasury-intelligence` only, per this milestone's explicit no-push instruction | M28-FX |
| M28-FX-FINAL | 2026-09-09 | Final scale and variance pass | SCALING, READER EXPERIENCE, DATA, AUTOMATION | High | IN PROGRESS | M28-FX core, Reader Polish and Compact Market UX merged through PR #332 | Stage 1 | `assets/data/fx/fx-config.json`, `scripts/fx/**`, `assets/js/fx-app.js`, `assets/css/market.css`, `pages/fx/**` | Use only earlier validated provider-business-day observations for variance; preserve the active provider's full common-base currency universe; expose deterministic Explorer cross-rates without pair-page sprawl; replace the Live FX card wall with a compact regional table; add reusable pair-intelligence hooks. | Same-day, prior-day, weekend, missing, positive, negative and zero variance regressions pass; all derived rates disclose their legs and classification; no fabricated history or unauthorised attribution; FX/link/syntax/diff checks pass. | Implemented and locally validated on `work/m28-fx-final-scale-variance`; no market-data artifact was regenerated or fabricated. Push, PR and Actions are pending at this checkpoint. | PENDING owner review/merge | Commit pending | M28-FX Final |
| M28-FX-R1 | 2026-09-11 | FX data-first production remediation | DATA, AUTOMATION, READER EXPERIENCE, GOVERNANCE | Critical | IN PROGRESS | M28-FX-FINAL merged; validated hourly observations present on `automation/fx-snapshot` | Stage 1 | `.github/workflows/fx-market-data.yml`, `assets/data/fx/**`, `assets/js/fx-ticker.js`, `assets/js/fx-app.js`, `pages/fx/**` | Restore the branch-to-review publication handoff, publish only genuine accumulated reference observations, calculate variance/history/weekly evidence, and prevent mutable FX JSON from remaining browser-cached. | 26 independently validated pairs carry prior-business-day variance; separate immutable daily archives and deterministic weekly evidence validate; current/weekly reads bypass cache while history remains stable; a missing review PR fails visibly; reference data is never labelled live. | Implementation and local validation complete on `work/m28-fx-r1-data-first-remediation`; production remains unchanged pending owner review and merge. Licensed live access is not configured, so the active source remains the authorised public reference tier. | PENDING owner review/merge | Commit pending | M28-FX-R1 |
| ANN-SOURCE-ACTIVATION | 2026-09-09 | Global Announcements authoritative source activation and freshness pass | INTELLIGENCE, DATA, AUTOMATION, GOVERNANCE | High | IN PROGRESS | Global Announcements lifecycle merged through PR #336; existing report-only candidate workflow | Stage 1 | `assets/data/trusted-sources.json`, `scripts/refresh-announcements.js`, `scripts/propose-intelligence-candidates.js`, `scripts/gpir-source-health-report.js` | Activate only live-verified official machine-readable feeds across the global regional grid; expose source-health/failure isolation; run a bounded report-only backfill from 2026-08-15 without bypassing human review. | At least one reliable new official endpoint is active where available; unsupported regions stay explicit; one source failure cannot abort the run; backfill cannot mutate public records; parser, lifecycle, Search/ASK and validators pass. | Seven Tier-1 endpoints activated, raising active machine-readable coverage from 6 to 13; 87 in-window records inspected, 5 relevant proposals routed to archive review, 82 rejected, 0 public mutations. GCC / Middle East remains an explicit gap. Implemented and locally validated; owner review, remote Actions and merge remain pending. | PENDING owner review/merge | Work-branch commit | Global Announcements Source Activation |

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

## Global Announcements permanent production recovery

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GA-PROD-01 | 2026-09-09 | Permanent source-to-intelligence production recovery | AUTOMATION, INTELLIGENCE, READER EXPERIENCE, GOVERNANCE | Critical | IMPLEMENTED / LOCALLY VALIDATED / REVIEW PENDING | M-18 lifecycle, M-21 discovery, merged PR #338 source matrix | Stage 1 | announcement discovery, publication gate, generator, reader, search/ASK, workflow | Close the candidate-to-publication break without source expansion, fabricated intelligence, runtime AI, direct-main automation or blank reader states. | Strict healthy Tier-1 gate; canonical append-only records; exact 24-hour lifecycle; permanent archive; server-rendered fallback; source health; retry/backoff; idempotent tests; one branch/PR. | One qualified HKMA record promoted from a real controlled backfill; five candidates retained non-public; 0 live / 10 archive / 1 developing; deterministic repository checks and local browser QA passed; push, PR, Actions and owner review remain pending. | PENDING | PENDING | Global Announcements Production Recovery |
## Global Announcements Intelligence Engine — implemented, owner review pending (2026-09-09)

- Exact 24-hour validated live ticker and retained repository archive implemented.
- Region/country/category/subcategory/date filters, counts, source validation, Search and ASK GPIR integration implemented.
- Backfill discovery remains proposal-only; expand configured trusted-source adapters in later governed milestones to reduce explicit regional coverage gaps.
## M29 — Global Source Network Activation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-29 | 2026-09-09 | Activate approved global source network | AUTOMATION, INTELLIGENCE, GOVERNANCE | Critical | IMPLEMENTED / LOCALLY VALIDATED / PR #349 REVIEW PENDING | Merged PR #343 production recovery | Stage 1 | trusted-source registry, acquisition, coverage, publication, archive, Search/ASK corpus | Activate safe deterministic acquisition for already-approved sources and flow real qualifying records through the existing canonical pipeline. | Functioning acquisition only counts as active; all 88 sources appear in machine-readable coverage; failures isolate; strict Tier-1 gate; bounded backfill; permanent pages/archive/Search/ASK; no FX or infrastructure change. | 43/88 sources active across 33 countries/jurisdictions; 211 dated records fetched, 13 admitted, 4 strictly published across three regions; 14 retained for review; 0 live / 14 archive / 1 developing. Deterministic local validation and the observed PR Actions run passed; branch pushed and PR #349 opened. Owner review and owner merge remain pending. | PENDING | `82e9962` | M29 |

## Wave A — Central Bank & Regulator Global Coverage Validation

| ID | Date Raised | Prompt / Requirement | Category | Priority | Status | Dependency | Target Stage | Related Module | Description | Acceptance Criteria | Outcome | Completion Date | Commit | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WAVE-A | 2026-09-10 | Validate and close central-bank/regulator country coverage before Wave B | AUTOMATION, INTELLIGENCE, GOVERNANCE | Critical | IMPLEMENTED / LOCALLY VALIDATED / PR #351 REVIEW PENDING | Merged M29 PR #349 | Stage 1 | trusted-source registry, acquisition parser, source health, country control matrix | Establish a bounded authoritative universe, revalidate active M29 authority acquisition, investigate all uncovered countries and give every jurisdiction one evidence-backed operational state. | Complete eight-region matrix; official-domain profiles; controlled acquisition/date/relevance/dedup checks; explicit blockers and methods; strict existing publication gate; one branch/PR; no Wave B/C/D or reader/FX redesign. | 85 authorities verified; 0 green, 37 amber, 1 quarantined, 47 verified unsupported, 0 missing. Twenty-five inactive BIS-member profiles added; parser/relevance defects fixed; 0 newly activated and 0 published; gap register complete. PR #351 is open; owner review/merge remain pending. | PENDING | `6801577` | Wave A |
| M39-G1-PROD-01 | 2026-11-03 | Correct owner-reported M39/G1 Production defects | PERFORMANCE, NAVIGATION, INTELLIGENCE, GOVERNANCE | Critical | PR #486 / PRODUCTION EVIDENCE PENDING | PR #485 baseline `26c07d5`, approved M39 branch, existing G1 Edge Functions | Production correction | homepage, archive, G1 publisher | Remove the measured startup blocker, restore approved taxonomy, constrain hover intent, reconcile archive authority and restore scheduled publisher selection without new infrastructure. | One before/after Production trace; 8/37/157 taxonomy; accessible responsive archive; publisher HTTP 200; governed 49-day counts; three-viewport live evidence; required checks and deployment pass. | PR #486 initial CI passed. Local desktop/1024px/390px navigation and archive acceptance pass without horizontal overflow; current-head CI, Edge deployment, governed backfill, Pages deployment and live after-evidence remain pending. | PENDING | `d7a00aa` + follow-up | M39/G1 |

## M41 — Payload CMS migration

- Raised: 2026-11-14. Category: ARCHITECTURE / CONTENT / DATA / GOVERNANCE / SECURITY / AUTOMATION.
- Status: IN PROGRESS / SOURCE IMPLEMENTED / EXTERNAL PROVISIONING BLOCKED.
- Branch: `codex/gpir-payload-cms-migration-20261114`; base `5230fe3`.
- Delivered: isolated Payload app and collections; PostgreSQL schema/role boundary; Supabase Storage S3 configuration; secure export, two-pass idempotent import, checkpoints and reconciliation; authorized signed release service; cloud dev container and manual workflows; focused compatibility tests and handover.
- Acceptance still required: live Contentful backup; reviewed generated Payload collection migration; non-production database import/reconciliation; end-to-end create/update/release/retrieve/archive acceptance; owner-approved cutover, rollback window and separate Contentful retirement approval.
- Blockers: Contentful organization grant; approved database/runtime/migrator logins; S3/Payload/release secrets; upstream Payload Lexical `happy-dom` high advisories; owner cutover authorization.
- Next executable action: grant the Contentful management token and provision the non-production Payload database, then follow `docs/M41-PAYLOAD-CMS-MIGRATION.md`.


### 2026-11-15 — M41 PR #580 release continuation

- IN PROGRESS: same-PR Worker build correction implemented and locally verified (17 tests, TypeScript, complete OpenNext bundle).
- BLOCKED: production TLS/database/admin/login/deployment acceptance requires authenticated Cloudflare runtime and private settings; current workspace preflight is 0/11. Three high upstream Happy DOM/Lexical/Payload audit findings remain for remediation/compatibility review. See corresponding master-log entry. No new PR or production cutover performed.


### 2026-11-15 — M41 Worker UnknownIssuer correction

- IN PROGRESS, PR #580 only: owner-approved Hyperdrive transport and secure setup helper implemented; Node TLS success is distinct from Worker acceptance. Worker build and 27 local tests pass. Pending authenticated resource creation, actual binding ID, admin/login validation and CMS deployment. Public website, Supabase schema, Contentful and original migration work are preserved.


### 2026-11-15 — M41 actual binding reconciled

- Hyperdrive setup VERIFIED by owner-provided command result: correct origin, selected CA, verify-full and disabled caching. CMS binding ID recorded on PR #580; source e072eb7 CI passed. Pending final binding-head CI and Worker admin/authentication/live-deployment acceptance. No database schema or public website change.


### 2026-11-15 — M41 preview authenticated; final production command prepared

- VERIFIED: Worker preview admin loads and editorial login opens populated Research Publications (owner screenshots). Binding-head CI passed.
- VERIFIED LOCALLY: Happy DOM security patch removes all high/critical audit findings; 30 tests, TypeScript and Worker build pass. Remaining 8 moderate/9 low findings reviewed and tracked.
- PENDING: execute guarded CMS-only release helper in authenticated Codespace, capture actual deployment version/URL and live smoke evidence, then verify live editorial login. PR #580 remains the only correction vehicle; no content cutover or migration authorized by these checks.


### 2026-11-15 — M41 authentication acceptance reopened

- BLOCKED on current production 68f6cb2: owner logs confirm unsupported stored PBKDF2 iterations; public HTTP 200 is not authentication success.
- IMPLEMENTED on PR #580 only: documented Worker password-hash setting, private verified existing-password rehash helper, and native database socket lifecycle correction. 34 tests, TypeScript, Worker build pass; no high/critical audit findings.
- NEXT: current-head CI, private Node login/conversion using existing credentials, guarded redeployment, then live authentication/collection acceptance. Preserve original Codespace work and saved configuration stash. No source/content migration or main merge authorized by this correction.

- CI follow-up: reviewed two synthetic authentication fixture literals through the existing exact path/line/rule/fingerprint allowlist; scanner patterns and scope remain unchanged. Private prompt data is passed directly and cleared without assignment matches. Scanner regression expectations include the two reviewed fixtures.


## 2026-11-15 — M41 full content cutover continuation, PR #580

Owner authorized full migration/cutover with Contentful BCP; existing infrastructure
acceptance retained. Added managed-site import/signed delivery, preserved-engine
editorial adapters and immutable Contentful recovery tooling to the existing branch.
10 new tests, 24 existing relevant tests, TypeScript and Worker build pass locally.
834 managed / 93 protected files inventoried. Production migration, source switch
and real BCP sync/recovery NOT RUN: authenticated Codespace/deployment access is
unavailable. Native research edit-to-snapshot propagation and competing-authority
reconciliation remain ACTIONABLE implementation work before private RELEASE.
Overall M41 remains IN PROGRESS; do not mark complete. No new PR, schema mutation,
validation promotion or Contentful deletion. See M41-FULL-CUTOVER-REPORT.md.


## 2026-11-15 — M41 native source contract and controlled release handover

Continued PR #580 only. The source gap recorded at 42f9822 is resolved: native
research authority/adoption, Supabase-gated immutable editions, protected-content
Payload lookup, permanent source lock and fuller BCP reference/media/draft recovery.
Existing Contentful content is never deleted or overwritten. One private runner
and M41-PRODUCTION-HANDOVER.md check access/settings before production stages and
preserve the original checkout/stashes. 84 focused tests, TypeScript, Worker build,
scanner and public inventory pass; 835 managed / 93 protected files. Private run
stopped at preflight because existing env/CA/deployment sessions are unavailable.
No production deployment or actual BCP recovery claimed. Source/handover PREPARED;
production cutover and reader acceptance OPEN / BLOCKED ON EXECUTION ACCESS.
See M41-FULL-CUTOVER-REPORT.md.


## 2026-11-15 — M41 resume: Contentful unchanged, primary cutover priority

Resumed saved checkpoint 2844a41/PR #580, without repeating implementation. Both
checkpoint CI workflows passed. Owner clarified zero Contentful changes and no
BCP synchronization delay. Removed sync from the runner and both relevant workflow
paths, added read-only draft guard and deny-by-default BCP writes with two tests.
Recovery retains unchanged Contentful baseline, read-only export, original Payload
snapshot and previous Git/Worker release history. Future Payload-to-Contentful sync
is deferred; no false synchronized-BCP claim. Runner attempted here; stopped at
preflight with stages=[] because the authenticated Codespace checkout/private env/CA
and deployment sessions are unavailable. No production change or Contentful write.
One complete private command batch and exact blocker are recorded in the handover.
M41 remains OPEN until actual deployment/live evidence; PR #580 only.


## M41 — owner preflight evidence and existing-session access fix

Owner ran 1c353a2; stages=[]; missing three explicit Delivery/Cloudflare settings.
No production or Contentful changes. Removed those mandatory variable requirements: exclude
new token creation, reuse authenticated Wrangler/verified Hyperdrive account and
GET-only lookup of an existing Delivery key. OAuth stays local; no credentials are
logged. Eleven focused tests pass. Handover resumes the clean failed worktree and
preserves originals/stashes. PR #580 only. Actual cutover/live evidence still pending.


## M41 — owner preflight project mismatch and CMS/Core boundary correction

Owner's 1e41d42 run: BLOCKED_NOT_COMPLETE, stages=[], no production/Contentful
changes. The old guard incorrectly required CMS and Core projects to be identical.
Corrected private CMS URL/DB/Hyperdrive validation plus independent Core target
from committed public configuration; existing Core authority checked read-only.
Separate server-only runtime fields prevent CMS credentials/URLs from redirecting
Core functions or publication decisions. Resume supports any clean pre-production
PR ancestor, preserving work; pinned CLI remains v2.121.0. Eighteen focused tests
pass. PR #580 only; migration/live cutover still pending private execution.


## M41 — missing GitHub cutover environment corrected (2026-11-15)

Owner's 038b16e attempt passed CMS/Core separation, then stopped at preflight with
HTTP 404, stages=[] and zero Contentful writes. Read-only repository environment
inventory confirms contentful-production and payload-preview exist, while
payload-production-cutover is absent. Runner now inventories environments instead
of GET-probing a not-yet-created environment; missing cutover setup requires the
existing gh identity to have repository administration permission. After all
preflight/CI gates and --execute, it provisions only the missing cutover environment,
rechecking existence first. Existing environments and protections receive no PUT.
22 access/resume/environment tests and unchanged secret scan pass. Existing safe
preflight worktree resumes with the same complete batch. PR #580 only; no production
migration/deployment/live acceptance claimed; Contentful unchanged. M41 stays OPEN.


## M41 — Contentful access passed; private Supabase management lookup blocked

Owner execution at 81709cb successfully reused the existing Contentful Delivery
key read-only, then stopped at Core key lookup (stages=[], no production or
Contentful writes). Prior error handling concealed the failure category. Runner
now reports only fixed, credential-free authentication/permission/compatibility/
network categories, never raw key command output. If an environment PAT is rejected,
it may reuse an existing stored CLI login; subsequent deployment keeps that same
management session. Pinned CLI 2.121.0 key and interactive login flags were checked.
23 focused tests and unchanged secret scan pass locally. The private continuation
can refresh management login with `env -u CI -u SUPABASE_ACCESS_TOKEN npx --yes
supabase@2.121.0 login --no-browser </dev/tty`, then run the existing resume batch.
No project keys created/rotated, schema changes or weakened source/entitlement
checks. PR #580 only. M41 remains OPEN pending actual private migration/live cutover.


## M41 — GitHub integration permission blocker; safe setup-only resume

Owner's 8d89b9b run passed Contentful, existing Core key lookup and both source CI
checks. First execution stage, creation of payload-production-cutover, received
HTTP 403 Resource not accessible by integration. No CMS deployment, draft writer
pause, migration or Contentful write occurred. Repository admin metadata did not
prove that the Codespaces integration credential held Administration write access.
Use the owner's interactive GitHub browser login (`gh auth login --hostname
github.com --web --git-protocol https --scopes repo,workflow </dev/tty`) with
GH_TOKEN/GITHUB_TOKEN unset, then privately select that stored login as GH_TOKEN
for the existing resume command. Do not print credentials or change private env.
Resume now accepts this exact setup-only failure with no later deployment/content
or draft-writer evidence; it still rejects partially executed production releases.
24 focused access/resume tests, syntax and unchanged secret scan pass locally.
PR #580 only. Existing environment protections and Contentful remain unchanged;
actual migration/live cutover pending. M41 remains OPEN.


## 2026-11-16 — M41 deployed-CMS checkpoint reconciled; guarded continuation

Owner supplied the private release evidence for source
`8c0637635dabab89d0d7ad0c924adf9ffa3bff0a`, CMS deployment version
`92fab47e-ee45-4b81-bbe8-b69e720b3d80`. Status is
`DEPLOYED_PUBLIC_SMOKE_VERIFIED`; admin HTTP 200 and anonymous user null.
This supersedes the older saved 13:23 UTC environment-provisioning failure for
the CMS deployment stage only. Editorial live login remains pending; no completed
content import, source switch or public/protected delivery is claimed.

The existing release worktree is `/workspaces/m41-full-cutover-suddBZ`.
Owner's read-only inspection found only two tracked build-generated modifications:
`apps/gpir-cms/next-env.d.ts` and `apps/gpir-cms/tsconfig.json`.
They are preserved. The Codespace has 2.5 GB free on a 32 GB volume; this is
development storage, not production hosting capacity.

PR #580 alone gains an explicit post-CMS continuation. It verifies the saved
evidence, unchanged deployed CMS runtime source and the sole active Cloudflare
version using a read-only deployment-status query. It accepts only the exact
observed Next-generated semantic changes, preserves the previous report/generated
patch privately, and skips npm ci, CMS build and CMS redeployment. It refuses
later/partial import evidence and checks at least 1 GiB available before import.
Preflight failure is saved separately so the old report survives. Entered release
stages are now persisted before their commands, distinguishing an interrupted
stage from completed evidence.

The continuation explicitly authorizes restoring the existing draft writer after
the normal merge, with Payload primary and Contentful writes blocked. Existing
environments/protections, all stashes/worktrees, URLs, both tickers, Smart Cards,
Supabase engines, JWT policies, validation thresholds and expiry rules are retained.
Contentful remains unchanged. No cleanup/deletion or paid infrastructure added.

Validation: 26 focused access/resume tests and both changed executable syntax
checks PASS locally. New cases reject deployment drift, split traffic, unexpected
config edits and partial import evidence. Current-head remote CI must pass before
private production continuation. Agent has connected GitHub access but no private
Codespace terminal, credentials or reader session. No private import/live acceptance
performed from this agent workspace; M41 remains OPEN.


## 2026-11-16 — read-only Core management credential selection

Owner's post-CMS continuation at `6e00295` passed repository environment inventory,
existing Wrangler/Hyperdrive account and read-only Contentful access. It stopped
at preflight on `CLI_PERMISSION` during existing Core key lookup; stages=[], zero
Contentful writes, no new deployment or import. The previous release report is
preserved; the new failure is in `resume-preflight-failure.json`.

Confirmed source defect: fallback to an already authenticated stored Supabase CLI
login handled an environment PAT's authentication refusal (401), but not its
permission refusal (403). A token scoped outside Core can return 403; this is a
possible cause, not a proven diagnosis of the private token. The corrected
credential selector tries the existing stored CLI login once for either category,
only during read-only key inventory or function listing. It never retries writes,
changes roles/scopes, creates/rotates keys, mutates the parent environment or
retries a selected session. A successful stored session is reused for later
management commands; actual Core key authority must still pass the existing
read-only Core request. A refusal of both sessions remains blocked.

28 focused tests and runner syntax PASS locally. New tests cover 401/403 selection,
parent-settings preservation, no write retry and bounded repeated refusal.
Pinned CLI 2.121.0 retained; no dependency, schema, runtime CMS source or TLS change.
Same post-CMS command and PR #580 only. CMS version 92fab47e remains the selected
checkpoint; generated files and stashes preserved. Current-head CI/private
continuation and actual public/protected live delivery remain required. M41 OPEN.


## 2026-11-16 — existing Contentful export discovered; preserve and reuse

Owner refreshed the existing Supabase CLI login. The next `c447d74` continuation
verified stored-login management access and the existing Core release key using
read-only requests. It then stopped on the partial-release guard, stages=[] and
zero Contentful writes. Owner's directory inventory explains that guard: the
saved Contentful export exists, with JSON archives at 13:34:59 UTC and the final
manifest at 13:35:01 UTC on 15 November. No coverage/research-edition/live report
was found. The old 13:23 failed report predates those later completed files.

The post-CMS continuation now distinguishes a completed read-only export from
later import/release evidence. Before accepting it, source/environment,
manifest schema, six JSON checksums, identity/count integrity, exclusion of BCP
recovery records, and all expected media paths/byte lengths/hashes are validated.
Path traversal/symlink escape and omitted expected media are rejected. The saved
export is reused in place without rewriting files or fetching another export.
The original content-addressed immutable Payload importer still reconciles
matching records and refuses conflicts/duplicate identities instead of
overwriting any native/editorial changes. Coverage/research/live evidence still
blocks ambiguous replay. No guard is simply disabled.

29 focused tests and runner syntax PASS locally; the new saved-export test covers
valid reuse with no writes, wrong source, counts, missing manifest, tampered JSON,
tampered media, omitted assets and unsafe paths. Private export integrity is not
claimed before the runner actually verifies those owner-side bytes.
Current-head CI and private execution remain required.

PR #580 only; same continuation command, no further login required by the latest
evidence. CMS version 92fab47e reused; generated files, private exports, original
reports and stashes preserved. No Contentful change or new CMS deployment.
M41 remains OPEN until migration/source switch and actual public/protected live
Payload delivery are evidenced.


## 2026-11-16 — confirmed export; already-paused writer continuation corrected

Owner's `8363807` run verified and reused CMS version 92fab47e and the saved
read-only Contentful export: 112 entries, 2 content types, 5 assets, 3 media files,
1 locale; all six JSON archives and three media hashes passed. ExportedAt:
2026-11-15T13:35:00.996Z; manifest SHA-256:
3236fd0e3581a84263c44010a980d22de95167cdc679ee3cf6ea4f41fb817f7b.
GitHub, Cloudflare and Core stored-login/key authority also passed.
No new import, CMS deployment or Contentful write occurred.

The run stopped while pausing the editorial draft workflow: GitHub 403 explicitly
said the workflow was already inactive. Confirmed runner defect: the earlier
restore-after-merge authorization was incorrectly used as the current-state
disable condition. This was an orchestration error, not a need to repeat CMS/export.

The correction separates observed workflow state from later restore intent.
An already manually disabled workflow needs no disable request. An active writer
is paused once; a concurrent pause is accepted only after the desired disabled
state is observed, while genuine failures remain errors. Original/authorized
restore intent survives continuation and controls only the post-merge enable.
A queued-run cancellation race is tolerated only if that exact run completed;
post-merge restoration leaves an already-active workflow alone. Unknown lifecycle
states still block. No workflow protection, content or subscription change.

32 focused tests and runner syntax PASS locally, including already-paused,
active-then-resume, concurrent pause, real denial and unexpected-state cases.
Required current-head CI and private execution remain pending when this entry
is authored. Same PR #580 and same guarded post-CMS continuation command.
Completed CMS/export/access evidence is retained; all files and stashes preserved.
M41 remains OPEN until migration/source switch and real public/protected live
Payload delivery are evidenced. No full-completion claim.


## 2026-11-16 — interrupted import checkpoint; detached recovery

Owner reports no release/import processes after the session timeout. The durable
consolidated report is IN_PROGRESS at the Contentful-export/public-Payload-import
stage, with pause and CMS stages entered; coverage, research-edition and live
reports are absent. This does not prove that no database records were written.
Completed CMS version 92fab47e, verified saved export (112 entries, 5 assets,
3 media files), source checks and authentication remain established.

Explicit --resume-import accepts only this known interrupted stage with the same
verified export hash, no later coverage/research/live evidence and zero Contentful
writes. It pins the original import source commit across further tooling commits.
The runner checks ancestor history and permits only the reviewed runner, standalone
importer, tests and handoff files to differ; changes to managed website inputs
remain blocked. The immutable content-addressed importer reuses identical objects
and refuses conflicts/duplicates, preserving possible partial records. It does
not create another source edition simply because recovery tooling changed.

The standalone CLI importer gains a pinned-source option, bounded Delivery fetch
and atomic progress/error-phase JSON; it closes its Payload connection in finally.
It is the sole excluded offline file in the CMS-runtime comparison: no Worker
runtime/config/dependency change or CMS redeployment is included. Required remote
TypeScript/Worker validation still applies.

The existing bootstrap supports --background. It launches the same guarded runner
detached, with private timestamped logs and saved PID/log metadata. An exclusive
release lock blocks overlapping executions and archives stale/finished lock
metadata instead of discarding it. Browser disconnect does not terminate this
detached process; stopping/suspending the Codespace still does. All original work,
stashes, source export and preceding reports remain preserved.

35 focused tests and JavaScript executable syntax checks PASS locally. The three
new tests cover source pin/export mismatch, explicit interrupted-stage limits and
overlapping/stale execution locks. Local full-app TypeScript compiler unavailable;
required remote validation/build must pass before private continuation.
No private database import, website source switch or live acceptance performed
from the agent workspace. M41 remains OPEN until actual public and protected
Payload delivery are evidenced.


## 2026-11-16 — existing deployment-token access repair, PR #580 only

Owner requests fixing the runner's management access without repeating migration,
credential submission, reconciliation or CMS deployment. Both isolated CLI
contexts failed; missing environment/fallback files do not establish native
credential-store state. The exact native-login rejection cause is unconfirmed.

Repository evidence identifies an established deployment authority:
`.github/workflows/gpir-p2-production-functions.yml` uses the repository secret
`GPIR_SUPABASE_DEPLOY_TOKEN` for Core management. The private cutover runner
did not consume that named credential and depended on a locally retrievable CLI
login. This continuation wires the runner to an existing named deploy token or
a verified private session recovered from that existing GitHub secret.

Access-only repair is added to the existing payload-cms-ci workflow, restricted
to explicit workflow_dispatch by krishnan-vishal on the exact PR #580 branch.
Repair mode skips validation/Worker-build jobs and never runs migration or deploys
P2/payment functions. It uses GET-only Core functions and API-key permission
checks; response bodies/keys are discarded. No Supabase token/key is created,
rotated, broadened or printed. The repository credential's current validity is
not assumed: a non-200 permission check blocks and reports only safe HTTP status.

An ephemeral RSA recipient key is generated privately in the existing ignored
Codespace migration directory. Only its public key and random request ID are
workflow inputs. GitHub encrypts the existing token with AES-256-GCM plus
RSA-OAEP/SHA-256; only the authenticated encrypted envelope is retained as a
one-day artifact. The private key never leaves the Codespace. Local decryption
checks request/Core binding and one-hour handoff age, then repeats the actual
read-only management checks before saving mode-0600 private management-session
JSON. Logs/reports contain only request/run IDs, status and HTTP codes. Pending
requests reuse the same private request/key instead of duplicate dispatch.

The runner reads that ignored private session explicitly and reuses it for
management commands; it no longer needs native keyring retrieval after successful
repair. Original CMS .env, Contentful and migration database records are unchanged.
The interrupted import remains pinned; its source-change allowlist names only the
new reviewed access tooling/tests and existing CI workflow. No managed content or
runtime CMS source changed.

39 focused tests and JavaScript syntax PASS locally. Tests cover encrypted
round-trip/no plaintext, wrong request/Core, stale handoff, ciphertext tamper,
weak key rejection, safe 401/403/429 handling, read-only requests, owner-only
workflow and build skipping. Workflow YAML parses; the existing CI workflow is
present on main, supporting dispatch of the reviewed PR ref. Remote required CI
must pass before owner-side access repair. GitHub secret presence/actual authority,
encrypted handoff and private runner acceptance are NOT yet evidenced.

M41 remains OPEN. This is an executable access-only correction, not deployment or
migration completion. No Codespace run or manual workflow dispatch was performed
from this agent workspace; private terminal execution is still required.


### Access-repair follow-up checks

Normal validation runs retain the exact required `M41 Payload CMS validation`
identity; only access-repair runs include the non-secret request ID in their title.
An additional CLI test proves a missing repository credential reports its exact
access-only stage without a network call or repeated login. The combined focused
inventory is now 40 tests. Actual encrypted handoff remains pending owner-side
execution; no management-access or migration completion is claimed.


## 2026-11-16 — finish from saved operation 775 in durable bounded batches

Production observation increased from 641 to 742 distinct managed-content objects.
Owner's saved progress proves 100 created + 675 reused file operations, total 775,
of 835 managed-file operations. These are operation counts, not a unique-object
coverage percentage. No manifest/archive/editorial completion is recorded yet.

Owner's read-only process/resource check: no release/import processes; 2469 MiB
free disk; available cgroup counters oom=0, oom_kill=0, oom_group_kill=0; log ends
during import without an application failure report. The exact external
termination reason is NOT established. Do not diagnose OOM, disk exhaustion,
credential failure or successful completion from that evidence.

The standalone importer now seeds an explicit source/snapshot-bound cursor from
the verified legacy 775-operation checkpoint. It preserves the original progress
separately and skips that completed blob prefix. Any uncertain work after the last
old checkpoint is matched by immutable identity rather than duplicated. Subsequent
cursor saves happen atomically after EVERY successful database operation. A stop
between database commit and cursor save can replay only that uncertain operation.

Each child handles at most 25 operations with a 32 MiB accounted-payload threshold,
then closes its database connection. The existing parent continues short children,
logs the saved phase/position after each batch, and applies a five-minute child
timeout plus a bounded batch limit. It does not reset migration or repeat the
completed prefix. The saved public-build input is reused; no CMS rebuild or repeat
Contentful export. The published Delivery response is captured privately once and
checksummed for all remaining batches. No Contentful writes.

Plan/cursor hashes bind source commit, immutable snapshot, frozen Delivery bytes
and phase sizes. Phases remain blobs -> source archive -> source entries ->
editorial mirrors -> manifest. The existing immutable/conflict checks, verified
Delivery import context, WARN/draft preservation and manifest-last rule remain.
A complete cursor cannot skip uncompleted phases. Interrupted temporary checkpoint
files are archived before replacement. Ordinary failures record a safe category,
position and key without returning raw private diagnostics.

Only the existing offline importer/runner, one framework-independent checkpoint
helper/test and existing CI test command change. No Worker runtime, dependency,
Supabase schema/role/auth/entitlement change, threshold change, new service or new
architecture. The repaired private management session is reused. Original
worktrees, stashes, exports, saved input and persisted database records remain.

47 focused tests and changed JavaScript syntax PASS locally. New cases prove
775-prefix skipping, cursor precedence/plan mismatch rejection, manifest-last
ordering, commit-before-save interruption without duplicate writes, batch limits,
safe failure categories and preservation of interrupted temporary evidence.
Required remote full-app TypeScript/Worker/Integrity checks must pass before
private continuation. No production batch run or public/protected live cutover
performed from this agent workspace; M41 remains OPEN.


## 2026-11-16 — standalone shutdown correction, PR #580

Saved batch confirmed at 800 (124 created/676 reused); the unfinished work must
continue from that cursor. Post-checkpoint child shutdown is now bounded and
explicit for both existing Payload CLI stages; query/data errors still fail.
No new settings/secrets or CMS/Contentful change. 50 focused tests PASS locally;
required CI/private execution and actual live acceptance pending.
Details: [consolidated report](M41-FULL-CUTOVER-REPORT.md).

## 2026-11-23 — Domain Experts and Global Leaders

**IN PROGRESS.** Repository directory, private REVIEW importer and entitled reader projection in owner review. Pending isolated migration validation, live accessibility acceptance, private staging of the initial 13 candidates, individual evidence and publication clearance and successive discovery batches. See [release evidence and rollout](GPIR_DOMAIN_EXPERT_DIRECTORY.md).
