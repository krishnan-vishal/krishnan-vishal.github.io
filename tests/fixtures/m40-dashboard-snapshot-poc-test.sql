-- Run only in the isolated benchmark database after the M40 data fixture is populated.
-- Fail on any payload mismatch or access-control regression.
begin;
set local role service_role;
do $$
declare
  expected jsonb;
  actual jsonb;
begin
  expected := public.gpir_m40_repository_query_v2(
    'announcements',null,null,null,null,null,null,null,1,0
  ) - 'records' - 'limit' - 'offset' - 'hasMore' - 'nextOffset';
  perform public.gpir_m40_refresh_dashboard_snapshot_v1();
  actual := public.gpir_m40_read_dashboard_snapshot_v1(interval '5 minutes');
  if actual is distinct from expected then
    raise exception 'M40_SNAPSHOT_EXACTNESS_FAILURE';
  end if;
  update public.gpir_m40_dashboard_snapshot_v1
  set refreshed_at = statement_timestamp() - interval '10 minutes'
  where snapshot_key = 'announcements:unfiltered';
  if public.gpir_m40_read_dashboard_snapshot_v1(interval '5 minutes') is not null then
    raise exception 'M40_SNAPSHOT_STALENESS_FAILURE';
  end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.gpir_m40_refresh_dashboard_snapshot_v1()','execute')
     or has_function_privilege('authenticated','public.gpir_m40_refresh_dashboard_snapshot_v1()','execute')
     or has_function_privilege('anon','public.gpir_m40_read_dashboard_snapshot_v1(interval)','execute')
     or has_function_privilege('authenticated','public.gpir_m40_read_dashboard_snapshot_v1(interval)','execute')
     or has_table_privilege('anon','public.gpir_m40_dashboard_snapshot_v1','select')
     or has_table_privilege('authenticated','public.gpir_m40_dashboard_snapshot_v1','select')
  then raise exception 'M40_SNAPSHOT_PRIVILEGE_FAILURE'; end if;
end $$;
rollback;
