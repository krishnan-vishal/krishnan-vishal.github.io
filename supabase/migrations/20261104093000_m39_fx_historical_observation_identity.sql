-- M39-FX Stage 1: retain source observation identity without changing the
-- existing capture timestamp or public archive architecture.

alter table public.fx_historical_archive
    add column if not exists observation_date date,
    add column if not exists rate_method text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fx_historical_archive_rate_method_check'
          and conrelid = 'public.fx_historical_archive'::regclass
    ) then
        alter table public.fx_historical_archive
            add constraint fx_historical_archive_rate_method_check
            check (rate_method is null or rate_method in
                ('provider-native', 'derived-cross', 'derived-inverse'));
    end if;
end $$;

create unique index if not exists uq_fx_historical_archive_observation
    on public.fx_historical_archive
    (base_currency, target_currency, observation_date, source, rate_method);

comment on column public.fx_historical_archive.timestamp is
    'GPIR ingestion timestamp. This is not the historical source observation date.';
comment on column public.fx_historical_archive.observation_date is
    'Original calendar observation date published by the named FX reference source.';
comment on column public.fx_historical_archive.rate_method is
    'provider-native, derived-cross, or derived-inverse; null only for legacy capture rows.';
