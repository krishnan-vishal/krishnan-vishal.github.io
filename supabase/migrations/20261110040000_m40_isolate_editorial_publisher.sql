-- Proposed only: deploy together with the publisher credential and the
-- governed scraper. Never grant this role or its JWT to ordinary processors.
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'gpir_editorial_publisher') then
    raise exception 'gpir_editorial_publisher role already exists; review its privileges before migration';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticator' and not rolinherit) then
    raise exception 'PostgREST authenticator must exist and must not inherit roles';
  end if;
end
$$;

create role gpir_editorial_publisher nologin noinherit nobypassrls;
grant gpir_editorial_publisher to authenticator;
grant usage on schema public to gpir_editorial_publisher;

-- TRANSITION: install the isolated publisher identity without changing the
-- live editorial RPC's SECURITY INVOKER mode or existing service_role grant.
-- The active Supabase Edge Function still calls this RPC as service_role.
-- Its revocation, SECURITY DEFINER conversion and dedicated-role grant
-- belong to the separately verified cutover, after the replacement caller,
-- trusted JWT and Contentful approval checks are operational.
-- In particular, do not grant the new role execution of the legacy RPC:
-- this phase must not make the old unguarded entry point newly accessible.
do $
begin
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.gpir_publish_t3_editorial_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)',
    'execute'
  ) then
    raise exception 'Existing service_role editorial RPC grant missing; review transition';
  end if;
end
$;

-- Preserve service_role writes for the existing governed Global Alerts pipeline.
-- Remove direct writes from public reader roles without disrupting production ingestion.
revoke insert, update, delete, truncate, references, trigger
  on table public.global_announcements from public, anon, authenticated;
