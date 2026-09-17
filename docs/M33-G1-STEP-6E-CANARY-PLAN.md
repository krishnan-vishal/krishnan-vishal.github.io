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
