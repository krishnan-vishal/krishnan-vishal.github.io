-- SEP-01: retain existing public.gpir_sep01_jobs JSONB payload/revision contract.
-- Applied to existing Supabase project under migration:
-- sep01_existing_queue_idempotency_and_branch_lock
create unique index if not exists gpir_sep01_jobs_idempotency_unique on public.gpir_sep01_jobs (idempotency_key);
create unique index if not exists gpir_sep01_jobs_active_branch_unique on public.gpir_sep01_jobs ((payload->>'branch')) where payload->>'status' in ('CLAIMED','CHECKPOINTED','PR_READY','CI_VERIFIED','RELEASE_ELIGIBLE') and payload ? 'branch';
