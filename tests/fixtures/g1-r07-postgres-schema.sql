-- Isolated contract fixture for the actual G1 and R07 migrations.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role authenticator nologin noinherit;
grant anon, authenticated, service_role to authenticator;
create table public.source_registry(source_id text primary key,source_name text,official_url text,trust_tier text,source_status text);
create table public.intelligence_candidates(
 id uuid primary key default gen_random_uuid(),raw_ingestion_id uuid,source_id text,canonical_url text,title text,
 published_at timestamptz,category text,event_type text,confidence_score numeric,
 candidate_status text,content_fingerprint text,summary_narration text,ticker_eligible boolean,country_code text,region text,
 validation_notes text,validated_at timestamptz,validation_version text,freshness_status text);
create table public.global_announcements(
 id uuid primary key default gen_random_uuid(),source_id text,title text,summary_narration text,
 canonical_url text unique,published_at timestamptz,ticker_eligible boolean,
 topic_headers text[],archive_month_year text,url text,publication_status text);
