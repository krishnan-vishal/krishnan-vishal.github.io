-- M40 OPTIONAL deployment gate. Run only after the isolated snapshot test passes
-- and the existing Supabase pg_cron installation is confirmed.
-- This does not change the currently deployed reader API feature flag.
-- Reuses existing pg_cron: no new service or external scheduler.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'M40_PG_CRON_NOT_INSTALLED';
  end if;
end $$;
-- 15-second freshness is NOT guaranteed by this one-minute recovery refresh.
-- Write triggers invalidate immediately; exact RPC handles invalid/missing snapshots.
select cron.schedule(
  'gpir-m40-dashboard-snapshot-refresh-v1',
  '* * * * *',
  'select public.gpir_m40_refresh_dashboard_snapshot_v1()'
);
-- Deployment prerequisite: pg_cron execution role must have EXECUTE on the
-- refresh function and SELECT/INSERT/UPDATE on the snapshot and revision tables.
-- Do not grant these permissions to anon/authenticated.
