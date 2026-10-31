-- GPIR G1 Phase 1: governed, source-validated intelligence publication.
-- This migration does not alter acquisition, authentication, payments,
-- subscriptions, entitlements, or the 12-hour public-alerts function.

create table if not exists public.intelligence_publication_audits (
    candidate_id uuid primary key
        references public.intelligence_candidates(id) on delete restrict,
    announcement_id uuid unique
        references public.global_announcements(id) on delete restrict,
    decision text not null,
    reason_code text not null,
    canonical_url text,
    content_fingerprint text,
    source_published_at timestamptz,
    source_checked_at timestamptz,
    source_http_status integer,
    evidence_excerpt text,
    validation_payload jsonb not null default '{}'::jsonb,
    attempted_at timestamptz not null default now(),
    completed_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint intelligence_publication_audits_decision_check check (
        decision in ('PROCESSING', 'PUBLISHED', 'REJECTED', 'DUPLICATE', 'REVIEW', 'ERROR')
    ),
    constraint intelligence_publication_audits_fingerprint_check check (
        content_fingerprint is null or content_fingerprint ~ '^[0-9a-f]{64}$'
    )
);

comment on table public.intelligence_publication_audits is
    'G1 source-validation and publication decisions; private service-role evidence, never a browser data source.';

create unique index if not exists uq_intelligence_publication_fingerprint
    on public.intelligence_publication_audits(content_fingerprint)
    where decision = 'PUBLISHED' and content_fingerprint is not null;

create index if not exists idx_intelligence_publication_decision
    on public.intelligence_publication_audits(decision, attempted_at);

alter table public.intelligence_publication_audits enable row level security;
revoke all on table public.intelligence_publication_audits from anon, authenticated;
grant all on table public.intelligence_publication_audits to service_role;

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
       or coalesce(p_validation_payload ->> 'timestamp_verified', 'false') <> 'true'
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

    live_eligible := p_source_published_at <= pg_catalog.clock_timestamp()
        and p_source_published_at >= pg_catalog.clock_timestamp() - interval '12 hours';

    insert into public.global_announcements (
        source_id, title, summary_narration, canonical_url, published_at,
        ticker_eligible, topic_headers, archive_month_year, url, publication_status
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
        'approved'
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

revoke all on function public.gpir_publish_validated_candidate(uuid, text, timestamptz, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.gpir_publish_validated_candidate(uuid, text, timestamptz, text, jsonb)
    to service_role;

-- The existing Vault key already invokes verify_jwt=true acquisition functions.
-- Reuse only its name; the decrypted value never enters source control or browser code.
do $schedule$
declare
    existing_job bigint;
begin
    select jobid into existing_job from cron.job where jobname = 'g1-intelligence-publication';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;

    perform cron.schedule(
        'g1-intelligence-publication',
        '*/10 * * * *',
        $command$
        select net.http_post(
            url := 'https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-intelligence-publish',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'apikey', secret.decrypted_secret,
                'Authorization', 'Bearer ' || secret.decrypted_secret
            ),
            body := jsonb_build_object('batchSize', 5)
        )
        from vault.decrypted_secrets as secret
        where secret.name = 'gpir_edge_function_secret'
          and secret.decrypted_secret is not null
          and secret.decrypted_secret <> '';
        $command$
    );
end
$schedule$;
