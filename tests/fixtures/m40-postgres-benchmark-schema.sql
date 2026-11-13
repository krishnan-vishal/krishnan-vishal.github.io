\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.source_registry (
    source_id text primary key,
    source_name text not null,
    official_url text not null,
    trust_tier text not null,
    source_status text not null,
    country text,
    region_tags text[],
    category text
);

create table public.global_announcements (
    id uuid primary key default gen_random_uuid(),
    source_id text not null references public.source_registry(source_id),
    title text not null,
    summary_narration text not null,
    canonical_url text not null unique,
    published_at timestamptz,
    ticker_eligible boolean not null default false,
    topic_headers text[] not null default '{}',
    publication_status text not null
);

create table public.gpir_intelligence_topics (
    id bigint generated always as identity primary key,
    announcement_id uuid not null references public.global_announcements(id),
    keywords text[] not null default '{}',
    outcome_status text,
    geography text,
    created_at timestamptz not null default now()
);

create table public.intelligence_raw_ingestion (
    id uuid primary key default gen_random_uuid(),
    source_id text not null references public.source_registry(source_id),
    raw_title text,
    canonical_url text,
    metadata jsonb not null default '{}',
    ingestion_status text not null
);

create index gpir_intelligence_topics_announcement_id_idx
    on public.gpir_intelligence_topics (announcement_id);

grant usage on schema public to service_role;
grant select on public.source_registry, public.global_announcements,
    public.gpir_intelligence_topics, public.intelligence_raw_ingestion to service_role;

alter table public.source_registry enable row level security;
alter table public.global_announcements enable row level security;
alter table public.gpir_intelligence_topics enable row level security;
alter table public.intelligence_raw_ingestion enable row level security;
