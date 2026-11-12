-- M40 governed server-side repository aggregation. Internal service-role RPC only.
-- No CMS entry is created for individual announcements or statistical observations.
-- The public Edge Function receives only approved announcement metadata and governed
-- aggregates; protected CMS/editorial bodies are never selected by this contract.

create or replace function public.gpir_m40_topic_ids(p_headers text[])
returns text[]
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  with normalized as (
    select distinct lower(regexp_replace(btrim(header), '[^a-zA-Z0-9]+', ' ', 'g')) as value
    from unnest(coalesce(p_headers, '{}'::text[])) header
    where nullif(btrim(header), '') is not null
  ), mapped(topic_id) as (
    select distinct mapping.topic_id
    from normalized n
    join (values
      ('regulatory','regulation'), ('regulatory','regulatory'), ('regulatory','regulatory actions'),
      ('regulatory','central bank'), ('regulatory','monetary policy'),
      ('licences','licences authorisations'), ('licences','licenses authorizations'),
      ('licences','licensing'), ('payments-licensing','payments licensing'),
      ('fintech-licensing','fintech licensing'),
      ('cross-border','cross border payments'), ('cross-border','cross border banking'),
      ('cross-border','correspondent banking'),
      ('real-time','real time payments'), ('real-time','instant payments'), ('real-time','rtp'),
      ('infrastructure','payment infrastructure'), ('infrastructure','payments infrastructure'),
      ('infrastructure','clearing settlement'), ('infrastructure','payment networks'),
      ('remittances','remittances'), ('remittances','remittances diaspora'),
      ('wallets','wallets digital payments'), ('wallets','digital payments'),
      ('aml','aml cft'), ('aml','aml kyc compliance'), ('aml','financial crime'),
      ('fraud','fraud cybersecurity'), ('fraud','fraud'), ('fraud','cybersecurity'),
      ('cbdc','cbdcs digital money'), ('cbdc','digital money'),
      ('stablecoins','stablecoins digital assets'), ('stablecoins','digital assets'),
      ('deals','deals partnerships'), ('deals','partnerships'),
      ('payments','payments'), ('payments','payment services'), ('payments','cashless payments'),
      ('fintech','fintech'), ('fintech','financial technology'),
      ('global-regional-fintech','global regional fintech'),
      ('pass','pass'), ('taas','taas'), ('saas','saas'), ('caas','caas'), ('baas','baas'),
      ('pobo','pobo'), ('cobo','cobo'),
      ('global-aggregators','global aggregators'), ('regional-aggregators','regional aggregators'),
      ('corporate-payments','corporate payments'), ('corporate-payments','b2b payments'),
      ('diaspora-payments','diaspora payments'), ('immigrant-payments','immigrant payments'),
      ('migrant-movements','migrant international movements'),
      ('money-movements','money movements'), ('super-apps','super apps'),
      ('bnpl','bnpl'), ('apm','alternative payment methods apm'),
      ('cards-money-movements','cards money movements'), ('cards-money-movements','merchant acquiring'),
      ('payment-gateways','payment gateways'), ('infrastructure','payment orchestration')
    ) as mapping(topic_id, source_value) on mapping.source_value = n.value
  )
  select coalesce(array_agg(topic_id order by topic_id), '{}'::text[]) from mapped
$$;

create or replace function public.gpir_m40_theme_ids(
  p_topic_ids text[], p_headers text[], p_title text, p_summary text
) returns text[]
language sql immutable parallel safe security invoker
set search_path = public, pg_temp
as $$
  with content as (
    select lower(concat_ws(' ', array_to_string(coalesce(p_headers, '{}'::text[]), ' '),
      coalesce(p_title, ''), coalesce(p_summary, ''))) as value
  ), flags as (
    select array_remove(array[
      case when coalesce(p_topic_ids, '{}'::text[]) && array['cross-border','remittances','diaspora-payments','immigrant-payments'] then 'cross-border' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['real-time'] then 'real-time' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['infrastructure','payment-gateways'] then 'infrastructure' end,
      case when value ~ '\m(payment|payments|settlement|remittance|money movement|money transfer|banking|bank|financial services|card|cards|wallet|wallets|clearing|fintech|merchant|checkout|payout|payouts)\M'
             and value ~ '\m(artificial intelligence|machine learning|generative ai|large language model|large language models|llm|llms|ai powered|ai driven|ai based|ai enabled|ai model|ai models|ai assistant|ai assistants|ai)\M' then 'ai' end,
      case when value ~ '\m(payment|payments|settlement|remittance|money movement|money transfer|banking|bank|financial services|card|cards|wallet|wallets|clearing|fintech|merchant|checkout|payout|payouts)\M'
             and value ~ '\m(agentic|ai agent|ai agents|autonomous agent|autonomous agents|agent to agent|machine payment|machine payments)\M' then 'agentic' end,
      case when value ~ '\m(payment|payments|settlement|remittance|money movement|money transfer|banking|bank|financial services|card|cards|wallet|wallets|clearing|fintech|merchant|checkout|payout|payouts)\M'
             and (value ~ '\m(web3|blockchain|crypto|digital asset|digital assets|distributed ledger|dlt|smart contract|smart contracts|on chain)\M'
                  or coalesce(p_topic_ids, '{}'::text[]) && array['stablecoins']) then 'web3' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['aml'] then 'aml' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['fraud'] then 'fraud' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['regulatory','licences','payments-licensing','fintech-licensing'] then 'regulatory' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['cbdc','stablecoins'] then 'cbdc' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['wallets','super-apps'] then 'wallets' end,
      case when coalesce(p_topic_ids, '{}'::text[]) && array['deals'] then 'partnerships' end
    ], null) as values
    from content
  )
  select coalesce(array(select distinct value from flags, unnest(values) value order by value), '{}'::text[])
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
as $$
declare
  v_result jsonb;
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
    with base as materialized (
      select a.id, a.title, a.canonical_url, a.source_id, a.published_at,
             a.topic_headers, coalesce(a.topic_headers[1],'Payments') as category,
             s.source_name, s.trust_tier, s.country, s.region_tags,
             coalesce(t.geography,'UNSPECIFIED') as geography,
             public.gpir_m40_topic_ids(a.topic_headers) as topic_ids,
             a.summary_narration
      from public.global_announcements a
      join public.source_registry s on s.source_id = a.source_id and s.source_status = 'GREEN'
      left join public.gpir_intelligence_topics t on t.announcement_id = a.id
      where a.publication_status = 'approved' and a.published_at is not null
        and (p_start is null or a.published_at >= p_start)
        and (p_end is null or a.published_at < p_end)
    ), classified as materialized (
      select b.*, public.gpir_m40_theme_ids(b.topic_ids,b.topic_headers,b.title,b.summary_narration) as theme_ids,
             public.gpir_m40_region_key(b.geography,b.country,b.region_tags) as region_key
      from base b
    ), eligible as materialized (
      select *, coalesce((select x from unnest(array['agentic','ai','web3','cbdc','aml','fraud','regulatory','real-time','cross-border','infrastructure','wallets','partnerships']) x where x = any(theme_ids) limit 1),'other') as primary_theme
      from classified
      where (p_topics is null or topic_ids && p_topics)
        and (p_themes is null or theme_ids && p_themes)
        and (p_categories is null or category = any(p_categories))
        and (p_region is null or region_key = p_region
             or (p_region = 'americas' and region_key in ('na','latam'))
             or (p_region = 'mea' and region_key in ('gcc','afr')))
        and (p_query is null or concat_ws(' ',title,summary_narration,category) ilike '%' || p_query || '%')
    ), aggregate as (
      select count(*)::integer as total,
        coalesce((select jsonb_object_agg(category,n order by category) from (select category,count(*)::integer n from eligible group by category) x),'{}'::jsonb) categories,
        coalesce((select jsonb_object_agg(topic,n order by topic) from (select topic,count(*)::integer n from eligible e cross join lateral unnest(e.topic_ids) topic group by topic) x),'{}'::jsonb) topics,
        coalesce((select jsonb_object_agg(theme,n order by theme) from (select theme,count(*)::integer n from eligible e cross join lateral unnest(e.theme_ids) theme group by theme) x),'{}'::jsonb) themes,
        coalesce((select jsonb_object_agg(primary_theme,n order by primary_theme) from (select primary_theme,count(*)::integer n from eligible group by primary_theme) x),'{}'::jsonb) primary_themes,
        coalesce((select jsonb_object_agg(region_key,n order by region_key) from (select region_key,count(*)::integer n from eligible group by region_key) x),'{}'::jsonb) regions,
        coalesce((select jsonb_object_agg(bucket,n order by bucket) from (select published_at::date::text bucket,count(*)::integer n from eligible group by 1) x),'{}'::jsonb) daily,
        coalesce((select jsonb_object_agg(bucket,n order by bucket) from (select date_trunc('week',published_at)::date::text bucket,count(*)::integer n from eligible group by 1) x),'{}'::jsonb) weekly,
        coalesce((select jsonb_object_agg(bucket,n order by bucket) from (select to_char(date_trunc('month',published_at),'YYYY-MM') bucket,count(*)::integer n from eligible group by 1) x),'{}'::jsonb) monthly,
        coalesce((select jsonb_object_agg(bucket,theme_counts order by bucket) from (
          select bucket,jsonb_object_agg(theme,n order by theme) theme_counts from (
            select published_at::date::text bucket,theme,count(*)::integer n from eligible e cross join lateral unnest(e.theme_ids) theme group by 1,2
          ) d group by bucket) x),'{}'::jsonb) daily_themes,
        coalesce((select jsonb_object_agg(bucket,theme_counts order by bucket) from (
          select bucket,jsonb_object_agg(theme,n order by theme) theme_counts from (
            select date_trunc('week',published_at)::date::text bucket,theme,count(*)::integer n from eligible e cross join lateral unnest(e.theme_ids) theme group by 1,2
          ) d group by bucket) x),'{}'::jsonb) weekly_themes,
        coalesce((select jsonb_object_agg(region_key,theme_counts order by region_key) from (
          select region_key,jsonb_object_agg(theme,n order by theme) theme_counts from (
            select region_key,theme,count(*)::integer n from eligible e cross join lateral unnest(e.theme_ids) theme group by 1,2
          ) d group by region_key) x),'{}'::jsonb) region_themes,
        count(*) filter (where cardinality(topic_ids)=0)::integer as unmapped
      from eligible
    )
    select jsonb_build_object('status','OK','kind','announcements','total',agg.total,
      'categories',agg.categories,'topics',agg.topics,'themes',agg.themes,
      'primaryThemes',agg.primary_themes,'regions',agg.regions,'daily',agg.daily,
      'weekly',agg.weekly,'monthly',agg.monthly,'dailyThemes',agg.daily_themes,
      'weeklyThemes',agg.weekly_themes,'regionThemes',agg.region_themes,
      'unmapped',agg.unmapped,'limit',p_limit,'offset',p_offset,
      'hasMore',p_offset + p_limit < agg.total,
      'nextOffset',case when p_offset + p_limit < agg.total then p_offset + p_limit else null end,
      'records',coalesce((select jsonb_agg(to_jsonb(x) order by x.published_at desc,x.id) from (
        select id,title,summary_narration as summary,canonical_url,source_id,source_name,trust_tier,published_at,
               topic_headers,category,country,region_tags,geography,region_key,
               topic_ids,theme_ids,primary_theme
        from eligible order by published_at desc,id limit p_limit offset p_offset
      ) x),'[]'::jsonb))
    into v_result from aggregate agg;
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

revoke all on function public.gpir_m40_topic_ids(text[]) from public,anon,authenticated;
revoke all on function public.gpir_m40_theme_ids(text[],text[],text,text) from public,anon,authenticated;
revoke all on function public.gpir_m40_region_key(text,text,text[]) from public,anon,authenticated;
revoke all on function public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.gpir_m40_topic_ids(text[]) to service_role;
grant execute on function public.gpir_m40_theme_ids(text[],text[],text,text) to service_role;
grant execute on function public.gpir_m40_region_key(text,text,text[]) to service_role;
grant execute on function public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer) to service_role;

-- The production advisor reports the source_id foreign key as unindexed. This partial
-- covering index also supplies the approved/public timestamp scan and stable page order.
create index if not exists idx_m40_announcements_approved_time_source
  on public.global_announcements (published_at desc,id,source_id)
  where publication_status='approved' and published_at is not null;
