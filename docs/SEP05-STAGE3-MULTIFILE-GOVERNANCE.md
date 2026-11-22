# GPIR SEP-05 — Stage 3 governed multi-file continuation

## Non-activation status
PR #676 is **draft and review-only**. No merge, production deployment, payable model execution, owner-submitted multi-file job or live two-file acceptance has been authorized or performed. The Central Command `multifile_submit` endpoint still rejects all execution. Neither of the Stage 3 activation environment flags is configured or enabled by this PR. The existing single-file production behavior remains unchanged.

## Central Command integration (review-only)
- Central Command now displays a separate `Gemini / OpenRouter — governed 2–3-file plan` selection, explicitly labeled **READ-ONLY**. The old single-file and repository-wide Copilot routes are unchanged.
- Owners can preview the canonical `multifile_plan` through the existing session-authenticated gateway, with the two proposed acceptance candidates prefilled: `docs/SEP01-COPILOT-CLINE-EXECUTION-GATE.md` and `docs/ARCHITECTURE.md`. The preview displays the live base commit, individual Git blobs, file sizes and plan ID; it is not a persisted approval.
- The UI always leaves Stage 3 job submission disabled, and the gateway still rejects `multifile_submit` with HTTP 403. No provider call, spending, Git job, automatic PR, merge or deployment is enabled.
- The owner-selected USD 0.25 ceiling is **not** a backend-bound spend authorization or evidence of independent provider account caps. No further execution approval can be inferred from the selection or preview. Implement authenticated persisted approval/release separately, only after review.
- `multifile-central-command.test.mjs` covers the read-only route, existing gateway refusal and module syntax; deterministic CI does not prove production deployment or live acceptance.

## Implemented on the existing PR
- Owner-authenticated, read-only Central Command `multifile_plan` preview, with canonical SHA-256 owner/base/instruction/blob/size/path binding.
- Strict two-to-three-file manifest in existing `docs/*.md` / `assets/css/*.css`; reject protected paths, duplicates, stale blobs, missing sources or total size over 300,000 bytes. Planning permits up to 100,000 bytes per file; execution additionally enforces the existing editor's 50,000-byte input ceiling before any provider call.
- `multifile-runner.mjs`: isolated job branch, clean baseline, explicit bound approval, exact source Git blobs, at least two substantive file changes, strict staging/commit-path verification, single verified parent, provider-request ceiling, and rollback of all tracked/untracked changes on rejected transactions.
- `multifile-provider-bridge.mjs`: dormant Gemini/OpenRouter route using the existing provider editors and independent fallback; no model access until a protected-store approval, matching owner, plan, branch, file locks, single-attempt policy and independently verified spend ceiling all pass. Maximum three actual API requests across the whole job, not three per file.
- `multifile-approval-persistence.mjs`: a planned job is persisted using the existing service-role Supabase CAS RPC. Separate owner-authenticated confirmation persists explicit attempt/cost approval. A further explicitly authorized release queues the job; only the pre-existing `QUEUED -> CLAIMED` atomic CAS transition acquires persistent per-file and branch writer locks.
- `multifile-checkpoint-recovery.mjs`: fail-closed remote-head, parent, manifest, original-blob, changed-path, commit-message and independent-test verification. Recovery never re-calls either provider. The existing durable Actions worker includes a dormant multi-file route and remote recovery hook.

## Spend and execution safeguards
- `SEP01_MULTIFILE_EXECUTION_ENABLED` must remain **unset/false** until independent acceptance and a separate owner release authorization.
- `SEP01_MULTIFILE_SPEND_CAP_VERIFIED` must remain **unset/false** until account-side provider spending limits have been independently verified.
- `SEP01_MULTIFILE_MAX_SPEND_USD` cannot exceed the explicitly approved provider ceiling. Per-job `multifile_approval.max_cost_usd` must be no larger than that ceiling. Booleans or a client-supplied plan alone are insufficient.
- An owner approval does not immediately run a job. A separate `AUTHORIZE_ONE_MULTIFILE_DISPATCH` release is required; the current owner-facing gateway does not expose that action. No new database table, credentials or production API route is introduced.
- The worker only operates inside `sep01/jobs/*` isolated branches and creates no automatic PR, merge or deployment. Existing Supabase RLS/CAS, GitHub review, and production governance remain in force.

## Acceptance gates remaining (NOT complete)
1. Independent code/security review of PR #676 and latest CI evidence, including approval persistence, zero-spend defaults, lock contention, rollback and recovery.
2. Owner-select exactly two non-sensitive existing documentation files, approve the canonical live plan and the specific Gemini/OpenRouter model/attempt/cost ceiling through the authenticated gateway. Provider caps and credentials must be verified separately. Do not use hypothetical approvals or simulated cost flags for live execution.
3. Expose the governed owner approval/release flow only after separate authorization; verify protected server-side persistence, atomic locks, and the account-side spend ceiling. Gate the multi-file route on reviewed configuration.
4. Perform **one** explicitly owner-approved two-file acceptance in a disposable branch. Require two actual edits, a pushed Git checkpoint, verified independent CI, provider/usage receipt, and a review-only draft PR or existing PR evidence. Never retry a one-shot acceptance automatically.
5. Keep Stage 3 execution disabled until acceptance evidence is reviewed and the owner separately authorizes activation. Do not merge/deploy PR #676 implicitly.

## Existing architecture and policy preserved
Supabase remains authoritative for identity, intelligence, entitlements and job governance; Payload/Contentful editorial authority, website navigation, Global Alerts, FX Smart Cards, ASK GPIR, publication confidence threshold and source-integrity controls are unchanged. No Aider activation, Copilot dependency, database migration, intelligence-rule relaxation or new product architecture is introduced.

## Final execution-gate disposition (2026-11-22)
- **Read-only production planning: ACCEPTED**. The owner-authenticated production plan returned the approved two-file manifest, baseline `d8dc0bfb246e7bd4f65c9701c1d799885f387bf9`, and execution disabled. This does not authorize spending.
- **Crash/retry budget remediation prepared on this PR:** before any provider request, the bridge now uses service-role CAS to persist `provider_attempt_reserved=true` on the claimed job. Any subsequent execution attempt with the same job identity is rejected before a provider call. Tests cover failed reservation and repeat execution after a simulated provider failure.
- **Provider account-side cap: NOT VERIFIED**. An environment flag or owner-entered value is not independent evidence of a provider billing limit. USD 0.25 remains an upper bound for the proposed test, not permission to spend.
- **Owner-facing stage/approve/dispatch HTTP workflow: NOT ENABLED**. The production gateway intentionally refuses `multifile_submit` with HTTP 403. Persisted approval primitives exist but are not connected to a production owner dispatch route.
- **Live execution acceptance: NOT RUN**. No paid API call, branch execution, job receipt or acceptance PR is claimed. The production read-only release was isolated in PR #677; this draft PR must be reconciled with `main` before merge because both touched Central Command and the gateway.
- **Release decision:** remain draft/dormant until new controller/security checks pass, production owner approval workflow is implemented and reviewed, account-side caps are verified, and the owner separately authorizes one paid dispatch. Do not infer approval from read-only acceptance.

## Owner-facing approval connection (draft implementation)
- Reuses the existing owner-authenticated Supabase Edge Function and `gpir_sep01_jobs` persistence table; no new database table, public credential, or execution route.
- `multifile_stage` revalidates the current `main` Git tree and exact owner-bound plan ID before inserting a single `PLANNED` record. The UI offers a separate **Record this read-only plan** action; it cannot submit or pay for a model call.
- `multifile_approve` requires the authenticated owner, the persisted `PLANNED` record, matching plan ID and baseline, exact `AUTHORIZE_ONE_MULTIFILE_JOB` confirmation, **server-side** `SEP01_MULTIFILE_SPEND_CAP_VERIFIED=true` and `SEP01_MULTIFILE_MAX_SPEND_USD=0.25`. Uses the existing `gpir_sep01_cas_job` RPC for optimistic revision checks.
- `multifile_dispatch` additionally requires the separately entered `AUTHORIZE_ONE_MULTIFILE_DISPATCH`, the persisted `APPROVED` record, and **server-side** `SEP01_MULTIFILE_EXECUTION_ENABLED=true`. It atomically queues one job; it does not itself call a provider or trigger GitHub deployment.
- Production configuration has **not** been enabled or deployed. A server-side flag does not independently prove that Gemini/OpenRouter provider account hard caps are configured. Owner approval to deploy the read-only UI is not approval to enable these flags.
- Original one-file route and existing `multifile_submit` HTTP 403 denial are unchanged. Do not merge this draft until conflict resolution against `main`, current CI and security checks, and separate owner release approval.
