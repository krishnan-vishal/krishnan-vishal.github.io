# M33-G1 Steps 7A–7F.1 — least-privilege orchestration safety

## Status

**STEP 7F.1 CLAIM RPC HOTFIX PREPARED; NOT APPLIED.** The owner deployed the
Step 7C claim layer and claim-aware Edge Function, kept Verify JWT on, disabled
the legacy writer and left the M33 scheduler off. Request 27 proved the deployed
dry-run path is write-free. The first direct claim test then failed closed with
PostgreSQL `42883` before a lease was acquired or the Edge Function invoked.

Owner-verified production remains RAW=9, candidates=9, rejections=0, handoffs=0
and announcements=77. Cron remains absent; publication and handoff remain
closed. This repository hotfix does not connect to production, execute SQL,
deploy, invoke a source or activate a schedule.

## Step 7F.1 claim RPC runtime repair

The failure is limited to `pg_catalog.greatest(...)` and
`pg_catalog.least(...)`. PostgreSQL parses `GREATEST` and `LEAST` as conditional
expressions, not ordinary functions, so they cannot be schema-qualified. Using
unqualified `least(1800, greatest(60, coalesce(p_ttl_seconds, 900)))` is required
syntax and does not consult `search_path`; it therefore does not weaken the
function's hardened `search_path=pg_catalog` object-resolution boundary.

The forward migration is corrected, and the owner hotfix replaces only
`public.gpir_claim_intelligence_source_run(text,uuid,integer)` in a transaction.
The exact signature/default, TTL bounds, advisory and row locks, finite expiry,
overlap counters, matching-token release function, RLS, `SECURITY DEFINER`,
qualified application objects and role grants remain unchanged. The hotfix
re-revokes `PUBLIC`, `anon`, `authenticated` and prior `service_role` access,
then grants only EXECUTE to `service_role`; the owner retains inherent access.

The original static test mistakenly required the invalid qualification, while
the disposable PostgreSQL workflow never executed the Step 7 claim migration.
Coverage now rejects both invalid forms and runs the migration/hotfix plus TTL,
overlap, token-release, RLS and permission behavior against isolated PostgreSQL.

## Step 7B owner cloud preflight

| Check | Verified result |
| --- | --- |
| Edge Function endpoint | `https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-intelligence-fetch` |
| `pg_cron` | 1.6.4 / PASS |
| `pg_net` | 0.20.4 / PASS |
| `supabase_vault` | 0.3.1 / PASS |
| Vault secret | `gpir_edge_function_secret` present; value not exposed |
| Existing M33 / intelligence Cron jobs | none |
| Existing source/run claim functions | none |
| Existing source/run/ingestion claim tables | none |

Production inspection also found broad grants on some existing GPIR functions,
including `gpir_process_raw_record` and `gpir_process_raw_batch`. Step 7C does
not change those proven legacy permissions. Their review belongs to a separate
security milestone.

## Atomic per-source overlap protection

`m33-g1-source-run-claim.sql` adds one finite lease per `source_id` in
`public.intelligence_source_run_claims` and two narrowly scoped RPCs. The
existing Edge Function claims a source before it creates a run or fetches an
external page. A second write-mode invocation for that same source returns
`SKIPPED_OVERLAP` / `SOURCE_RUN_ALREADY_ACTIVE`: no fetch, RAW insert,
processor, candidate, handoff or publication work occurs. Different source IDs
have independent leases.

The mutation is serialized by a transaction-scoped PostgreSQL advisory lock
plus a row lock. A session advisory lock alone is unsuitable because the Edge
Function's PostgREST/RPC operations may use separate pooled requests. The
finite persistent lease spans external acquisition and later RPCs. The Edge
Function releases it in `finally` after normal completion or failure, and only
the matching token can release it. A 60–1800 second bounded expiry (runtime
request: 900 seconds) reclaims crash/timeout leases and prevents permanent
source starvation.

`last_overlap_at` and `overlap_skipped_count` retain overlap observability
without inventing an ingestion run. Real work continues to use existing
`RUNNING`/`SUCCESS`/`PARTIAL`/`FAILED` run records.

Dry runs intentionally do not acquire the production claim. They preserve the
existing fetch/parse/assessment-only contract and create no run, RAW record or
processor work. The claim protects the state-changing write path, while dry-run
semantics remain unchanged.

## Least-privilege claim security

The checked-in Edge Function uses `withSupabase({ auth: ["secret"] })` and
calls the RPCs through `ctx.supabaseAdmin`. The `@supabase/server` contract
defines that administrative client as the RLS-bypassing `service_role` client;
Supabase secret keys also map database access to `service_role`. Therefore the
minimum runtime database role is `service_role`, not `anon` or `authenticated`.

Both claim RPCs are `SECURITY DEFINER` with `SET search_path = pg_catalog` and
fully qualified application-object references. This is justified because it
allows the Edge runtime only the two fixed claim operations without granting
direct table access or arbitrary SQL capability. The table has RLS enabled and
no runtime table grant. The migration explicitly revokes table/RPC access from
`PUBLIC`, `anon`, `authenticated` and any prior `service_role` grant, then grants
only RPC `EXECUTE` to `service_role`. The function owner (normally `postgres`
under owner SQL-editor execution) retains inherent administration rights.

## Prepared scheduler and disable procedure

`m33-g1-scheduler-activation.sql` is a separately executable owner-only
activation artifact for the verified existing endpoint. It does not create a
second ingestion engine and must not be run as part of claim-layer deployment.
It rechecks each named source is GREEN with `poll_minutes=60`, then prepares
independent write-mode calls:

| Job | UTC minute | Source |
| --- | ---: | --- |
| `m33-g1-sfa-ingestion` | 05 | `SFA-APAC-001` |
| `m33-g1-rbi-ingestion` | 25 | `CB-APAC-010` |
| `m33-g1-pymnts-ingestion` | 45 | `PYMNTS-GLOBAL-004` |

Every job uses `dry_run=false` and resolves `gpir_edge_function_secret` from
`vault.decrypted_secrets` at execution time. It sends the credential through
the server-to-server `apikey` header and the existing bearer path, without
storing the secret in repository SQL or in the generated Cron command. A
missing/null/empty Vault value yields no `net.http_post` call. Each job has its
own name and can be disabled independently; the emergency artifact disables
all three named M33 jobs only.

`m33-g1-scheduler-emergency-disable.sql` never deletes or changes sources, RAW,
candidates, run history, handoffs, announcements, ticker data, the Edge secret,
or any non-M33 job. Claim rollback is separately isolated in
`m33-g1-source-run-claim-rollback.sql` and may run only after all schedules are
disabled and no lease is active.

## Owner post-migration verification

`m33-g1-step-7c-post-migration-verification.sql` is SELECT-only and reveals no
Vault value. After the claim migration, it proves table/RLS presence, exact RPC
signatures, function owner, `SECURITY DEFINER`, explicit search path, effective
role privileges, direct table grants, absence of the three M33 Cron jobs and
unchanged RAW/candidate/rejection/handoff/announcement baseline counts.

Expected permission result: `PUBLIC=false`, `anon=false`,
`authenticated=false`, `service_role=true`; direct runtime table privileges are
absent.

## Owner deployment order

1. Execute only `m33-g1-source-run-claim.sql` as the database owner.
2. Run the SELECT-only post-migration verification and stop on any mismatch.
3. Deploy the checked-in claim-aware `gpir-intelligence-fetch` Edge Function.
4. Manually verify one normal controlled-source write invocation.
5. Manually prove same-source overlap returns the controlled zero-work result.
6. Verify different-source independence if it can be tested safely.
7. Recheck RAW/candidate counts and publication, handoff, ticker and source
   boundaries.
8. Only after every prior check passes may the scheduler become eligible for a
   separate owner-approved activation. Do not combine activation with safety-
   layer deployment.

## Preserved boundaries

The controlled runtime allowlist remains SFA, RBI and PYMNTS. Fintech Futures
(`FS-GLOBAL-003`) and unknown sources remain blocked. RAW-first, run lineage,
individual RAW processing, deduplication, `MAX_PAGE_FETCHES=3`, Gate1/Gate2 and
candidate semantics are unchanged. No batch processor, canonical handoff,
publication, `global_announcements` write path, ticker action or Cron creation
exists in the Edge Function.

Local static/runtime-contract validation does not activate the scheduler or
contact Supabase. Local Deno absence remains a known environment limitation,
not a new architecture blocker.
