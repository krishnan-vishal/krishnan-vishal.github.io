-- M39: governed T3 editorial publication.
-- Additive function only: no table, column, grant on existing objects or existing function changes.
-- T1/T1.5/T2 automation continues to use gpir_publish_consolidated_candidate unchanged, which
-- still rejects T3. This function publishes a T3 candidate only when the service-role publisher
-- supplies fully verified Contentful editorial approval bound to this exact candidate and URL.
-- Requires explicit release approval before application.
create function public.gpir_publish_t3_editorial_candidate(
 p_candidate_id uuid, p_summary text, p_source_published_at timestamptz,
 p_content_fingerprint text, p_validation_payload jsonb, p_event_key text,
 p_issuer text, p_event_type text, p_subject text, p_event_date date,
 p_geography text, p_keywords text[], p_outcome_status text
) returns uuid language plpgsql security invoker set search_path = pg_catalog as $function$
declare
 c public.intelligence_candidates%rowtype;
 s public.source_registry%rowtype;
 t public.gpir_intelligence_topics%rowtype;
 announcement_identifier uuid;
 development_identifier uuid;
 live_eligible boolean;
 normalized_summary text := pg_catalog.btrim(coalesce(p_summary,''));
begin
 if p_event_key is null or p_event_key !~ '^[0-9a-f]{64}$'
    or length(btrim(coalesce(p_subject,''))) < 8
    or length(normalized_summary) < 120 or length(normalized_summary) > 1200
    or p_content_fingerprint is null or p_content_fingerprint !~ '^[0-9a-f]{64}$'
    or p_event_date is null or p_source_published_at is null
    or p_outcome_status is null or p_outcome_status not in ('PENDING','ANNOUNCED','CONFIRMED')
    or coalesce(p_validation_payload->>'source_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'canonical_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'timestamp_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'content_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'relevance_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'summary_grounded','false') <> 'true'
    or coalesce(p_validation_payload->>'editorial_verified','false') <> 'true'
    or length(btrim(coalesce(p_validation_payload->>'editorial_entry_id',''))) = 0
    or coalesce(p_validation_payload->>'editorial_publication_id','') !~ '^VK-GPIR?-[A-Z0-9]+(-[A-Z0-9]+)+$'
    or p_validation_payload->>'editorial_supabase_record_id' is distinct from p_candidate_id::text
 then raise exception 'G1_T3_EDITORIAL_INVALID_EVIDENCE'; end if;

 select * into c from public.intelligence_candidates where id=p_candidate_id for update;
 if not found or c.candidate_status not in ('PENDING','REVIEW','VALIDATING')
 then raise exception 'G1_T3_EDITORIAL_INVALID_CANDIDATE'; end if;
 select * into s from public.source_registry where source_id=c.source_id;
 if s.trust_tier is distinct from 'T3' or s.source_status is distinct from 'GREEN'
    or c.canonical_url is null or c.canonical_url !~ '^https://'
    or p_validation_payload->>'editorial_source_url' is distinct from c.canonical_url
    or c.published_at is null or abs(extract(epoch from (p_source_published_at-c.published_at))) > 129600
    or p_source_published_at > clock_timestamp() + interval '5 minutes'
 then raise exception 'G1_T3_EDITORIAL_SOURCE_NOT_ELIGIBLE'; end if;
 if lower(btrim(normalized_summary)) = lower(btrim(c.title))
 then raise exception 'G1_T3_EDITORIAL_HEADLINE_ONLY_SUMMARY'; end if;
 if exists (select 1 from public.intelligence_publication_audits a
            where a.candidate_id=c.id and a.decision='PUBLISHED')
 then raise exception 'G1_T3_EDITORIAL_ALREADY_PUBLISHED'; end if;
 if exists (select 1 from public.intelligence_publication_audits a
            where a.decision='PUBLISHED' and a.content_fingerprint=p_content_fingerprint and a.candidate_id<>c.id)
    or exists (select 1 from public.global_announcements g where g.canonical_url=c.canonical_url)
 then raise exception 'G1_T3_EDITORIAL_DUPLICATE_CONTENT'; end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_key,0));
 select * into t from public.gpir_intelligence_topics where topic_key=p_event_key for update;
 if not found then
   live_eligible := p_source_published_at <= clock_timestamp()
     and p_source_published_at >= clock_timestamp() - interval '12 hours';
   insert into public.global_announcements (
     source_id, title, summary_narration, canonical_url, published_at,
     ticker_eligible, topic_headers, archive_month_year, url, publication_status
   ) values (
     c.source_id, c.title, normalized_summary, c.canonical_url, p_source_published_at,
     live_eligible, array[coalesce(c.category,'Payments')],
     pg_catalog.to_char(p_source_published_at,'MM/YYYY'), c.canonical_url, 'approved'
   ) returning id into announcement_identifier;
   update public.intelligence_candidates set candidate_status='APPROVED',
     summary_narration=normalized_summary, published_at=p_source_published_at,
     ticker_eligible=live_eligible,
     validation_notes='Source, timestamp, content and relevance verified; T3 editorial approval confirmed in Contentful',
     validated_at=clock_timestamp(), content_fingerprint=p_content_fingerprint,
     validation_version='GPIR-G1-PUBLICATION-1',
     freshness_status=case when live_eligible then 'RECENT' else 'HISTORICAL' end
   where id=c.id;
   insert into public.intelligence_publication_audits(candidate_id,announcement_id,decision,reason_code,
     canonical_url,content_fingerprint,source_published_at,source_checked_at,evidence_excerpt,
     validation_payload,attempted_at,completed_at,updated_at)
   values(c.id,announcement_identifier,'PUBLISHED','T3_EDITORIAL_APPROVED_PUBLICATION',c.canonical_url,
     p_content_fingerprint,p_source_published_at,clock_timestamp(),
     left(coalesce(p_validation_payload->>'evidence_excerpt',''),1000),p_validation_payload,
     clock_timestamp(),clock_timestamp(),clock_timestamp())
   on conflict(candidate_id) do update set announcement_id=excluded.announcement_id,
     decision=excluded.decision,reason_code=excluded.reason_code,canonical_url=excluded.canonical_url,
     content_fingerprint=excluded.content_fingerprint,source_published_at=excluded.source_published_at,
     source_checked_at=excluded.source_checked_at,evidence_excerpt=excluded.evidence_excerpt,
     validation_payload=excluded.validation_payload,completed_at=excluded.completed_at,
     updated_at=excluded.updated_at;
   insert into public.gpir_intelligence_topics(topic_key,subject,announcement_id,keywords,geography,outcome_status)
   values(p_event_key,p_subject,announcement_identifier,coalesce(p_keywords,'{}'),
     coalesce(p_geography,'UNSPECIFIED'),p_outcome_status) returning * into t;
 else
   -- Corroboration attaches only to an identical subject; the original timestamp is never changed.
   if exists(select 1 from public.gpir_intelligence_topic_sources where canonical_url=c.canonical_url)
   then raise exception 'G1_T3_EDITORIAL_DUPLICATE_SOURCE_URL'; end if;
   if lower(regexp_replace(btrim(c.title),'[^a-zA-Z0-9]+',' ','g')) <>
      lower(regexp_replace(btrim(t.subject),'[^a-zA-Z0-9]+',' ','g'))
   then raise exception 'G1_T3_EDITORIAL_TOPIC_MATCH_REVIEW_REQUIRED'; end if;
   announcement_identifier := t.announcement_id;
   update public.intelligence_candidates set candidate_status='DUPLICATE',
     ticker_eligible=false,validated_at=clock_timestamp(),
     validation_notes='G1_T3_EDITORIAL_VALIDATED_SOURCE_ATTACHED'
   where id=c.id;
   insert into public.intelligence_publication_audits(candidate_id,decision,reason_code,canonical_url,
     content_fingerprint,source_published_at,validation_payload,completed_at)
   values(c.id,'DUPLICATE','G1_T3_EDITORIAL_VALIDATED_SOURCE_ATTACHED',c.canonical_url,
     p_content_fingerprint,p_source_published_at,p_validation_payload,clock_timestamp())
   on conflict(candidate_id) do update set decision=excluded.decision,
     reason_code=excluded.reason_code,validation_payload=excluded.validation_payload,
     completed_at=excluded.completed_at;
 end if;
 insert into public.gpir_intelligence_developments(topic_id,candidate_id,event_type,effective_date,summary,outcome_status)
 values(t.id,c.id,coalesce(nullif(p_event_type,''),'announcement'),p_event_date,normalized_summary,p_outcome_status)
 returning id into development_identifier;
 insert into public.gpir_intelligence_topic_sources(topic_id,development_id,source_id,canonical_url,
   source_published_at,evidence_excerpt)
 values(t.id,development_identifier,c.source_id,c.canonical_url,p_source_published_at,
   left(coalesce(p_validation_payload->>'evidence_excerpt',''),1000));
 return announcement_identifier;
end
$function$;
revoke all on function public.gpir_publish_t3_editorial_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
 from public,anon,authenticated;
grant execute on function public.gpir_publish_t3_editorial_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
 to service_role;
