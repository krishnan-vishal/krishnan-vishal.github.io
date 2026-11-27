alter table public.global_announcements add column publication_precision text check (publication_precision in ('EXACT','DATE_ONLY')), add constraint global_announcements_date_only_never_live check (publication_precision is distinct from 'DATE_ONLY' or ticker_eligible is false);

create or replace function public.gpir_publish_validated_candidate(
    p_candidate_id uuid,
    p_summary text,
    p_source_published_at timestamptz,
    p_content_fingerprint text,
    p_validation_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    candidate_record public.intelligence_candidates%rowtype;
    source_status_value text;
    source_trust_tier text;
    required_confidence numeric;
    announcement_identifier uuid;
    live_eligible boolean;
    normalized_summary text := pg_catalog.btrim(coalesce(p_summary, ''));
begin
    if p_candidate_id is null
       or p_source_published_at is null
       or p_content_fingerprint is null
       or p_content_fingerprint !~ '^[0-9a-f]{64}$'
       or pg_catalog.length(normalized_summary) < 120
       or pg_catalog.length(normalized_summary) > 1200 then
        raise exception 'G1_PUBLICATION_INVALID_EVIDENCE';
    end if;

    if coalesce(p_validation_payload ->> 'source_verified', 'false') <> 'true'
       or coalesce(p_validation_payload ->> 'canonical_verified', 'false') <> 'true'
       or (coalesce(p_validation_payload->>'timestamp_verified','false') <> 'true'
        and not coalesce(p_validation_payload->>'publication_precision' = 'DATE_ONLY'
          and p_validation_payload->>'publication_date' =
            to_char(p_source_published_at at time zone 'UTC','YYYY-MM-DD')
          and p_source_published_at = date_trunc('day',p_source_published_at,'UTC'),false))
       or coalesce(p_validation_payload ->> 'content_verified', 'false') <> 'true'
       or coalesce(p_validation_payload ->> 'relevance_verified', 'false') <> 'true'
       or coalesce(p_validation_payload ->> 'summary_grounded', 'false') <> 'true' then
        raise exception 'G1_PUBLICATION_VALIDATION_INCOMPLETE';
    end if;

    select candidate.*
      into candidate_record
      from public.intelligence_candidates candidate
     where candidate.id = p_candidate_id
     for update;

    if not found then raise exception 'G1_CANDIDATE_NOT_FOUND'; end if;
    if candidate_record.candidate_status not in ('PENDING', 'REVIEW', 'VALIDATING') then
        raise exception 'G1_CANDIDATE_STATUS_NOT_PUBLISHABLE';
    end if;
    if candidate_record.canonical_url is null
       or candidate_record.canonical_url !~ '^https://'
       or candidate_record.published_at is null then
        raise exception 'G1_CANDIDATE_CONTRACT_INCOMPLETE';
    end if;
    if pg_catalog.abs(extract(epoch from
        (p_source_published_at - candidate_record.published_at))) > 129600 then
        raise exception 'G1_SOURCE_TIMESTAMP_MISMATCH';
    end if;
    if p_source_published_at > pg_catalog.clock_timestamp() + interval '5 minutes' then
        raise exception 'G1_SOURCE_TIMESTAMP_FUTURE';
    end if;
    if pg_catalog.lower(normalized_summary) = pg_catalog.lower(pg_catalog.btrim(candidate_record.title)) then
        raise exception 'G1_HEADLINE_ONLY_SUMMARY_PROHIBITED';
    end if;

    select source.source_status, source.trust_tier
      into source_status_value, source_trust_tier
      from public.source_registry source
     where source.source_id = candidate_record.source_id;

    required_confidence := case source_trust_tier
        when 'T1' then 70
        when 'T1.5' then 80
        when 'T2' then 90
        else null
    end;
    if source_status_value <> 'GREEN'
       or required_confidence is null
       or candidate_record.confidence_score is null
    or (p_validation_payload->>'publication_precision' = 'DATE_ONLY' and candidate_record.confidence_score < 95)
       or candidate_record.confidence_score < required_confidence then
        raise exception 'G1_AUTO_PUBLICATION_THRESHOLD_NOT_MET';
    end if;

    if exists (
        select 1 from public.global_announcements announcement
         where announcement.canonical_url = candidate_record.canonical_url
    ) or exists (
        select 1 from public.intelligence_publication_audits audit
         where audit.decision = 'PUBLISHED'
           and audit.content_fingerprint = p_content_fingerprint
           and audit.candidate_id <> p_candidate_id
    ) then
        raise exception 'G1_DUPLICATE_PUBLICATION';
    end if;

    live_eligible := coalesce(p_validation_payload->>'publication_precision' = 'EXACT',false)
     and coalesce(p_validation_payload->>'timestamp_verified' = 'true',false)
     and coalesce(candidate_record.confidence_score >= 95,false)
     and p_source_published_at <= pg_catalog.clock_timestamp()
        and p_source_published_at >= pg_catalog.clock_timestamp() - interval '12 hours';

    insert into public.global_announcements (
        source_id, title, summary_narration, canonical_url, published_at,
        ticker_eligible, topic_headers, archive_month_year, url, publication_status, publication_precision
    ) values (
        candidate_record.source_id,
        candidate_record.title,
        normalized_summary,
        candidate_record.canonical_url,
        p_source_published_at,
        live_eligible,
        array[coalesce(candidate_record.category, 'Payments')],
        pg_catalog.to_char(p_source_published_at, 'MM/YYYY'),
        candidate_record.canonical_url,
        'approved', p_validation_payload->>'publication_precision'
    ) returning id into announcement_identifier;

    update public.intelligence_candidates
       set candidate_status = 'APPROVED',
           summary_narration = normalized_summary,
           published_at = p_source_published_at,
           ticker_eligible = live_eligible,
           validation_notes = 'Source, timestamp, content, relevance and canonical URL verified by GPIR-G1-PUBLICATION-1',
           validated_at = pg_catalog.clock_timestamp(),
           content_fingerprint = p_content_fingerprint,
           validation_version = 'GPIR-G1-PUBLICATION-1',
           freshness_status = case when live_eligible then 'RECENT' else 'HISTORICAL' end
     where id = p_candidate_id;

    insert into public.intelligence_publication_audits (
        candidate_id, announcement_id, decision, reason_code, canonical_url,
        content_fingerprint, source_published_at, source_checked_at,
        source_http_status, evidence_excerpt, validation_payload,
        attempted_at, completed_at, updated_at
    ) values (
        p_candidate_id, announcement_identifier, 'PUBLISHED', 'VALIDATED_FOR_PUBLICATION',
        candidate_record.canonical_url, p_content_fingerprint, p_source_published_at,
        pg_catalog.clock_timestamp(),
        case when pg_catalog.jsonb_typeof(p_validation_payload -> 'source_http_status') = 'number'
            then (p_validation_payload ->> 'source_http_status')::integer else null end,
        p_validation_payload ->> 'evidence_excerpt', p_validation_payload,
        pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    )
    on conflict (candidate_id) do update set
        announcement_id = excluded.announcement_id,
        decision = excluded.decision,
        reason_code = excluded.reason_code,
        canonical_url = excluded.canonical_url,
        content_fingerprint = excluded.content_fingerprint,
        source_published_at = excluded.source_published_at,
        source_checked_at = excluded.source_checked_at,
        source_http_status = excluded.source_http_status,
        evidence_excerpt = excluded.evidence_excerpt,
        validation_payload = excluded.validation_payload,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at;

    return announcement_identifier;
end
$function$;

create or replace function public.gpir_publish_consolidated_candidate(
 p_candidate_id uuid, p_summary text, p_source_published_at timestamptz,
 p_content_fingerprint text, p_validation_payload jsonb, p_event_key text,
 p_issuer text, p_event_type text, p_subject text, p_event_date date,
 p_geography text, p_keywords text[], p_outcome_status text
) returns uuid language plpgsql security invoker set search_path = pg_catalog as $function$
declare
 c public.intelligence_candidates%rowtype;
 s public.source_registry%rowtype;
 t public.gpir_intelligence_topics%rowtype;
 required_confidence numeric;
 announcement_identifier uuid;
 development_identifier uuid;
begin
 if p_event_key is null or p_event_key !~ '^[0-9a-f]{64}$'
    or length(btrim(coalesce(p_subject,''))) < 8
    or length(btrim(coalesce(p_summary,''))) < 120
    or length(btrim(coalesce(p_summary,''))) > 1200
    or p_content_fingerprint is null or p_content_fingerprint !~ '^[0-9a-f]{64}$'
    or p_event_date is null or p_source_published_at is null
    or p_outcome_status is null or p_outcome_status not in ('PENDING','ANNOUNCED','CONFIRMED')
    or coalesce(p_validation_payload->>'source_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'canonical_verified','false') <> 'true'
    or (coalesce(p_validation_payload->>'timestamp_verified','false') <> 'true'
        and not coalesce(p_validation_payload->>'publication_precision' = 'DATE_ONLY'
          and p_validation_payload->>'publication_date' =
            to_char(p_source_published_at at time zone 'UTC','YYYY-MM-DD')
          and p_source_published_at = date_trunc('day',p_source_published_at,'UTC'),false))
    or coalesce(p_validation_payload->>'content_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'relevance_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'summary_grounded','false') <> 'true'
 then raise exception 'G1_R07_INVALID_EVIDENCE'; end if;

 select * into c from public.intelligence_candidates where id=p_candidate_id for update;
 if not found or c.candidate_status not in ('PENDING','REVIEW','VALIDATING')
 then raise exception 'G1_R07_INVALID_CANDIDATE'; end if;
 select * into s from public.source_registry where source_id=c.source_id;
 required_confidence := case s.trust_tier when 'T1' then 70 when 'T1.5' then 80 when 'T2' then 90 else null end;
 if s.source_status is distinct from 'GREEN' or required_confidence is null
    or c.confidence_score is null
    or (p_validation_payload->>'publication_precision' = 'DATE_ONLY' and c.confidence_score < 95) or c.confidence_score < required_confidence
    or c.canonical_url is null or c.canonical_url !~ '^https://'
    or c.published_at is null or abs(extract(epoch from (p_source_published_at-c.published_at))) > 129600
    or p_source_published_at > clock_timestamp() + interval '5 minutes'
 then raise exception 'G1_R07_SOURCE_NOT_ELIGIBLE'; end if;
 if exists (select 1 from public.intelligence_publication_audits a
            where a.candidate_id=c.id and a.decision='PUBLISHED')
 then raise exception 'G1_R07_ALREADY_PUBLISHED'; end if;
 if exists (select 1 from public.intelligence_publication_audits a
            where a.decision='PUBLISHED' and a.content_fingerprint=p_content_fingerprint and a.candidate_id<>c.id)
 then raise exception 'G1_R07_DUPLICATE_CONTENT'; end if;

 -- The caller supplies a conservative topic key; only matching keys auto-group.
 -- Locking makes same-key publication and source attachment atomic.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_key,0));
 select * into t from public.gpir_intelligence_topics where topic_key=p_event_key for update;
 if not found then
   announcement_identifier := public.gpir_publish_validated_candidate(
     p_candidate_id,p_summary,p_source_published_at,p_content_fingerprint,p_validation_payload);
   insert into public.gpir_intelligence_topics(topic_key,subject,announcement_id,keywords,geography,outcome_status)
   values(p_event_key,p_subject,announcement_identifier,coalesce(p_keywords,'{}'),
     coalesce(p_geography,'UNSPECIFIED'),p_outcome_status) returning * into t;
 else
   -- A corroborating report is not a second publication; keep its own evidence and date.
   if exists(select 1 from public.gpir_intelligence_topic_sources where canonical_url=c.canonical_url)
   then raise exception 'G1_R07_DUPLICATE_SOURCE_URL'; end if;
   -- A different headline or milestone must never be silently attached by a supplied key.
   -- No second publication is allowed until subject-level matching is independently verified.
   if lower(regexp_replace(btrim(c.title),'[^a-zA-Z0-9]+',' ','g')) <>
      lower(regexp_replace(btrim(t.subject),'[^a-zA-Z0-9]+',' ','g'))
   then raise exception 'G1_R07_TOPIC_MATCH_REVIEW_REQUIRED'; end if;
   announcement_identifier := t.announcement_id;
   update public.intelligence_candidates set candidate_status='DUPLICATE',
     ticker_eligible=false,validated_at=clock_timestamp(),
     validation_notes='G1_R07_VALIDATED_SOURCE_ATTACHED'
   where id=c.id;
   insert into public.intelligence_publication_audits(candidate_id,decision,reason_code,canonical_url,
     content_fingerprint,source_published_at,validation_payload,completed_at)
   values(c.id,'DUPLICATE','G1_R07_VALIDATED_SOURCE_ATTACHED',c.canonical_url,
     p_content_fingerprint,p_source_published_at,p_validation_payload,clock_timestamp())
   on conflict(candidate_id) do update set decision=excluded.decision,
     reason_code=excluded.reason_code,validation_payload=excluded.validation_payload,
     completed_at=excluded.completed_at;
 end if;
 insert into public.gpir_intelligence_developments(topic_id,candidate_id,event_type,effective_date,summary,outcome_status)
 values(t.id,c.id,coalesce(nullif(p_event_type,''),'announcement'),p_event_date,p_summary,p_outcome_status)
 returning id into development_identifier;
 insert into public.gpir_intelligence_topic_sources(topic_id,development_id,source_id,canonical_url,
   source_published_at,evidence_excerpt)
 values(t.id,development_identifier,c.source_id,c.canonical_url,p_source_published_at,
   left(coalesce(p_validation_payload->>'evidence_excerpt',''),1000));
 return announcement_identifier;
end
$function$;

create or replace function public.gpir_publish_t3_editorial_candidate(
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
    or (coalesce(p_validation_payload->>'timestamp_verified','false') <> 'true'
        and not coalesce(p_validation_payload->>'publication_precision' = 'DATE_ONLY'
          and p_validation_payload->>'publication_date' =
            to_char(p_source_published_at at time zone 'UTC','YYYY-MM-DD')
          and p_source_published_at = date_trunc('day',p_source_published_at,'UTC'),false))
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
 if p_validation_payload->>'publication_precision' = 'DATE_ONLY'
    and coalesce(c.confidence_score,0) < 95 then
   raise exception 'G1_DATE_ONLY_INSUFFICIENT_CONFIDENCE';
 end if;
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
   live_eligible := coalesce(p_validation_payload->>'publication_precision' = 'EXACT',false)
     and coalesce(p_validation_payload->>'timestamp_verified' = 'true',false)
     and coalesce(c.confidence_score >= 95,false)
     and p_source_published_at <= clock_timestamp()
     and p_source_published_at >= clock_timestamp() - interval '12 hours';
   insert into public.global_announcements (
     source_id, title, summary_narration, canonical_url, published_at,
     ticker_eligible, topic_headers, archive_month_year, url, publication_status, publication_precision
   ) values (
     c.source_id, c.title, normalized_summary, c.canonical_url, p_source_published_at,
     live_eligible, array[coalesce(c.category,'Payments')],
     pg_catalog.to_char(p_source_published_at,'MM/YYYY'), c.canonical_url, 'approved', p_validation_payload->>'publication_precision'
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

create or replace function public.gpir_publish_t3_automatic_candidate(
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
 candidate_host text;
 official_host text;
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
    or (coalesce(p_validation_payload->>'timestamp_verified','false') <> 'true'
        and not coalesce(p_validation_payload->>'publication_precision' = 'DATE_ONLY'
          and p_validation_payload->>'publication_date' =
            to_char(p_source_published_at at time zone 'UTC','YYYY-MM-DD')
          and p_source_published_at = date_trunc('day',p_source_published_at,'UTC'),false))
    or coalesce(p_validation_payload->>'content_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'relevance_verified','false') <> 'true'
    or coalesce(p_validation_payload->>'summary_grounded','false') <> 'true'
    or coalesce(p_validation_payload->>'t3_auto_verified','false') <> 'true'
 then raise exception 'G1_T3_AUTO_INVALID_EVIDENCE'; end if;

 select * into c from public.intelligence_candidates where id=p_candidate_id for update;
 if not found or c.candidate_status not in ('PENDING','REVIEW','VALIDATING')
 then raise exception 'G1_T3_AUTO_INVALID_CANDIDATE'; end if;
 select * into s from public.source_registry where source_id=c.source_id;
 if s.trust_tier is distinct from 'T3' or s.source_status is distinct from 'GREEN'
    or c.confidence_score is null
    or (p_validation_payload->>'publication_precision' = 'DATE_ONLY' and c.confidence_score < 95) or c.confidence_score < 95
    or c.canonical_url is null or c.canonical_url !~ '^https://'
    or s.official_url is null or s.official_url !~ '^https://'
    or c.published_at is null or abs(extract(epoch from (p_source_published_at-c.published_at))) > 129600
    or p_source_published_at > clock_timestamp() + interval '5 minutes'
 then raise exception 'G1_T3_AUTO_SOURCE_NOT_ELIGIBLE'; end if;
 candidate_host := regexp_replace(lower(substring(c.canonical_url from '^https://([^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)')),'^www\.','');
 official_host := regexp_replace(lower(substring(s.official_url from '^https://([^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)')),'^www\.','');
 if candidate_host is null or official_host is null
    or (candidate_host <> official_host and right(candidate_host,length(official_host)+1) <> '.'||official_host)
 then raise exception 'G1_T3_AUTO_SOURCE_DOMAIN_MISMATCH'; end if;
 if lower(btrim(normalized_summary)) = lower(btrim(c.title))
 then raise exception 'G1_T3_AUTO_HEADLINE_ONLY_SUMMARY'; end if;
 if exists (select 1 from public.intelligence_publication_audits a
            where a.candidate_id=c.id and a.decision='PUBLISHED')
 then raise exception 'G1_T3_AUTO_ALREADY_PUBLISHED'; end if;
 if exists (select 1 from public.intelligence_publication_audits a
            where a.decision='PUBLISHED' and a.content_fingerprint=p_content_fingerprint and a.candidate_id<>c.id)
    or exists (select 1 from public.global_announcements g where g.canonical_url=c.canonical_url)
 then raise exception 'G1_T3_AUTO_DUPLICATE_CONTENT'; end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_key,0));
 select * into t from public.gpir_intelligence_topics where topic_key=p_event_key for update;
 if not found then
   live_eligible := coalesce(p_validation_payload->>'publication_precision' = 'EXACT',false)
     and coalesce(p_validation_payload->>'timestamp_verified' = 'true',false)
     and coalesce(c.confidence_score >= 95,false)
     and p_source_published_at <= clock_timestamp()
     and p_source_published_at >= clock_timestamp() - interval '12 hours';
   insert into public.global_announcements (
     source_id, title, summary_narration, canonical_url, published_at,
     ticker_eligible, topic_headers, archive_month_year, url, publication_status, publication_precision
   ) values (
     c.source_id, c.title, normalized_summary, c.canonical_url, p_source_published_at,
     live_eligible, array[coalesce(c.category,'Payments')],
     pg_catalog.to_char(p_source_published_at,'MM/YYYY'), c.canonical_url, 'approved', p_validation_payload->>'publication_precision'
   ) returning id into announcement_identifier;
   update public.intelligence_candidates set candidate_status='APPROVED',
     summary_narration=normalized_summary, published_at=p_source_published_at,
     ticker_eligible=live_eligible,
     validation_notes='Source, canonical URL, timestamp, content and relevance verified; T3 automatic publication profile met',
     validated_at=clock_timestamp(), content_fingerprint=p_content_fingerprint,
     validation_version='GPIR-G1-PUBLICATION-1',
     freshness_status=case when live_eligible then 'RECENT' else 'HISTORICAL' end
   where id=c.id;
   insert into public.intelligence_publication_audits(candidate_id,announcement_id,decision,reason_code,
     canonical_url,content_fingerprint,source_published_at,source_checked_at,evidence_excerpt,
     validation_payload,attempted_at,completed_at,updated_at)
   values(c.id,announcement_identifier,'PUBLISHED','T3_AUTOMATIC_PUBLICATION',c.canonical_url,
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
   then raise exception 'G1_T3_AUTO_DUPLICATE_SOURCE_URL'; end if;
   if lower(regexp_replace(btrim(c.title),'[^a-zA-Z0-9]+',' ','g')) <>
      lower(regexp_replace(btrim(t.subject),'[^a-zA-Z0-9]+',' ','g'))
   then raise exception 'G1_T3_AUTO_TOPIC_MATCH_REVIEW_REQUIRED'; end if;
   announcement_identifier := t.announcement_id;
   update public.intelligence_candidates set candidate_status='DUPLICATE',
     ticker_eligible=false,validated_at=clock_timestamp(),
     validation_notes='G1_T3_AUTO_VALIDATED_SOURCE_ATTACHED'
   where id=c.id;
   insert into public.intelligence_publication_audits(candidate_id,decision,reason_code,canonical_url,
     content_fingerprint,source_published_at,validation_payload,completed_at)
   values(c.id,'DUPLICATE','G1_T3_AUTO_VALIDATED_SOURCE_ATTACHED',c.canonical_url,
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
