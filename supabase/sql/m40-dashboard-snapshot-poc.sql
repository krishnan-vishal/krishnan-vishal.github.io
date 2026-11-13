-- M40 isolated proof of concept: governed, unfiltered announcement summary snapshot.
-- NOT wired into the live RPC. Exact filtered queries remain on gpir_m40_repository_query_v2.
-- A snapshot is explicitly refreshed by a trusted service role; stale snapshots are not served.
create table if not exists public.gpir_m40_dashboard_snapshot_v1 (
  snapshot_key text primary key check (snapshot_key = 'announcements:unfiltered'),
  payload jsonb not null,
  refreshed_at timestamptz not null,
  revision bigint not null default 0,
  check (jsonb_typeof(payload) = 'object')
);
-- Single transactional revision is bumped by every relevant write statement.
-- Refresh locks this row, preventing publication/source changes from racing the snapshot.
create table if not exists public.gpir_m40_dashboard_revision_v1 (
  snapshot_key text primary key check (snapshot_key = 'announcements:unfiltered'),
  revision bigint not null default 0
);
insert into public.gpir_m40_dashboard_revision_v1(snapshot_key,revision)
values ('announcements:unfiltered',0)
on conflict do nothing;
revoke all on public.gpir_m40_dashboard_revision_v1 from public,anon,authenticated;
revoke all on public.gpir_m40_dashboard_revision_v1 from service_role;
grant select, update on public.gpir_m40_dashboard_revision_v1 to service_role;

create or replace function public.gpir_m40_invalidate_dashboard_snapshot_v1()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $m40_invalidate$
begin
  update public.gpir_m40_dashboard_revision_v1
  set revision = revision + 1
  where snapshot_key = 'announcements:unfiltered';
  return null;
end $m40_invalidate$;
revoke all on function public.gpir_m40_invalidate_dashboard_snapshot_v1()
  from public,anon,authenticated;

-- Statement-level triggers avoid per-row work during bulk ingestion.
-- The trigger and originating write commit or roll back together.
drop trigger if exists gpir_m40_invalidate_announcements on public.global_announcements;
create trigger gpir_m40_invalidate_announcements
after insert or update or delete or truncate on public.global_announcements
for each statement execute function public.gpir_m40_invalidate_dashboard_snapshot_v1();

drop trigger if exists gpir_m40_invalidate_sources on public.source_registry;
create trigger gpir_m40_invalidate_sources
after insert or update or delete or truncate on public.source_registry
for each statement execute function public.gpir_m40_invalidate_dashboard_snapshot_v1();

drop trigger if exists gpir_m40_invalidate_topics on public.gpir_intelligence_topics;
create trigger gpir_m40_invalidate_topics
after insert or update or delete or truncate on public.gpir_intelligence_topics
for each statement execute function public.gpir_m40_invalidate_dashboard_snapshot_v1();

revoke all on public.gpir_m40_dashboard_snapshot_v1 from public, anon, authenticated;
revoke all on public.gpir_m40_dashboard_snapshot_v1 from service_role;
grant select, insert, update on public.gpir_m40_dashboard_snapshot_v1 to service_role;

create or replace function public.gpir_m40_refresh_dashboard_snapshot_v1()
returns jsonb language plpgsql volatile security invoker
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_revision bigint;
  v_current_revision bigint;
begin
  -- Compute outside the revision lock so ingestion writes never wait for aggregation.
  -- If a write commits during computation, discard the obsolete result.
    select revision into v_revision
    from public.gpir_m40_dashboard_revision_v1
    where snapshot_key = 'announcements:unfiltered';
    v_payload := public.gpir_m40_repository_query_v2(
      'announcements',null,null,null,null,null,null,null,1,0
    ) - 'records' - 'limit' - 'offset' - 'hasMore' - 'nextOffset';
    select revision into v_current_revision
    from public.gpir_m40_dashboard_revision_v1
    where snapshot_key = 'announcements:unfiltered' for update;
    if v_current_revision = v_revision then
      insert into public.gpir_m40_dashboard_snapshot_v1(snapshot_key,payload,refreshed_at,revision)
      values ('announcements:unfiltered',v_payload,clock_timestamp(),v_revision)
      on conflict (snapshot_key) do update
      set payload = excluded.payload, refreshed_at = excluded.refreshed_at,
          revision = excluded.revision;
      return v_payload;
    end if;
    -- A concurrent write invalidated the calculation; fail closed, do not publish.
  -- A failed refresh leaves the prior snapshot invalid by revision and forces exact RPC.
  return null;
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
  from public.gpir_m40_dashboard_snapshot_v1 s
  join public.gpir_m40_dashboard_revision_v1 r
    on r.snapshot_key = s.snapshot_key and r.revision = s.revision
  where s.snapshot_key = 'announcements:unfiltered'
    and s.refreshed_at >= statement_timestamp() - p_max_age;
  -- NULL means caller must use the exact governed RPC, never stale data.
  return v_payload;
end $$;

revoke all on function public.gpir_m40_refresh_dashboard_snapshot_v1() from public,anon,authenticated;
revoke all on function public.gpir_m40_read_dashboard_snapshot_v1(interval) from public,anon,authenticated;
grant execute on function public.gpir_m40_refresh_dashboard_snapshot_v1() to service_role;
grant execute on function public.gpir_m40_read_dashboard_snapshot_v1(interval) to service_role;
