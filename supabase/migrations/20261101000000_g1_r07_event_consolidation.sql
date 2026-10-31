-- G1-R07: one canonical topic card, independently validated developments and publishing sources.
-- Additive migration. Requires explicit release approval; no existing G1 function is replaced.
create table public.gpir_intelligence_topics (
 id uuid primary key default gen_random_uuid(),
 topic_key text not null unique check (topic_key ~ '^[0-9a-f]{64}$'),
 subject text not null check (length(btrim(subject)) >= 8),
 announcement_id uuid unique not null references public.global_announcements(id) on delete restrict,
 keywords text[] not null default '{}',
 geography text not null default 'UNSPECIFIED',
 outcome_status text not null default 'PENDING'
   check (outcome_status in ('PENDING','ANNOUNCED','CONFIRMED')),
 created_at timestamptz not null default now()
);
create table public.gpir_intelligence_developments (
 id uuid primary key default gen_random_uuid(),
 topic_id uuid not null references public.gpir_intelligence_topics(id) on delete restrict,
 candidate_id uuid not null unique references public.intelligence_candidates(id) on delete restrict,
 event_type text not null,
 effective_date date not null,
 summary text not null check (length(btrim(summary)) >= 120),
 outcome_status text not null default 'PENDING'
   check (outcome_status in ('PENDING','ANNOUNCED','CONFIRMED')),
 created_at timestamptz not null default now()
);
create table public.gpir_intelligence_topic_sources (
 id uuid primary key default gen_random_uuid(),
 topic_id uuid not null references public.gpir_intelligence_topics(id) on delete restrict,
 development_id uuid not null references public.gpir_intelligence_developments(id) on delete restrict,
 source_id text not null,
 canonical_url text not null unique check (canonical_url ~ '^https://'),
 source_published_at timestamptz not null,
 evidence_excerpt text,
 verified_at timestamptz not null default now()
);
create index on public.gpir_intelligence_developments(topic_id,effective_date);
create index on public.gpir_intelligence_topic_sources(topic_id);
alter table public.gpir_intelligence_topics enable row level security;
alter table public.gpir_intelligence_developments enable row level security;
alter table public.gpir_intelligence_topic_sources enable row level security;
revoke all on public.gpir_intelligence_topics,public.gpir_intelligence_developments,public.gpir_intelligence_topic_sources from public,anon,authenticated;
grant all on public.gpir_intelligence_topics,public.gpir_intelligence_developments,public.gpir_intelligence_topic_sources to service_role;

create function public.gpir_publish_consolidated_candidate(
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
    or coalesce(p_validation_payload->>'timestamp_verified','false') <> 'true'
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
    or c.confidence_score is null or c.confidence_score < required_confidence
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
revoke all on function public.gpir_publish_consolidated_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
 from public,anon,authenticated;
grant execute on function public.gpir_publish_consolidated_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)
 to service_role;
