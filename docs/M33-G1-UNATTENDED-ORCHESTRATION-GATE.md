# M33-G1 unattended orchestration gate

## Status

**PLANNED ONLY — NOT ACTIVATED.** This document does not create a scheduler,
deploy an Edge Function, invoke a source, move a secret, modify RLS, or change
production data. It is the controlled next gate after the completed Step 6E
three-source production canary.

## Established boundary

The single acquisition runtime remains
`supabase/functions/gpir-intelligence-fetch/index.ts`. Its proven path is
source registry → acquisition → ingestion run → RAW → one-record processor →
candidate/rejection. It remains RAW-first, bounded to `MAX_PAGE_FETCHES = 3`,
deduplicated, and has no handoff, publication, announcement, ticker or Cron
operation.

The controlled source set is exactly:

| Source | Class | Poll | Runtime state |
| --- | --- | --- | --- |
| `SFA-APAC-001` | Fintech Association | 60 minutes | eligible |
| `CB-APAC-010` | Central Bank / Regulator | 60 minutes | eligible |
| `PYMNTS-GLOBAL-004` | Financial Services / Payments Media | 60 minutes | eligible |
| `FS-GLOBAL-003` | Financial Services Media | n/a | GREEN/trusted, `ACQUISITION_BLOCKED`, excluded |

Eligibility is evaluated from `source_registry` at dispatch time: a source must
be GREEN, acquisition-eligible and in the version-controlled runtime allowlist.
Trust eligibility and acquisition eligibility remain independent controls.

## Scheduler analysis and recommendation

Repository evidence shows GitHub Actions schedules for the separate continuous
intelligence/publication and ticker paths. Those workflows are protected M30/
Last-Known-Good surfaces and must not be repurposed into a competing M33
scheduler. The Edge Function itself explicitly has no Cron creation, and the
repository contains no evidence that `pg_cron` is enabled or that any M33
Supabase job exists.

**Recommended future scheduler: Supabase-native scheduled HTTP invocation of
the existing `gpir-intelligence-fetch` Edge Function**, after owner-authorized
cloud preflight proves the supported scheduler, securely held invocation
credential, RLS/policy compatibility and deactivation method. Supabase is the
cloud runtime/data layer; this avoids making GitHub Actions or a local machine
a production dependency and does not introduce another ingestion engine.

Proposed stabilization cadence, subject to the source-registry `poll_minutes`
value at activation time:

| UTC minute | Source | Cadence |
| --- | --- | --- |
| 05 | SFA | hourly / 60 minutes |
| 25 | RBI | hourly / 60 minutes |
| 45 | PYMNTS | hourly / 60 minutes |

The 20-minute staggering limits concurrent load. A later registry poll value
change must be reflected by a separately reviewed schedule change; no scheduler
may silently ignore `poll_minutes`.

## Required controls before activation

1. **Scheduler preflight:** owner performs read-only confirmation of the
   enabled Supabase scheduler capability, job identity, secure invocation
   mechanism, RLS/policies and safe-disable command. No secret is copied to
   GitHub, a workstation or a new service.
2. **Per-source overlap protection:** add a production-proven, atomic,
   nonblocking per-source lock/active-run gate in the existing Edge Function
   path before its run row is created. A second invocation for the same source
   must report `SKIPPED_OVERLAP` and make no RAW write. The exact database
   primitive requires the cloud preflight; a read-then-insert check alone is not
   adequate because it races.
3. **Failure isolation:** each scheduled source invocation is independent.
   A failed SFA/RBI/PYMNTS invocation records `FAILED` or `PARTIAL` in its own
   `intelligence_ingestion_runs` row and does not prevent the other two source
   slots from running.
4. **Observability:** retain the current run row/status/counts/error message
   and source/run metadata. Activation must provide an owner-visible query or
   dashboard for last run, status, RAW count, candidate/rejection count and
   error per source. No public-announcement query is part of orchestration.
5. **Retry:** no immediate automatic retry during stabilization. The next
   source-specific cadence is the retry boundary after an owner reviews failure
   evidence. This prevents duplicate pressure while deduplication remains the
   secondary guard.
6. **Safe disable/rollback:** disable the three scheduler jobs first; then
   verify no RUNNING source lock/job remains. The Edge Function remains
   deployable but uninvoked. Re-enable only after owner approval. Do not delete
   RAW, candidates, runs or the source records during deactivation.

## Non-negotiable publication boundary

Scheduled runs may only execute the already-proven acquisition/RAW processor
path. Canonical handoff remains closed; `global_announcements` remains
untouched; ticker state remains unchanged; no Cron job publishes, approves, or
processes existing candidates. Gate1/Gate2 thresholds and REVIEW semantics are
out of scope.

## Activation decision gates

1. Owner applies and verifies the PYMNTS source-registry onboarding artifact.
2. Owner deploys the already reviewed Edge Function separately.
3. Owner confirms a post-deployment manual dry-run is write-free for every
   eligible source.
4. Owner approves the scheduler/overlap-protection implementation after the
   required cloud preflight and isolated regression proof.
5. Owner activates one source schedule at a time; after each activation,
   inspect run lineage and unchanged handoff/publication/announcement counts.

Any failed gate stops further activation. The schedule must not be activated by
this planning milestone.
