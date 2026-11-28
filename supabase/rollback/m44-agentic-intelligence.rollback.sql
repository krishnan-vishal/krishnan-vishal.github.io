-- M44 database rollback. Run only through the reviewed Supabase release path.
-- Edge Functions are recovered by redeploying their preceding reviewed revisions.

drop function if exists public.gpir_m44_fx_snapshot_v1(integer);
drop index if exists public.idx_fx_historical_archive_observation_date;
