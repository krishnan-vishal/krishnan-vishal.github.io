-- M41 Payload CMS isolation bootstrap.
-- This migration creates only schema/role boundaries. Payload collection DDL is
-- generated and applied by Payload's versioned migration runner with the
-- gpir_payload_migrator role; the runtime login inherits only
-- gpir_payload_runtime. No existing public-schema object is modified.

begin;

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'gpir_payload_migrator') then
        create role gpir_payload_migrator nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'gpir_payload_runtime') then
        create role gpir_payload_runtime nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
    end if;
end
$$;

create schema if not exists payload authorization gpir_payload_migrator;

revoke all on schema payload from public, anon, authenticated, service_role;
grant usage, create on schema payload to gpir_payload_migrator;
grant usage on schema payload to gpir_payload_runtime;

-- Payload must never inherit existing application-table privileges. Existing
-- Supabase roles continue unchanged.
revoke all on schema public from gpir_payload_migrator, gpir_payload_runtime;
revoke all on all tables in schema public from gpir_payload_migrator, gpir_payload_runtime;
revoke all on all sequences in schema public from gpir_payload_migrator, gpir_payload_runtime;
revoke all on all functions in schema public from gpir_payload_migrator, gpir_payload_runtime;

alter default privileges for role gpir_payload_migrator in schema payload
    grant select, insert, update, delete on tables to gpir_payload_runtime;
alter default privileges for role gpir_payload_migrator in schema payload
    grant usage, select on sequences to gpir_payload_runtime;
alter default privileges for role gpir_payload_migrator in schema payload
    grant execute on functions to gpir_payload_runtime;

comment on schema payload is
    'Isolated Payload CMS editorial schema. No GPIR intelligence, identity, auth, entitlement or alert authority.';
comment on role gpir_payload_runtime is
    'Payload runtime group role: DML in payload schema only; never service_role or public-schema authority.';
comment on role gpir_payload_migrator is
    'Payload migration group role: DDL in payload schema only; login credentials are provisioned out of band.';

commit;
