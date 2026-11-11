-- M40 governed server-side repository aggregation. Internal service-role RPC only.
-- No CMS entry is created for individual announcements or statistical observations.
create or replace function public.gpir_m40_repository_query(
  p_kind text default 'announcements',
  p_topic text default null,
  p_region text default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if p_kind not in ('announcements','statistics') or p_limit not between 1 and 100
     or p_offset not between 0 and 1000000 or
     (p_from is not null and p_to is not null and p_from > p_to) then
    raise exception 'INVALID_QUERY_PARAMETERS' using errcode = '22023';
  end if;
  if p_kind = 'announcements' then
    with eligible as (
      select a.id, a.title, a.canonical_url, a.source_id, a.published_at,
             a.topic_headers, coalesce(t.geography,'UNSPECIFIED') as region
      from public.global_announcements a
      left join lateral (
        select t.geography from public.gpir_intelligence_topics t
        where t.announcement_id = a.id order by t.created_at desc limit 1
      ) t on true
      where a.publication_status = 'approved' and a.published_at is not null
        and (p_topic is null or p_topic = any(a.topic_headers))
        and (p_region is null or coalesce(t.geography,'UNSPECIFIED') = p_region)
        and (p_from is null or a.published_at >= p_from::timestamptz)
        and (p_to is null or a.published_at < (p_to + 1)::timestamptz)
    ), aggregates as (
      select count(*) as total,
        coalesce((select jsonb_object_agg(topic,n) from (
          select topic,count(*) n from eligible e cross join lateral unnest(e.topic_headers) topic where topic is not null group by topic
        ) x),'{}'::jsonb) as themes,
        coalesce((select jsonb_object_agg(region,n) from (
          select region,count(*) n from eligible group by region
        ) x),'{}'::jsonb) as regions,
        coalesce((select jsonb_object_agg(bucket,n) from (
          select published_at::date::text bucket,count(*) n from eligible group by 1
        ) x),'{}'::jsonb) as daily
      from eligible
    )
    select jsonb_build_object('status','OK','kind','announcements','total',agg.total,
      'themes',agg.themes,'regions',agg.regions,'daily',agg.daily,
      'limit',p_limit,'offset',p_offset,
      'records',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select id,title,canonical_url,source_id,published_at,topic_headers,region
        from eligible order by published_at desc,id limit p_limit offset p_offset
      ) x),'[]'::jsonb))
    into v_result from aggregates agg;
  else
    with eligible as (
      select i.id,i.source_id,i.raw_title as title,i.canonical_url,
             i.metadata->>'provider' as provider,
             i.metadata->>'record_type' as record_type,
             i.metadata->>'topic' as topic,
             coalesce(i.metadata->>'source_region','UNSPECIFIED') as region,
             (i.metadata->>'observation_date')::date as observation_date
      from public.intelligence_raw_ingestion i
      join public.source_registry s on s.source_id = i.source_id
      where i.ingestion_status = 'PROCESSED'
        and s.source_status = 'GREEN' and s.trust_tier in ('T1','T2')
        and i.metadata->>'data_class' = 'STATISTICAL_REFERENCE'
        and i.metadata->>'publication_eligible' = 'false'
        and i.metadata->>'alert_eligible' = 'false'
        and i.metadata->>'observation_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and (p_topic is null or i.metadata->>'topic' = p_topic)
        and (p_region is null or coalesce(i.metadata->>'source_region','UNSPECIFIED') = p_region)
        and (p_from is null or (i.metadata->>'observation_date')::date >= p_from)
        and (p_to is null or (i.metadata->>'observation_date')::date <= p_to)
    ), aggregates as (
      select count(*) as total,
        coalesce((select jsonb_object_agg(topic,n) from (
          select coalesce(topic,'UNSPECIFIED') topic,count(*) n from eligible group by 1
        ) x),'{}'::jsonb) as themes,
        coalesce((select jsonb_object_agg(region,n) from (
          select region,count(*) n from eligible group by 1
        ) x),'{}'::jsonb) as regions,
        coalesce((select jsonb_object_agg(bucket,n) from (
          select observation_date::text bucket,count(*) n from eligible group by 1
        ) x),'{}'::jsonb) as daily
      from eligible
    )
    select jsonb_build_object('status','OK','kind','statistics','total',agg.total,
      'themes',agg.themes,'regions',agg.regions,'daily',agg.daily,
      'limit',p_limit,'offset',p_offset,
      'records',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select id,source_id,title,canonical_url,provider,record_type,topic,region,observation_date
        from eligible order by observation_date desc nulls last,id limit p_limit offset p_offset
      ) x),'[]'::jsonb))
    into v_result from aggregates agg;
  end if;
  return v_result;
end $$;
revoke all on function public.gpir_m40_repository_query(text,text,text,date,date,integer,integer) from public,anon,authenticated;
grant execute on function public.gpir_m40_repository_query(text,text,text,date,date,integer,integer) to service_role;
