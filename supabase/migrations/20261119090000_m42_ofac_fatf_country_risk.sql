-- M42: OFAC/FATF regulatory history and country-risk evidence.
-- Additive only. This migration does not register sources, schedule polling, publish
-- intelligence, or change any confidence threshold. Release SQL is separately controlled.

begin;

create table if not exists public.gpir_regulatory_documents (
    id uuid primary key default gen_random_uuid(),
    source_id text not null references public.source_registry(source_id),
    document_identity text not null,
    canonical_url text not null check (canonical_url ~ '^https://'),
    document_kind text not null check (document_kind in (
        'OFAC_CURRENT_SNAPSHOT', 'OFAC_DELTA', 'OFAC_RECENT_ACTION', 'FATF_STATEMENT'
    )),
    published_at timestamptz,
    publication_date date,
    publication_precision text not null check (publication_precision in ('EXACT_TIMESTAMP', 'DATE_ONLY', 'UNKNOWN')),
    effective_at timestamptz,
    retrieved_at timestamptz not null default now(),
    content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
    media_type text,
    http_status integer check (http_status between 100 and 599),
    validation_state text not null check (validation_state in ('VALIDATED', 'REVIEW', 'REJECTED', 'UNAVAILABLE')),
    document_version integer not null default 1 check (document_version > 0),
    supersedes_document_id uuid references public.gpir_regulatory_documents(id),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (source_id, document_identity, content_sha256),
    check (published_at is null or publication_date is null or published_at::date = publication_date)
);

create index if not exists gpir_regulatory_documents_source_published_idx
    on public.gpir_regulatory_documents (source_id, publication_date desc, created_at desc);
create index if not exists gpir_regulatory_documents_identity_idx
    on public.gpir_regulatory_documents (document_identity, document_version desc);

create table if not exists public.gpir_sanctions_change_events (
    id uuid primary key default gen_random_uuid(),
    source_id text not null references public.source_registry(source_id),
    document_id uuid not null references public.gpir_regulatory_documents(id),
    event_key text not null unique,
    action_type text not null check (action_type in ('ADDED', 'REMOVED', 'AMENDED', 'TECHNICAL', 'REGULATORY_NOTICE')),
    entity_uid text,
    entity_name text,
    list_code text,
    programs text[] not null default '{}',
    country_codes text[] not null default '{}',
    published_at timestamptz,
    publication_date date not null,
    effective_date date,
    lifecycle_status text not null check (lifecycle_status in ('CURRENT', 'HISTORICAL')),
    evidence jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    check (published_at is null or published_at::date = publication_date),
    check (coalesce((evidence->>'current_full_snapshot_proof')::boolean, false) = false)
);

create index if not exists gpir_sanctions_change_events_date_idx
    on public.gpir_sanctions_change_events (publication_date desc, action_type);
create index if not exists gpir_sanctions_change_events_uid_idx
    on public.gpir_sanctions_change_events (entity_uid)
    where entity_uid is not null;

create table if not exists public.gpir_country_risk_status_history (
    id uuid primary key default gen_random_uuid(),
    source_id text not null references public.source_registry(source_id),
    document_id uuid not null references public.gpir_regulatory_documents(id),
    country_code text not null check (country_code ~ '^[A-Z]{3}$'),
    country_name text not null,
    official_designation text not null check (official_designation in (
        'FATF_CALL_FOR_ACTION', 'FATF_INCREASED_MONITORING'
    )),
    effective_from date not null,
    effective_to date,
    publication_date date not null,
    status_fingerprint text not null unique check (status_fingerprint ~ '^[0-9a-f]{64}$'),
    gpir_analytical_risk text not null default 'UNRATED' check (gpir_analytical_risk in ('HIGH', 'MEDIUM', 'LOW', 'UNRATED')),
    gpir_methodology_id text,
    created_at timestamptz not null default now(),
    check (effective_to is null or effective_to >= effective_from),
    check (
        (gpir_analytical_risk = 'UNRATED' and gpir_methodology_id is null)
        or (gpir_analytical_risk <> 'UNRATED' and gpir_methodology_id is not null)
    )
);

create unique index if not exists gpir_country_risk_one_current_idx
    on public.gpir_country_risk_status_history (source_id, country_code)
    where effective_to is null;
create index if not exists gpir_country_risk_history_idx
    on public.gpir_country_risk_status_history (country_code, effective_from desc);

create table if not exists public.gpir_regulatory_backfill_checkpoints (
    source_id text not null references public.source_registry(source_id),
    window_start date not null,
    window_end date not null,
    cursor_value text not null default '',
    run_status text not null check (run_status in ('PENDING', 'RUNNING', 'PARTIAL', 'COMPLETE', 'FAILED')),
    fetched_count integer not null default 0 check (fetched_count >= 0),
    deduplicated_count integer not null default 0 check (deduplicated_count >= 0),
    validated_count integer not null default 0 check (validated_count >= 0),
    rejected_count integer not null default 0 check (rejected_count >= 0),
    unavailable_count integer not null default 0 check (unavailable_count >= 0),
    earliest_verified_date date,
    latest_verified_date date,
    last_error_code text,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    updated_at timestamptz not null default now(),
    primary key (source_id, window_start, window_end),
    check (window_start < window_end),
    check (window_end - window_start <= 31),
    check (
        earliest_verified_date is null or latest_verified_date is null
        or earliest_verified_date <= latest_verified_date
    )
);

alter table public.gpir_regulatory_documents enable row level security;
alter table public.gpir_sanctions_change_events enable row level security;
alter table public.gpir_country_risk_status_history enable row level security;
alter table public.gpir_regulatory_backfill_checkpoints enable row level security;

revoke all on public.gpir_regulatory_documents from public, anon, authenticated;
revoke all on public.gpir_sanctions_change_events from public, anon, authenticated;
revoke all on public.gpir_country_risk_status_history from public, anon, authenticated;
revoke all on public.gpir_regulatory_backfill_checkpoints from public, anon, authenticated;

grant select, insert, update on public.gpir_regulatory_documents to service_role;
grant select, insert, update on public.gpir_sanctions_change_events to service_role;
grant select, insert, update on public.gpir_country_risk_status_history to service_role;
grant select, insert, update on public.gpir_regulatory_backfill_checkpoints to service_role;

create or replace view public.gpir_country_risk_current_v1
with (security_invoker = true)
as
select
    h.country_code,
    h.country_name,
    h.official_designation,
    h.effective_from,
    h.publication_date,
    h.gpir_analytical_risk,
    h.gpir_methodology_id,
    d.canonical_url as source_url,
    d.content_sha256 as source_hash,
    h.created_at as validated_at
from public.gpir_country_risk_status_history h
join public.gpir_regulatory_documents d on d.id = h.document_id
where h.effective_to is null
  and d.validation_state = 'VALIDATED';

revoke all on public.gpir_country_risk_current_v1 from public, anon, authenticated;
grant select on public.gpir_country_risk_current_v1 to service_role;

comment on table public.gpir_sanctions_change_events is
    'Append-oriented OFAC change evidence. Current full snapshots are prohibited as historical proof.';
comment on column public.gpir_country_risk_status_history.official_designation is
    'Official FATF designation; never a GPIR analytical rating.';
comment on column public.gpir_country_risk_status_history.gpir_analytical_risk is
    'Defaults to UNRATED and requires a documented methodology ID for HIGH/MEDIUM/LOW.';
comment on column public.gpir_sanctions_change_events.country_codes is
    'Jurisdiction exposure evidence only; it does not assert that a country is sanctioned.';

commit;
