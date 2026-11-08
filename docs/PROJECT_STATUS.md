# FINTECHOISIS / GPIR Project Status

## Current handoff

### M39 governed T3 editorial publication (Contentful)

- **Owner authorization:** 2026-11-08. PYMNTS and every T3 source remain T3; no trust tier, confidence threshold or T1/T1.5/T2 behaviour changed, and there is no automatic T3 approval.
- **Existing contracts reused (no new content type or table):** the Contentful `gpirPublication` model read through the server-side, published-only Delivery API (`cdn.contentful.com`; preview hosts and management tokens are refused), the existing Supabase publisher, topic-consolidation tables and public intelligence API. Binding fields: `supabaseRecordId` = `intelligence_candidates.id`; `legacySourceUrl` = the candidate canonical article URL; `publicationStatus` = `CURRENT`; `validationStatus` = `VALIDATED` (the explicit editorial approval); `sourceValidationSummary` = editor evidence note (at least 40 characters); `gpirPublicationId` = governed `VK-GPIR-…` identifier.
- **Enforcement:** `gpir-intelligence-publish` publishes a T3 candidate only when exactly one published entry matches candidate id, source URL host (official domain) and canonical URL, then repeats the full live source revalidation (canonical URL, original source timestamp within 36 h of the candidate, content evidence, payments relevance, deduplication). Duplicate entries for one candidate or URL are ambiguous and approve nothing. Terminal decisions are never reopened; an editor update or a due transient retry reopens a prior review.
- **Database:** one additive function, `gpir_publish_t3_editorial_candidate` (migration `20261108140000_m39_t3_editorial_publication.sql`), was required because the existing publication functions hard-reject T3 by design. It accepts only T3 GREEN sources, re-checks the editorial evidence bound to the exact candidate id and URL, retains the original timestamp, applies the 12-hour live rule and the same topic consolidation. No table, column or existing function or grant changed. The migration is not applied.
- **Archive and live expiry:** an approved article older than 12 hours is stored with `ticker_eligible=false` and its original timestamp and appears only as `HISTORICAL`; timestamps are never reset.
- **Queue:** `node scripts/m39/list-t3-editorial-queue.mjs` (server credentials, read-only) lists T3 candidates awaiting approval with draft Contentful field values and flags those already linked to an entry.
- **Required release actions:** apply the migration after owner approval; ensure `gpir-intelligence-publish` has `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENVIRONMENT` and `CONTENTFUL_DELIVERY_TOKEN` (Delivery token only) and deploy it with its existing JWT boundary; an editor then creates and publishes one `gpirPublication` entry per candidate with the fields above. Until an entry exists the candidate correctly remains awaiting review.
- **Validation:** 12 focused editorial tests, the publisher/consolidation tests, and a PostgreSQL 16 acceptance run covering the new function (T3 rejected by the automated route, editorial flag, URL and record-id binding, T1 refused, attach-to-topic, new card, replay refused, atomic rollback) pass. Live Contentful, production database, deployment, public API, homepage and My GPIR verification are not performed (no Contentful or production credentials in this environment, no approved entry exists).

### M39 global intelligence aggregation and relay recovery

- **Baseline:** `codex/m39-global-aggregation-recovery-20261108` from `origin/main` `a1780df` (PRs #523–#526 merged). The untracked `recovery/` additions are retained and unused.
- **Portfolio reconciliation:** The Paypers is registered but inactive/`SOURCE_UNSUPPORTED` (no machine-readable feed; `/rss` and `/feed` return HTML). Fintech Futures (`FS-GLOBAL-003`) has a parser guard and discovery adapter in `gpir-intelligence-fetch` but is absent from `CONTROLLED_SOURCE_IDS` and from the repository registries, so it cannot run; its feed returned HTTP 403 and no access control was bypassed. FinTech Global, CNBC FinTech, FinTech Weekly, FinTech Magazine, KPMG Pulse of Fintech and the World Bank FinTech topic are absent. MAS (`CB-APAC-002`) and ECB (`CB-EUR-001`) constants are likewise not allowlisted. Source activation requires owner-approved registry SQL and is not performed here.
- **Confirmed publisher defect:** `gpir-intelligence-publish` recorded transient source failures (`SOURCE_FETCH_FAILED`, `SOURCE_HTTP_429/500/502/503/504`, `PROCESSING_ERROR`) as final `REVIEW` audits, so an otherwise eligible T1 candidate was never retried and could miss its 12-hour live window. Such candidates are now retried after a 30-minute backoff while published within 12 hours, behind never-processed candidates. Every retry repeats the full source, canonical, timestamp, evidence and tier-threshold validation; thresholds, tiers and the Contentful editorial boundary are unchanged.
- **Review correction (PR #527):** audit rows are now read with a deterministic order (`attempted_at.desc`) and resolved per candidate: any `PUBLISHED`, `REJECTED` or `DUPLICATE` decision always wins; otherwise the most recent attempt decides, so an older transient failure cannot override a later outcome. The 30-minute backoff and full validation are unchanged. No schema or permission change: every audit column read (`candidate_id`, `decision`, `reason_code`, `attempted_at`, `completed_at`) is already defined by migration `20261031134116` and written by the deployed publisher, and the added `source_registry` columns (`country`, `region_tags`, `category`) are already selected by the deployed `gpir-public-intelligence`, whose live responses return them. Direct introspection is not possible with the public key (both tables are not exposed to anon).
- **Consolidation retention:** topic geography now records the publishing source's country or region instead of the fixed `UNSPECIFIED`, and each source in the public `sources[]` array carries `country`, `region` and `segment` alongside its original URL, name and timestamp. No schema change.
- **Production evidence (2026-11-08 12:47–12:58 UTC):** `gpir-public-alerts` returns `alerts: []`; `gpir-public-intelligence?scope=history` returns 198 records (35 BIS, 161 Hyperswitch/Mojaloop technical references, 2 MAS announcements), none LIVE and no media-source announcement. Production database, Edge logs and the Supabase management token were not accessible in this environment, so live candidate counts and registry statuses are the last documented values (24 h to 2026-11-07: 144 discovered, 14 REVIEW, 7 rejected, 0 published).
- **Latent risk, not changed:** the publisher scans at most 20×50 candidates oldest-first and finalized `REVIEW` rows stay in that pool; about 850 REVIEW candidates existed on 2026-11-08, so new candidates become unreachable near 1,000. A server-side exclusion needs the unseen `gpir_process_raw_record` semantics and owner review.
- **Historical backfill:** publisher `from`/`to`, GDELT and BIS windows and the ingestion run ledger exist. Missing: owner approval for a five-year range (the approved contract starts 2026-01-01), a resumable per-source cursor/checkpoint runner, historical adapters for sources whose feeds expose only recent items, and pagination in `gpir-public-intelligence`, which reads a single 1,000-row announcement page.
- **Release boundary:** Edge deployment of `gpir-intelligence-publish` and `gpir-public-intelligence` and owner merge remain pending; no production write, source registration or publication was performed.

### M39 Gate 2 recovery

- **Branch / baseline:** `codex/m39-gate2-recovery` from `b9fe03d` (merged BIS/GDELT PR #522). Implementation checkpoint `a696e54826dd42ecb6ffb72db6abc26c4f8b21ae` is confirmed on the remote branch; PR #523 targets `main`. Recovered source files were untracked; the original `recovery/` additions are retained locally and not used at runtime.
- **Technical sources:** Mojaloop Helm releases / specification commits and Hyperswitch releases / connector commits use bounded official GitHub API queries, source/URL validation, deduplication and explicitly non-publishable raw reference classification. The existing ingestion source status, registry identity, claim, run ledger and raw-staging controls are reused. The proposed source registration SQL is not applied. Date windows subdivide dense change histories; unresolved truncation is surfaced.
- **RPW:** the actual published World Bank workbook contains two dataset sheets. The parser reads both, checks headers, accepts numeric nonnegative $200 CC1 cost observations, and emits unweighted service-quote corridor-quarter aggregates, not official corridor averages. A complete read-only scan found 253,960 source rows, 252,422 selected quotes, zero duplicate period/ID pairs, 1,538 rejected rows and 17,191 aggregates from 2011-Q1 through 2025-Q3; missing quarters, including 2025-Q2, remain missing. Five quote IDs recur in different periods and are not incorrectly collapsed. Quarter-end markers are not survey or publication dates. The extracted workbook is not retained in the repository.
- **Evidence:** public API probes for 2024-01-01 through 2026-11-08 found Mojaloop 6 releases / 1 specification commit and Hyperswitch 26 releases / 576 connector commits, without reported truncation. Focused recovery and BIS/GDELT tests pass 13/13; syntax and secret scan pass. Edge execution against a Supabase environment, SQL application, GitHub CI and live deployment remain unverified.
- **Release boundary:** owner review, CI, merge, approved source registration and controlled `gpir-intelligence-fetch` deployment remain pending; no deployment, production database write or publication was performed. RPW output is an offline plan, not an enabled production ingestion path; source registration, authorized acquisition/staging and runtime validation remain separate prerequisites.

### M39 Smart Intelligence dashboard final completion

- **Baseline:** branch codex/m39-smart-dashboard-final from merged PR #517 (4f14d5e). The lightweight record browser is replaced by the approved compact navy/gold reader dashboard without changing the existing Supabase, Contentful, authentication, payment or publication architecture.
- **Dashboard:** authenticated readers receive the governed 12-hour live ribbon, 24H/7D/30D/QTD/YTD/custom periods, geographic context, 12 multi-select topics, Top Signal Now, six KPIs, equivalent-period comparisons, 12 topic cards, a source-backed 12-week heatmap, evidence records, methodology, Contentful compatibility and ASK GPIR context handoff.
- **Data boundary:** calculations use only dated approved announcements from GREEN sources that pass the existing official-URL/content checks. Production currently exposes two fully eligible MAS records. Thirty-eight dated T3 media records lack governed topic evidence and 39 legacy records lack publication dates; none are promoted or counted. The 12-hour alert state is truthfully empty.
- **Source repair:** guarded release SQL corrects only three verified registry endpoint defects: FinTech Australia .org.in to official .org.au news, generic europa.eu to the ECB press RSS, and the RBA null authority/root page to official RBA media-release RSS. Trust tiers, confidence thresholds, parser profiles and publication status are unchanged; an exact rollback is included.
- **Validation:** dashboard tests, public intelligence governance tests, reader/payment tests, ASK GPIR intent, Contentful production release, content/link/announcement validation, syntax, secret scan and diff checks pass. Production application of the source repair, Edge deployment, PR checks/merge, Pages publication and live authenticated desktop/mobile screenshots remain release actions.

### M39 production closure — FX, Smart Intelligence, alerts and My GPIR

- **Baseline:** `codex/m39-production-closure` from merged `origin/main` `928bcbe`, which already contains PRs #514–#516 and the governed 26-record Contentful FX index. No CMS entry, publication identity, route or access-policy row was recreated or changed.
- **Root cause / correction:** `gpir-reader-summary` still enforced the older subscriber gate and rejected currencies absent from Frankfurter's ECB catalogue before checking the approved supplementary archive. FX access now remains server-authenticated but independent of payment, and unsupported ECB pairs recover only from dated, method-labelled `reference-open-er-api` rows already present in `fx_historical_archive`. Null-date legacy captures are excluded. Sparse histories display an explicit insufficient-for-long-term-analysis notice.
- **Smart Intelligence:** added a separate authenticated reader surface backed by the existing `gpir-public-intelligence` history contract, with subject and period controls, cited factual evidence, deterministic count/date/category context, truthful geography gaps, applicable Contentful research and the existing ASK GPIR entry point. It does not infer market impact or merge with the FX card.
- **My GPIR:** moved the 26 public FX records into a distinct filterable section, separate from paid Library entitlements. Every pair exposes the exact three actions `Open FX Intelligence`, `Open Smart Intelligence` and `Read Published Research`; public copy states that no paid subscription is required.
- **Production evidence before release:** `fx_historical_archive` has 14,300 rows, 13,362 dated rows and 134 pairs through 2026-11-07. AED/INR has three dated supplementary observations (5–7 November) plus seven legacy null-date captures. The last 24 hours contain 72/72 successful ingestion runs, 144 discovered records, 14 REVIEW candidates, seven deterministic rejections and zero publications. All 14 publication audits report `AUTO_PUBLICATION_THRESHOLD_NOT_MET`; the 12-hour alert feed is therefore correctly eligible-empty. No threshold, source tier or approval rule was changed.
- **Validation / boundary:** 46/46 focused FX/Smart/alerts/Contentful tests and 24/24 reader/payment/reliability tests pass. Content, links, announcements, announcement intent, FX validation/regression/archive, secret scan, syntax and diff checks pass. The advisory performance audit has existing estate warnings only after the new Smart page image dimensions were supplied. No schema, table, payment, pricing, PayPal, RLS, Contentful or historical row mutation was made; inserted historical observations: zero.
- **Release state:** implementation is complete locally. Required next actions are commit/push, one reviewed PR, successful checks, owner-authorized merge, Pages deployment, `gpir-reader-summary` deployment with `verify_jwt=true`, and live authenticated acceptance.

### M39-G1 — Global Alerts production completion evidence

- **Production state (2026-11-06 03:13 UTC):** PRs #479 and #480 are merged. Production Edge Functions `gpir-intelligence-fetch` v50, `gpir-intelligence-publish` v5, `gpir-public-alerts` v4 and `gpir-public-intelligence` v6 are ACTIVE with the intended JWT boundaries. The `g1-intelligence-publication` cron is active every ten minutes; all 144 runs in the preceding 24 hours succeeded, and Edge logs independently show 141 publisher requests and 71 ingestion requests returning HTTP 200.
- **Governed gate outcome:** the preceding 24 hours contain 72 successful ingestion runs, 144 discovered records, 21 candidates, 12 deterministic rejections and zero publications. All 802 current candidates remain REVIEW; 794 are T3 and therefore cannot auto-publish. Two candidates meet only the numeric source/confidence threshold but have not passed the complete publication evidence gate. Audit totals are 792 `AUTO_PUBLICATION_THRESHOLD_NOT_MET`, eight `INSUFFICIENT_PAYMENTS_RELEVANCE` and two `SOURCE_TIMESTAMP_MISSING`. No threshold, review or authorization control was bypassed.
- **Public reader evidence:** `gpir-public-alerts` returned HTTP 200 with `alerts: []`, `windowHours: 12` and a current `generatedAt`; this is the correct eligible-empty state. `gpir-public-intelligence` returned the two approved MAS records as ARCHIVED with original publication timestamps, categories, summaries and official source/canonical links. Production Search/ASK assets consume that API, and the archive consumes the same Supabase authority. The two public records currently return `region: null`; the authoritative MAS source row also has null `region_tags`, so no region was inferred or fabricated. Duplicate canonical URL and published-fingerprint checks both returned zero. The publication audit table has RLS enabled; anon and authenticated roles cannot select it.
- **USD/JPY identity and access:** Supabase readback confirms `VK-GPIR-P-000000000036-4`, record `399ce347-30ea-408a-8bf5-2fc42fe6f9fa`, lineage `VK-GPIR-L-000000000036-4`, `CURRENT`, `PUBLIC`, `ACTIVE` and `EVIDENCED` for Contentful entry `5Ihk9crvLzMw02mrCh91Ph`. The subscriber FX page remains live and its unauthenticated `gpir-reader-summary` request returns HTTP 401.
- **USD/JPY remaining release gap:** the Contentful delivery build has not been rerun since the entry was published. The production canonical route `/usd-jpy-exchange-rate-dynamics-monetary-policy-context/` returns HTTP 404 and `assets/data/fx/editorial-public.json` still contains zero records. The FX bridge's stale non-contract `PUBLISHED` test is corrected on this branch to require the authoritative `CURRENT` lifecycle plus explicit `PUBLIC` presentation; `HISTORICAL`, unsupported and non-public records remain excluded. The existing Contentful workflow is artifact-only and explicitly marks its output non-deploying. A fresh delivery artifact, governed route/index promotion through a reviewed branch/PR and owner-controlled merge/Pages deployment remain required; no second publication, secret change or bypass was made.
- **Verification:** 3/3 focused FX editorial bridge tests and 35/35 focused G1/M39 Global Alerts tests pass. Content, internal-link, announcement and ASK/announcement-intent validators pass. A separate broad M35 status-contract suite has one pre-existing estate-count fixture drift (`7 !== 2`) outside the bridge change. Production HTTP, database, cron, Edge log and authorization evidence was collected read-only. State: **GLOBAL ALERTS OPERATIONAL / ELIGIBLE-EMPTY; USD/JPY SITE PROMOTION AND GOVERNED REGION CLASSIFICATION REMAIN OPEN.**
- **Durable handoff:** bridge implementation checkpoint `788797c8c26aec3c08c26476e283e8f3f2a64d68` is confirmed in remote branch `codex/m39-fx-production-closure`; PR #513 tracks the current branch and targets `main`. Merge and Pages publication remain owner-controlled.

### M39-FX — Contentful editorial activation review

- **Branch / baseline:** `codex/m39-fx-production-closure`, fast-forwarded to `origin/main` `20b420ce9395a2f5b4f2b252738299c1b853555b` after PRs #510–#512 merged. Unrelated untracked recovery/design artifacts remain untouched.
- **Estate decision:** authenticated M35 delivery build #5 artifact digest matches GitHub and contains 35 delivered publications, but no explicit USD/JPY or USD/SGD pair publication. The closest Singapore country entry (`79IwPy4ChfJ04brzBF2BNS`) is general, `WARN`, status-null, public-classification-null material and is not eligible. Decision: `NO_APPROVED_PAIR_SPECIFIC_PUBLICATION`; exported and Production FX editorial record count remains zero.
- **Prepared draft:** a review-only USD/JPY `gpirPublication` field mapping uses verified BIS, Bank of Japan, Federal Reserve and ECB sources. It records the reference window and provenance without presenting Supabase/ECB calculations as independent research, and explicitly rejects causal inference, executable pricing and forecasts. Governed IDs, Supabase UUID, lifecycle, publication date and public classification remain null/pending.
- **Release boundary:** no Contentful write, approval, publish action, workflow dispatch, index promotion, production deployment, Supabase mutation or application-code change occurred. The existing bridge has an unresolved `PUBLISHED` filter versus the authoritative `CURRENT`/`HISTORICAL` lifecycle contract; it was documented but not changed under the no-filter-change gate.
- **Durable checkpoint:** review package commit `9fa5f91655301aacf674ce2fdce66f79d2c3a14a` is confirmed on `origin/codex/m39-fx-production-closure`. No PR was opened because no application-code change was necessary.
- **Next dependency:** owner/editorial approval of the draft and sources; identity/lineage/Supabase allocation; CURRENT/public/canonical-route approval; controlled Contentful Draft creation and publication; owner-approved contract-aligned bridge correction; delivery rebuild, reviewed index promotion and live USD/JPY card verification.

### M39-FX — Final UI/UX refinement and intelligence evidence closure

- **Branch / base:** `codex/m39-fx-ui-refinement`, created from `origin/main` at `aef4bed9c7f0734c404c176f8ff796d3acb55f68` after PR #502 merged. User-owned untracked recovery/design artifacts remain untouched.
- **Scope:** refined only the protected FX Intelligence page, its existing `<gpir-fx-card>`, scoped CSS and focused tests. No Supabase schema/data, historical recovery, scheduled capture, PayPal/authentication, entitlement, ASK GPIR, Global Alerts, Contentful or public ticker contract changed.
- **Experience:** homepage-aligned brand/header/footer, compact navy/ivory/gold hierarchy, reduced hero/chart/card spacing, six synchronized period controls, a compact range ladder, default-collapsed movement heatmap, retained peer and converter panels, and four evidence-led briefs with executive takeaways, expandable detail, source attribution and explicit editorial-unavailable states.
- **Accuracy / provenance:** all statistics remain deterministic from returned fixing observations. “Today” wording was removed in favor of the actual latest fixing; fixing, retrieval and capture dates remain distinct. No event, policy driver, quote, forecast or provider price was inferred or fabricated.
- **Acceptance:** 30/30 focused FX/auth/journey tests pass. Content, link, announcement and announcement-intent validators pass; the performance audit is advisory-only with six pre-existing out-of-scope warnings. Browser acceptance at 1920, 1024, 768, 717, 390, 360 and 280 CSS pixels found no horizontal overflow and verified period/URL synchronization, converter recalculation, expandable sources and mobile navigation. The broader M39 sweep passes 67/70; its three failures are pre-existing reader-performance fixture/assertion drift in untouched homepage/reader-dashboard files (old auth cache-key expectation and two invalid fixture URLs).
- **Release boundary:** implementation commit `97331d9af4895a54237a95888a97dd1d509d4e5f` is confirmed on `origin/codex/m39-fx-ui-refinement`; PR #503 targets `main`. No merge, deployment, database mutation, workflow dispatch or production configuration change is authorized or claimed.

### M39-FX Stage 1 — Historical reference recovery

- **Branch / PR / base:** `fix/m39-fx-invalid-rate-fallback`, PR #502, from merged PR #501. PR #502 merged to `main` as `aef4bed9c7f0734c404c176f8ff796d3acb55f68` on 5 November 2026.
- **Production baseline (read only, 5 November 2026):** `fx_historical_archive` has 938 preserved legacy rows across all 134 configured pairs. `observation_date`, `rate_method`, the validation constraint and `uq_fx_historical_archive_observation` are present; migration history records `20261104100918_m39_fx_historical_observation_identity`. Zero rows currently have an observation date or rate method.
- **Source correction:** Frankfurter includes a valid prior in-force fixing at some window boundaries; recovery now validates but excludes that pre-window context instead of treating it as malformed. Actual malformed JSON/rate/catalog, conflicting or empty responses, HTTP 429/5xx (including 522), abort/timeout and network failures recover through bounded monthly CSV requests to the official ECB Data API. A non-recoverable HTTP 404 remains fail-closed.
- **Coverage:** the normal live plan and an injected-522 live fallback drill independently return the same 134-pair report: 60 supported, 74 unsupported, 216 genuine fixing dates from 2 January through 4 November, and 12,960 planned rows. USD/JPY and USD/INR have 216 same-date cross observations; EUR/JPY has 216 provider-native observations outside the configured 134; AED/INR remains unsupported. Inactive ARS/RUB series are correctly reported unavailable for the requested interval.
- **Archive / compatibility:** existing ingestion timestamps and legacy rows are preserved. Historical writes remain 500-row conflict-ignore upserts on the composite observation identity. The plan path submits zero rows; the normal 30-minute capture job remains isolated by the existing workflow condition, and public/subscriber plus ASK GPIR contracts are unchanged.
- **Validation / remote checkpoint:** 14 direct ECB fallback/parser tests cover 522, 429, 5xx, invalid rate payload, malformed JSON, empty data, network failure, source provenance and fail-closed 404. Historical backfill, Supabase archive, FX regression/validation, 27 subscriber authorization/journey tests, content/link/announcement validators, syntax, secret scan and `git diff --check` passed. Implementation commit `1489d2f27a5c6233e424a509453fdc8be1757dc3` was confirmed on the remote branch; PR #502 then merged as `aef4bed9`.
- **Advisors / boundary:** Supabase security and performance advisors report existing estate findings outside this FX change; no FX-table-specific finding was returned. No Production row mutation, workflow dispatch, repository-variable change, auth/payment/entitlement change, Edge Function change, main merge or publication occurred.
- **Approval checkpoint:** the merge gate is complete. The owner must still separately approve one `historical_reference_action=apply-approved` dispatch, verify 12,960 dated rows plus all 938 legacy rows, and only then set `FX_HISTORY_OBSERVATION_IDENTITY_ENABLED=true`. Until those gates complete, Production backfill remains **IN PROGRESS / BLOCKED BY DESIGN**.

### M39-FX-08 — Subscriber currency-pair intelligence

- **Branch / base:** `feat/m39-fx-08`, created from `origin/main` at `99dbc7c` after M39-FX-07 / PR #498.
- **Objective:** add on-demand historical currency-pair intelligence for entitled readers, retaining the existing reader-auth, subscription, FX archive, and navigation architecture. No schema, payment, authentication, or backend service was added.
- **Implementation:** `<gpir-fx-card>` renders independent pair/period contexts, deterministic observation-based metrics, a responsive navy/ivory/gold dashboard, a compact homepage entry, and an FX Intelligence menu link. The existing `gpir-reader-summary` Edge Function serves pair history only after verifying the bearer session, current active subscription dates and authoritative confirmed-payment evidence; the public ticker is unchanged.
- **Historical source:** Frankfurter v2 is queried specifically for its ECB provider, with the source currency catalogue and actual per-pair fixing dates. The live read-only USD/JPY probe returned 7,128 observations from 1999-01-04 through 2026-11-03. This is pair-specific coverage; no all-pairs 1999 coverage is claimed. Non-EUR crosses use same-date ECB EUR reference data. Supabase capture timestamps are shown separately and are not mixed into source observations.
- **Analytics / missing data:** percentage changes, high/low dates, daily log returns, annualised realised volatility, observation moving averages, historical percentile, movement distribution, previous-period and five-year comparisons, reference conversion, and the last earlier fixing within 1% are deterministic. No interpolation, forecast, causal claim, editorial driver, or remittance quote is fabricated; unavailable data is labelled.
- **Design / evidence:** the written v2 design brief is implemented with responsive CSS, including 360px rules. `docs/design-references/v2-designomics.pdf` was not present in the checkout, and browser screenshot tooling was unavailable; exact PDF comparison and screenshot acceptance are therefore not claimed.
- **Authorization / release boundary:** access is enforced by the existing Edge Function, not client-side hiding. Deployment of the updated function is required before the live contract is available; no function deployment, database write, merge, or publication occurred.
- **Validation:** focused FX, reader-summary authorization, auth return-route, and navigation tests pass 38/38, including desktop hover/click/Escape, scroll guard, and mobile accordion behavior. `node scripts/test-fx.js`, `node scripts/test-fx-archive.js`, `node scripts/validate-content.js`, `node scripts/validate-links.js`, `node scripts/validate-fx.js`, `node scripts/scan-high-confidence-secrets.js`, changed-file syntax checks, and CRLF-aware `git diff --check` pass. The plain whitespace check flags carriage returns on changed lines in five pre-existing CRLF HTML files; those are line endings, not trailing spaces.
- **Design / release limit:** browser screenshot tooling was unavailable, so mobile/desktop screenshot acceptance is unverified. The specified design PDF was absent; the written v2 brief is the visual basis. No production function deployment or database change occurred.
- **Release state:** PR #499 merged to `main` as `1e53d64`. The later owner-controlled `gpir-reader-summary` deployment is recorded below; live-acceptance configuration and Production checkout activation remain separate owner-controlled decisions.
- **Reader-journey follow-up (2026-11-04):** commit `a6ca71f791d5f4d20aa767ece07af88ea0514a3a` removes the homepage promotion so FX Snapshot and Global Alerts are adjacent, routes supported ticker pairs to the protected dashboard, and carries pair/period context through sign-in, plan selection and server-verified subscription return. All shared ticker script references and the FX page generator cache key were refreshed; ticker styling, animation, public data, dashboard design and navigation behavior were not changed.
- **Follow-up validation:** 41 focused FX/auth/navigation tests pass; the internal link validator checked 156 HTML files; changed JavaScript syntax and CRLF-aware whitespace checks pass. Mocked browser checks at 1440px and 360px passed for guest, non-subscriber and active-subscriber states, retained EUR/JPY 5Y selection, and found no horizontal overflow. Server-side entitlement tests deny missing, expired and unverifiable subscriptions without fetching source history.
- **Follow-up release state:** commit `a6ca71f791d5f4d20aa767ece07af88ea0514a3a` is verified in merged PR #499 history. Production subscription-checkout activation remains owner-controlled; no credential or schema change was made by that follow-up.
- **Final payment / entitlement correction (2026-11-04):** the FX route now selects the existing `payment_confirmed_at` value written by the verified PayPal payment webhook contract and requires it together with `ACTIVE` status and a current effective window before any Frankfurter or archive retrieval. `APPROVAL_PENDING`, `PAYMENT_FAILED`, expired, missing/malformed confirmation and database failure states fail closed. No column, migration, payment handler or database policy changed.
- **Checkout correction:** reader-summary validates the exact environment-specific plan state returned by the existing filtered catalogue: `SANDBOX_ACTIVE` remains required in Sandbox and only `LIVE_ACTIVE` is eligible in Production. The browser retains its Production hostname, project URL, endpoint and explicit production-enable safeguards. This makes the approved Production plan eligible in code; it does not activate checkout or change provider configuration.
- **Focused correction validation:** 63/63 affected FX entitlement, selected-pair journey, reader-summary reliability, recurring subscription/webhook and Production non-monetary checkout tests pass. The high-confidence secret scan, changed-function/client syntax checks and `git diff --check` pass. State: **READY FOR OWNER REVIEW AND CONTROLLED DEPLOYMENT; MERGE, CHECKOUT ACTIVATION AND DEPLOYMENT REMAIN OWNER-CONTROLLED.**
- **Registered-reader live-acceptance gate (2026-11-04):** `gpir-reader-summary` now supports an FX-only, disabled-by-default validation identity. It activates only when server-side `GPIR_FX_LIVE_ACCEPTANCE_ENABLED` is exactly `true` and `GPIR_FX_LIVE_ACCEPTANCE_USER_ID` is a valid UUID exactly matching the authenticated Supabase `user.id`. Missing, false, malformed or mismatched configuration follows the unchanged confirmed-payment subscription path and denies a non-subscriber.
- **Acceptance boundary / evidence:** the configured identity can reach only the existing `fxPair` response after Supabase authentication; it creates no payment, subscription, publication, library or other premium entitlement. Normal confirmed-payment access is unchanged. Focused FX authorization/card and selected-pair tests pass 27/27; function syntax and `git diff --check` pass. The approved Production user UUID was not supplied or stored, and neither configuration value was enabled.
- **Live release state:** following explicit owner approval, the exact commit `0869e63fe67b98a3b584905ce138aa93ccdd3920` function files were deployed only to Production `gpir-reader-summary` version 29 (`verify_jwt=true`, `ezbr_sha256` `8d397f2522f15d7bb4e01341dffd014c45757bfb409c733ff02d11a0e74ddb98`). Retrieved deployed files match the repository files exactly, and an unauthenticated live USD/JPY request returns `401 / UNAUTHORIZED_NO_AUTH_HEADER`. No acceptance variable was set or changed. Live registered-reader acceptance still requires the owner-approved Supabase `auth.users.id` and separate explicit enablement. Rollback remains configuration-only: set `GPIR_FX_LIVE_ACCEPTANCE_ENABLED=false` and remove the user-ID value. No merge, payment or entitlement activation occurred.

### M39-FX-06 — Pair context, precision, spacing and archive integrity

- **Branch / base:** `feat/m39-fx-06`, from production `main` at `02e74c12ee6445008e51c7581721e6c9454388bc` (includes merged PR #495 / M39-FX-05).
- **Objective:** correct displayed FX precision and excessive spacing; preserve the selected pair across Currency Explorer, Weekly Trends and Historical; strengthen the existing Supabase archive path without adding services, tables or providers.
- **Implementation:** direct, JPY and inverse archive rates use the established 4/2/6-decimal display convention; archive cards and controls are more compact and responsive. Pair selectors, query-string synchronization and contextual links carry normalized `BASE-QUOTE` pairs across all three views. The archive only accepts well-formed validated observations with matching pair identity, source and a non-future observation timestamp, and preserves their numeric precision. The workflow retains its existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets; no private credential enters browser code.
- **Historical limit:** a read-only public archive probe returned 134 rows for 2026-11-03 at a single capture time. Earlier queried windows ending 2026-09-15, 2026-10-01 and 2026-10-27 returned zero rows. The committed static hourly archive and weekly summary also contain only 2026-11-03. No historical observations were fabricated or backfilled; earlier history is unrecoverable from the accessible archive evidence.
- **Validation:** the FX archive contract and regression suites, FX/content/link validators, changed-file JavaScript syntax checks and `git diff --check` pass. The public archive was read only; no Supabase write or workflow rerun was performed. No supplied screenshots were available in the workspace/session for visual comparison.
- **Commit / release boundary:** implementation commit `24aca5c` and evidence commit `527aba0` are local on this branch. `git push -u origin feat/m39-fx-06` failed with `fatal: unable to get password from user`; no remote SHA was confirmed. `gh auth status` reports no authenticated GitHub account. No PR, merge or production deployment occurred. The workflow's previous failure root cause remains unknown; public metadata showed both a successful and a failed archive run, while detailed logs were inaccessible.
- **State:** implementation and local validation complete; remote push and PR are blocked on GitHub authentication. Historical recovery and screenshot-based acceptance remain unavailable.

### M39-FX-05 — Public FX pricing boundary (merged in PR #495)

- **Production baseline:** M39-FX-05 was merged to `main` in PR #495, which is the base of this branch.
- **Boundary:** public pages render only validated source-supplied directional prices; spread analytics remain excluded from public components. Subscriber entitlements and missing-data behavior are unchanged.

### M39/G1 — Final homepage repair and historical repository verification

- **Branch / base:** `codex/m39-g1-final-homepage-repair` from latest `origin/main` `8822ed2`. Scope is limited to homepage navigation, timeline presentation, the public repository date renderer, focused tests and governance records; authentication, payments, entitlements, FX, Global Alerts data flow and Supabase rows are unchanged.
- **Navigation:** desktop/tablet mega-menus retain click/Enter, Escape focus restoration, outside-click closing and mobile accordion behavior while adding intentional pointer-movement hover. A post-scroll guard prevents a stationary pointer or incidental end-of-scroll jitter from opening a menu. Panels remain viewport-bounded with internal scroll, and opening Search GPIR closes any menu before the overlay appears.
- **Timeline:** the existing three-card research structure is unchanged. Scoped selectors, explicit SVG maximum dimensions and an updated cache key prevent inherited/stale rules from enlarging icons. Desktop remains three columns; 1024px tablet and mobile stack to one contained column with compact spacing.
- **G1 repository:** the deployed `scope=history` API returned exactly two records, IDs `407b51ed-be74-4d48-b0cb-c5bf370762e1` and `127952ce-aaba-4e44-8d19-feaadd4def37`, both `ARCHIVED` / `HISTORICAL`, with summaries and verified MAS links. The page already displayed both; its date formatter now renders verified `mas.gov.sg` timestamps in `Asia/Singapore`, restoring the original 28 October and 23 October source dates without changing Production data or API eligibility.
- **Acceptance evidence:** the focused suite passes 38/38. Headless browser checks at 1440×900, 1024×768 and 390×844 confirm hover/click/Escape/search isolation, stationary-scroll protection, mobile accordion behavior, viewport-contained navigation, desktop three-column timeline, tablet/mobile stacking and 24×24 SVGs. Search GPIR retains Australia and TerraPay results. State: **RELEASE CANDIDATE READY FOR PR/CI; MERGE, DEPLOYMENT AND POST-DEPLOYMENT VERIFICATION PENDING.**

### G1 — Governed publication gate and rolling 15-day public repository

- **Branch / base:** `codex/g1-15day-closure`, based on `origin/main` `296d312` after the merged G1 publication and event-consolidation work. M39, G2, payments, authentication and subscriptions are unchanged.
- **Publication gate:** a read-only Production queue check found two pending GREEN-source candidates meeting the stored trust/confidence metadata threshold, but the unchanged source validator returned `REVIEW / SOURCE_TIMESTAMP_MISSING` for both original pages despite HTTP 200 responses. No candidate is governance-eligible, so no candidate was selected, approved, published or written to Production. The newest blocked row is RBI candidate `0efd7ebd-3035-4132-a6ae-61ca771fb3b9`, published-at `2026-09-10T00:00:00Z`, at `https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=63566`.
- **15-day repository:** `gpir-public-intelligence` now requests approved announcements from the rolling 15-day cutoff and independently enforces an inclusive 15-day lower boundary plus a no-future-record upper boundary during response normalization. The existing 12-hour LIVE/ticker rule is unchanged; records from 12 hours through 15 days remain HISTORICAL, and older Supabase rows are not deleted or mutated. The response adds `windowDays: 15` while preserving the `records` contract used by Search GPIR and ASK GPIR.
- **Evidence / release boundary:** focused G1 and G1-R07 tests pass 15/15, including exact-boundary inclusion, one-millisecond-outside exclusion and 13-hour historical retention. No Edge Function deployment, database write, publication, merge or Production change occurred. State: **IMPLEMENTATION READY FOR OWNER REVIEW; FIRST GOVERNED PUBLICATION BLOCKED BY MISSING SOURCE TIMESTAMP EVIDENCE.**

### M39-G1 — Homepage navigation and Global Alerts completion

- **Owner / branch / base:** Vishal Krishnan; `codex/m39-g1-alerts`; latest `origin/main` base `e9d9d50` on 2026-10-31. Work was isolated from the unrelated dirty `m38-production-resume` checkout.
- **Navigation:** desktop/tablet mega-menus now use intentional click/Enter activation only; the active trigger toggles closed, outside click closes, and Escape closes then restores trigger focus. Hover/focus CSS no longer rotates the caret or reveals a closed desktop panel. The existing mobile tap accordion and long-menu scrolling remain intact.
- **Global Alerts:** the homepage keeps the deployed read-only `gpir-public-alerts` endpoint and never uses static historical announcements as a live fallback. The renderer distinguishes loading, legitimate empty and API-unavailable states; non-live states are stationary. Live records require a meaningful headline, summary, category, publisher, valid authoritative timestamp and credential-free HTTPS source URL, and reject explicit non-approved, ineligible, unverified or restricted flags. Live-only items open the existing detail panel and use the verified original source rather than a nonexistent generated page as their fallback link.
- **Presentation / evidence:** dark-ribbon alert text now uses high-contrast white/gold styling and actual announcements pause on hover or keyboard focus. The focused deterministic suite passes 10/10. A Windows browser screenshot was not captured because browser control could not verify the current Edge URL safely; no visual result is claimed.
- **Production dependency / boundary:** a read-only request to the deployed endpoint returned HTTP 200 with `alerts: []`, `windowHours: 12` and `generatedAt: 2026-10-31T06:00:27.810Z`. Source for the deployed `gpir-public-alerts` and `gpir-intelligence-fetch` functions is not present on `main`, so the reported upstream `summary_narration` publication gap cannot be safely corrected or deployed in this frontend PR. No database record, schema, approval state, Edge Function, production deployment or main merge changed. State: **IMPLEMENTATION COMPLETE / READY FOR OWNER REVIEW; LIVE DATA DEPENDS ON ELIGIBLE UPSTREAM PUBLICATION.**
- **Remote checkpoint:** implementation commit `e50c5d5` is pushed on `codex/m39-g1-alerts`; PR [#479](https://github.com/krishnan-vishal/krishnan-vishal.github.io/pull/479) is open into `main`. Merge and deployment remain owner-controlled.

### M39 — Reader Summary reliability and controlled deployment readiness

- **Owner / branch / base:** Vishal Krishnan; `feature/m39-reader-ui-refinement`; reconciled on 2026-10-29 against `origin/main` `54abe9c`. The branch was four commits ahead with no missing main commit. Uncommitted M37 acceptance documentation and unrelated UIX review files in the original checkout were preserved and not staged.
- **Candidate retrieval:** the existing `fetchPolicyCandidates()` helper remains unchanged. `gpir_list_entitlement_candidates_v2` stays primary. Only HTTP responses carrying `PGRST202` use the restricted `gpir_publication_access_policies` fallback filtered to `ACTIVE` / `ENTITLED` and limited to publication identity fields. Every valid primary or fallback candidate still requires a reader-scoped `resolve_publication_entitlement` result; only `ALLOW` enters the library.
- **Failure isolation and logging:** deterministic dual-failure coverage proves an HTTP 404 / `PGRST202` primary response followed by an HTTP 503 fallback still returns HTTP 200 with profile, payment history, active subscription and plan data preserved; the library is unavailable and empty, `libraryCount` is null, and no resolver call occurs. Dependency logs retain only bounded status/code diagnostics and no longer echo untrusted upstream messages that could contain credentials or reader information.
- **Regression evidence:** primary success, restricted fallback, malformed fallback identity and dual-failure scenarios pass. The complete focused M37-M39 suite passes 48/48, including Production one-time payment, webhook, entitlement, reader checkout and recurring-subscription isolation. Content, link, announcement, intent, high-confidence-secret, syntax and whitespace checks pass. The performance audit reports five advisory warnings. A broader M35 run retains six pre-existing estate-count failures in files unchanged from `origin/main`; they are not attributed to M39.
- **Scope / release boundary:** this reliability pass changes only `gpir-reader-summary`, its M38 failure mock, the new M39 tests and governance handoff records. The branch also retains its earlier M39 reader UI refinements. No database data, migration, payment, subscription, entitlement, secret, Edge Function, Production deployment, main merge or publication state changed. State: **IMPLEMENTATION COMPLETE / READY FOR OWNER REVIEW AND CONTROLLED PRODUCTION DEPLOYMENT; MERGE AND DEPLOYMENT REMAIN OWNER-CONTROLLED.**
- **Remote checkpoint:** implementation commit `9a0f095cd464f090fb984fa4e70117b818780a56` is pushed and confirmed on the working branch. PR #472 is open and mergeable into `main`; `GPIR Security and Integrity` run 540 and `M37 Production Non-Monetary Gate` run 16 passed for that implementation SHA. Owner review, merge and a separately controlled Production deployment remain pending.

### M37-UI-01 — Reader checkout integration

- **Owner request / state:** on 2026-10-28, the owner reported the six Production one-time offers `LIVE_ACTIVE` and `ONETIME_CHECKOUT_ENABLED=true`. No Production write or payment was performed during this UI work. PR #469 is already merged; the focused follow-on implementation is on `codex/m37-ui-reader-checkout` pending an owner-authorized GitHub review route.
- **Reader integration:** My GPIR now retrieves the authenticated `gpir-onetime-create-order` catalogue and displays only valid server-returned USD, EUR, GBP, SGD, AUD and CAD offers. Order creation sends pass, currency and idempotency identifiers only; no browser amount is submitted. PayPal SDK instances remain currency-specific and capture is accepted only when `gpir-onetime-capture-order` returns `CAPTURED`, `live`, `SERVER_VERIFIED` and an authoritative expiry.
- **Refresh and failure boundary:** a verified capture refreshes the reader summary, payment history, plan state and displayed entitlement expiry. Pending, cancelled, failed or unverified browser outcomes dispatch no access-refresh event and grant nothing. The broad protected-section warning no longer treats Production's intentionally unavailable legacy recurring-checkout catalogue as a data outage; genuine library, payments, plan or library-pass failures still produce the warning.
- **Recurring isolation / validation:** the existing recurring subscription JavaScript and backend handlers are unchanged. Focused M37/M38 reader, production payment, webhook, entitlement and recurring tests pass 34/34. No real-money transaction was attempted.

### M37 — Final Production implementation and release gate

- **Owner / branch / PR:** Vishal Krishnan; `release/m37-six-currency-disabled-prep`; existing PR #469 into `main`, continued from checkpoint `14863fb`. No replacement PR or payment architecture was created.
- **Production contract readback (2026-10-28):** all six one-time catalogue rows are `DISABLED`, each at 999 minor units for 30 days. Production has zero M37 orders, entitlements and webhook events. RLS is enabled; mutation RPCs are service-role-only; the publication resolver contains the additive library-pass check while retaining recurring-subscription and publication-purchase branches.
- **Order and capture integration:** the create handler uses `gpir_m37_prepare_order` and `gpir_m37_attach_order`; the capture handler uses `gpir_m37_get_reader_order` and `gpir_m37_finalize_verified_capture`. Browser amount fields are not sent to preparation or trusted for PayPal order creation. The Edge layer accepts only the exact Premium Library pass, six approved currencies, 999 minor units and 30 days. A PayPal 422/delayed response is recovered by securely reading and verifying the completed provider order before idempotent finalization.
- **Webhook reconciliation:** PayPal signature verification occurs before any ledger write. The handler claims `gpir_m37_onetime_webhook_events` through its unique provider-event key, detects same-ID payload conflicts, reprocesses recoverable `RECEIVED`/`ERROR` events, verifies completed captures through PayPal Orders v2, recovers an order-attachment race through the Production attachment RPC, finalizes through the Production capture RPC, and revokes through `gpir_m37_revoke_verified_capture`. Pending, denied, cancelled, mismatched, unverified, unrelated and duplicate events cannot grant access.
- **Reader result:** `gpir-reader-summary` and the My GPIR dashboard now combine the existing payment/subscription view with the Production M37 order and entitlement ledgers. They report all six currencies, captured/refunded/reversed history, Premium Library pass state, effective window and expiry independently from recurring billing. The resolver remains the access decision authority.
- **Entitlement integrity:** the live finalizer verifies local order, PayPal order, capture ID, currency and amount; repeated identical finalization returns the stored expiry; `source_order_id` and PayPal capture IDs are unique; each accepted capture creates one entitlement at `CURRENT_TIMESTAMP + interval '30 days'`; refunds/reversals revoke it.
- **Preservation and activation boundary:** recurring create, verify, webhook and browser modules are byte-identical to `origin/main`; focused M38 recurring regression passes. USD recurring remains `LIVE_ACTIVE`; the five other recurring currencies remain `PENDING_PROVIDER`. One-time offers, checkout page and runtime flag remain disabled. No Production function deployment, schema mutation, charge, entitlement or activation occurred.
- **Validation / handoff:** focused M37 Production tests pass 19/19 and M38 recurring/reader tests pass 7/7 before the final repository validation pass. Implementation commit, remote SHA confirmation and final GitHub checks are recorded by Git/PR metadata after this handoff entry. State: **IMPLEMENTATION COMPLETE / READY FOR OWNER RELEASE REVIEW; MERGE AND ACTIVATION REMAIN OWNER-CONTROLLED.**

### SUPABASE-ANNOUNCEMENTS-04 — Broad HTML link fallback

- **User request:** 2026-09-14 request to scan all page anchors by default because official indexes use tables, lists and divs rather than only article cards. Keep only 10–250 character titles whose title or URL contains a specified finance keyword; preserve approved and ticker-eligible Supabase writes.
- **Implementation:** `scraper.js` uses `a[href]` unless `parser_profile` supplies an explicit CSS selector, deduplicates canonical URLs, removes the former 20-item source cap, and upserts/updates in 100-row batches. Source and zero-result logs distinguish a clean empty run from a scrape failure. Existing HTTPS and registered-host checks remain.
- **Evidence / boundary:** focused all-anchor filter and 205-row batch tests, the Security and Integrity script checks, announcement validators, syntax and secret scan pass locally. Recent public `run-ticker.yml` runs are green, but the user reports the table empty; detailed source logs and live database rows are unavailable here. This broader fallback does not establish that sources are reachable, eligible or visible to the separate static GPIR reader. Main publication remains owner-controlled.

### SUPABASE-ANNOUNCEMENTS-04 — Approved ticker ingestion request

- **User request:** 2026-09-14 request to write scraped Supabase announcement rows with `publication_status=approved` and `ticker_eligible=true`, including previously discovered matching URLs on rerun. This changes the earlier review-only database policy; canonical GPIR JSON and its independent publication controls are unchanged.
- **Implementation:** `scraper.js` sets both fields on every new row and updates only those two fields for matching existing `canonical_url` rows. The official-host and HTTPS checks remain. A focused mock checks both new insert and existing-row promotion without changing an existing title.
- **Boundary:** the repository's public announcement reader uses canonical static data rather than `global_announcements`; a database flag change alone does not establish public GPIR-site display. Owner review and live workflow/database verification remain necessary.
- **Delivery control:** the validated commit was pushed to `codex/approved-ticker-ingestion`. Automatic approval review rejected `git push origin HEAD:main` because the direct publication of auto-approved external scrape data lacked established project-owner authorization and bypassed the repository's main review control. The command did not execute; no main publication is claimed.

### SUPABASE-ANNOUNCEMENTS-04 — Ticker job runtime repair

- **Trigger:** the public `run-ticker.yml` run at main `9149344` installed dependencies successfully but failed in `Run The Announcement Scraper` with exit code 1. The detailed exception was not supplied; GitHub's public log-download endpoint returned 403. The workflow used Node 18, while registry metadata says current `@supabase/supabase-js` 2.116.0 requires Node 22+ and Cheerio 1.2.0 requires Node 20.18.1+.
- **Change:** `codex/ticker-scraper-runtime-fix` moves the job to Node 22, pins the compatible client/parser versions, updates checkout/setup actions, and removes unused `rss-parser`. The scraper now reads owner-supplied `feed_or_index_url`/`source_id`, inserts into required unique `canonical_url`, and reports Supabase code/details/hint. Review rows explicitly disable ticker eligibility and leave unknown source publication timestamps null. Canonical JSON publication is unchanged.
- **Evidence / limit:** owner supplied both SQL table definitions during this task. Syntax, focused mock schema mapping/error/archive checks, announcement validation and diff whitespace checks pass locally. The detailed cloud exception and a successful rerun remain unavailable; no live Supabase insert is claimed.

### FX-BIDIRECTIONAL-03 — Reverse FX reader flows

- **Owner direction / branch:** 2026-09-14 request to support both sending directions in Historical, Weekly Trends and Treasury, with six-decimal inverse rates and matching movement indicators. Implemented on `codex/fx-global-hourly-archive` pending release validation.
- **Implementation:** the public seven-day reader derives a reverse row only when that pair is not recorded for the capture timestamp; both pages expose a sending-currency filter derived from returned rows. Treasury includes all 28 configured regional sending currencies and resolves a missing direction from the validated reverse snapshot pair before using common-base derivation. Inverse rates display to six decimals, and inverse highs, lows, percentages and ▲/▼ direction derive from the inverted observations.
- **Validation / boundary:** focused FX archive and regression tests, all Security and Integrity workflow scripts, 61-file JavaScript syntax, secret scan, FX/content/link and announcement validators, and `git diff --check` pass locally. Performance audit reports four existing advisory warnings. Calculated inverses remain labeled and are not executable quotes. Public archive visibility and live production data remain unverified.
- **Delivery / publication control:** implementation and current main history are pushed to `codex/fx-global-hourly-archive`. Automatic approval review rejected `git push origin HEAD:main`: the transcript does not establish explicit project-owner authorization for pushing main. The command did not execute. Owner-controlled publication remains pending; no indirect release route was attempted.

### FX-GLOBAL-ARCHIVE-02 — Public seven-day FX reader

- **PR security repair:** PR #378's Security and Integrity run passed content, discovery, links and JavaScript syntax, then failed its secret-pattern scan on the public reader's `apikey:` object property. The request now sets the same public header through `Headers.set()` as the existing gallery, and obsolete static weekly/date assertions were replaced with dynamic reader contract checks. The scan rules and immutable content hashes were preserved.
- **Owner direction / branch:** 2026-09-14 request to replace fixed September historical controls and the static weekly reader with public, read-only Supabase archive queries on `codex/fx-global-hourly-archive`.
- **Implementation:** both generated FX pages now render empty card targets through a shared public-key REST reader. It filters the past seven days by timestamp, pages chronologically, groups every distinct pair, computes seven-day variance/high/low, and populates the historical capture selector from returned timestamps. The generated static hourly archive remains a last-known-good fallback when present. No service-role key enters browser code.
- **Evidence / limit:** focused archive tests, FX regression, syntax, FX/content/link validation and diff whitespace checks pass locally. A read-only production endpoint probe returned HTTP 200 with zero publicly visible rows; that does not distinguish an empty table from RLS filtering. The static hourly fallback file does not yet exist in this checkout. Live cards and scheduled inserts remain unverified until rows are publicly readable and the workflow runs.
- **Handoff:** the development branch was pushed. GitHub's PR creation integration returned HTTP 403 (`Resource not accessible by integration`), so the owner must open the compare page as a PR or provide an integration with PR write permission.

### FX-GLOBAL-ARCHIVE-01 — Regional hourly archive repair

- **Owner direction / branch:** 2026-09-14 request to cover 28 specified currencies across four regional groups, store each hourly validated pair in the supplied Supabase `fx_historical_archive` schema, and compute the weekly tab from its trailing seven days. Work branch `codex/fx-global-hourly-archive` started at `origin/main` `55c4870` and merged current `origin/main` `ea53c29` before handoff.
- **Implementation:** the existing keyless reference provider requests one complete USD table per run; that table yields each specified USD pair and every within-group local cross, in addition to the 26 curated pairs. This keeps the free daily-reference endpoint within its documented hourly request guidance. Configured licensed adapters remain priority candidates, but incomplete pair coverage falls through to the reference tier. Missing/incomplete provider data now fails without changing `current.json` or advancing the publication date.
- **Archive/reader:** after FX/content validation, the hourly workflow installs `@supabase/supabase-js`, inserts one row per validated pair using the owner-supplied table columns and service-role secrets scoped to that step, pages through the past seven days, reduces hourly rows to the last capture per UTC day, and regenerates `weekly-summary.json`. The public Weekly Trends reader continues to fetch generated JSON without a browser database dependency. The ticker retains 26 curated pairs; other regional pairs route through Explorer rather than nonexistent detail pages. The historical page lists stored immutable dates only; the September 1 date lock and invented missing-date links are gone.
- **Evidence / limits:** local FX, Supabase-mock archive contract, structured FX/content and link checks pass. No live provider, Supabase write, Actions run or production refresh has been claimed. Historical gaps after September 9 cannot be backfilled without actual preserved observations. Owner review/merge of the branch and configured Actions secrets remain necessary for production execution.

### SUPABASE-COUNTRY-03 — Live country summary enhancement
- **Owner / base / branch:** Vishal Krishnan explicitly requested a direct `main` release; development branch `codex/phase3-live-country-dashboard` from `origin/main` at `55c4870`.
- **Objective:** query the public Supabase `country_intelligence` REST API for `publication_status=eq.live` and surface live country summaries in the homepage Dashboard Gallery.
- **Actual frontend contract:** the gallery previously fetched `content-registry.json` and `dashboard-metadata.json`; it did not fetch `country-intelligence.json`. Those repository files continue to provide dashboard identity, imagery, links and last-known-good descriptions. The new public-key request selects only country identity, publication status, summary and the page identifier from JSONB metadata. Live text is inserted with `textContent`.
- **Live API evidence:** a read-only public-key request returned HTTP 200 with an empty array for all rows and for the `live` filter. The `publication_status` column and projected page expression were accepted; CORS allowed `https://fintechoisis.com`. This does not establish whether the table is empty or public RLS excludes the rows. No live summary can be displayed until eligible rows are publicly readable.
- **Validation:** focused mocked gallery test, changed-file JavaScript syntax, content/link validators, M-27A reader journey, M24 reader integration, applicable Security and Integrity regression commands, and `git diff --check` pass. Performance audit reports four existing advisory warnings. The public release and browser-visible cloud result remain unverified.
- **Delivery / blocker:** implementation commit `06b8f3b` is pushed to `codex/phase3-live-country-dashboard`. Automatic approval review rejected the direct `git push origin HEAD:main` as a production publication without trusted owner authorization under `AGENTS.md`; the command did not run. Main remains `55c4870` at the checked remote SHA. Owner-controlled PR review and merge are required; no retry through an indirect route is authorized.
- **Boundary:** no service-role key, schema mutation, record promotion or country data rewrite. Cloud failure, latency and zero rows retain the existing static gallery.

### SUPABASE-COUNTRY-01 — Optional country metadata mirror
- **Owner / branch / base:** Vishal Krishnan; `codex/supabase-country-intelligence` from `origin/main` at `5c7f8bd`.
- **Objective:** upsert canonical `assets/data/country-intelligence.json` records into Supabase `country_intelligence` after the existing static intelligence workflow, matching `country_code`.
- **Implementation:** a separate Node script maps `isoAlpha2` to `country_code`, `name` to `country_name`, present summary and risk fields to their matching columns, and remaining fields to JSONB `metadata`. Absent risk, narrative and FX values are not invented or cleared. The workflow validates content first, then runs the cloud mirror as a non-blocking final step with credentials scoped to that step. Existing file writes, generated pages, public URLs and publication review remain unchanged.
- **Validation:** local sync contract test, Node syntax and `validate-content.js` passed; no live Supabase write or Actions result is claimed.
- **Schema dependency:** the supplied `CREATE TABLE` definition omitted a UNIQUE constraint on `country_code`. On 2026-09-13, the owner reported that the UNIQUE constraint was executed in Supabase. This is owner confirmation; no direct database schema query or live upsert was performed here.
- **Delivery:** implementation commit `b02b1de`; branch pushed and ready for owner review. PR, merge and cloud run remain pending. GitHub Pages remains independent of Supabase availability.

### M28-FX-R1 — Data-first production remediation
- **Milestone / owner:** M28-FX-R1 — FX Live Data Pipeline Final Repair; Vishal Krishnan.
- **Base / branch:** `origin/main` at `2098026`; `work/m28-fx-r1-data-first-remediation`. No merge is authorised.
- **Root cause:** the hourly FX workflow successfully generated and validated observations on `automation/fx-snapshot`, but GitHub Actions could not create its review PR and deliberately returned success. Consequently production `main` remained on the first 08 Sep snapshot with no historical baseline, variance or weekly evidence.
- **Data result:** the repair branch incorporates the genuine Open ER API reference observations accumulated by the automation branch through 11 Sep: 26/26 validated pairs, three immutable daily archives, previous-business-day values for all 26 pairs and four-observation deterministic weekly summaries. The source remains truthfully `REFERENCE`; no licensed live provider is configured or claimed.
- **Freshness / failure result:** mutable `current.json` and `weekly-summary.json` reads now use unique request URLs with `cache: no-store`; dated immutable history retains stable cacheable URLs. The 36px homepage strip says `FX SNAPSHOT`, renders a single dynamic IST timestamp, derives CURRENT/REFERENCE/DELAYED/STALE state from provider class and observation age, and retains a loaded snapshot as `LAST VALIDATED` after a browser refresh failure. Browser polling is metadata-driven within a bounded 5–15 minute interval; the current hourly daily-reference workflow is staggered to minute 7.
- **Workflow result:** a missing review PR is now a failed publication handoff, not a green run. The validated automation branch remains preserved, but `gh pr create` failure makes the scheduled workflow visibly fail until the repository permission is enabled or a human opens the PR.
- **Validation:** FX regression suite, FX structured-data validator, generated-page link validator, JavaScript syntax and `git diff --check` pass. Live public-provider diagnostic returned 26 requested/26 normalized pair records through the existing adapter; no credential was printed.
- **Remaining authority:** owner review/merge of the remediation PR is required to update production. For durable scheduled publication proposals, enable **Settings > Actions > General > Allow GitHub Actions to create and approve pull requests**. Licensed live bid/ask/last access remains blocked pending authorised provider credentials and a verified API contract.

### M30 — Final Global Announcements Production Closure
- **Milestone / owner:** M30 — Final Global Announcements Production Closure; Vishal Krishnan.
- **Base / branch:** merged Wave A PR #351 on `origin/main` (`2411e99`); `work/m30-global-announcements-production-closure`. One PR is required; no merge is authorised.
- **Root causes:** the homepage announcement ticker was intentionally static (`animation:none`) with manual horizontal overflow; the archive still used a large date-range/card-grid presentation; its intended compact rules lived in `page.css`, which the generated archive does not load; and lifecycle freshness preferred GPIR `publishedAt`, allowing old source events to appear LIVE after later validation. The automatic gate also accepted date-only evidence despite M30 requiring an exact timestamp.
- **Ticker outcome:** one canonical card sequence is rendered, cloned once with the clone removed from accessibility/focus order, measured, and animated exactly one sequence width for a seamless loop. The viewport hides overflow, records remain 28–30px compact with 10–11px type and ellipsis, and fallback records carry an explicit ARCHIVE label. Reduced-motion remains static.
- **Archive outcome:** generated Year/Month buttons and counts are primary navigation; current canonical counts are 2026 (14), September (1), August (2), July (2), June (6), May (1), March (2). Region/country/category/subcategory remain compact secondary filters. The generated canonical snapshot is embedded from `announcements.json`, so filtering is local and the server-rendered archive remains usable when discovery or JavaScript refresh fails. The date-range form and duplicate latest-card section were removed.
- **Freshness/publication controls:** LIVE now uses the authoritative source publication timestamp, never GPIR processing time. Exact source timestamp is mandatory for future deterministic T1 auto-publication; date-only and other failing candidates remain in review/quarantine. Existing historical records and provenance are unchanged.
- **Production evidence:** report-only discovery evaluated 113 approved sources (43 configured), discovered 0 records, proposed 0, and mutated 0. The truthful outcome is `No new eligible authoritative event available for live publication`. Publication report-only evaluated and retained 14 existing candidates, auto-published 0 and quarantined 7 eligible-source candidates for failed gates. Current public lifecycle is 0 LIVE and 14 archived.
- **Search/ASK proof:** all 14 canonical published records are emitted by `announcementEntries`; the shared lifecycle query and existing `answerAnnouncementQuery` path resolve the same records. No independent ticker dataset was introduced.
- **QA:** 24-check M30 suite and all relevant content, lifecycle, P1 recovery, publication, intent/Search/ASK, source, link, syntax and diff checks pass. Narrow-viewport browser QA confirms compact/no-overflow archive rendering and two timed ticker captures confirm visible movement without a scrollbar. Performance audit retains four pre-existing advisory warnings.
- **Delivery state:** implementation complete at `bf14d59`; branch pushed at `8e18f0b`; PR #356 is open and mergeable against `main`, and its Security and Integrity workflow passed. Final documentation checkpoint must be pushed and rechecked before handoff.
- **Remaining authority:** Vishal owner review and merge decision for PR #356. No worker merge is authorised.
- **Scope:** no FX, Wave B, navigation, source-universe, backend, domain, dashboard, country or canonical-schema redesign.

### Wave A — Central Bank & Regulator Validation
- **Milestone:** Wave A — Central Bank & Regulator Global Coverage Validation.
- **Category / owner:** Intelligence / Automation / Governance; Vishal Krishnan.
- **Base / branch:** merged M29 PR #349 on `origin/main` (`7709bbae`); `work/wave-a-central-bank-regulator-validation`. One PR is required; no merge is authorised.
- **Implementation status:** IMPLEMENTED / LOCALLY VALIDATED / COMMITTED AND PUSHED / PR #351 OPEN / ACTIONS PENDING.
- **Bounded universe:** 85 jurisdictions: all 63 current BIS member central banks/monetary authorities plus 22 additional central-bank jurisdictions already represented in GPIR. The matrix covers exactly the eight owner-specified regional groups.
- **Evidence outcome:** 85 central-bank authorities and seven separate regulator profiles are verified; 77 jurisdictions have an official publication surface documented. Final health-aligned result: zero `ACTIVE_GREEN`, 37 `ACTIVE_AMBER`, one `QUARANTINED_RED`, 47 `VERIFIED_UNSUPPORTED`, and zero `MISSING_AUTHORITY`.
- **Live revalidation:** all 38 active M29 Wave-A profiles were controlled-fetch tested. Seventeen profiles returned correctly dated official publications (283 parsed publication entries); 21 did not. A later repeat across five previously reachable indexes uniformly returned endpoint-unavailable, so earlier same-pass proof was retained without promoting any source.
- **Defects corrected:** official HTML acquisition now handles date attributes, numeric slash/dot formats and anchor-local date association before surrounding context. Payment relevance now rejects macroeconomic “balance of payments” false positives unless separate specific payments evidence is present.
- **Registry/report:** 25 missing BIS members were added as inactive Tier-1 official profiles, bringing the registry and `source-health.json` to 113 sources. `assets/data/wave-a-country-matrix.json` contains the 85-row control matrix, totals, regional breakdown, metrics and a blocker/method gap register.
- **Publication outcome:** zero newly discovered items passed the existing strict publication gate. No canonical record, ticker entry, archive/summary card, Search entry or ASK entry was added; all existing M29 reader behavior is unchanged.
- **Isolation/governance:** no UI, Search, ASK, FX, hosting, database, runtime-AI, paid-API or Wave B/C/D work was performed. Domain allowlisting, redirect rejection, per-source isolation, URL/event deduplication and human-controlled publication remain intact.
- **Local validation:** content and announcement schemas, M29 and Wave A coverage, M29 acquisition/isolation, source activation, lifecycle, 28-check publication pipeline, announcement intent, intelligence radar, M24 Search/ASK integration, 104-file links, FX boundary regression/validation, full JavaScript syntax and `git diff --check` pass. Performance audit retains four pre-existing advisory warnings.
- **Handoff:** implementation commit `6801577` is pushed and PR #351 is open against `main`.
- **Remaining:** push this documentation checkpoint, confirm its remote SHA and Actions state, then stop for owner review. Production remains unchanged until owner-controlled merge.
### P1 — Continuous Intelligence Discovery Recovery
- **Milestone:** P1 — Continuous Intelligence Discovery Recovery.
- **Category / owner:** Intelligence / Automation / Reliability; Vishal Krishnan.
- **Base / branch:** `origin/main` at `7709bba`; `fix/p1-continuous-intelligence-discovery`. One PR is required; no merge is authorised.
- **Exact run #15 failure:** job `Discover trusted-source candidates`, step `Validate changed intelligence artifacts`, command `node scripts/validate-announcements.js`. It reported five reader/generated-artifact contract violations: missing single-sequence ticker, duplicated ticker sequence, incomplete archive lifecycle sections, blank server-rendered archive fallback, and missing dynamic archive publication timestamp. The failure was deterministic schema/validation drift in SHA `8b19163`, not a source, network, parser, Actions environment or Node runtime failure. M29 later brought the reader artifacts into conformance on `main` before this recovery branch began.
- **Recovery implementation:** candidate and source-health snapshot writes are staged and atomically promoted. Source-health generation or promotion failures now return `DEGRADED_LAST_KNOWN_GOOD_RETAINED` rather than failing an otherwise integrity-preserving cycle. Endpoint and parser failures remain isolated AMBER/RED source results. Zero qualifying records is an explicit successful outcome with `0 new records; existing published corpus retained`.
- **Reader/LKG result:** the ticker was not coupled to source-health success. It already selects LIVE records inside 24 hours, then the existing published corpus, with non-live detail labelled `ARCHIVED · HISTORICAL INTELLIGENCE`; a truthful empty state remains when no published record exists. Announcements, canonical registry, archive, Search and ASK inputs remain unchanged in degraded simulations.
- **Node finding:** run #15 used `actions/checkout@v4`, `actions/setup-node@v4` and project Node 20. GitHub warned those action runtimes were being forced from Node 20 to Node 24, but both setup steps succeeded and the exact deterministic validator errors occurred later. No action or dependency version was changed because runtime compatibility did not contribute.
- **Validation status:** dedicated A–E recovery simulations, production pipeline checks, announcement validation and JavaScript syntax checks pass locally. Implementation commit `6011fd3`; branch pushed at `f8d761c`; PR #353 open, mergeable and its initial Security and Integrity check passed. The final documentation checkpoint must be pushed and rechecked before handoff.
- **Scope controls:** PR #351 remains unmerged and untouched. Wave B was not begun. No Global Announcements, Wave A, Search, ASK, FX, taxonomy or canonical architecture redesign was performed.
- **Remaining authority:** owner review and merge of PR #353. The worker has not merged it.

## Superseded M29 handoff

- **Milestone:** M29 — GPIR Global Source Network Activation.
- **Category / owner:** Intelligence / Automation / Governance; Vishal Krishnan.
- **Base / branch:** merged PR #343 on `origin/main` (`8b19163`); `work/m29-global-source-network-activation`.
- **Implementation status:** MERGED through PR #349 at `7709bba`.
- **Source activation:** the existing 88-source registry is unchanged in membership. Thirty already-approved official public indexes were activated with bounded deterministic HTML acquisition in addition to the existing 13 RSS/Atom/JSON endpoints: 43 functioning active sources across 33 countries/jurisdictions. The successful acquisition snapshot reports 43 GREEN, 0 AMBER, 0 RED, 0 STALE and 45 UNSUPPORTED.
- **Controlled backfill (2026-05-01 through 2026-09-09):** 211 dated records were fetched in-window; 13 passed the broad payment-intelligence candidate gate and 198 were rejected or deduplicated. Four Tier-1 records then passed the stricter publication gate: Bank of Canada cross-border payments, Banco Central do Brasil virtual-asset transfers, and two Bank of England stablecoin/payment-infrastructure notices. Fourteen ambiguous or secondary candidates remain non-public for exception review.
- **Reader outcome:** the four real records have canonical entries, permanent summary pages, original-source links, source/validation/lifecycle evidence, archive cards, registry/search entries and ASK GPIR retrieval through the existing corpus. All four are correctly archived because their source dates predate the 24-hour window; the truthful live count is zero. Current totals are 14 published/archive records and 1 developing announcement.
- **Coverage artifact:** `assets/data/source-health.json` is the machine-readable all-source coverage and health report. It includes every required M29 field for all 88 sources and is validated by `scripts/validate-source-coverage.js`.
- **Isolation/governance:** each source is fetched independently with bounded retries, official-domain/redirect controls and last-known-good publication behavior. No source, URL, service, database, runtime AI, paid API, FX asset, Search architecture or ASK architecture was invented or added.
- **Local validation:** content, announcement/canonical schema, all-source coverage, M29 acquisition/isolation, 28-check production pipeline, source activation, lifecycle, Search/ASK scenarios, intelligence radar, M24 reader integration, 104-file link scan, full 51-file JavaScript syntax scan, high-confidence secret scan and `git diff --check` passed. Performance audit passed with four pre-existing advisory warnings.
- **Handoff:** implementation and validation are committed through `82e9962`; the working branch is pushed and PR #349 is open against `main`.
- **Actions:** GPIR Security and Integrity completed successfully for the synchronized `8a675c3` PR head. The final documentation-only checkpoint must revalidate after push; no pending check is represented as passed.
- **Remaining:** push the final documentation checkpoint, confirm its remote SHA and Actions result, then owner review and owner-controlled merge. Production remains unchanged until merge.


## Superseded Global Announcements lifecycle handoff

- **Milestone:** Global Announcements Intelligence Engine — live-to-archive lifecycle.
- **Working branch:** `work/global-announcements-intelligence-archive` from `origin/main` at `5c45990`.
- **Outcome:** Merged through PR #336; exact 24-hour lifecycle, archive, Search/ASK retrieval and report-only backfill foundation now form the base of the current source-activation pass.

## Superseded M28-FX Final Scale handoff

- **Milestone:** M28-FX Final Scale & Variance Pass.
- **Category / owner:** Scaling / Reader Experience / Data / Automation; Vishal Krishnan.
- **Objective:** Automatic previous-business-day variance from validated GPIR observations, compact regional Live FX grid, full active-provider currency universe with deterministic cross-rates, and reusable pair-intelligence presentation hooks.
- **Working branch:** `work/m28-fx-final-scale-variance`.
- **Base:** `origin/main` at `7a77bfa` (includes merged M28-FX Compact Market UX, PR #332).
- **Implementation status:** IMPLEMENTED / LOCALLY VALIDATED / PENDING COMMIT, PUSH, PR AND ACTIONS.
- **Completed:** Variance history now keys closes by provider observation business date and accepts only `VALIDATED` records, preventing same-day scheduler runs or quarantined observations from becoming a false baseline. Weekend/holiday and bounded lookback behavior remain deterministic. Weekly summaries retain their genuine source observations and include the latest validated current point without interpolation.
- **Scale foundation:** The active reference adapter preserves its complete validated USD common-base currency table in `current.json` on the next scheduled generation. Currency Explorer selects any two supplied currencies and calculates a direct or derived reference deterministically in one reusable client-side view; the 26 curated static pair pages remain the bounded indexed set.
- **Reader presentation:** Live FX uses compact `PAIR | RATE | PREV-DAY Δ | STATUS` tables grouped by the existing GPIR market-region vocabulary. Pair intelligence exposes rate, variance, source, timestamp, freshness, classification, genuine market fields only, history-derived trend/high/low, methodology, and explicitly empty future module hooks.
- **Data integrity:** No current/history market observation was edited or generated in this implementation branch. No variance or trend was fabricated. Provider attribution remains the actual adapter id. Licensed LSEG/Bloomberg/XE/IBRLive stubs remain unconfigured contracts and are never presented as sources unless they genuinely supply a future observation.
- **Files changed:** FX configuration, browser app/styles, reference provider, business-day/snapshot/weekly engines, FX validator/tests/page generator, generated FX HTML, and GPIR handoff/governance documentation only.
- **Local validation:** FX regression suite, FX validator, edited JavaScript syntax, link validation, `git diff --check`, and local browser runtime checks for regional filtering plus direct/derived Explorer rendering passed. Actions: PENDING.
- **Publication state:** No merge. Commit, remote SHA and PR URL PENDING at this documentation checkpoint.

## Superseded M28-FX foundation handoff

- **Milestone:** M28-FX — FX Pricing & Treasury Intelligence.
- **Category / owner:** Reader Experience / Data / Automation; Vishal Krishnan.
- **Objective:** A compact automated FX ticker plus a full FX Pricing & Treasury
  reader section (Currency Explorer, Treasury Intelligence, Weekly Trends,
  immutable daily Historical archive) built on a provider-adapter architecture
  with no fabricated/synthetic/stale-as-live rates. M24–M27 were already
  occupied milestone numbers (verified against this log and the backlog before
  choosing M28).
- **Working branch:** `work/m28-fx-pricing-treasury-intelligence` (local only —
  this milestone's instructions explicitly said not to push/create a PR).
- **Base:** `origin/main` at `27df7c5` (includes the merged Global Announcements
  freshness fix, PR #322).
- **Implementation status:** IMPLEMENTED / LOCALLY VALIDATED, NOT PUSHED.
  Completion date: PENDING owner review of the local branch.
- **Completed:** Provider-adapter architecture (`scripts/fx/providers/` —
  `reference.js` real, keyless, reusing the same `open.er-api.com` endpoint
  the pre-existing client-side ticker already called in production;
  `xe.js`/`ibrlive.js`/`lseg.js`/`bloomberg.js` genuine contract stubs that
  report `NO_PROVIDER_CONFIGURED` cleanly and refuse to guess at an
  unverified vendor request shape); previous-business-day variance engine
  with weekend/holiday-aware rollover (`scripts/fx/business-day.js`);
  deterministic normalization/validation with anomaly quarantine
  (`scripts/fx/normalize-validate.js`); snapshot orchestrator with provider
  failover and one-time-per-day historical freezing that never overwrites an
  existing archive file (`scripts/fx/generate-fx-snapshot.js`); deterministic
  weekly-observation engine with no invented commentary
  (`scripts/fx/weekly-summary.js`); CI-style validator
  (`scripts/validate-fx.js`); an 8-group regression suite
  (`scripts/test-fx.js`); a static page generator producing the Live FX hub,
  Currency Explorer, Treasury Intelligence, Weekly Trends, Historical archive
  and one page per featured pair (`scripts/generate-fx-pages.js`,
  `pages/fx/**`); a redesigned compact homepage ticker reading the generated
  snapshot instead of fetching a provider directly from the browser
  (`assets/js/fx-ticker.js`), a lazy-loading reader app for all FX views
  (`assets/js/fx-app.js`), and menu/ribbon integration into the existing
  mega-menu and `#fx-ribbon` (no redundant top-level menu added); a scheduled
  GitHub Actions workflow (`.github/workflows/fx-market-data.yml`); and
  `docs/FX_PRICING_TREASURY.md`.
- **No-Credential Mode verified for real, not simulated:** this session had no
  provider credentials and no network egress (confirmed by a live
  `EGRESS_BLOCKED`/HTTP 403 result from `scripts/fx/generate-fx-snapshot.js`
  itself). The committed `assets/data/fx/current.json` is the genuine output
  of that real run — every record `dataStatus: NO_PROVIDER_CONFIGURED`, every
  rate field `null` — not a placeholder. The same code will reach the
  keyless reference provider successfully once run on a GitHub Actions
  runner with normal internet access.
- **Files modified:** `index.html` (mega-menu entries, `#fx-ribbon` heading/
  link, cache-bust version bumps), `assets/js/fx-ticker.js`,
  `assets/css/market.css`, `docs/PROJECT_STATUS.md`,
  `docs/MASTER_PROJECT_LOG.md`, `docs/GPIR_BACKLOG.md`, plus a version-string
  bump applied mechanically to 80 existing pages that already load
  `fx-ticker.js`/`market.css`.
- **Files created:** `assets/data/fx/fx-config.json`,
  `scripts/fx/business-day.js`, `scripts/fx/normalize-validate.js`,
  `scripts/fx/ticker-format.js`, `scripts/fx/weekly-summary.js`,
  `scripts/fx/generate-fx-snapshot.js`,
  `scripts/fx/providers/{index,reference,xe,ibrlive,lseg,bloomberg,licensed-provider-base}.js`,
  `scripts/validate-fx.js`, `scripts/test-fx.js`, `scripts/generate-fx-pages.js`,
  `assets/js/fx-app.js`, `pages/fx/{index,explorer,treasury,weekly,historical}.html`,
  `pages/fx/pairs/*.html` (26 pages, one per featured pair),
  `docs/FX_PRICING_TREASURY.md`. Generated data artifacts:
  `assets/data/fx/current.json`, `assets/data/fx/weekly-summary.json`.
- **Governance correction applied:** `fx-market-data.yml` initially committed
  validated snapshots directly to `main`; this was corrected before any push
  to align with `continuous-intelligence.yml`'s existing branch/PR review
  pattern — it now pushes to `automation/fx-snapshot` and proposes a PR,
  degrading gracefully (branch pushed, warning logged) rather than failing
  the run if PR auto-creation is unavailable. `main` is never written
  directly. See `docs/FX_PRICING_TREASURY.md`'s "Publication model" section.
- **Local validation:** See the M28-FX milestone entry in
  [MASTER_PROJECT_LOG.md](MASTER_PROJECT_LOG.md) for the full command list and
  results — all passed.
- **Remote handoff / PR / Actions:** None — not pushed, no PR, per this
  milestone's explicit instruction. The branch exists only in this local
  checkout; Vishal must push/PR/merge it, or ask for that explicitly.
- **Constraints / production impact:** No DNS/hosting/CNAME change. The
  homepage ticker's visual behavior and data source changed (see above); no
  existing GPIR navigation, header, footer, design language, validator or
  deployment architecture was replaced.
- **Reconciled production baseline:** M20–M27C, GPIR-OPS-01 and the Global
  Announcements freshness fix (PR #322) are merged. `CNAME` at `origin/main`
  still contains `fintechoisis.com`.

The master log's 2026-09-08 M28-FX entry supersedes stale current-status
claims below. Those snapshots remain as historical evidence, not active
development gates.

## Earlier status snapshot — retained for history

**PROJECT:** FINTECHOSIS — Global Payments Intelligence Repository
**Current Stage:** Stage 1 — public repository activation and connected consumption
**Current Prompt:** M-18 — GLOBAL ANNOUNCEMENTS INTELLIGENCE PHASE 1
**Current Milestone:** M-18 Phase 1 — IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING
**Last Completed Prompt:** M-27B.3 Final human live acceptance
**Last Verified Commit:** `4a7720af2c678cfebad8a8d1f3c5cdd3eea57957`
**Current Release Commit:** `51210bec14750deb7bbda9e27cd5ad513aa1c797`
**Release Status:** M-18.4B — IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING
**Release Summary:** Announcement freshness wording, lifecycle-aware reader structure, registry-backed related intelligence, structured Search cards, historical searchability and shared GPIR footer integration are live on `origin/main`; browser acceptance remains pending because browser tooling is unavailable in this environment.
**Current Development Status:** M-27A.4 removes only the stale India country-page
scaffold warning. India Search and Markets routes resolve to the same canonical
page; dashboard publication architecture and content remain unchanged. M-27A.3 closes and resets the search overlay
before preserving existing result navigation. Search indexing, ranking, ASK GPIR,
dashboard architecture and content remain unchanged. M-27A.2 separates country editorial status from
dashboard publication status and resolves connected dashboard links through
existing metadata assets. No dashboard research, sources, images, metadata,
narratives or registry relationships were changed. M-27A.1 completes the canonical geographic
navigation and registry-driven Dashboard Gallery release using existing assets
only. The Dashboard Gallery is a presentation/view layer and does not create a
parallel country hierarchy. M-26B completes the connected-public-reader
release using the existing canonical registry and live route structure. The
public site now cross-links Country → Region, Country → Dashboard, Country →
Related GPIR records, Region → Country and Region → Dashboard availability
without inventing unsupported relationships or introducing a backend,
telemetry, AI API or domain change.

**M-26A Starting SHA:** `a00b19e9bc9a69177096391eb256fad328375ac0`
**M-26A Status:** ACHIEVED for repository activation. The site now presents
existing content as a public GPIR repository rather than a disconnected set of
pages. Search, ASK GPIR, source/evidence and dashboard narration remain
local-first and grounded in existing repository records.

**M-26B Starting SHA:** `bfb08fb7e12bee4cbd36c6a84921cbc55a981141`
**M-26B Status:** ACHIEVED — CONNECTED PUBLIC READER IMPLEMENTED AND LIVE HTTP
VERIFIED; BROWSER QA NOT VERIFIED IF TOOLING IS UNAVAILABLE.

**Validation Summary:**
- `node --check assets/js/script.js` — passed
- `node scripts/validate-content.js` — passed
- `node scripts/validate-links.js` — passed
- `git --no-pager diff --check` — passed
- Registry integrity checks for duplicate IDs and broken relationships — passed
- Live HTTP verification: homepage, UAE country page and APAC region page each
  returned HTTP 200; runtime assets `script.js`, `chapter-page.css` and
  `content-registry.json` each returned HTTP 200.

**Browser QA:** `BROWSER QA NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.

**M-18:** OPEN
**M-19:** OPEN
**CNAME:** ABSENT
**Custom domain:** DEFERRED

**M-27C Phase 1 Status:** ACHIEVED — DIAGNOSTIC / ARCHITECTURE GATE COMPLETE.
NO PRODUCTION IMPLEMENTATION AUTHORISED.

**M-27C Phase 1 Objective:** Translate live-reader observations into verified
architecture findings, root causes, safe implementation boundaries and a
controlled roadmap for reader-intelligence improvements.

**M-27C Phase 1 Architecture:** GPIR remains a static GitHub Pages site using
HTML, CSS, vanilla JavaScript and JSON. There is no backend, database, public
API, analytics provider or subscription platform.

## M-20 — Intelligence Lifecycle Foundation

- **Date:** `2026-09-07`.
- **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Capability:** The shared lifecycle vocabulary now distinguishes `CURRENT`,
  `DEVELOPING` and `HISTORICAL`, while preserving separate editorial,
  validation, publication and source-trust states.
- **Publication boundary:** Developing records remain excluded from the ticker,
  primary generated pages and structured announcement search. Historical records
  retain stable URLs, reciprocal lineage validation and sitemap preservation.
- **Compatibility:** Existing valid records retain their fields and URLs; only
  the already-unpublished Qatar review record is explicitly labelled
  `DEVELOPING`. No historical record, source URL or validated content was
  removed or rewritten.
- **Preserved safeguards:** M-18-4C trusted redirect boundaries, report-only
  refresh, historical sitemap retention, atomic generation and last-known-good
  publication behavior remain unchanged.
- **Deferred:** No immutable edition snapshots, scheduled ingestion, backend,
  database, AI runtime or UI redesign is introduced.

## M-21 — Continuous Intelligence Pipeline Foundation

- **Date:** `2026-09-07`.
- **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Capability:** A two-hour GitHub Actions workflow inspects only configured
  official machine-readable endpoints and writes only a proposal-only candidate
  queue on an automation branch.
- **Safety:** Candidates are deterministic `DEVELOPING`, `NOT_PUBLISHED`,
  `PENDING_HUMAN_REVIEW` and `CONTENT_UNDER_REVIEW` records. They are excluded
  from public site inputs; failures and no-change runs leave the static site and
  `main` untouched.
- **Deferred:** Source endpoint expansion remains human-configured; no AI
  classification, automatic publication, backend or live public feed exists.

## M-23 — Global Announcements Continuous Intelligence

- **Date:** `2026-09-07`.
- **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Capability:** Activates the existing M21 two-hour proposal workflow with
  verified official RSS sources: RBI press releases, RBI notifications and ECB
  Market Information Dissemination (MID).
- **Safety and provenance:** Each discovered candidate records its source
  authority, original official item URL, final approved discovery endpoint,
  source publication date when supplied and retrieval timestamp. Candidates
  remain `DEVELOPING`, `NOT_PUBLISHED` and pending human review; no public
  announcement, Search GPIR or ASK GPIR path is changed.
- **Deferred:** Additional authorities and any human-reviewed promotion of a
  candidate into validated CURRENT intelligence remain controlled later work.

## M-23.1 — Global Intelligence Radar Expansion

- **Date:** `2026-09-07`.
- **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Capability:** The existing M21 scheduler now reports a rolling `<=24-hour`
  discovery target where official endpoint availability permits, filters for
  payment-relevant material, and deduplicates both canonical URLs and stable
  title/date event fingerprints before proposing candidates.
- **Initial coverage:** M23 sources are retained and the official HKMA JSON
  press-release endpoint adds APAC regulatory/payment-security coverage. The
  data-driven registry records region, ISO/jurisdiction, topics, priority,
  active state and honest workflow health/readiness metadata for active feeds.
- **Boundaries:** Discovery is not validation or publication. Failed sources are
  reported individually while healthy sources continue; the static public site,
  CURRENT/HISTORICAL records, Search GPIR and ASK GPIR remain unchanged.
- **Deferred:** Expansion towards broader regional coverage is configuration-led
  and limited to future manually verified official endpoints. GPIR makes no
  universal real-time-coverage claim.

**M-27C Phase 1 Findings:** The dashboard lightbox is the correct future
foundation but lacks reader controls; the announcement marquee needs a
deterministic measured two-copy loop; Home/hash navigation needs one shared
sticky-header-aware contract; CURRENT/HISTORICAL is documented but not fully
applied; no legitimate unique visitor measurement exists; subscription and
weekly digest infrastructure do not exist; World Map routing is not yet
registry-canonical and map interaction can feel sluggish; and mega-menu hover
behaviour is too sensitive for calm passive reading.

**M-27C Phase 1 Pending Objectives:** M-27C.1 dashboard reader controls;
M-27C.2 deterministic announcement ticker; M-27C.3 navigation contract;
M-27C.4 immutable historical architecture; M-27C.5 privacy-preserving
visitor measurement; M-27C.6 subscription and weekly digest; M-27C.7 canonical
World Map routing; M-27C.8 intent-driven mega-menu behaviour.

**M-27C Phase 1 Preservation:** M-27A.2 dashboard status separation,
disclaimer preservation, dashboard boundary correction and five existing
dashboard publication links remain completed. M-27A.3 Search GPIR overlay
close-before-navigation remains completed. Neither is pending M-27C work.

**M-27C Phase 1 Not Added:** No analytics provider, subscription provider,
subscriber storage, double opt-in, external LLM/API, backend, database,
dashboard research/image/metadata/narrative/disclaimer, country research,
historical migration, new research content or production reader code was
added. M-18 and M-19 remain OPEN; custom domain/CNAME remains deferred; and
browser automation remains unavailable/not verified.

**M-27C Phase 1 Files:** Only `docs/MASTER_PROJECT_LOG.md`,
`docs/PROJECT_STATUS.md` and `docs/GPIR_BACKLOG.md` are changed by this
documentation update.

**M-27C Phase 1 Next Action:** Review and commit this governance update
separately, then proceed to M-27B.1 — LIVE READER INTERACTION DIAGNOSTIC.
M-27B.1 remains DIAGNOSE ONLY; no recommendation may be implemented until
separately authorised.

**M-25E Status:** INTEGRATED INTO M-26A — public activation preserves the
previous dashboard library activation and regional narrative work while
operating as a coherent public repository experience.
**M-25E Starting SHA:** `6543423245ea4f9babbf72345e6da0b3516edd25`
**M-25E.1 Status:** RECONCILIATION CLEAR — 123 local/origin assets, no
local-only or origin-only dashboard files, no history-only files, and absent
screenshot references not added.

**M-24A Status:** COMPLETED — deterministic local-first ASK GPIR foundation.
**M-25A Status:** PARTIAL — context-aware relationships and source metadata are
live; browser QA, broader source cards and dashboard intelligence remain open.
**M-25B Status:** PARTIAL — source-aware search cards and bounded validated
reader navigation are implemented; browser QA, broader registry coverage and
dashboard intelligence remain open.
**M-25B Implementation SHA:** `9f77ff182d38f8f2c568d07185605a7b075dcde1`
**M-25C Status:** PARTIAL — dashboard metadata foundation and reader disclosures are implemented; dashboard intelligence, browser QA and missing metadata remain open.
**M-25C Implementation SHA:** `c9d3b89488700d01adaa92cf6389eaccb865e9b8`
**M-25D Status:** PARTIALLY ACHIEVED. Diagnostic complete (retained); strategic
scope corrected (retained); implementation now delivered for dashboard
registry connection, UK registry connection, dashboard search discoverability
and ASK GPIR country↔dashboard linking. Regional dashboard routes, Europe/SEPA
region record, further portfolio content gaps and browser QA remain open.
**M-25D Governance Baseline SHA:** `e062bf22a532e033e27bfe6b7c09c166a7ce0883`
**M-25D Starting SHA:** `a55ad91a05acb06451c9d61d020974e8c08d6e4b`

**M-27A Status:** ACHIEVED — CURRENT ASSET CONSUMPTION & LIVE GPIR ALIGNMENT
INTEGRATED.
**M-27A Starting SHA:** `479d8d6634b2aee39cc8391d8f91b88e4c7f8eab`
**M-27A Objective:** Consume existing assets and align into live GPIR reader
without creating new content or fabricating unsupported relationships.
**M-27A Implementation:** Registry aligned with complete page references for
regions; UAE country → region → dashboard → narrative journey complete and
verified; same pattern extends to India, Saudi Arabia, Qatar, Singapore; all
validations pass; live HTTP verification complete; no new content created.
**M-27A Country Coverage:** 6 countries with GPIR records (UAE, India, Saudi
Arabia, Qatar, Singapore, UK); 5 with published dashboards; 2 active regions;
all connected through deterministic registry relationships.
**M-27A Files Changed:** `assets/data/content-registry.json` (region page
references added), `scripts/m27a-validate.js` (new validation).
**M-27A Validation:** All checks passed (36/36 checks, 5 JS/content validators,
git diff check).
**M-27A HTTP Verification:** Homepage, UAE country, Middle East region, all
data files, JS and CSS returned HTTP 200.
**M-27A Security:** No API keys, secrets, external AI, telemetry or backend
added.
**M-27A Browser QA:** `NOT VERIFIED — BROWSER TOOLING UNAVAILABLE`.
**M-27A Achieved:** ✓ Connected reader journeys, ✓ Dashboard metadata/narratives,
✓ Announcements/intelligence links, ✓ ASK GPIR fully integrated, ✓ Search
includes all registry content, ✓ All assets consumed, ✓ No new content created.
**M-27A Deferred:** Additional regional coverage, source/evidence full feature
set, historical editions, browser QA, custom domain.

**M-27A.1 Status:** IMPLEMENTATION COMPLETE — PENDING/LIVE VERIFIED.
**M-27A.1 Starting SHA:** `2eb7ffa6ccbac76b02e650af4ed9ff03b5b206c9`.
**M-27A.1 Objective:** Preserve Global -> Region -> Country while making the
Dashboard Gallery consume existing registry relationships as a view layer.
**M-27A.1 Implementation:** Existing dashboard identities resolve through
Dashboard -> Country -> Region using existing metadata, narratives, image
assets and routes. No new research content was introduced.
**M-27A.1 Validation:** Both runtime scripts, link validation, content
validation, registry relationship checks and `git diff --check` passed.
**M-27A.1 Live HTTP:** VERIFIED — homepage, UAE country page, Middle East
region page, dashboard metadata, narratives, gallery script, main script and
CSS all returned HTTP 200; deployed resource bytes match the release files.
**M-27A.1 Achieved:** Navigation alignment, registry-driven gallery and
asset/route preservation.
**M-27A.1 Partial:** Browser QA remains NOT VERIFIED because browser tooling is
unavailable.
**M-27A.1 Deferred:** Custom domain; M-18; M-19; new research and future
coverage.
**M-27A.1 Not yet added / to do:** No new content was added; browser QA is the
remaining release verification task.
**M-27A.1 Next milestone:** Future governed reader validation or coverage
expansion under separate authorization.

**M-27A.2 Status:** IMPLEMENTATION COMPLETE — PENDING/LIVE VERIFIED.
**M-27A.2 Starting SHA:** `dc43cb95e36ce80fe6ba8ca869135a7135ab3d8a`.
**M-27A.2 Objective:** Separate country editorial status from dashboard
publication status and correct connected dashboard reader links.
**M-27A.2 Issue 1:** Country `.draft-notice` markup is outside five
`.dashboard-reader` boundaries; dashboard status comes from existing
`dashboard-metadata.json`.
**M-27A.2 Issue 2:** Connected links now resolve registry dashboard relationships
through metadata `imagePath` values to existing publication assets instead of
homepage hash fallbacks.
**M-27A.2 Validation:** Runtime syntax checks, link validation, content
validation, M-27A validation (36/36), targeted five-dashboard assertions and
`git diff --check` passed.
**M-27A.2 Live HTTP:** VERIFIED — GitHub Pages deployment SHA matched the
release. Homepage, UAE, KSA, Qatar, India and Singapore country pages,
dashboard metadata, narratives, gallery runtime, main runtime and CSS all
returned HTTP 200; deployed bytes matched the committed release files.
All five connected dashboard links resolve to existing publication assets;
Qatar no longer resolves to Home.
**M-27A.2 Achieved:** Status separation and canonical dashboard asset links.
**M-27A.2 Partial:** Browser QA remains NOT VERIFIED because browser tooling is
unavailable.
**M-27A.2 Deferred:** Custom domain; M-18; M-19; future coverage expansion.
**M-27A.2 Not yet added / to do:** No new research/content/assets; browser QA
remains outstanding.
**M-27A.2 Next milestone:** Future governed reader validation or coverage
expansion under separate authorization.

**M-27A.3 Status:** IMPLEMENTATION COMPLETE — PENDING/LIVE VERIFIED.
**M-27A.3 Starting SHA:** `a0f897a25fc4450fad139403a38a2d8cb9de9b54`.
**M-27A.3 Objective:** Close the Search GPIR overlay before normal result
navigation while preserving the existing routing path.
**M-27A.3 Root cause:** Normal search results did not invoke the existing
`close()` reset path; only announcement detail results did.
**M-27A.3 Correction:** `activateResult()` now invokes `close()` for normal
results before returning `false`, so native mouse navigation and keyboard Enter
navigation continue unchanged.
**M-27A.3 Files:** `assets/js/script.js` only.
**M-27A.3 Validation:** Runtime syntax, content, link, M-27A (36/36), targeted
search source assertions and `git diff --check` passed.
**M-27A.3 Live HTTP:** VERIFIED — GitHub Pages deployed SHA matched
origin/main. Homepage, UAE country page, Qatar country page,
`content-search.js` and `script.js` returned HTTP 200. The deployed script
contains the corrected normal-result `close()` path and preserves keyboard
navigation.
**M-27A.3 Achieved:** Overlay close/reset before result navigation.
**M-27A.3 Partial:** Browser QA remains NOT VERIFIED because browser tooling is
unavailable.
**M-27A.3 Deferred:** Custom domain; M-18; M-19; broader reader work.
**M-27A.3 Not yet added / to do:** No additional UX, design, content, ranking or
architecture changes; browser QA remains outstanding.
**M-27A.3 Next milestone:** Future governed reader validation under separate
authorization.

**M-27A.4 Status:** ACHIEVED — stale India country-page scaffold warning
removed; dashboard publication architecture unchanged.
**M-27A.4 Starting SHA:** `35cc9e7076820ecc87cd6aeb37790ea629ba872d`.
**M-27A.4 Objective:** Remove stale generic draft markup from the active India
country page while preserving canonical Search/Markets routing and dashboard
publication status separation.
**M-27A.4 Correction:** Removed only the stale `.draft-notice` block from
`pages/countries/india.html`; dashboard reader, disclaimer, research, sources,
statistics, image, reference ID, metadata and narrative remain unchanged.
**M-27A.4 Validation:** Standard validators, M-27A validation (36/36), route
consistency, status, dashboard-preservation and warning-retention assertions
passed.
**M-27A.4 Browser QA:** NOT VERIFIED because browser tooling is unavailable.
**M-27A.4 Live HTTP:** VERIFIED — GitHub Pages deployment succeeded. India
page, homepage, dashboard metadata and content-search runtime returned HTTP
200; India has no generic draft notice and its dashboard/disclaimer remain
present.
**M-27A.4 Deferred:** Custom domain; M-18; M-19; future reader work.
**M-27A.4 Next milestone:** Future governed reader validation under separate
authorization.

**M-27A.5 Status:** IMPLEMENTATION COMPLETE — PENDING/LIVE VERIFIED.
**M-27A.5 Starting SHA:** `a711e9a3cc1cc1bb35263e6445aa739a5b422924`.
**M-27A.5 Objective:** Remove the stale generic country scaffold warning from
all five existing published country readers without changing dashboard status,
research, disclaimers, sources, routes or content.
**M-27A.5 Root cause/correction:** The shared static `.draft-notice` remained
on UAE, Saudi Arabia, Qatar and Singapore after India was corrected. The four
remaining blocks were removed; India was already clear.
**M-27A.5 Permanent rule:** Country editorial status != Dashboard publication
status. Published country readers with active associated dashboard/research
publications do not display the generic scaffold warning. Future genuinely
draft pages require explicit content/status-model designation.
**M-27A.5 Validation:** Standard validators, M-27A validation (36/36), five-
country route/status/dashboard-preservation assertions and `git diff --check`
passed.
**M-27A.5 Live HTTP:** Pending push verification for all five country pages,
homepage, search runtime and dashboard metadata.
**M-27A.5 Final release SHA:** `ca4513b9dab7bdfd0d2e52827a15b4b442839090`.
**M-27A.5 Live HTTP:** VERIFIED — all five country pages, homepage, dashboard
metadata, dashboard narratives, main runtime and content-search runtime
returned HTTP 200. All five live pages have no generic draft warning, retain
their dashboard readers and preserve canonical Search/Markets routes.
**M-27A.5 Achieved:** Pending live verification; dashboard publication
architecture unchanged.
**M-27A.5 Partial:** Browser QA remains NOT VERIFIED because browser tooling is
unavailable.
**M-27A.5 Deferred:** Custom domain; M-18; M-19; future reader work.
**M-27A.5 Next milestone:** Future governed reader validation under separate
authorization.

## COMPLETED

- Static HTML/CSS/vanilla JavaScript GitHub Pages architecture.
- Performance tier, lazy loading, responsive images and reduced-motion support.
- Shared navigation, ticker, search, i18n, dashboard/lightbox and page templates.
- Structured JSON content and trusted-source verification model.
- Content schema and architecture guardrail documentation.
- Dev-time content contract validation for current records and relationships.
- Permanent project log, backlog, status snapshot and development governance documents.
- Canonical reference-based content registry with typed pilot records for
  countries, regions, source, announcement and intelligence; the pilot now
  indexes all five active country records with existing pages.
- Build-time GPIR content-factory contract defining shared content types,
  evidence classifications, provenance fields, readiness states,
  reconciliation states and future dashboard metadata.
- First source-backed registry batch indexed for SAMA licensing, RBI Payments
  Vision 2028 and MAS/ABS PayNow Generation 2; existing announcement records
  and generated intelligence routes remain the substantive content source.
- Deterministic ASK GPIR reader tool added as a progressive enhancement to the
  existing search dialog; it retrieves indexed content, active country coverage
  and current-page headings without claiming generative AI.
- Context-aware ASK GPIR extension added using current route matching, validated
  registry relationships, existing source metadata and topic exploration.
- Registry validation for IDs, types, slugs, source references, relationships
  and page targets.
- Least-privilege GitHub Actions security/integrity workflow.
- Repository-native internal HTML-link validation and security disclosure
  guidance.
- Accurate current-state privacy and cookie disclosures for the static site.

## IN PROGRESS

- None recorded.

## ACTIONABLE NEXT

- Expand structured content registry coverage using verified evidence.
- Use `assets/data/content-model.json` as the shared contract for the first
  structured content batches; no placeholder record is publishable without
  evidence and review state.
- Extend the canonical registry with the remaining existing classified
  announcements only when source identities and generated routes resolve.
- Extend the page generator to consume registry records only after a second
  pilot proves parity with existing country/intelligence pages.
- Improve repository search only after measured need and within current
  performance thresholds.
- Extend reader-facing relationship and evidence discovery using existing
  templates and data.
- Expand ASK GPIR intents only from existing structured records and preserve
  the no-external-AI/no-query-storage boundary.
- Add browser-enabled QA before claiming interactive, responsive or accessibility
  completion for M-25A.
- Preserve M-18 and M-19 as separate open workstreams.
- Defer M-25C dashboard intelligence until structured dashboard metadata exists.
- Add low-cost governance/monitoring checks that reflect documented contracts.
- Reconcile all known pending work before starting another implementation prompt.
- Reconcile external pending work before authorizing the next implementation.
- Preserve the Phase 2 workflow and review remaining SEC items before any later
  security or privacy work.
- Review jurisdiction-specific privacy wording separately before introducing
  any new data collection or consent mechanism.
- Reconcile external pending work before authorizing the next implementation.
- Public live portfolio completeness audit: confirm existing GPIR country,
  intelligence, regulatory and research content is accessible, navigable and
  discoverable, independent of dashboard coverage. **PARTIAL:** `uk.html` is
  now registry-connected; `australia.html`/`japan.html`/`united-kingdom.html`
  remain 0-byte placeholders with no content to expose.
- **DONE:** Dashboard publication-to-country relationship — added a
  `DASHBOARD` content type and 5 records deterministically connected via
  existing `pagePath`/`page` matches, recognising each dashboard as an already
  validated publication.
- Resolve M-25D dashboard-to-existing-intelligence relationship only where
  explicitly evidenced (not yet done; `search-index.json` reference IDs still
  differ from `dashboard-*` IDs).
- Reconcile M-25D dashboard identity (dashboard-metadata IDs vs. search-index
  reference IDs) — not yet done.
- **RESOLVED (no action needed):** M-25D image asset-path finding — on direct
  inspection, `imagePath` values already resolve correctly to files in
  `assets/dashboards/`; the prior diagnostic used an incomplete asset search.
- **DONE:** Reconciled M-25D dashboard metadata/content-model schema mismatch
  — `content-model.json` `dashboardMetadataFields` now matches the actual
  `dashboard-metadata.json` keys.
- Decide on the empty `pages/dashboards/*.html` route architecture — not yet
  decided; still 0-byte placeholders with no inbound links.
- **DONE:** Dashboard search integration — the 5 existing dashboard records
  are now merged into the existing client-side search index using only their
  existing structured fields.
- Design a CURRENT / HISTORICAL content model applicable to dashboards, country
  intelligence, regulatory information, AML/CFT information, payment
  developments, research publications, announcements and forecasts; no valid
  historical content is deleted when superseded. **PARTIAL:** the field/status
  contract is documented in `content-model.json`; no record has been migrated.
- Integrate and activate existing reader utilities (Search, ASK GPIR, Explain,
  Explore, related content, Source/Evidence, country/dashboard/historical/
  intelligence navigation) before building new frameworks or infrastructure.
  **PARTIAL:** ASK GPIR now links a country page to its existing dashboard via
  the registry relationship; broader utility integration remains open.
- Add browser validation for dashboard and reader work if available — not
  available in this environment.
- Preserve M-18 and M-19 as separate open workstreams (unaffected by M-25D).
- Do not create dashboards or research content for countries that do not yet
  have them; existing GPIR content for those countries remains publicly
  accessible without waiting for dashboard coverage.
- Add a Europe/SEPA `REGION` registry record so `country:united-kingdom` can
  carry an explicit REGION relationship (deferred to keep this change minimal).

See [GPIR_BACKLOG.md](GPIR_BACKLOG.md) for IDs, dependencies and acceptance criteria.


## PARKED

- Expanded source registry, pending manual domain verification.
- Controlled source ingestion, pending a reviewed workflow outside runtime.
- Change detection, AI classification/extraction and the GPIR intelligence
  engine, pending governed inputs and evaluation.
- Country and corridor engines, pending schema and evidence scale-up.
- Production automation, pending the preceding workflow dependencies.

## BLOCKED

- Public API/backend knowledge store, pending explicit architecture approval,
  operational ownership and measured need.
- Production observability, pending an approved free monitoring and privacy
  model.

## DEVELOPMENT PRIORITY

- **P0:** Protect the existing build and resolve backlog conflicts.
- **P1:** Complete M-10 registry work after reconciliation.
- **P2:** Execute approved Stage 1 registry/governance increments.
- **P3:** Improve reader experience based on measured needs.
- **P4:** Develop governed intelligence automation.
- **P5:** Address future and experimental scale requirements.

## NEXT DEVELOPMENT GATE

**Reconcile all known pending work before starting the next implementation
prompt.** P1 AUDIT-001 and AUDIT-002 are closed by Prompt 13.

Prompt 12 adds a live-site condition to that gate: review the two P1 audit
findings before authorizing the next implementation prompt.

## KNOWN ISSUES

- The performance audit reports one missing image dimension warning and two
  byte-identical duplicate-logo warnings; these predate Prompt 09 and are
  advisory.
- Earlier prompt-level history is not available in the repository record.
- The repository has no backend, database, API, live ingestion, AI pipeline or
  production observability service.
- Prompt 10 registry, validator and governance files are committed in
  `7813132e2fd21a746932778b8c8459bb62dafaab`.
- Prompt 11 governance updates are committed in
  `fe32af6b0b58d96559ac8a6c33b0e77354a3a911`.
- P5: `pages/regions/sepa.html` is not a repository route and returns 404; the
  current canonical route is `pages/regions/europe.html`.
- SEC-001 remains blocked by GitHub Pages response-header limitations; no CSP,
  X-Frame-Options, Permissions-Policy, Referrer-Policy or X-Content-Type-
  Options response headers are currently deployed.
- Google Fonts and the public FX API remain documented third-party risks.
- Local browser rendering automation was unavailable for Prompt 18; responsive
  behavior was checked against the scoped CSS contract and existing responsive
  rules, not screenshots.
- The legal documents contain future-oriented sections for capabilities not
  currently deployed; the current-state disclosures now distinguish those
  possibilities from actual GPIR behavior.

## ARCHITECTURE STATUS

**PROTECTED**

The existing static architecture, URLs, content governance, performance tier,
reduced-motion support, search, ticker, i18n, dashboards and page templates
remain protected under [ARCHITECTURE_GUARDRAIL.md](ARCHITECTURE_GUARDRAIL.md).

## PRODUCTION CHANGE STATUS

- No HTML, CSS, runtime JavaScript, URL or generated production page was
  modified by Prompt 10. The new registry is build-time data only.
- `assets/data/content-registry.json` and the existing validator were extended
  for the pilot.
- Four governance Markdown files were created under `docs/`.
- The existing Word document was deliberately not modified; it is a privacy
  policy, not a project log. The repository-native Markdown record is the
  authoritative new project memory.
- Prompt 12 was audit-only; Prompt 13 changed only the authorized generator,
  affected generated pages, legacy research links and governance records.
- M-12 was verified as the Prompt 12 audit result, but no separate M-12
  milestone was formally declared in the project record.
- Prompt 13 remediation and governance updates are committed in
  `fea8228b4d52363a92dcd61ea48224f2f74a0a01`.
- Phase 2 security controls are committed in
  `b326c4501008e857e1efd48db6f59a8a10e31aa6`; no application, content, asset
  or runtime page files were changed.
- Prompt 17 changed only the existing Privacy Policy and Cookie Policy; no
  application data collection, tracker, consent platform, account, form or
  backend was added.
- Prompt 17 privacy baseline is committed in
  `391501d70790b963a58eb36a5b2f170632020231`.
- Prompt 18 changed only `index.html` and `assets/css/page.css` for the ticker;
  governance metadata is committed in
  `71e35efdc12df0decdcf61bf144863f643ec8ac1`.

**LAST UPDATED:** 2026-08-28

## M-27B.2 — World Map Interaction & Performance Repair

- **Date:** `2026-09-06`.
- **Status:** **IMPLEMENTED, PUSHED, LIVE HTTP VERIFIED; BROWSER RUNTIME PENDING.**
- **Objective:** Make the existing World Map a responsive, deliberate navigation
  layer without changing its visual concept, country content, dashboards or
  canonical route architecture.
- **Implementation:** Initial land-dot generation now yields across animation
  frames in small batches; corridor, marker and legend composition waits for
  the scheduled land/data work. Existing dots, arcs, markers, tooltips and
  animation remain present.
- **Interaction:** Active India, UAE, Saudi Arabia, Qatar and Singapore
  markers retain their existing country-page URLs. Region legend entries are
  now keyboard-accessible anchors to the existing Middle East, APAC, Europe,
  LATAM, Americas and Africa directory pages.
- **Hit areas:** Invisible marker padding was reduced from `inset:-10px` to
  `inset:-7px`, preserving visible marker size and geographic positions while
  removing the diagnosed target overlap.
- **Caption:** The map caption now accurately says `Tap a market to explore
  country intelligence`; active markers still navigate to the country reader,
  which exposes the connected dashboard where published.
- **Australia:** Preserved as `coming_soon` with no dashboard, registry record
  or invented route. Its existing zero-byte country file remains a separate
  deferred data/content gap.
- **Files changed:** `assets/js/world-map.js`, `assets/css/global.css` and
  `index.html`. Governance records were updated separately after release.
- **Validation:** JavaScript syntax, content validation, internal link
  validation, M-27A validation (36/36), map interaction contract, performance
  audit review and `git diff --check` passed. The performance audit reported
  three pre-existing advisory warnings unrelated to this change.
- **Release commit:** `30260a7` (`M-27B.2 World Map interaction and performance repair`).
- **Push:** `origin/main` updated successfully.
- **Live verification:** Homepage, India and UAE country pages, APAC and Middle
  East region pages, map JavaScript and map data returned HTTP 200. Deployed
  script bytes contain the scheduled build and region-link implementation; the
  deployed homepage contains the corrected caption.
- **Browser QA:** `BROWSER EXECUTION UNAVAILABLE`. Hover, click/tap latency,
  keyboard activation and visual regression remain pending runtime validation.
- **Achieved:** Authorized source implementation, repository validation, push,
  and live HTTP/resource verification.
- **Partial:** Full success criteria remain pending browser-level interaction
  evidence.
- **Deferred:** Australia publication, browser automation, and any redesign or
  new content remain deferred.
- **Not added:** No new routes, dashboards, registry records, research,
  backend, framework, API or database was added.
- **Next goal:** Perform browser acceptance and live interaction verification
  when browser tooling is available.

## M-27B.3 — Final Human Live Acceptance Record

- **Date:** `2026-09-06`.
- **Public URL tested:** `https://krishnan-vishal.github.io/`.
- **Acceptance source:** Repository owner human testing in the actual public
  browser after deployment. This is not automated Codespace browser execution.
- **Automated browser execution:** `UNAVAILABLE`.
- **Human public-browser acceptance:** **COMPLETED — PASS**.
- **Country markers:** India, UAE, Saudi Arabia, Qatar and Singapore all
  worked in the live browser.
- **Region legend:** Middle East, Asia Pacific, Europe, LATAM, Americas and
  Africa all worked in the live browser.
- **Performance:** Initial map lag was gone; marker selection lag was gone; and
  the India/UAE/Qatar selection conflict was gone.
- **M-27B.2 final status:** **ACHIEVED** through the evidence chain
  `diagnostic -> implementation -> repository validation -> deployment -> live
  HTTP/resource verification -> human public-browser acceptance -> PASS`.
- **Production commit:** `30260a7`.
- **Prior governance commit:** `d42df24`.
- **Achievement:** The World Map now functions as a responsive reader-
  navigation layer: marker -> Country Intelligence -> existing dashboard where
  published; region legend -> existing canonical Region page.
- **Preserved:** Dashboard content, country intelligence and historical/current
  architecture remain unchanged. Australia remains coming soon. No fabricated
  dashboard or country content and no new routing architecture were added.
- **Deferred/open:** M-18 Global Announcements Ticker Integrity remains OPEN;
  M-19 Cross-Stream Reconciliation remains OPEN; custom domain/DNS, visitor
  measurement and subscription/digest infrastructure remain deferred.
- **Next goal:** Select the next reader-experience objective from the existing
  GPIR backlog after review and authorization. No next objective is implemented
  by this record.

## M-18 — Global Announcements Ticker Integrity

- **Date:** `2026-09-06`.
- **Objective:** Remove the deterministic blank interval in the public Global
  Announcements ticker without changing announcement data or card semantics.
- **Defect confirmed:** The renderer produced one announcement sequence while
  the marquee animation swept through the full single-sequence track before
  restarting, leaving a blank interval.
- **Implementation:** `renderTicker()` now stores the existing ordered card
  sequence once and assigns `sequenceHTML + sequenceHTML` to the same track.
  The scoped `#market-ribbon` animation now runs from `translateX(0)` to
  `translateX(-50%)`, making the second sequence a seamless continuation.
- **Files changed:** `assets/js/announcements.js` and
  `assets/css/page.css` only. No announcement JSON, registry, source,
  homepage, World Map, country, region or dashboard file changed.
- **Data preservation:** 10 announcement records, IDs, content, ordering and
  source references are unchanged.
- **Validation:** `node --check assets/js/announcements.js`,
  `node --check assets/js/script.js`, content validation, link validation,
  targeted M-18 contract checks, data baseline comparison, performance audit
  review and `git diff --check` passed. The performance audit reported three
  pre-existing advisory warnings unrelated to M-18.
- **Production commit:** `8c1ba3c` (`M-18 Fix global announcements ticker
  continuity`), pushed to `origin/main`.
- **Live HTTP/resource verification:** Homepage, ticker JavaScript, ticker CSS
  and announcement data returned HTTP 200. Deployed bytes contain the doubled
  renderer, 0-to-−50% animation endpoints and 10 records.
- **Automated browser execution:** `UNAVAILABLE`.
- **Human live acceptance:** Not supplied for M-18; continuous visual ticker
  behavior remains pending browser verification.
- **Status:** **IMPLEMENTED / LIVE ACCEPTANCE PENDING**. M-18 is not closed
  solely by static validation or HTTP checks.
- **Deferred/open:** M-19 Cross-Stream Reconciliation remains OPEN; custom
  domain/DNS, visitor measurement and subscription/digest infrastructure remain
  deferred. No new content or routing architecture was added.
- **Next goal:** Obtain human or automated browser confirmation that the ticker
  transitions directly between duplicated sequences with no blank interval.

## M-18 Phase 1 — Global Announcements Intelligence

- **Date:** `2026-09-06`.
- **Status:** **IMPLEMENTED / LIVE BROWSER ACCEPTANCE PENDING.**
- **Diagnostic findings:** 10 announcement records exist; 9 are
  `GPIR_CLASSIFIED`; 1 remains `SOURCE_VERIFICATION_REQUIRED`; 9 classified
  records have intelligence pages; only 4 announcement/intelligence pairs were
  previously represented in the registry; the static search index had no
  announcement entries; ASK GPIR had no announcement resolver; and no scheduled
  ingestion mechanism exists.
- **Implementation:** Applied explicit lifecycle/publication metadata without
  inventing dates or supersession; reconciled 9 published records into the
  canonical registry; extended existing search and ASK GPIR retrieval; added a
  generated current/historical archive; exposed the archive from the homepage;
  and added a report-only refresh foundation.
- **Phase status:** M-18.1 ticker continuity remains `IMPLEMENTED / LIVE
  ACCEPTANCE PENDING` from `8c1ba3c`; M-18.2 data/lifecycle is implemented and
  validated; M-18.3 archive is implemented with 9 current and 0 historical
  publications; M-18.4 search/ASK GPIR is implemented and statically validated;
  M-18.5 refresh is `FOUNDATION ONLY / NOT SCHEDULED`.
- **Preservation:** Existing announcement content, ordering, source URLs,
  summaries, Why It Matters text, intelligence pages, World Map, dashboards,
  country/region content and M-19 were preserved. The unresolved Qatar record
  remains outside publication until source/date verification is complete.
- **Files changed:** Announcement data/model/registry, announcement and search
  runtime consumers, ASK GPIR runtime, homepage archive link, intelligence page
  generator/output, sitemap, targeted validators, and report-only refresh
  tooling. No DNS, CNAME, dashboard, World Map or M-19 file changed.
- **Validation:** Edited JavaScript syntax, targeted announcement validator,
  content validator, link validator, M-27A validator and `git diff --check`
  passed. Performance audit passed with three pre-existing advisory warnings.
- **Production commit:** `52c3ce6` (`M-18 Phase 1 Global Announcements
  intelligence layer`), pushed to `origin/main`.
- **Live HTTP verification:** Homepage, archive, representative intelligence
  page, announcement data, registry, content-search.js and script.js returned
  HTTP 200. Deployed bytes contain the archive, lifecycle data, announcement
  search entries and ASK GPIR resolver.
- **Automated browser execution:** `UNAVAILABLE`.
- **Human browser acceptance:** Not supplied for this phase. Visual archive,
  search and ASK GPIR interaction remain pending browser verification.
- **Overall M-18:** Not achieved. Phase 1 is implemented with live resource
  verification, but M-18 remains open until browser acceptance and a future
  verified refresh architecture are addressed.
- **Next goal:** Perform browser acceptance, then separately authorize any
  scheduled ingestion work; do not claim real-time or 8-hour refresh.

## M-22 — Country Intelligence Scale Foundation

- **Status:** **IMPLEMENTED / PENDING CI AND PR REVIEW.**
- **Capability:** Canonical country metadata gives existing and future country
  intelligence stable ISO identity, GPIR regional grouping, lifecycle,
  availability and permanent page references.
- **Compatibility:** Six existing country pages remain native and unchanged.
  Future M21 candidates can carry deterministic country/region references;
  no candidate can publish country content without human review.
- **Deferred:** 200-country population, generated country pages, navigation and
  search redesign remain separate controlled work.

## 2026-11-03 — M39/G1 production correction

- Started `codex/m39-g1-production-correction` from baseline merge `26c07d589b148471bee819aa6848e1b8d7ed38a6`. The single Production performance trace reproduced the reported delay: controls were visible at 517 ms but core initialization waited until 23,806 ms because `assets/js/supabase-combined-engine.js` imported `https://jsdelivr.net/`, which timed out after 22,613 ms.
- Removed that obsolete duplicate browser engine and initialized core controls immediately from the end-of-body bundle. External FX, alerts and Supabase data remain asynchronous and retain their existing fallbacks.
- Restored the committed owner-approved M39 taxonomy from `feature/m39-homepage-finalization`: eight headers, 37 intact groups and 157 topics. The existing controller now uses a 180 ms intentional hover delay, cancels pending opens on pointer exit, retains click/keyboard/touch/Escape/outside-click behavior, resets panel scroll on open and keeps viewport containment.
- Reconciled the announcement archive with the existing `gpir-public-intelligence?scope=history` authority, retained the 12-hour LIVE rule and static last-known-good fallback, and tightened the existing high-contrast responsive card layout.
- Confirmed the G1 scheduler was active but the publisher returned HTTP 503 because it built one audit URL containing the full 729-row queue. The repository now pages candidates and 50-ID audit lookups, retains atomic publication contracts and holds below-threshold candidates for governed review without unnecessary external fetches.
- Final focused tests pass 35/35 after moving the existing accordion boundary to 1100px and preserving the generated 12-hour archive contract. Content validation passes and internal links pass across 155 HTML files. Local browser acceptance now confirms desktop navigation plus 1024px and 390px containment, and a compact, readable archive with no horizontal overflow at all three widths.
- Implementation commit `d7a00aafcb685245bf5c3065769a835a65dbe29f` is pushed on `codex/m39-g1-production-correction`; PR #486 is open. Its initial `G1 R07 targeted tests` and `GPIR Security and Integrity` runs passed. A follow-up responsive/archive visual correction is being checkpointed on the same PR; current-head CI, merge, Production deployments, governed backfill execution and final live after-evidence remain pending.
