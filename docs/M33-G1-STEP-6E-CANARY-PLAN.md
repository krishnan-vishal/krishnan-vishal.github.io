# M33-G1 Step 6E Controlled Three-Source Canary Plan

## Step 6E-G10 — final PYMNTS source-registry onboarding artifact

Owner-supplied first-party evidence resolves the G9 jurisdiction gate:
PYMNTS.com is a subsidiary of What’s Next Media & Analytics and its trademark
materials identify What’s Next Media & Analytics LLC. For source-registry
classification, `country_iso3='USA'` records the owner-verified organizational/
home-jurisdiction classification. `country='Global'` records the scope of
PYMNTS intelligence and content; it does not restrict GPIR acquisition or
coverage to the United States. `region_tags` remains NULL, matching the
evidenced production convention.

`migrations/m33-g1/m33-g1-pymnts-source-registry-onboarding.sql` is the final
owner-executable artifact. It inserts exactly `PYMNTS-GLOBAL-004` using the
verified production `source_registry` columns, RSS acquisition vocabulary `A`,
T3, GREEN, 60-minute polling and `universal-finance`. It is transaction-safe
and uses `ON CONFLICT (source_id) DO NOTHING`; no existing source, including
Fintech Futures, is updated or deleted. Its verification SELECT returns only
the PYMNTS record. It has not been executed, and no deployment/invocation/write
canary is authorized by this artifact.

## Step 6E-G6 — new acquisition-eligible Source-3 preparation

Owner authorization permitted one new source onboarding after G5 found no
eligible existing media/intelligence record. Candidates researched were
Finextra, PYMNTS and The Paypers. Finextra has an official payments RSS feed
(HTTP 200) but three sampled first-party leaf pages returned HTTP 403, so it
is acquisition-ineligible for RAW-first processing. The Paypers public pages
were reachable, but no verified machine-readable first-party publication feed
was established in this preflight; it was not selected.

**Selected Source-3: `PYMNTS-GLOBAL-004` / PYMNTS.** PYMNTS is an established
global financial-services/payments media and intelligence publisher. Its
first-party RSS feed (`https://www.pymnts.com/feed/`) returned HTTP 200, and
three sampled first-party leaves returned HTTP 200 with article-specific titles,
publication dates and content metadata under ordinary requests. No credentials,
CAPTCHA, proxy, challenge bypass or browser automation was required. The
RSS surface is discovery-only; only deduplicated official article leaves can
advance to the existing `universal-finance` extraction/Gate path.

The source is accurately tiered **T3** as a secondary media publisher, rather
than elevated to T1/T2 merely for operational usefulness. It is suitable for
the candidate-only Source-3 canary because it meets both trust and acquisition
eligibility, subject to the normal RAW-first and human-controlled publication
boundaries. `docs/M33-G1-SOURCE-3-ONBOARDING.json` is the auditable owner-only
future production `source_registry` insertion artifact; it does not apply an
insertion or migration.

The controlled runtime allowlist is now SFA, RBI and PYMNTS. Fintech Futures
remains documented as trust-eligible/GREEN and `ACQUISITION_BLOCKED`, but is
runtime blocked and retained rather than deleted. Trust eligibility and
acquisition eligibility are separate controls. PYMNTS is prepared for an owner
dry run only; no deployment, invocation or write canary is authorized.

## Step 6E-G5 — replacement Source-3 selection gate

The repository contains no production `source_registry` snapshot; its isolated
PostgreSQL baseline has only a synthetic test source and cannot establish a
production replacement. The repository’s authoritative source-domain registry
was inspected as the available source-governance evidence. It has active,
machine-readable Tier-1/Tier-2 official regulator and payment-operator sources,
but **no existing GREEN/T2-or-stronger financial-services/payments media or
industry-intelligence source with an approved accessible first-party discovery
endpoint**.

Existing media/intelligence candidates (`fxc-intelligence`, `the-paypers`,
Reuters and Bloomberg) are Tier 3, inactive and explicitly
`SOURCE_UNSUPPORTED`; they cannot be promoted or used without inventing
acquisition evidence. The Tier-2 machine-readable candidates are payment
infrastructure operators, not the requested media/industry-intelligence class.
Selecting one would change the requested source class and is therefore not a
safe replacement.

**Decision: replacement Source-3 is NOT IDENTIFIED; G5 is STOPPED at the
existing-registry eligibility gate.** `FS-GLOBAL-003` remains trust-eligible
(`GREEN`) but acquisition-ineligible (`ACQUISITION_BLOCKED`), with request 24
HTTP 403 and zero writes. Trust eligibility and acquisition eligibility are
separate controls. No new external source, schema migration, registry record,
runtime allowlist change, deployment or production action was made. SFA and
RBI remain the two passed operating sources.

## Step 6E-G4 — Fintech Futures acquisition diagnostic

Request 24 reached the authorized `FS-GLOBAL-003` Edge Function but failed at
the acquisition layer with `INDEX_FETCH_FAILED_HTTP_403` (HTTP 500 response
from the function; index request HTTP 403). Parser execution and leaf
discovery are therefore **NOT PROVEN**; database writes were zero and the
write canary remains blocked.

Read-only first-party diagnostics confirm the configured category URL returns
HTTP 403 for server-side acquisition, including with ordinary browser-compatible
headers. The site’s public `robots.txt` is accessible and advertises
`sitemap.xml`, `googlenews.xml`, `news-archive-index.xml`,
`articles-archive-index.xml`, and `sitemap-index.xml`; each advertised
machine-readable discovery surface also returned HTTP 403 under the same
ordinary request conditions. Generic `/feed/` and `/category/payment/feed/`
returned HTTP 403 as well. No CAPTCHA, challenge, proxy, credential, browser
automation, mirror, or other access-control workaround was attempted.

**Decision: `FINTECH FUTURES ACQUISITION = BLOCKED`.** No legitimate accessible
first-party machine-readable surface was proven, so no registry or runtime
change is appropriate. Contain Source-3 as `ACQUISITION_BLOCKED`; preserve
operational SFA/RBI behavior and all existing RAW/candidate/publication
boundaries. A future owner-supplied, explicitly permitted first-party feed/API
or source authorization is required before re-opening Source-3.

## Step 6E-G1 — RBI canary closure and Fintech Futures dry-run candidate

Owner-supplied request 22/23 and post-canary verification close Source-2
`CB-APAC-010` (Reserve Bank of India) as **PASSED**. Request 22 was an HTTP
200 write-free dry run: four discovered, three selected and three genuine leaf
records with record-specific titles and `RBI_LEAF_RECORD` dates. Request 23
was an HTTP 200 RAW-staging write: four discovered, three selected, three RAW
inserted and zero fetch errors. Individual RAW processing yielded three RBI
candidates (Payments/CANDIDATE/60, Regulation + FinTech/CANDIDATE/70, and
Payments/CANDIDATE/60).

The verified baseline after RBI is RAW=6, candidates=6, rejections=0,
handoffs=0 and `global_announcements`=39. The candidate-to-handoff,
publication, ticker and Cron boundaries remain closed.

Source-3 `FS-GLOBAL-003` (Fintech Futures; GBR/Global; T2; GREEN;
acquisition mode C; `universal-finance`) is prepared for an **owner dry-run
only**. The registry’s official payment-category URL
`https://fintechfutures.com/category/payment/` is discovery-only. The
version-controlled candidate allowlists SFA, RBI and Fintech Futures only,
requires the `universal-finance` profile, and selects deduplicated official
payment/fintech article leaves while rejecting the category page, navigation,
tag/archive, author, pagination, promotional and external links. It does not
hard-code article URLs. No Fintech Futures invocation or write mode is
authorized.

## Step 6E-F14 — RBI leaf content extraction root-cause correction candidate

Request 21 was a technical dry-run PASS (HTTP 200; four links discovered;
three official RBI press-release leaf URLs selected; zero writes and zero fetch
errors) but a **LEAF CONTENT QUALITY HOLD**. It is not a connectivity,
authorization or discovery failure. The generic `Press Releases` title,
UNKNOWN date and Gate-2 UNKNOWN/15 preview arose because the official leaf
HTML uses a generic document title/H1: its record-specific title and date are
the adjacent `tableheader` rows, with the article content in `tablecontent1`.

The version-controlled RBI-only candidate now extracts that official record
header/body structure before using the exact listing/RSS title fallback. It
records the parsed leaf date as `RBI_LEAF_RECORD`; without an authoritative
leaf or listing/RSS date it remains UNKNOWN. Generic RBI shell titles cannot
override a record title, and no retrieval-time date is invented. SFA behavior,
the two-source allowlist, page bound and all RAW-first/publication controls are
unchanged. This candidate is not deployed; no RBI write canary is authorized.

## Status: STOPPED — source-selection and acquisition-path gate

The requested canary cannot be prepared safely from the current repository
evidence. There is no version-controlled `source_registry` snapshot and no
version-controlled `gpir-intelligence-fetch`/canonical acquisition runner to
inspect. Step 6C also established that this workspace has no authenticated
read-only Supabase metadata route.

The trusted-source registry is not a substitute for production
`source_registry`: it identifies `rbi-press-releases` as a verified official
regulatory RSS source, but the association candidate `sfa` is explicitly
`DISCOVERY_ONLY`; no verified existing specialist-source record was evidenced.
Consequently, exactly three GREEN production source records, their acquisition
metadata, and the required canonical path cannot be verified without guessing.

No canary runner, scheduler, source registry record, Supabase row, RAW record,
candidate, handoff, announcement, ticker value or production workflow was
created or changed.

## Required owner evidence before planning resumes

Provide read-only `source_registry` metadata for three candidate records
(including source ID, name, status, trust tier, official/feed URLs, acquisition
method and parser profile), and the approved Edge Function/repository location
for the canonical acquisition path. Then the bounded, RAW-first plan can be
written without inferring production configuration.

## Step 6E-B version-control acquisition boundary

**STOPPED at source-capture gate.** The owner-provided M33-F5 characteristics
identify the deployed `gpir-intelligence-fetch` behavior, but no deployed
`index.ts`, `discoverNewsLinks`, `cardRegex`, parser fixture, or existing Edge
Function directory is present in this repository. A search found no
`SFA-APAC-001` implementation either.

The requested RAW-first/run-lineage reconciliation cannot safely be applied to
an invented parser or guessed deployed schema columns. The deployed Supabase
function remains M33-F5; no GitHub replacement is deployed, and no production
canary has started. The owner must provide the exact deployed function source
(and any parser fixtures) for a byte/behavior-preserving version-control
capture before the minimal write-path change can be reviewed and tested.

## Step 6E-B1 deployed M33-F5 baseline capture

**CAPTURED, not reconciled.** The owner-provided deployed source is now held unchanged at `supabase/functions/gpir-intelligence-fetch/index.ts` (SHA-256 `894503E3758689FC89D24DA265EC08D07373F7534A5FE727542793799A5F2169`). It verifies SFA-only parsing, page limit 3, secret-only authentication, dry-run-by-default, date provenance, PDF deferral and both assessment RPCs; it has no announcement, approval, handoff or Cron operation.

The known M33-F5 gaps remain: gates precede RAW, REJECT evidence is skipped, no ingestion run is created and no `ingestion_run_id` is attached. M33-F5 remains deployed; this GitHub capture is not deployed and no canary has begun.

## Step 6E-B2 RAW-first/run-lineage reconciliation

**STOPPED at run-accounting schema gate.** The required B2 accounting names
(`discovered_count`, `fetched_count`, `raw_inserted_count`, `candidate_count`,
`rejected_count`, `error_count`, `last_error`) conflict with the repository's
verified baseline for `intelligence_ingestion_runs`, which establishes only
`records_discovered`, `records_candidate`, `records_rejected`,
`records_published`, and `error_message` alongside the run identity/status
fields. No verified evidence establishes the requested additional names in the
deployed schema.

The B2 instruction requires stopping rather than guessing in this condition.
No Edge Function code was changed, deployed or invoked; no canary started.
Owner-supplied read-only deployed column metadata is required before a
minimal, schema-accurate reconciliation can proceed.

### Resumed implementation

Owner-supplied metadata resolved the run-column gate. The B2 GitHub candidate
now creates one `RUNNING` SFA-APAC-001 run before any write, writes bounded
evidence RAW-first with `ingestion_run_id`, and calls only
`gpir_process_raw_record` for the returned RAW ID. It maps run accounting to
the verified `records_*`/`error_message` columns and keeps richer counters in
metadata. The B1 baseline remains preserved in history; this candidate is not
deployed, no canary has run, publication remains closed, and RBI/Fintech
Futures remain inactive.

## Step 6E-D2 confidence-score recovery hotfix

Production request 16 captured three SFA RAW records but all processor calls
failed on `numeric(5,4)` overflow for valid Gate-2 scores 60/80. The run and
RAW evidence remain historical; no refetch or evidence deletion is permitted.
The version-controlled hotfix changes only `confidence_score` to
`numeric(5,2)` in a transaction. It does not add a score constraint.

Owner-run sequence: confirm candidates=0, handoffs=0 and announcements=39;
apply `m33-g1-confidence-score-hotfix.sql`; verify precision 5/scale 2 and
the unchanged counts; identify the existing three request-16 RAW IDs; then,
only under separate authorization, call `gpir_process_raw_record(raw_id)` once
per listed ID. Do not refetch, use the batch processor, hand off or publish.

## Step 6E-E — Source-1 SFA production canary closed

**PASSED.** Owner-supplied production evidence records SFA-APAC-001 dry-run
request 15 (HTTP 200, 25 links, 3 selected, zero writes and three CANDIDATE
previews) and write request 16 (three RAW rows). Initial processing failed on
`numeric(5,4)` overflow; the verified `numeric(5,2)` hotfix (`2e24c154`) was
applied, then the three existing RAW IDs from run
`592cdf0e-722b-458c-888a-73d50709c862` were individually recovered with
`gpir_process_raw_record(raw_id)`. No refetch or batch processor was used.

Final evidence: RAW=3, candidates=3, rejections=0, handoffs=0 and
`global_announcements`=39 unchanged. Candidate-to-handoff, publication,
ticker and Cron remain closed.

### Source-2 RBI owner-run procedure — not executed

Source ID: `CB-APAC-010`; source: Reserve Bank of India; parser:
`rbi-rss-profile`. Phase A only: owner invokes the deployed approved runner
with `source_id=CB-APAC-010, dry_run=true`, then verifies HTTP success,
bounded `MAX_PAGE_FETCHES=3`, zero writes and no publication/Cron attempt.
Phase B requires owner review of Phase A: one `dry_run=false` invocation only,
then verify the single run, RAW-first lineage, processor results for only that
run's new RAW IDs, handoffs=0, announcements=39 and ticker eligibility=false.
No batch processor, handoff, publication, Cron or further source activation is
authorized. RBI has not been executed.

## Step 6E-F2 — Source-2 RBI authorization candidate

Production request 17 returned HTTP 400 `SOURCE_NOT_ALLOWED_IN_M33_F4C` with
zero database writes. This was an **expected safety block** from the deployed
Source-1-only lock, not an RBI parser or Supabase failure.

The version-controlled candidate replaces that stale message with the explicit
M33-G1 6E allowlist: `SFA-APAC-001` and `CB-APAC-010` only. RBI remains
registry-driven and must expose parser profile `rbi-rss-profile`; no RBI parser
logic was added. `FS-GLOBAL-003` and all unknown sources remain blocked. This
candidate is not deployed and no RBI invocation has occurred.

## Step 6E-F5 — RBI discovery quality correction candidate

Request 18 was an RBI authorization/connectivity/technical dry-run PASS (HTTP
200, 4 links, 3 selected, zero writes) but a **DISCOVERY QUALITY HOLD**: generic
homepage PDFs dominated selection. The version-controlled `rbi-rss-profile`
candidate now parses official RBI RSS/listing items, admits only `rbi.org.in`
or `rbidocs.rbi.org.in` regulatory/payment-relevant links, deduplicates them,
and excludes generic/promotional and external links. Relevant regulatory PDFs
remain eligible. SFA behavior and all canary/publication controls are
unchanged. It is not deployed; no further RBI invocation occurred.

## Step 6E-F8 — RBI leaf-record discovery correction candidate

Request 19 was a technical/official-index discovery PASS with zero writes, but
**leaf-record discovery HOLD**: the RBI root and listing pages were promoted as
records. The candidate now treats root, notification/master-circular listing
and other identifier-free navigation URLs as discovery-only. It accepts only
official RBI leaf/detail identifiers and relevant regulatory PDFs, normalizes
and deduplicates links, and carries RSS publication dates where supplied.
This is not deployed; RBI write canary remains unauthorized.

## Step 6E-F11 — RBI leaf metadata extraction candidate

Request 20 confirmed leaf discovery PASS but metadata-quality HOLD: the three
official press-release leaf URLs returned generic shell titles and unknown
dates, with zero writes. The candidate keeps leaf discovery unchanged, prefers
an RBI leaf heading over generic page-shell titles, uses the exact RSS/listing
title as fallback, and records only authoritative leaf or listing/RSS dates.
Equivalent `www.rbi.org.in` and `rbi.org.in` URLs normalize for deduplication.
No date is inferred, fabricated or taken from retrieval time. It is not
deployed and RBI write mode remains unauthorized.
