# M33-G1 Step 7A — orchestration safety preparation

## Status

**PREPARED, NOT DEPLOYED OR ACTIVATED.** Step 6E is closed and passed for the
three controlled sources. Owner-verified production remains RAW=9,
candidates=9, rejections=0, handoffs=0 and announcements=39. This milestone
does not connect to Supabase, execute SQL, deploy the Edge Function, invoke a
source, activate a schedule, or change production data.

## Atomic per-source overlap protection

`m33-g1-source-run-claim.sql` adds one finite lease per `source_id` in
`public.intelligence_source_run_claims` and two narrowly scoped RPCs. The
existing Edge Function claims a source before it creates a run or fetches an
external page. A second write-mode invocation for that same source returns the
controlled `SKIPPED_OVERLAP` / `SOURCE_RUN_ALREADY_ACTIVE` outcome: no fetch,
RAW, processor, candidate, handoff or publication work occurs. Different
source IDs have independent leases.

The claim mutation is serialized by a transaction-scoped PostgreSQL advisory
lock plus a row lock. A session advisory lock alone is unsuitable here: the
Edge Function's PostgREST/RPC calls use separate pooled database requests, so
it cannot demonstrably retain one database session while external acquisition
and later RPCs execute. The finite persistent lease is therefore the smallest
reliable mechanism that spans the lifecycle. It is released in the Edge
Function `finally` path after normal completion or failure; only the matching
token can release it. A 60–1800 second bounded expiry (runtime request: 900)
reclaims crash/timeout leases, so a source cannot be permanently stranded.

The claim row retains `last_overlap_at` and `overlap_skipped_count`, making a
skipped overlap observable without inventing a successful ingestion run or
changing normal `intelligence_ingestion_runs` statistics. Existing run rows
continue to record real `RUNNING`/`SUCCESS`/`PARTIAL`/`FAILED` work.

RLS stays enabled on the claim table. `PUBLIC` has no table or RPC access.
Because the repository has no authoritative production application-role grant
evidence, this artifact deliberately does not guess a grant; the owner must
grant RPC execution only to the verified Edge service role during cloud
preflight.

## Prepared scheduler and disable procedure

`m33-g1-scheduler-activation.sql` is an owner-only, transaction-safe
activation artifact for the existing `gpir-intelligence-fetch` endpoint. It
does not create a second ingestion engine. It rechecks each named source is
GREEN with `poll_minutes=60`, then schedules independent write-mode calls:

| Job | UTC minute | Source |
| --- | ---: | --- |
| `m33-g1-sfa-ingestion` | 05 | `SFA-APAC-001` |
| `m33-g1-rbi-ingestion` | 25 | `CB-APAC-010` |
| `m33-g1-pymnts-ingestion` | 45 | `PYMNTS-GLOBAL-004` |

It uses `gpir_edge_function_secret` from `vault.decrypted_secrets` at job
runtime. No secret appears in repository SQL or gets interpolated into the
stored cron command. The exact existing production Edge endpoint is not
present in repository evidence, so the artifact has a guarded
`__OWNER_VERIFIED_EDGE_FUNCTION_URL__` placeholder and fails closed until the
owner supplies the exact endpoint at the separately authorized activation.
That is an activation preflight, not a local or production operation in Step
7A. Re-application unschedules and recreates only the three named M33 jobs.

`m33-g1-scheduler-emergency-disable.sql` unschedules only those three named
jobs. Claim rollback is separate in `m33-g1-source-run-claim-rollback.sql` and
must occur only after schedules are disabled and no lease is active. Neither
artifact deletes or alters sources, RAW, candidates, runs, handoffs,
announcements or ticker data.

## Preserved boundaries

The controlled runtime allowlist remains SFA, RBI and PYMNTS. Fintech Futures
(`FS-GLOBAL-003`) and unknown sources remain blocked. RAW-first, run lineage,
individual RAW processing, deduplication, `MAX_PAGE_FETCHES=3`, Gate1/Gate2
and candidate semantics are unchanged. No batch processor, canonical handoff,
publication, `global_announcements` write path, ticker action or Cron creation
exists in the Edge Function.

## Static proof

`node scripts/test-m33-g1-step-7a.js` statically proves the authorization,
claim-before-fetch ordering, same-source skip, different-source keying, finite
stale recovery, `finally` release, RAW-first/publication boundaries, job
cadence, Vault use, no hardcoded secret, idempotent job replacement and
M33-only emergency disable scope. It does not activate a scheduler or contact
Supabase.
