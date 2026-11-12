\set ON_ERROR_STOP on

begin;

insert into public.source_registry(source_id,source_name,official_url,trust_tier,source_status,country,region_tags)
values ('green','Green','https://green.example','T1','GREEN',null,null),
       ('amber','Amber','https://amber.example','T1','AMBER',null,null);

insert into public.global_announcements(id,source_id,title,summary_narration,canonical_url,published_at,topic_headers,publication_status)
values ('00000000-0000-0000-0000-000000000001','green','AI payment','summary','https://example.test/1','2026-01-02 12:00+00',array['Payments'],'approved'),
       ('00000000-0000-0000-0000-000000000002','green','Bank update','summary','https://example.test/2','2026-01-01 12:00+00',array['REGULATION'],'approved'),
       ('00000000-0000-0000-0000-000000000003','amber','Hidden','summary','https://example.test/3','2026-01-03 12:00+00',array['Payments'],'approved'),
       ('00000000-0000-0000-0000-000000000004','green','Review','summary','https://example.test/4','2026-01-03 12:00+00',array['Payments'],'review');

insert into public.gpir_intelligence_topics(announcement_id,geography)
values ('00000000-0000-0000-0000-000000000001','Singapore'),
       ('00000000-0000-0000-0000-000000000001','Germany');

set role service_role;
do $$
declare
  first_page jsonb;
  next_page jsonb;
  regional jsonb;
begin
  first_page := public.gpir_m40_repository_query_v2('announcements',null,null,null,null,null,null,null,1,0);
  next_page := public.gpir_m40_repository_query_v2('announcements',null,null,null,null,null,null,null,1,1);
  regional := public.gpir_m40_repository_query_v2('announcements',null,null,null,'apac',null,null,null,10,0);
  if (first_page->>'total')::integer <> 3
     or first_page->'categories' <> '{"Payments":2,"REGULATION":1}'::jsonb
     or first_page->'topics' <> '{"payments":2,"regulatory":1}'::jsonb
     or first_page->'themes' <> '{"ai":2,"regulatory":1}'::jsonb
     or first_page->'regions' <> '{"apac":1,"europe":1,"unclassified":1}'::jsonb
     or first_page->'daily' <> '{"2026-01-01":1,"2026-01-02":2}'::jsonb
     or first_page->'dailyThemes' <> '{"2026-01-01":{"regulatory":1},"2026-01-02":{"ai":2}}'::jsonb
     or (first_page - array['records','limit','offset','hasMore','nextOffset'])
        <> (next_page - array['records','limit','offset','hasMore','nextOffset'])
     or (regional->>'total')::integer <> 1
     or regional->'records'->0->>'geography' <> 'Singapore'
     or (first_page->>'hasMore')::boolean is not true
     or (next_page->>'nextOffset')::integer <> 2 then
    raise exception 'aggregate, pagination, or geography contract mismatch: first %, next %, regional %',
      first_page, next_page, regional;
  end if;
  if has_function_privilege('anon','public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute')
     or has_function_privilege('authenticated','public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute')
     or not has_function_privilege('service_role','public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute') then
    raise exception 'RPC permissions mismatch';
  end if;
end $$;
reset role;

update public.global_announcements set topic_headers = array['AML CFT'], title = 'Bank update'
where id = '00000000-0000-0000-0000-000000000001';
set role service_role;
do $$
declare result jsonb;
begin
  result := public.gpir_m40_repository_query_v2('announcements',array['aml'],null,null,null,null,null,null,10,0);
  if (result->>'total')::integer <> 2 or result->'topics' <> '{"aml":2}'::jsonb
     or result->'themes' <> '{"aml":2}'::jsonb then
    raise exception 'updated classification mismatch: %', result;
  end if;
end $$;
reset role;
rollback;
