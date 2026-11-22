# GPIR SEP-05 — Stage 3 governed multi-file continuation

## Non-activation status
PR #676 is **draft and review-only**. No merge, production deployment, payable model execution, owner-submitted multi-file job or live two-file acceptance has been authorized or performed. The Central Command `multifile_submit` endpoint still rejects all execution. Neither of the Stage 3 activation environment flags is configured or enabled by this PR. The existing single-file production behavior remains unchanged.

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
