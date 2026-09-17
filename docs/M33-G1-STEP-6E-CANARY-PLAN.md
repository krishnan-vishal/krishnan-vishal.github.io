# M33-G1 Step 6E Controlled Three-Source Canary Plan

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
