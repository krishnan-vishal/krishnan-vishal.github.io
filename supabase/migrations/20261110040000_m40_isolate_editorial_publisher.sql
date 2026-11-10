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

-- Only the isolated publisher role may invoke the existing editorial RPC.
-- The protected publisher must independently read the published Contentful
-- entry before using its separately provisioned credential.
alter function public.gpir_publish_t3_editorial_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
  security definer;
revoke all on function public.gpir_publish_t3_editorial_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.gpir_publish_t3_editorial_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
  to gpir_editorial_publisher;

-- Reader SELECT and all candidate/raw-ingestion privileges remain unchanged.
revoke insert, update, delete, truncate, references, trigger
  on table public.global_announcements from public, anon, authenticated, service_role;
