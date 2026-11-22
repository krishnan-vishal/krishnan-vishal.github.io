create table public.gpir_fintech_source_catalog (
    id integer primary key,
    record jsonb not null check (jsonb_typeof(record) = 'object')
);
alter table public.gpir_fintech_source_catalog enable row level security;
revoke all on public.gpir_fintech_source_catalog from public, anon, authenticated;
grant select on public.gpir_fintech_source_catalog to service_role;