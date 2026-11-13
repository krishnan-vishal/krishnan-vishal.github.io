-- M40 governed server-side repository aggregation. Internal service-role RPC only.
-- No CMS entry is created for individual announcements or statistical observations.
-- The public Edge Function receives only approved announcement metadata and governed
-- aggregates; protected CMS/editorial bodies are never selected by this contract.
--
-- M40 performance architecture (500,000-record benchmark gate):
-- Topic and theme classification is immutable per row, so it is computed once at
-- write time into stored generated columns encoded as bitmasks, then served from
-- covering partial indexes. Queries aggregate a single-pass grouping-sets rollup
-- instead of re-running regex classification on every row for every request.
-- Classifier functions remain the single source of truth: the generated columns
-- call them, so classification semantics cannot drift. If any classifier mapping
-- changes, the generated columns and their indexes must be rebuilt in the same
-- migration (alter table ... drop column / add column) to stay exact.

create or replace function public.gpir_m40_topic_dictionary()
returns table(bit_position integer, topic_id text)
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  values
    (0,'aml'), (1,'apm'), (2,'baas'), (3,'bnpl'), (4,'caas'),
    (5,'cards-money-movements'), (6,'cbdc'), (7,'cobo'), (8,'corporate-payments'),
    (9,'cross-border'), (10,'deals'), (11,'diaspora-payments'), (12,'fintech'),
    (13,'fintech-licensing'), (14,'fraud'), (15,'global-aggregators'),
    (16,'global-regional-fintech'), (17,'immigrant-payments'), (18,'infrastructure'),
    (19,'licences'), (20,'migrant-movements'), (21,'money-movements'), (22,'pass'),
    (23,'payment-gateways'), (24,'payments'), (25,'payments-licensing'), (26,'pobo'),
    (27,'real-time'), (28,'regional-aggregators'), (29,'regulatory'), (30,'remittances'),
    (31,'saas'), (32,'stablecoins'), (33,'super-apps'), (34,'taas'), (35,'wallets')
$$;

create or replace function public.gpir_m40_theme_dictionary()
returns table(bit_position integer, theme_id text)
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  values
    (0,'agentic'), (1,'ai'), (2,'aml'), (3,'cbdc'), (4,'cross-border'), (5,'fraud'),
    (6,'infrastructure'), (7,'partnerships'), (8,'real-time'), (9,'regulatory'),
    (10,'wallets'), (11,'web3')
$$;

-- Mask primitives: write-time classification encoded as bit positions from the
-- dictionaries above. The CASE mapping below and the dictionary are the single
-- normalization contract; gpir_m40_topic_ids/gpir_m40_theme_ids decode these masks,
-- so array and mask classifications can never diverge.
create or replace function public.gpir_m40_topic_mask(p_headers text[])
returns bigint
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select coalesce(bit_or(
    case lower(regexp_replace(btrim(header), '[^a-zA-Z0-9]+', ' ', 'g'))
      when 'regulation' then 1::bigint << 29
      when 'regulatory' then 1::bigint << 29
      when 'regulatory actions' then 1::bigint << 29
      when 'central bank' then 1::bigint << 29
      when 'monetary policy' then 1::bigint << 29
      when 'licences authorisations' then 1::bigint << 19
      when 'licenses authorizations' then 1::bigint << 19
      when 'licensing' then 1::bigint << 19
      when 'payments licensing' then 1::bigint << 25
      when 'fintech licensing' then 1::bigint << 13
      when 'cross border payments' then 1::bigint << 9
      when 'cross border banking' then 1::bigint << 9
      when 'correspondent banking' then 1::bigint << 9
      when 'real time payments' then 1::bigint << 27
      when 'instant payments' then 1::bigint << 27
      when 'rtp' then 1::bigint << 27
      when 'payment infrastructure' then 1::bigint << 18
      when 'payments infrastructure' then 1::bigint << 18
      when 'clearing settlement' then 1::bigint << 18
      when 'payment networks' then 1::bigint << 18
      when 'payment orchestration' then 1::bigint << 18
      when 'remittances' then 1::bigint << 30
      when 'remittances diaspora' then 1::bigint << 30
      when 'wallets digital payments' then 1::bigint << 35
      when 'digital payments' then 1::bigint << 35
      when 'aml cft' then 1::bigint << 0
      when 'aml kyc compliance' then 1::bigint << 0
      when 'financial crime' then 1::bigint << 0
      when 'fraud cybersecurity' then 1::bigint << 14
      when 'fraud' then 1::bigint << 14
      when 'cybersecurity' then 1::bigint << 14
      when 'cbdcs digital money' then 1::bigint << 6
      when 'digital money' then 1::bigint << 6
      when 'stablecoins digital assets' then 1::bigint << 32
      when 'digital assets' then 1::bigint << 32
      when 'deals partnerships' then 1::bigint << 10
      when 'partnerships' then 1::bigint << 10
      when 'payments' then 1::bigint << 24
      when 'payment services' then 1::bigint << 24
      when 'cashless payments' then 1::bigint << 24
      when 'fintech' then 1::bigint << 12
      when 'financial technology' then 1::bigint << 12
      when 'global regional fintech' then 1::bigint << 16
      when 'pass' then 1::bigint << 22
      when 'taas' then 1::bigint << 34
      when 'saas' then 1::bigint << 31
      when 'caas' then 1::bigint << 4
      when 'baas' then 1::bigint << 2
      when 'pobo' then 1::bigint << 26
      when 'cobo' then 1::bigint << 7
      when 'global aggregators' then 1::bigint << 15
      when 'regional aggregators' then 1::bigint << 28
      when 'corporate payments' then 1::bigint << 8
      when 'b2b payments' then 1::bigint << 8
      when 'diaspora payments' then 1::bigint << 11
      when 'immigrant payments' then 1::bigint << 17
      when 'migrant international movements' then 1::bigint << 20
      when 'money movements' then 1::bigint << 21
      when 'super apps' then 1::bigint << 33
      when 'bnpl' then 1::bigint << 3
      when 'alternative payment methods apm' then 1::bigint << 1
      when 'cards money movements' then 1::bigint << 5
      when 'merchant acquiring' then 1::bigint << 5
      when 'payment gateways' then 1::bigint << 23
    end), 0)
  from unnest(coalesce(p_headers, '{}'::text[])) header
  where nullif(btrim(header), '') is not null
$$;

create or replace function public.gpir_m40_theme_mask(
  p_topic_mask bigint, p_headers text[], p_title text, p_summary text
) returns integer
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select
    (case when p_topic_mask & ((1::bigint << 9) | (1::bigint << 30) | (1::bigint << 11) | (1::bigint << 17)) <> 0 then 1 << 4 else 0 end)
  | (case when p_topic_mask & (1::bigint << 27) <> 0 then 1 << 8 else 0 end)
  | (case when p_topic_mask & ((1::bigint << 18) | (1::bigint << 23)) <> 0 then 1 << 6 else 0 end)
  | (case when pay
           and value ~ '\m(artificial intelligence|machine learning|generative ai|large language model|large language models|llm|llms|ai powered|ai driven|ai based|ai enabled|ai model|ai models|ai assistant|ai assistants|ai)\M' then 1 << 1 else 0 end)
  | (case when pay
           and value ~ '\m(agentic|ai agent|ai agents|autonomous agent|autonomous agents|agent to agent|machine payment|machine payments)\M' then 1 << 0 else 0 end)
  | (case when pay
           and (p_topic_mask & (1::bigint << 32) <> 0
                or value ~ '\m(web3|blockchain|crypto|digital asset|digital assets|distributed ledger|dlt|smart contract|smart contracts|on chain)\M') then 1 << 11 else 0 end)
  | (case when p_topic_mask & (1::bigint << 0) <> 0 then 1 << 2 else 0 end)
  | (case when p_topic_mask & (1::bigint << 14) <> 0 then 1 << 5 else 0 end)
  | (case when p_topic_mask & ((1::bigint << 29) | (1::bigint << 19) | (1::bigint << 25) | (1::bigint << 13)) <> 0 then 1 << 9 else 0 end)
  | (case when p_topic_mask & ((1::bigint << 6) | (1::bigint << 32)) <> 0 then 1 << 3 else 0 end)
  | (case when p_topic_mask & ((1::bigint << 35) | (1::bigint << 33)) <> 0 then 1 << 10 else 0 end)
  | (case when p_topic_mask & (1::bigint << 10) <> 0 then 1 << 7 else 0 end)
  from (
    -- The payments-context pattern is shared by the ai/agentic/web3 themes;
    -- evaluate it once per row instead of once per theme.
    select value,
      value ~ '\m(payment|payments|settlement|remittance|money movement|money transfer|banking|bank|financial services|card|cards|wallet|wallets|clearing|fintech|merchant|checkout|payout|payouts)\M' as pay
    from (
      select lower(concat_ws(' ', array_to_string(coalesce(p_headers, '{}'::text[]), ' '),
        coalesce(p_title, ''), coalesce(p_summary, ''))) as value
    ) content
  ) context
$$;

create or replace function public.gpir_m40_topic_mask_of_ids(p_topic_ids text[])
returns bigint
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select coalesce(bit_or(1::bigint << d.bit_position), 0)
  from unnest(coalesce(p_topic_ids, '{}'::text[])) mapped(topic_id)
  join public.gpir_m40_topic_dictionary() d on d.topic_id = mapped.topic_id
$$;

-- Dictionary bits are assigned in alphabetical id order, so ascending-bit decoding
-- reproduces the classifiers' alphabetical array ordering exactly.
create or replace function public.gpir_m40_topic_names(p_mask bigint)
returns text[]
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(d.topic_id order by d.topic_id), '{}'::text[])
  from public.gpir_m40_topic_dictionary() d
  where p_mask & (1::bigint << d.bit_position) <> 0
$$;

create or replace function public.gpir_m40_theme_names(p_mask integer)
returns text[]
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(d.theme_id order by d.theme_id), '{}'::text[])
  from public.gpir_m40_theme_dictionary() d
  where p_mask & (1 << d.bit_position) <> 0
$$;

create or replace function public.gpir_m40_primary_theme(p_mask integer)
returns text
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select coalesce((
    select candidate.theme_id
    from unnest(array['agentic','ai','web3','cbdc','aml','fraud','regulatory','real-time','cross-border','infrastructure','wallets','partnerships']) with ordinality candidate(theme_id, priority)
    join public.gpir_m40_theme_dictionary() d on d.theme_id = candidate.theme_id
    where p_mask & (1 << d.bit_position) <> 0
    order by candidate.priority
    limit 1
  ), 'other')
$$;

-- Canonical classifier contract preserved: identical signatures and outputs,
-- now decoding the mask primitives so there is a single normalization source.
create or replace function public.gpir_m40_topic_ids(p_headers text[])
returns text[]
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select public.gpir_m40_topic_names(public.gpir_m40_topic_mask(p_headers))
$$;

create or replace function public.gpir_m40_theme_ids(
  p_topic_ids text[], p_headers text[], p_title text, p_summary text
) returns text[]
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  select public.gpir_m40_theme_names(public.gpir_m40_theme_mask(
    public.gpir_m40_topic_mask_of_ids(p_topic_ids), p_headers, p_title, p_summary))
$$;

create or replace function public.gpir_m40_region_key(
  p_geography text, p_country text, p_region_tags text[]
) returns text
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  with input as (
    select lower(concat_ws(' ', coalesce(p_geography, ''), coalesce(p_country, ''),
      array_to_string(coalesce(p_region_tags, '{}'::text[]), ' '))) as value
  )
  select case
    when value ~ '\m(global|worldwide|international|multiple)\M' then 'global'
    when value ~ '\m(united states|usa|us|canada|north america)\M' then 'na'
    when value ~ '\m(latin america|latam|caribbean|south america|central america|brazil|mexico|argentina|chile|colombia|peru|uruguay)\M' then 'latam'
    when value ~ '\m(gcc|gulf|middle east|mena|uae|emirates|saudi|qatar|bahrain|oman|kuwait)\M' then 'gcc'
    when value ~ '\m(africa|nigeria|kenya|ghana|egypt|morocco|tanzania|uganda|ethiopia|rwanda|senegal|south africa)\M' then 'afr'
    when value ~ '\m(europe|european|united kingdom|uk|germany|france|sepa|eu|italy|spain|netherlands|switzerland|ireland|sweden|poland)\M' then 'europe'
    when value ~ '\m(apac|asia|pacific|singapore|india|japan|china|australia|new zealand|malaysia|thailand|indonesia|philippines|hong kong|korea|vietnam|pakistan|bangladesh|sri lanka|maldives)\M' then 'apac'
    else 'unclassified'
  end from input
$$;

-- Write-time classification storage. PostgreSQL maintains stored generated columns
-- on every insert and update, so they can never drift from the authoritative rows.
alter table public.global_announcements
  add column if not exists gpir_m40_topic_mask bigint
    generated always as (public.gpir_m40_topic_mask(topic_headers)) stored;
alter table public.global_announcements
  add column if not exists gpir_m40_theme_mask integer
    generated always as (public.gpir_m40_theme_mask(public.gpir_m40_topic_mask(topic_headers), topic_headers, title, summary_narration)) stored;

-- Covering partial indexes: aggregate and pagination scans run as index-only scans
-- over approved, published rows without touching wide heap tuples.
create index if not exists idx_m40_announcements_time_classified
  on public.global_announcements (published_at desc, id)
  include (source_id, topic_headers, gpir_m40_topic_mask, gpir_m40_theme_mask)
  where publication_status = 'approved' and published_at is not null;

create index if not exists idx_m40_announcements_id_classified
  on public.global_announcements (id)
  include (published_at, source_id, topic_headers, gpir_m40_topic_mask, gpir_m40_theme_mask)
  where publication_status = 'approved' and published_at is not null;

create index if not exists idx_m40_intelligence_topics_announcement_geography
  on public.gpir_intelligence_topics (announcement_id, id)
  include (geography);

create index if not exists idx_m40_intelligence_topics_geography
  on public.gpir_intelligence_topics (geography);

-- Retain the earlier seven-argument M40 draft as a compatibility overload. The Edge
-- function calls only this ten-argument contract, so no dependency needs to be dropped.
create or replace function public.gpir_m40_repository_query_v2(
  p_kind text default 'announcements',
  p_topics text[] default null,
  p_themes text[] default null,
  p_categories text[] default null,
  p_region text default null,
  p_query text default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
set work_mem = '64MB'
as $$
declare
  v_result jsonb;
  v_total integer;
  v_records jsonb;
  v_topic_filter bigint;
  v_theme_filter integer;
  v_topics constant text[] := array['regulatory','licences','cross-border','real-time','infrastructure','remittances','wallets','aml','fraud','cbdc','stablecoins','deals','payments','fintech','global-regional-fintech','pass','taas','saas','caas','baas','pobo','cobo','global-aggregators','regional-aggregators','payments-licensing','fintech-licensing','corporate-payments','diaspora-payments','immigrant-payments','migrant-movements','money-movements','super-apps','bnpl','apm','cards-money-movements','payment-gateways'];
  v_themes constant text[] := array['cross-border','real-time','infrastructure','ai','agentic','web3','aml','fraud','regulatory','cbdc','wallets','partnerships'];
begin
  if p_kind not in ('announcements','statistics') or p_limit not between 1 and 100
     or p_offset not between 0 and 1000000
     or (p_start is not null and p_end is not null and p_start >= p_end)
     or (p_topics is not null and (cardinality(p_topics) > 24 or not p_topics <@ v_topics))
     or (p_themes is not null and (cardinality(p_themes) > 12 or not p_themes <@ v_themes))
     or (p_categories is not null and (cardinality(p_categories) > 24 or exists(select 1 from unnest(p_categories) v where nullif(btrim(v),'') is null or length(v) > 120)))
     or (p_region is not null and p_region not in ('global','apac','europe','americas','mea','na','latam','gcc','afr','unclassified'))
     or (p_query is not null and (nullif(btrim(p_query),'') is null or length(p_query) > 120)) then
    raise exception 'INVALID_QUERY_PARAMETERS' using errcode = '22023';
  end if;

  if p_kind = 'announcements' then
    v_topic_filter := case when p_topics is null then null else
      (select coalesce(bit_or(1::bigint << d.bit_position), 0) from public.gpir_m40_topic_dictionary() d where d.topic_id = any(p_topics)) end;
    v_theme_filter := case when p_themes is null then null else
      (select coalesce(bit_or(1 << d.bit_position), 0) from public.gpir_m40_theme_dictionary() d where d.theme_id = any(p_themes)) end;

    -- Preserve the existing joined-row pagination and geography semantics.
    with page as (
      select a.id, a.published_at, a.source_id, a.topic_headers,
             a.gpir_m40_topic_mask as topic_mask, a.gpir_m40_theme_mask as theme_mask,
             coalesce(t.geography, 'UNSPECIFIED') as geography
      from public.global_announcements a
      join public.source_registry s on s.source_id = a.source_id and s.source_status = 'GREEN'
      left join public.gpir_intelligence_topics t on t.announcement_id = a.id
      where a.publication_status = 'approved' and a.published_at is not null
        and (p_start is null or a.published_at >= p_start)
        and (p_end is null or a.published_at < p_end)
        and (v_topic_filter is null or (a.gpir_m40_topic_mask & v_topic_filter) <> 0)
        and (v_theme_filter is null or (a.gpir_m40_theme_mask & v_theme_filter) <> 0)
        and (p_categories is null or coalesce(a.topic_headers[1], 'Payments') = any(p_categories))
        and (p_query is null or a.id in (
          select qa.id from public.global_announcements qa
          where concat_ws(' ', qa.title, qa.summary_narration, coalesce(qa.topic_headers[1], 'Payments')) ilike '%' || p_query || '%'))
        and (p_region is null
             or public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) = p_region
             or (p_region = 'americas' and public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) in ('na','latam'))
             or (p_region = 'mea' and public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) in ('gcc','afr')))
      order by a.published_at desc, a.id
      limit p_limit offset p_offset
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc, x.id), '[]'::jsonb)
    into v_records
    from (
      select p.id, a.title, a.summary_narration as summary, a.canonical_url, p.source_id,
             s.source_name, s.trust_tier, p.published_at, p.topic_headers,
             coalesce(p.topic_headers[1], 'Payments') as category, s.country, s.region_tags,
             p.geography,
             public.gpir_m40_region_key(p.geography, s.country, s.region_tags) as region_key,
             public.gpir_m40_topic_names(p.topic_mask) as topic_ids,
             public.gpir_m40_theme_names(p.theme_mask) as theme_ids,
             public.gpir_m40_primary_theme(p.theme_mask) as primary_theme
      from page p
      join public.global_announcements a on a.id = p.id
      join public.source_registry s on s.source_id = p.source_id
    ) x;

      -- Every page carries the same exact aggregate breakdowns.
      with base as (
        select a.id, a.published_at, a.source_id,
               coalesce(a.topic_headers[1], 'Payments') as category,
               a.gpir_m40_topic_mask as topic_mask, a.gpir_m40_theme_mask as theme_mask
        from public.global_announcements a
        where a.publication_status = 'approved' and a.published_at is not null
          and (p_start is null or a.published_at >= p_start)
          and (p_end is null or a.published_at < p_end)
          and (v_topic_filter is null or (a.gpir_m40_topic_mask & v_topic_filter) <> 0)
          and (v_theme_filter is null or (a.gpir_m40_theme_mask & v_theme_filter) <> 0)
          and (p_categories is null or coalesce(a.topic_headers[1], 'Payments') = any(p_categories))
          and (p_query is null or a.id in (
            select qa.id from public.global_announcements qa
            where concat_ws(' ', qa.title, qa.summary_narration, coalesce(qa.topic_headers[1], 'Payments')) ilike '%' || p_query || '%'))
      -- Reduce joined rows before region lookup without losing joined-row counts.
      ), grouped as materialized (
        select b.published_at::date as day, b.category, b.topic_mask, b.theme_mask,
               coalesce(g.geography, 'UNSPECIFIED') as geography,
               coalesce(s.country, '') as country, coalesce(s.region_tags, '{}'::text[]) as region_tags,
               count(*) as n
        from base b
        join public.source_registry s on s.source_id = b.source_id and s.source_status = 'GREEN'
        left join public.gpir_intelligence_topics g on g.announcement_id = b.id
        group by 1, 2, 3, 4, 5, 6, 7
      ), region_keys as materialized (
        select distinct geography, country, region_tags from grouped
      ), region_lookup as materialized (
        select geography, country, region_tags,
               public.gpir_m40_region_key(geography, nullif(country, ''), region_tags) as region_key
        from region_keys
      ), classified_keys as materialized (
        select b.day, b.category, b.topic_mask, b.theme_mask, b.n, r.region_key
        from grouped b
        join region_lookup r on r.geography = b.geography
                            and r.country = b.country
                            and r.region_tags = b.region_tags
      ), classified as (
        select b.day, b.category, b.topic_mask, b.theme_mask, b.region_key, b.n
        from classified_keys b
        where (p_region is null or b.region_key = p_region
               or (p_region = 'americas' and b.region_key in ('na','latam'))
               or (p_region = 'mea' and b.region_key in ('gcc','afr')))
      ), rollup as materialized (
        select c.day, c.category, c.region_key,
               c.topic_mask, c.theme_mask, sum(c.n) as n
        from classified c
        group by grouping sets ((c.day, c.theme_mask),
                                (c.category, c.region_key, c.topic_mask, c.theme_mask))
      ), day_rollup as (
        select day, theme_mask, n from rollup where day is not null
      ), dim_rollup as (
        select category, region_key, topic_mask, theme_mask, n from rollup where day is null
      ), daily_theme_counts as materialized (
        select r.day, d.theme_id, sum(r.n)::integer as n
        from day_rollup r
        join public.gpir_m40_theme_dictionary() d on r.theme_mask & (1 << d.bit_position) <> 0
        group by r.day, d.theme_id
      )
      select jsonb_build_object('status','OK','kind','announcements',
        'total',coalesce((select sum(n) from dim_rollup),0)::integer,
        'categories',coalesce((select jsonb_object_agg(category,n order by category) from (
          select category,sum(n)::integer n from dim_rollup group by category) x),'{}'::jsonb),
        'topics',coalesce((select jsonb_object_agg(topic_id,n order by topic_id) from (
          select d.topic_id,sum(r.n)::integer n from dim_rollup r
          join public.gpir_m40_topic_dictionary() d on r.topic_mask & (1::bigint << d.bit_position) <> 0
          group by d.topic_id) x),'{}'::jsonb),
        'themes',coalesce((select jsonb_object_agg(theme_id,n order by theme_id) from (
          select d.theme_id,sum(r.n)::integer n from dim_rollup r
          join public.gpir_m40_theme_dictionary() d on r.theme_mask & (1 << d.bit_position) <> 0
          group by d.theme_id) x),'{}'::jsonb),
        'primaryThemes',coalesce((select jsonb_object_agg(primary_theme,n order by primary_theme) from (
          select public.gpir_m40_primary_theme(theme_mask) primary_theme,sum(n)::integer n
          from dim_rollup group by 1) x),'{}'::jsonb),
        'regions',coalesce((select jsonb_object_agg(region_key,n order by region_key) from (
          select region_key,sum(n)::integer n from dim_rollup group by region_key) x),'{}'::jsonb),
        'daily',coalesce((select jsonb_object_agg(bucket,n order by bucket) from (
          select day::text bucket,sum(n)::integer n from day_rollup group by 1) x),'{}'::jsonb),
        'weekly',coalesce((select jsonb_object_agg(bucket,n order by bucket) from (
          select date_trunc('week',day)::date::text bucket,sum(n)::integer n from day_rollup group by 1) x),'{}'::jsonb),
        'monthly',coalesce((select jsonb_object_agg(bucket,n order by bucket) from (
          select to_char(day,'YYYY-MM') bucket,sum(n)::integer n from day_rollup group by 1) x),'{}'::jsonb),
        'dailyThemes',coalesce((select jsonb_object_agg(bucket,theme_counts order by bucket) from (
          select bucket,jsonb_object_agg(theme_id,n order by theme_id) theme_counts from (
            select day::text bucket,theme_id,n from daily_theme_counts
          ) i group by bucket) x),'{}'::jsonb),
        'weeklyThemes',coalesce((select jsonb_object_agg(bucket,theme_counts order by bucket) from (
          select bucket,jsonb_object_agg(theme_id,n order by theme_id) theme_counts from (
            select date_trunc('week',day)::date::text bucket,theme_id,sum(n)::integer n from daily_theme_counts
            group by 1,2) i group by bucket) x),'{}'::jsonb),
        'regionThemes',coalesce((select jsonb_object_agg(region_key,theme_counts order by region_key) from (
          select region_key,jsonb_object_agg(theme_id,n order by theme_id) theme_counts from (
            select r.region_key,d.theme_id,sum(r.n)::integer n from dim_rollup r
            join public.gpir_m40_theme_dictionary() d on r.theme_mask & (1 << d.bit_position) <> 0
            group by 1,2) i group by region_key) x),'{}'::jsonb),
        'unmapped',coalesce((select sum(n) from dim_rollup where topic_mask = 0),0)::integer)
      into v_result;
      v_total := (v_result->>'total')::integer;

    v_result := v_result || jsonb_build_object('limit',p_limit,'offset',p_offset,
      'hasMore',p_offset + p_limit < v_total,
      'nextOffset',case when p_offset + p_limit < v_total then p_offset + p_limit else null end,
      'records',v_records);
  else
    with eligible as materialized (
      select i.id,i.source_id,i.raw_title as title,i.canonical_url,
             i.metadata->>'provider' as provider,i.metadata->>'record_type' as record_type,
             coalesce(i.metadata->>'topic','Payments') as category,
             public.gpir_m40_topic_ids(array[coalesce(i.metadata->>'topic','Payments')]) as topic_ids,
             coalesce(i.metadata->>'source_region','UNSPECIFIED') as geography,
             public.gpir_m40_region_key(i.metadata->>'source_region',i.metadata->>'country','{}'::text[]) as region_key,
             (i.metadata->>'observation_date')::date as observation_date
      from public.intelligence_raw_ingestion i
      join public.source_registry s on s.source_id=i.source_id
      where i.ingestion_status='PROCESSED' and s.source_status='GREEN' and s.trust_tier in ('T1','T2')
        and i.metadata->>'data_class'='STATISTICAL_REFERENCE'
        and i.metadata->>'publication_eligible'='false' and i.metadata->>'alert_eligible'='false'
        and i.metadata->>'observation_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (p_start is null or (i.metadata->>'observation_date')::date >= p_start::date)
        and (p_end is null or (i.metadata->>'observation_date')::date < p_end::date)
        and (p_categories is null or coalesce(i.metadata->>'topic','Payments')=any(p_categories))
        and (p_query is null or concat_ws(' ',i.raw_title,i.metadata->>'topic') ilike '%' || p_query || '%')
    ), filtered as materialized (
      select *,public.gpir_m40_theme_ids(topic_ids,array[category],title,null) theme_ids from eligible
    ), final as materialized (
      select * from filtered where (p_topics is null or topic_ids && p_topics)
        and (p_themes is null or theme_ids && p_themes)
        and (p_region is null or region_key=p_region
             or (p_region='americas' and region_key in ('na','latam'))
             or (p_region='mea' and region_key in ('gcc','afr')))
    ), aggregate as (
      select count(*)::integer total,
        coalesce((select jsonb_object_agg(category,n order by category) from (select category,count(*)::integer n from final group by category)x),'{}'::jsonb) categories,
        coalesce((select jsonb_object_agg(topic,n order by topic) from (select topic,count(*)::integer n from final e cross join lateral unnest(e.topic_ids) topic group by topic)x),'{}'::jsonb) topics,
        coalesce((select jsonb_object_agg(theme,n order by theme) from (select theme,count(*)::integer n from final e cross join lateral unnest(e.theme_ids) theme group by theme)x),'{}'::jsonb) themes,
        coalesce((select jsonb_object_agg(region_key,n order by region_key) from (select region_key,count(*)::integer n from final group by region_key)x),'{}'::jsonb) regions,
        coalesce((select jsonb_object_agg(bucket,n order by bucket) from (select observation_date::text bucket,count(*)::integer n from final group by 1)x),'{}'::jsonb) daily,
        coalesce((select jsonb_object_agg(bucket,n order by bucket) from (select date_trunc('week',observation_date)::date::text bucket,count(*)::integer n from final group by 1)x),'{}'::jsonb) weekly,
        coalesce((select jsonb_object_agg(bucket,n order by bucket) from (select to_char(observation_date,'YYYY-MM') bucket,count(*)::integer n from final group by 1)x),'{}'::jsonb) monthly
      from final
    )
    select jsonb_build_object('status','OK','kind','statistics','total',agg.total,
      'categories',agg.categories,'topics',agg.topics,'themes',agg.themes,'regions',agg.regions,
      'daily',agg.daily,'weekly',agg.weekly,'monthly',agg.monthly,
      'primaryThemes','{}'::jsonb,'dailyThemes','{}'::jsonb,'weeklyThemes','{}'::jsonb,
      'regionThemes','{}'::jsonb,'unmapped',0,'limit',p_limit,'offset',p_offset,
      'hasMore',p_offset+p_limit<agg.total,
      'nextOffset',case when p_offset+p_limit<agg.total then p_offset+p_limit else null end,
      'records',coalesce((select jsonb_agg(to_jsonb(x) order by x.observation_date desc,x.id) from (
        select id,source_id,title,canonical_url,provider,record_type,category,topic_ids,
               theme_ids,geography,region_key,observation_date
        from final order by observation_date desc,id limit p_limit offset p_offset
      )x),'[]'::jsonb))
    into v_result from aggregate agg;
  end if;
  return v_result;
end $$;

revoke all on function public.gpir_m40_topic_dictionary() from public,anon,authenticated;
revoke all on function public.gpir_m40_theme_dictionary() from public,anon,authenticated;
revoke all on function public.gpir_m40_topic_ids(text[]) from public,anon,authenticated;
revoke all on function public.gpir_m40_theme_ids(text[],text[],text,text) from public,anon,authenticated;
revoke all on function public.gpir_m40_region_key(text,text,text[]) from public,anon,authenticated;
revoke all on function public.gpir_m40_topic_mask(text[]) from public,anon,authenticated;
revoke all on function public.gpir_m40_theme_mask(bigint,text[],text,text) from public,anon,authenticated;
revoke all on function public.gpir_m40_topic_mask_of_ids(text[]) from public,anon,authenticated;
revoke all on function public.gpir_m40_topic_names(bigint) from public,anon,authenticated;
revoke all on function public.gpir_m40_theme_names(integer) from public,anon,authenticated;
revoke all on function public.gpir_m40_primary_theme(integer) from public,anon,authenticated;
revoke all on function public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.gpir_m40_topic_dictionary() to service_role;
grant execute on function public.gpir_m40_theme_dictionary() to service_role;
grant execute on function public.gpir_m40_topic_ids(text[]) to service_role;
grant execute on function public.gpir_m40_theme_ids(text[],text[],text,text) to service_role;
grant execute on function public.gpir_m40_region_key(text,text,text[]) to service_role;
grant execute on function public.gpir_m40_topic_mask(text[]) to service_role;
grant execute on function public.gpir_m40_theme_mask(bigint,text[],text,text) to service_role;
grant execute on function public.gpir_m40_topic_mask_of_ids(text[]) to service_role;
grant execute on function public.gpir_m40_topic_names(bigint) to service_role;
grant execute on function public.gpir_m40_theme_names(integer) to service_role;
grant execute on function public.gpir_m40_primary_theme(integer) to service_role;
grant execute on function public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer) to service_role;

-- The production advisor reports the source_id foreign key as unindexed. This partial
-- covering index also supplies the approved/public timestamp scan and stable page order.
create index if not exists idx_m40_announcements_approved_time_source
  on public.global_announcements (published_at desc,id,source_id)
  where publication_status='approved' and published_at is not null;


-- Bounded records-only path: no repository-wide rollup for historical page requests.
-- This does not replace the exact aggregate RPC and preserves offset/order semantics.
create or replace function public.gpir_m40_repository_records_v1(
  p_kind text default 'announcements',
  p_topics text[] default null,
  p_themes text[] default null,
  p_categories text[] default null,
  p_region text default null,
  p_query text default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
set work_mem = '64MB'
as $$
declare
  v_records jsonb;
  v_topic_filter bigint;
  v_theme_filter integer;
  v_topics constant text[] := array['regulatory','licences','cross-border','real-time','infrastructure','remittances','wallets','aml','fraud','cbdc','stablecoins','deals','payments','fintech','global-regional-fintech','pass','taas','saas','caas','baas','pobo','cobo','global-aggregators','regional-aggregators','payments-licensing','fintech-licensing','corporate-payments','diaspora-payments','immigrant-payments','migrant-movements','money-movements','super-apps','bnpl','apm','cards-money-movements','payment-gateways'];
  v_themes constant text[] := array['cross-border','real-time','infrastructure','ai','agentic','web3','aml','fraud','regulatory','cbdc','wallets','partnerships'];
begin
  if p_kind <> 'announcements' or p_limit not between 1 and 100
     or p_offset not between 0 and 1000000
     or (p_start is not null and p_end is not null and p_start >= p_end)
     or (p_topics is not null and (cardinality(p_topics) > 24 or not p_topics <@ v_topics))
     or (p_themes is not null and (cardinality(p_themes) > 12 or not p_themes <@ v_themes))
     or (p_categories is not null and (cardinality(p_categories) > 24 or exists(select 1 from unnest(p_categories) v where nullif(btrim(v),'') is null or length(v) > 120)))
     or (p_region is not null and p_region not in ('global','apac','europe','americas','mea','na','latam','gcc','afr','unclassified'))
     or (p_query is not null and (nullif(btrim(p_query),'') is null or length(p_query) > 120)) then
    raise exception 'INVALID_QUERY_PARAMETERS' using errcode = '22023';
  end if;
  v_topic_filter := case when p_topics is null then null else
    (select coalesce(bit_or(1::bigint << d.bit_position), 0) from public.gpir_m40_topic_dictionary() d where d.topic_id = any(p_topics)) end;
  v_theme_filter := case when p_themes is null then null else
    (select coalesce(bit_or(1 << d.bit_position), 0) from public.gpir_m40_theme_dictionary() d where d.theme_id = any(p_themes)) end;
    with page as (
      select a.id, a.published_at, a.source_id, a.topic_headers,
             a.gpir_m40_topic_mask as topic_mask, a.gpir_m40_theme_mask as theme_mask,
             coalesce(t.geography, 'UNSPECIFIED') as geography
      from public.global_announcements a
      join public.source_registry s on s.source_id = a.source_id and s.source_status = 'GREEN'
      left join public.gpir_intelligence_topics t on t.announcement_id = a.id
      where a.publication_status = 'approved' and a.published_at is not null
        and (p_start is null or a.published_at >= p_start)
        and (p_end is null or a.published_at < p_end)
        and (v_topic_filter is null or (a.gpir_m40_topic_mask & v_topic_filter) <> 0)
        and (v_theme_filter is null or (a.gpir_m40_theme_mask & v_theme_filter) <> 0)
        and (p_categories is null or coalesce(a.topic_headers[1], 'Payments') = any(p_categories))
        and (p_query is null or a.id in (
          select qa.id from public.global_announcements qa
          where concat_ws(' ', qa.title, qa.summary_narration, coalesce(qa.topic_headers[1], 'Payments')) ilike '%' || p_query || '%'))
        and (p_region is null
             or public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) = p_region
             or (p_region = 'americas' and public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) in ('na','latam'))
             or (p_region = 'mea' and public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) in ('gcc','afr')))
      order by a.published_at desc, a.id
      limit p_limit offset p_offset
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc, x.id), '[]'::jsonb)
    into v_records
    from (
      select p.id, a.title, a.summary_narration as summary, a.canonical_url, p.source_id,
             s.source_name, s.trust_tier, p.published_at, p.topic_headers,
             coalesce(p.topic_headers[1], 'Payments') as category, s.country, s.region_tags,
             p.geography,
             public.gpir_m40_region_key(p.geography, s.country, s.region_tags) as region_key,
             public.gpir_m40_topic_names(p.topic_mask) as topic_ids,
             public.gpir_m40_theme_names(p.theme_mask) as theme_ids,
             public.gpir_m40_primary_theme(p.theme_mask) as primary_theme
      from page p
      join public.global_announcements a on a.id = p.id
      join public.source_registry s on s.source_id = p.source_id
    ) x;

  return jsonb_build_object('status','OK','kind','announcements','limit',p_limit,'offset',p_offset,
    'records',v_records,'hasMore',jsonb_array_length(v_records) = p_limit);
end $$;

revoke all on function public.gpir_m40_repository_records_v1(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.gpir_m40_repository_records_v1(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer) to service_role;

-- Indexed keyset continuation: avoids deep OFFSET and repository-wide rollups.
-- This does not replace the exact aggregate RPC and preserves offset/order semantics.
create or replace function public.gpir_m40_repository_cursor_v1(
  p_kind text default 'announcements',
  p_topics text[] default null,
  p_themes text[] default null,
  p_categories text[] default null,
  p_region text default null,
  p_query text default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_limit integer default 25,
  p_after_time timestamptz default null,
  p_after_id uuid default null
) returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
set work_mem = '64MB'
as $$
declare
  v_records jsonb;
  v_topic_filter bigint;
  v_theme_filter integer;
  v_topics constant text[] := array['regulatory','licences','cross-border','real-time','infrastructure','remittances','wallets','aml','fraud','cbdc','stablecoins','deals','payments','fintech','global-regional-fintech','pass','taas','saas','caas','baas','pobo','cobo','global-aggregators','regional-aggregators','payments-licensing','fintech-licensing','corporate-payments','diaspora-payments','immigrant-payments','migrant-movements','money-movements','super-apps','bnpl','apm','cards-money-movements','payment-gateways'];
  v_themes constant text[] := array['cross-border','real-time','infrastructure','ai','agentic','web3','aml','fraud','regulatory','cbdc','wallets','partnerships'];
begin
  if p_kind <> 'announcements' or p_limit not between 1 and 100
     or ((p_after_time is null) <> (p_after_id is null))
     or (p_start is not null and p_end is not null and p_start >= p_end)
     or (p_topics is not null and (cardinality(p_topics) > 24 or not p_topics <@ v_topics))
     or (p_themes is not null and (cardinality(p_themes) > 12 or not p_themes <@ v_themes))
     or (p_categories is not null and (cardinality(p_categories) > 24 or exists(select 1 from unnest(p_categories) v where nullif(btrim(v),'') is null or length(v) > 120)))
     or (p_region is not null and p_region not in ('global','apac','europe','americas','mea','na','latam','gcc','afr','unclassified'))
     or (p_query is not null and (nullif(btrim(p_query),'') is null or length(p_query) > 120)) then
    raise exception 'INVALID_QUERY_PARAMETERS' using errcode = '22023';
  end if;
  v_topic_filter := case when p_topics is null then null else
    (select coalesce(bit_or(1::bigint << d.bit_position), 0) from public.gpir_m40_topic_dictionary() d where d.topic_id = any(p_topics)) end;
  v_theme_filter := case when p_themes is null then null else
    (select coalesce(bit_or(1 << d.bit_position), 0) from public.gpir_m40_theme_dictionary() d where d.theme_id = any(p_themes)) end;
    with page as (
      select a.id, a.published_at, a.source_id, a.topic_headers,
             a.gpir_m40_topic_mask as topic_mask, a.gpir_m40_theme_mask as theme_mask,
             coalesce(t.geography, 'UNSPECIFIED') as geography
      from public.global_announcements a
      join public.source_registry s on s.source_id = a.source_id and s.source_status = 'GREEN'
      left join public.gpir_intelligence_topics t on t.announcement_id = a.id
      where a.publication_status = 'approved' and a.published_at is not null
        and (p_after_time is null or a.published_at < p_after_time or (a.published_at = p_after_time and a.id > p_after_id))
        and (p_start is null or a.published_at >= p_start)
        and (p_end is null or a.published_at < p_end)
        and (v_topic_filter is null or (a.gpir_m40_topic_mask & v_topic_filter) <> 0)
        and (v_theme_filter is null or (a.gpir_m40_theme_mask & v_theme_filter) <> 0)
        and (p_categories is null or coalesce(a.topic_headers[1], 'Payments') = any(p_categories))
        and (p_query is null or a.id in (
          select qa.id from public.global_announcements qa
          where concat_ws(' ', qa.title, qa.summary_narration, coalesce(qa.topic_headers[1], 'Payments')) ilike '%' || p_query || '%'))
        and (p_region is null
             or public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) = p_region
             or (p_region = 'americas' and public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) in ('na','latam'))
             or (p_region = 'mea' and public.gpir_m40_region_key(coalesce(t.geography, 'UNSPECIFIED'), s.country, s.region_tags) in ('gcc','afr')))
      order by a.published_at desc, a.id
      limit p_limit + 1
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc, x.id), '[]'::jsonb)
    into v_records
    from (
      select p.id, a.title, a.summary_narration as summary, a.canonical_url, p.source_id,
             s.source_name, s.trust_tier, p.published_at, p.topic_headers,
             coalesce(p.topic_headers[1], 'Payments') as category, s.country, s.region_tags,
             p.geography,
             public.gpir_m40_region_key(p.geography, s.country, s.region_tags) as region_key,
             public.gpir_m40_topic_names(p.topic_mask) as topic_ids,
             public.gpir_m40_theme_names(p.theme_mask) as theme_ids,
             public.gpir_m40_primary_theme(p.theme_mask) as primary_theme
      from page p
      join public.global_announcements a on a.id = p.id
      join public.source_registry s on s.source_id = p.source_id
    ) x;

  return jsonb_build_object('status','OK','kind','announcements','limit',p_limit,
    'records',coalesce((select jsonb_agg(value order by ord) from jsonb_array_elements(v_records) with ordinality as e(value,ord) where ord <= p_limit),'[]'::jsonb),
    'hasMore',jsonb_array_length(v_records) > p_limit,
    'nextCursor',case when jsonb_array_length(v_records) > p_limit then
      (select jsonb_build_object('publishedAt',value->>'published_at','id',value->>'id')
       from jsonb_array_elements(v_records) with ordinality as e(value,ord) where ord = p_limit)
      else null end);
end $$;

revoke all on function public.gpir_m40_repository_cursor_v1(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.gpir_m40_repository_cursor_v1(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,timestamptz,uuid) to service_role;
