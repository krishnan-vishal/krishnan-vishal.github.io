-- M40 isolated proof of concept: governed, unfiltered announcement summary snapshot.
-- NOT wired into the live RPC. Exact filtered queries remain on gpir_m40_repository_query_v2.
-- A snapshot is explicitly refreshed by a trusted service role; stale snapshots are not served.
create table if not exists public.gpir_m40_dashboard_snapshot_v1 (
  snapshot_key text primary key check (snapshot_key = 'announcements:unfiltered'),
  payload jsonb not null,
  refreshed_at timestamptz not null,
  check (jsonb_typeof(payload) = 'object')
);
revoke all on public.gpir_m40_dashboard_snapshot_v1 from public, anon, authenticated;
revoke all on public.gpir_m40_dashboard_snapshot_v1 from service_role;
grant select, insert, update on public.gpir_m40_dashboard_snapshot_v1 to service_role;

create or replace function public.gpir_m40_refresh_dashboard_snapshot_v1()
returns jsonb language plpgsql volatile security invoker
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
begin
  -- Compute once using the existing governed exact implementation.
  v_payload := public.gpir_m40_repository_query_v2(
    'announcements',null,null,null,null,null,null,null,1,0
  ) - 'records' - 'limit' - 'offset' - 'hasMore' - 'nextOffset';
  insert into public.gpir_m40_dashboard_snapshot_v1(snapshot_key,payload,refreshed_at)
  values ('announcements:unfiltered',v_payload,clock_timestamp())
  on conflict (snapshot_key) do update
  set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
  return v_payload;
end $$;

create or replace function public.gpir_m40_read_dashboard_snapshot_v1(
  p_max_age interval default interval '30 seconds'
) returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
begin
  if p_max_age is null or p_max_age < interval '0 seconds'
     or p_max_age > interval '5 minutes' then
    raise exception 'INVALID_SNAPSHOT_MAX_AGE' using errcode = '22023';
  end if;
  select payload into v_payload
  from public.gpir_m40_dashboard_snapshot_v1
  where snapshot_key = 'announcements:unfiltered'
    and refreshed_at >= statement_timestamp() - p_max_age;
  -- NULL means caller must use the exact governed RPC, never stale data.
  return v_payload;
end $$;

revoke all on function public.gpir_m40_refresh_dashboard_snapshot_v1() from public,anon,authenticated;
revoke all on function public.gpir_m40_read_dashboard_snapshot_v1(interval) from public,anon,authenticated;
grant execute on function public.gpir_m40_refresh_dashboard_snapshot_v1() to service_role;
grant execute on function public.gpir_m40_read_dashboard_snapshot_v1(interval) to service_role;
