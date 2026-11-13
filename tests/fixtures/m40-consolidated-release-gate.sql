\set ON_ERROR_STOP on
-- Isolated minimal data only. This file is never applied to production.
insert into public.source_registry(source_id,source_name,official_url,trust_tier,source_status,country,region_tags,category)
values('GATE-SRC','Gate Source','https://gate.example','T1','GREEN','Global',array['Global'],'PAYMENTS');
insert into public.global_announcements(id,source_id,title,summary_narration,canonical_url,published_at,ticker_eligible,topic_headers,publication_status)
values('00000000-0000-4000-8000-000000000001','GATE-SRC','Governed snapshot gate announcement','An isolated governed announcement used only for the M40 release gate.','https://gate.example/one',now(),true,array['Payments'],'approved');
insert into public.gpir_intelligence_topics(announcement_id,keywords,outcome_status,geography)
values('00000000-0000-4000-8000-000000000001',array['payments'],'PUBLISHED','Global');
\i supabase/sql/m40-dashboard-snapshot-poc.sql
\i tests/fixtures/m40-dashboard-snapshot-poc-test.sql
-- Exercise every write invalidation trigger and freshness boundary in rollback-only transaction.
begin;
grant insert,update,delete,truncate on public.global_announcements,public.source_registry,public.gpir_intelligence_topics to service_role;
set local role service_role;
select public.gpir_m40_refresh_dashboard_snapshot_v1();
do $$
declare t text; rev bigint; nextrev bigint;
begin
 for t in select unnest(array['global_announcements','source_registry','gpir_intelligence_topics']) loop
   select revision into rev from public.gpir_m40_dashboard_revision_v1;
   execute format('update public.%I set %I=%I where false',t,
     case when t='global_announcements' then 'title' when t='source_registry' then 'source_name' else 'geography' end,
     case when t='global_announcements' then 'title' when t='source_registry' then 'source_name' else 'geography' end);
   select revision into nextrev from public.gpir_m40_dashboard_revision_v1;
   if nextrev<=rev then raise exception 'INVALIDATION_TRIGGER_NOT_FIRED_%',t; end if;
   if public.gpir_m40_read_dashboard_snapshot_v1(interval '30 seconds') is not null then
     raise exception 'STALE_SNAPSHOT_EXPOSED_%',t; end if;
   perform public.gpir_m40_refresh_dashboard_snapshot_v1();
 end loop;
 update public.gpir_m40_dashboard_snapshot_v1 set refreshed_at=statement_timestamp()-interval '31 seconds';
 if public.gpir_m40_read_dashboard_snapshot_v1(interval '30 seconds') is not null then
   raise exception 'THIRTY_SECOND_EXPIRY_FAILED'; end if;
end $$;
rollback;
