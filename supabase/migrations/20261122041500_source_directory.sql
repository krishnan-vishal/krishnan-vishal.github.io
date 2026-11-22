create table public.gpir_source_directory (
    region text not null,
    kind text not null check (kind in ('bank', 'association')),
    country_code text not null check (country_code ~ '^[A-Z]{2}$'),
    country text not null,
    name text not null,
    official_url text not null check (official_url like 'https://%'),
    summary text not null,
    coverage text not null,
    primary key (region, kind, country_code, name)
);

alter table public.gpir_source_directory enable row level security;
revoke all on public.gpir_source_directory from public, anon, authenticated;
grant select on public.gpir_source_directory to service_role;
