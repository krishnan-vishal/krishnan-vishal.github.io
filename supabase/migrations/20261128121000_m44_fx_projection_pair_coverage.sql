-- Keep the public current/previous-close projection below the Data API row cap.
-- This changes only the projection. All dated and legacy archive rows remain.
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
    with daily as (
        select distinct on (a.base_currency, a.target_currency, a.observation_date)
            a.base_currency::text as base_currency, a.target_currency::text as target_currency,
            a.observation_date, a.rate, a.region::text as region, a.source::text as source,
            a.rate_method::text as rate_method,
            a.timestamp as captured_at
        from public.fx_historical_archive a
        where a.observation_date between
            current_date - greatest(7, least(coalesce(p_days, 30), 90)) and current_date
          and a.timestamp is not null
          and a.rate > 0
          and a.base_currency ~ '^[A-Z]{3}$'
          and a.target_currency ~ '^[A-Z]{3}$'
          and a.base_currency <> a.target_currency
          and a.source is not null
          and a.rate_method in ('provider-native', 'derived-cross', 'derived-inverse')
        order by a.base_currency, a.target_currency, a.observation_date,
            a.timestamp desc nulls last, a.id desc
    ),
    ranked as (
        select daily.*, row_number() over (
            partition by daily.base_currency, daily.target_currency
            order by daily.observation_date desc
        ) as day_rank
        from daily
    )
    select ranked.base_currency, ranked.target_currency, ranked.observation_date,
        ranked.rate, ranked.region, ranked.source, ranked.rate_method, ranked.captured_at
    from ranked
    where ranked.day_rank <= 2
    order by ranked.base_currency, ranked.target_currency, ranked.observation_date desc;
$$;

revoke all on function public.gpir_m44_fx_snapshot_v1(integer) from public, anon, authenticated;
grant execute on function public.gpir_m44_fx_snapshot_v1(integer) to service_role;

comment on function public.gpir_m44_fx_snapshot_v1(integer) is
    'M44 latest and previous validated FX observations per pair; service-role only.';
