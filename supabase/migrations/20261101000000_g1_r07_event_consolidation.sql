-- G1-R07 additive canonical event attribution. Do not apply before owner release.
create table if not exists public.gpir_intelligence_events (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique check (event_key ~ '^[a-f0-9]{64}$'),
 announcement_id uuid unique references public.global_announcements(id) on delete restrict,
 issuer text not null,
 event_type text not null,
 subject text not null,
 event_date date not null,
 geography text not null,
 outcome_status text not null default 'PENDING' check (outcome_status in ('CONFIRMED','ANNOUNCED','PENDING')),
 keywords text[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.gpir_intelligence_event_sources (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.gpir_intelligence_events(id) on delete restrict,
 source_id text not null,
 canonical_url text not null check (canonical_url ~ '^https://'),
 source_published_at timestamptz not null,
 evidence_excerpt text,
 verified_at timestamptz not null default now(),
 unique (event_id, canonical_url)
);
create unique index if not exists gpir_event_source_unique_url on public.gpir_intelligence_event_sources(canonical_url);
alter table public.gpir_intelligence_events enable row level security;
alter table public.gpir_intelligence_event_sources enable row level security;
revoke all on public.gpir_intelligence_events,public.gpir_intelligence_event_sources from anon,authenticated;
grant all on public.gpir_intelligence_events,public.gpir_intelligence_event_sources to service_role;

-- Serializes competing publishers on the same event key and retains original publication RPC gates.
create or replace function public.gpir_publish_consolidated_candidate(
 p_candidate_id uuid, p_summary text, p_source_published_at timestamptz,
 p_content_fingerprint text, p_validation_payload jsonb, p_event_key text,
 p_issuer text, p_event_type text, p_subject text, p_event_date date,
 p_geography text, p_keywords text[], p_outcome_status text
) returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare existing_event public.gpir_intelligence_events%rowtype;
 announcement_identifier uuid;
 candidate_record public.intelligence_candidates%rowtype;
 source_record public.source_registry%rowtype;
 required_confidence numeric;
begin
 if p_event_key is null or p_event_key !~ '^[a-f0-9]{64}$'
    or length(btrim(coalesce(p_issuer,''))) < 3
    or length(btrim(coalesce(p_subject,''))) < 8
    or p_event_date is null or p_geography is null
    or p_outcome_status not in ('CONFIRMED','ANNOUNCED','PENDING')
    or coalesce(p_validation_payload->>'source_verified','false') <> 'true'
 then raise exception 'G1_R07_EVENT_EVIDENCE_REQUIRED'; end if;
 select * into candidate_record from public.intelligence_candidates where id=p_candidate_id;
 if not found then raise exception 'G1_R07_CANDIDATE_MISSING'; end if;
 select * into source_record from public.source_registry where source_id=candidate_record.source_id;
 required_confidence := case source_record.trust_tier when 'T1' then 70 when 'T1.5' then 80 when 'T2' then 90 else null end;
 if source_record.source_status is distinct from 'GREEN' or required_confidence is null
   or candidate_record.confidence_score < required_confidence
   or candidate_record.candidate_status not in ('PENDING','REVIEW','VALIDATING')
 then raise exception 'G1_R07_SOURCE_NOT_ELIGIBLE'; end if;
 if candidate_record.canonical_url is null or candidate_record.canonical_url !~ '^https://' or
   abs(extract(epoch from (p_source_published_at - candidate_record.published_at))) > 129600
 then raise exception 'G1_R07_SOURCE_INVALID'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_key, 0));
 select * into existing_event from public.gpir_intelligence_events where event_key=p_event_key for update;
 if found then
   -- Only attach independently validated corroborating evidence. Never create a second alert.
   if existing_event.announcement_id is null then raise exception 'G1_R07_EVENT_PENDING_REVIEW'; end if;
   insert into public.gpir_intelligence_event_sources(event_id,source_id,canonical_url,source_published_at,evidence_excerpt)
   values(existing_event.id,candidate_record.source_id,candidate_record.canonical_url,p_source_published_at,
     left(coalesce(p_validation_payload->>'evidence_excerpt',''),1000))
   on conflict (event_id,canonical_url) do nothing;
   update public.intelligence_candidates set candidate_status='DUPLICATE',ticker_eligible=false,
     validation_notes='G1_R07_SOURCE_ATTACHED_TO_CANONICAL_EVENT',validated_at=clock_timestamp()
     where id=p_candidate_id;
   insert into public.intelligence_publication_audits(candidate_id,announcement_id,decision,reason_code,canonical_url,
     content_fingerprint,source_published_at,validation_payload,completed_at)
   values(p_candidate_id,null,'DUPLICATE','G1_R07_SOURCE_ATTACHED',candidate_record.canonical_url,
     p_content_fingerprint,p_source_published_at,p_validation_payload,clock_timestamp())
   on conflict (candidate_id) do update set decision='DUPLICATE',reason_code='G1_R07_SOURCE_ATTACHED',
     completed_at=excluded.completed_at,validation_payload=excluded.validation_payload;
   return existing_event.announcement_id;
 end if;
 announcement_identifier := public.gpir_publish_validated_candidate(p_candidate_id,p_summary,p_source_published_at,
   p_content_fingerprint,p_validation_payload);
 insert into public.gpir_intelligence_events(event_key,announcement_id,issuer,event_type,subject,event_date,
   geography,keywords,outcome_status)
 values(p_event_key,announcement_identifier,p_issuer,p_event_type,p_subject,p_event_date,p_geography,
   coalesce(p_keywords,'{}'),p_outcome_status)
 returning * into existing_event;
 insert into public.gpir_intelligence_event_sources(event_id,source_id,canonical_url,source_published_at,evidence_excerpt)
 values(existing_event.id,candidate_record.source_id,candidate_record.canonical_url,p_source_published_at,
   left(coalesce(p_validation_payload->>'evidence_excerpt',''),1000));
 return announcement_identifier;
end $$;
revoke all on function public.gpir_publish_consolidated_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text) from public,anon,authenticated;
grant execute on function public.gpir_publish_consolidated_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text) to service_role;
