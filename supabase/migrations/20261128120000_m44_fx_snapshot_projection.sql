-- M44 Phase 1: bounded, read-only projection of the existing FX archive.
-- No new table, provider, scheduler or publication authority is introduced.

create index if not exists idx_fx_historical_archive_observation_date
    on public.fx_historical_archive (observation_date desc)
    where observation_date is not null and timestamp is not null;

create or replace function public.gpir_m44_fx_snapshot_v1(p_days integer default 30)
returns table (
    base_currency text,
    target_currency text,
    observation_date date,
    rate numeric,
    region text,
    source text,
    rate_method text,
    captured_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
    select distinct on (
        archive.base_currency,
        archive.target_currency,
        archive.observation_date
    )
        archive.base_currency::text,
        archive.target_currency::text,
        archive.observation_date,
        archive.rate,
        archive.region::text,
        archive.source::text,
        archive.rate_method::text,
        archive.timestamp as captured_at
    from public.fx_historical_archive archive
    where archive.observation_date is not null
      and archive.timestamp is not null
      and archive.observation_date >= current_date - greatest(7, least(coalesce(p_days, 30), 90))
      and archive.rate > 0
      and archive.base_currency ~ '^[A-Z]{3}$'
      and archive.target_currency ~ '^[A-Z]{3}$'
      and archive.base_currency <> archive.target_currency
      and archive.source is not null
      and archive.rate_method in ('provider-native', 'derived-cross', 'derived-inverse')
    order by archive.base_currency, archive.target_currency,
        archive.observation_date, archive.timestamp desc nulls last, archive.id desc;
$$;

revoke all on function public.gpir_m44_fx_snapshot_v1(integer) from public, anon, authenticated;
grant execute on function public.gpir_m44_fx_snapshot_v1(integer) to service_role;

comment on function public.gpir_m44_fx_snapshot_v1(integer) is
    'M44 read-only daily FX projection from validated historical observations; service-role only.';
