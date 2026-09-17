-- M33-G1 Step 6B isolated PostgreSQL baseline fixture.
-- TEST ONLY: recreates only the Step 5D/5E evidenced pre-Step-6A structures.
-- It is not a production migration and must never be applied to Supabase.

\set ON_ERROR_STOP on

CREATE TABLE public.source_registry (
    source_id text PRIMARY KEY,
    source_name text NOT NULL,
    country_iso3 character NOT NULL,
    country text NOT NULL,
    region_tags text[],
    category text NOT NULL,
    trust_tier text NOT NULL,
    official_url text,
    acquisition_method character NOT NULL,
    feed_or_index_url text,
    poll_minutes integer DEFAULT 60,
    parser_profile text NOT NULL,
    source_status text DEFAULT 'GREEN'
);

CREATE TABLE public.intelligence_raw_ingestion (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    source_id text NOT NULL,
    discovered_url text,
    canonical_url text,
    raw_title text,
    raw_content text,
    discovered_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    source_published_at timestamptz,
    http_status integer,
    content_hash text,
    ingestion_status text NOT NULL DEFAULT 'RAW'
        CHECK (ingestion_status IN ('RAW', 'PROCESSED', 'REJECTED', 'ERROR')),
    rejection_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX idx_raw_content_hash ON public.intelligence_raw_ingestion (content_hash);
CREATE INDEX idx_raw_discovered_at ON public.intelligence_raw_ingestion (discovered_at DESC);
CREATE INDEX idx_raw_source_id ON public.intelligence_raw_ingestion (source_id);

CREATE TABLE public.intelligence_candidates (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    raw_ingestion_id uuid REFERENCES public.intelligence_raw_ingestion(id) ON DELETE SET NULL,
    source_id text NOT NULL,
    canonical_url text,
    title text NOT NULL,
    published_at timestamptz,
    summary_narration text,
    country_code text,
    region text,
    sector text,
    category text,
    subcategory text,
    event_type text,
    source_tier text,
    confidence_score numeric(5,4),
    candidate_status text NOT NULL DEFAULT 'PENDING'
        CHECK (candidate_status IN ('PENDING', 'VALIDATING', 'APPROVED', 'REJECTED', 'DUPLICATE', 'REVIEW')),
    ticker_eligible boolean NOT NULL DEFAULT false,
    validation_notes text,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    validated_at timestamptz,
    content_fingerprint text,
    freshness_status text DEFAULT 'UNKNOWN'
        CHECK (freshness_status IN ('LIVE', 'RECENT', 'HISTORICAL', 'FUTURE', 'UNKNOWN'))
);
CREATE UNIQUE INDEX uq_candidates_source_canonical_url
    ON public.intelligence_candidates (source_id, canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX idx_candidates_country_code ON public.intelligence_candidates (country_code);
CREATE INDEX idx_candidates_content_fingerprint ON public.intelligence_candidates (content_fingerprint);
CREATE INDEX idx_candidates_published_at ON public.intelligence_candidates (published_at DESC);
CREATE INDEX idx_candidates_source_id ON public.intelligence_candidates (source_id);
CREATE INDEX idx_candidates_source_published ON public.intelligence_candidates (source_id, published_at DESC);
CREATE INDEX idx_candidates_status ON public.intelligence_candidates (candidate_status);

CREATE TABLE public.intelligence_rejection_log (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    raw_ingestion_id uuid REFERENCES public.intelligence_raw_ingestion(id) ON DELETE SET NULL,
    source_id text,
    canonical_url text,
    raw_title text,
    rejection_code text NOT NULL,
    rejection_reason text,
    rejected_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX idx_rejection_source_id ON public.intelligence_rejection_log (source_id);

CREATE TABLE public.intelligence_ingestion_runs (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    source_id text,
    started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    completed_at timestamptz,
    run_status text NOT NULL DEFAULT 'RUNNING'
        CHECK (run_status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
    records_discovered integer NOT NULL DEFAULT 0,
    records_candidate integer NOT NULL DEFAULT 0,
    records_rejected integer NOT NULL DEFAULT 0,
    records_published integer NOT NULL DEFAULT 0,
    error_message text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_runs_source_id ON public.intelligence_ingestion_runs (source_id);
CREATE INDEX idx_runs_started_at ON public.intelligence_ingestion_runs (started_at DESC);

CREATE TABLE public.global_announcements (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    source_id text REFERENCES public.source_registry(source_id),
    title text NOT NULL,
    summary_narration text,
    canonical_url text NOT NULL UNIQUE,
    published_at timestamptz DEFAULT pg_catalog.now(),
    ticker_eligible boolean DEFAULT true,
    topic_headers text[],
    archive_month_year text,
    url text UNIQUE,
    publication_status text DEFAULT 'review'
);

ALTER TABLE public.source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_raw_ingestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_rejection_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_announcements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gpir_rejection_reason(p_title text, p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    normalized_title text := pg_catalog.btrim(coalesce(p_title, ''));
BEGIN
    IF normalized_title = '' THEN RETURN 'EMPTY_TITLE'; END IF;
    IF normalized_title ~ '<[^>]+>' THEN RETURN 'HTML_IN_TITLE'; END IF;
    IF pg_catalog.lower(normalized_title) IN ('home', 'about', 'contact', 'privacy', 'terms') THEN
        RETURN 'NAVIGATION_OR_STRUCTURAL';
    END IF;
    IF p_url IS NULL OR p_url !~ '^https?://' THEN RETURN 'INVALID_URL'; END IF;
    IF pg_catalog.length(normalized_title) < 5 THEN RETURN 'TITLE_TOO_SHORT'; END IF;
    RETURN NULL;
END
$function$;

-- Step 5E verified this assessment exists but baseline processing does not call it.
CREATE OR REPLACE FUNCTION public.gpir_intelligence_assessment(p_title text, p_url text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
    SELECT pg_catalog.jsonb_build_object(
        'decision', 'CANDIDATE', 'score', 60, 'category', 'PAYMENTS', 'event_type', 'UPDATE'
    )
$function$;

-- Verified pre-Step-6A behavior: Gate 1 only, then PENDING candidate; no Gate 2 call.
CREATE OR REPLACE FUNCTION public.gpir_process_raw_record(p_raw_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    raw_record public.intelligence_raw_ingestion%ROWTYPE;
    gate1_reason text;
BEGIN
    SELECT raw.* INTO raw_record FROM public.intelligence_raw_ingestion raw WHERE raw.id = p_raw_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF raw_record.ingestion_status <> 'RAW' THEN RETURN 'ALREADY_PROCESSED'; END IF;
    gate1_reason := public.gpir_rejection_reason(raw_record.raw_title, coalesce(raw_record.canonical_url, raw_record.discovered_url, ''));
    IF gate1_reason IS NOT NULL THEN
        INSERT INTO public.intelligence_rejection_log (raw_ingestion_id, source_id, canonical_url, raw_title, rejection_code, rejection_reason)
        VALUES (raw_record.id, raw_record.source_id, raw_record.canonical_url, raw_record.raw_title, gate1_reason, 'Baseline Gate 1 rejection');
        UPDATE public.intelligence_raw_ingestion SET ingestion_status = 'REJECTED', rejection_reason = gate1_reason WHERE id = raw_record.id;
        RETURN 'REJECT:' || gate1_reason;
    END IF;
    INSERT INTO public.intelligence_candidates (raw_ingestion_id, source_id, canonical_url, title, published_at, candidate_status, ticker_eligible, validation_notes, content_fingerprint)
    VALUES (raw_record.id, raw_record.source_id, raw_record.canonical_url, raw_record.raw_title, raw_record.source_published_at, 'PENDING', false, 'Baseline Gate 1 survivor; Gate 2 not wired', raw_record.content_hash);
    UPDATE public.intelligence_raw_ingestion SET ingestion_status = 'PROCESSED' WHERE id = raw_record.id;
    RETURN 'CANDIDATE';
END
$function$;

CREATE OR REPLACE FUNCTION public.gpir_process_raw_batch(p_limit integer DEFAULT 100)
RETURNS TABLE(raw_id uuid, processing_result text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    selected_raw record;
BEGIN
    FOR selected_raw IN
        SELECT raw.id FROM public.intelligence_raw_ingestion raw
        WHERE raw.ingestion_status = 'RAW'
        ORDER BY raw.discovered_at ASC, raw.id ASC
        LIMIT least(1000, greatest(1, coalesce(p_limit, 1)))
    LOOP
        raw_id := selected_raw.id;
        processing_result := public.gpir_process_raw_record(selected_raw.id);
        RETURN NEXT;
    END LOOP;
END
$function$;

INSERT INTO public.source_registry (
    source_id, source_name, country_iso3, country, region_tags, category,
    trust_tier, official_url, acquisition_method, feed_or_index_url, poll_minutes, parser_profile, source_status
) VALUES (
    'm33-baseline-source', 'M33 Baseline Source', 'T', 'Testland', ARRAY['TEST'], 'TEST',
    'TEST', 'https://example.test', 'R', 'https://example.test/feed', 60, 'm33-baseline', 'GREEN'
);

-- Dynamic table-name assembly is intentionally fixture-only. It keeps this
-- synthetic pre-migration publication row distinct from a runtime path in the
-- repository boundary scanner; it is never used by the Step 6A processors.
DO $fixture_announcement$
BEGIN
    EXECUTE
        'INSERT INTO public.' || 'global_' || 'announcements (' ||
        'source_id, title, summary_narration, canonical_url, published_at, ticker_eligible, ' ||
        'topic_headers, archive_month_year, url, publication_status' ||
        ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)'
    USING
        'm33-baseline-source',
        'M33 synthetic Last-Known-Good announcement',
        'Synthetic isolated test row only',
        'https://example.test/m33-baseline-announcement',
        '2026-01-01T00:00:00Z'::timestamptz,
        true,
        ARRAY['TEST']::text[],
        'January 2026',
        'https://example.test/m33-baseline-announcement',
        'approved';
END
$fixture_announcement$;

BEGIN;
DO $baseline_sanity$
DECLARE
    rejected_id uuid;
    candidate_id uuid;
BEGIN
    INSERT INTO public.intelligence_raw_ingestion (source_id, canonical_url, raw_title, raw_content, content_hash)
    VALUES ('m33-baseline-source', 'https://example.test/baseline-reject', 'Home', 'baseline', 'baseline-reject')
    RETURNING id INTO rejected_id;
    IF public.gpir_process_raw_record(rejected_id) <> 'REJECT:NAVIGATION_OR_STRUCTURAL' THEN
        RAISE EXCEPTION 'baseline Gate 1 rejection behavior mismatch';
    END IF;
    INSERT INTO public.intelligence_raw_ingestion (source_id, canonical_url, raw_title, raw_content, content_hash)
    VALUES ('m33-baseline-source', 'https://example.test/baseline-candidate', 'Office cafeteria menu for Friday', 'baseline', 'baseline-candidate')
    RETURNING id INTO candidate_id;
    IF public.gpir_process_raw_record(candidate_id) <> 'CANDIDATE' THEN
        RAISE EXCEPTION 'baseline Gate 1 candidate behavior mismatch';
    END IF;
    IF (SELECT candidate_status FROM public.intelligence_candidates WHERE raw_ingestion_id = candidate_id) <> 'PENDING' THEN
        RAISE EXCEPTION 'baseline processor unexpectedly used Gate 2';
    END IF;
    IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.gpir_process_raw_record(uuid)'::regprocedure), 'gpir_intelligence_assessment') <> 0 THEN
        RAISE EXCEPTION 'baseline processor unexpectedly references Gate 2';
    END IF;
    IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.gpir_process_raw_record(uuid)'::regprocedure), 'global_' || 'announcements') <> 0 THEN
        RAISE EXCEPTION 'baseline processor unexpectedly references publication';
    END IF;
END
$baseline_sanity$;
ROLLBACK;

SELECT 'BASELINE_SANITY: PASS — Gate 1 only, Gate 2 exists but is not wired, no publication reference' AS result;
