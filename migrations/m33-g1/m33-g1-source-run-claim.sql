-- M33-G1 Step 7A source-run overlap safety layer.
-- PREPARED ONLY: do not apply without owner-approved Supabase preflight.
-- This is deliberately independent of ingestion evidence and never deletes it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intelligence_source_run_claims (
    source_id text PRIMARY KEY
        REFERENCES public.source_registry(source_id) ON DELETE RESTRICT,
    claim_token uuid NOT NULL,
    claimed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    expires_at timestamptz NOT NULL,
    released_at timestamptz,
    last_overlap_at timestamptz,
    overlap_skipped_count integer NOT NULL DEFAULT 0
        CHECK (overlap_skipped_count >= 0)
);

ALTER TABLE public.intelligence_source_run_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gpir_claim_intelligence_source_run(
    p_source_id text,
    p_claim_token uuid,
    p_ttl_seconds integer DEFAULT 900
)
RETURNS TABLE(
    claimed boolean,
    active_expires_at timestamptz,
    overlap_skipped_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    existing_claim public.intelligence_source_run_claims%ROWTYPE;
    bounded_ttl integer;
    lease_expires_at timestamptz;
BEGIN
    IF p_source_id IS NULL OR pg_catalog.btrim(p_source_id) = '' OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'M33-G1 source claim requires source_id and claim_token';
    END IF;

    bounded_ttl := pg_catalog.least(1800, pg_catalog.greatest(60, coalesce(p_ttl_seconds, 900)));
    lease_expires_at := pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => bounded_ttl);

    -- The transaction-scoped advisory lock is used only to serialize the
    -- persistent claim mutation. The persistent lease, not a pooled session,
    -- safely spans Edge HTTP acquisition and processing.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_source_id, 0));

    SELECT * INTO existing_claim
      FROM public.intelligence_source_run_claims
     WHERE source_id = p_source_id
     FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.intelligence_source_run_claims (
            source_id, claim_token, claimed_at, expires_at, released_at
        ) VALUES (
            p_source_id, p_claim_token, pg_catalog.clock_timestamp(), lease_expires_at, NULL
        );
        RETURN QUERY SELECT true, lease_expires_at, 0;
        RETURN;
    END IF;

    IF existing_claim.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.intelligence_source_run_claims
           SET claim_token = p_claim_token,
               claimed_at = pg_catalog.clock_timestamp(),
               expires_at = lease_expires_at,
               released_at = NULL
         WHERE source_id = p_source_id;
        RETURN QUERY SELECT true, lease_expires_at, existing_claim.overlap_skipped_count;
        RETURN;
    END IF;

    UPDATE public.intelligence_source_run_claims AS claim
       SET last_overlap_at = pg_catalog.clock_timestamp(),
           overlap_skipped_count = claim.overlap_skipped_count + 1
     WHERE claim.source_id = p_source_id
     RETURNING claim.expires_at, claim.overlap_skipped_count
          INTO active_expires_at, overlap_skipped_count;
    claimed := false;
    RETURN NEXT;
END
$function$;

CREATE OR REPLACE FUNCTION public.gpir_release_intelligence_source_run(
    p_source_id text,
    p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    IF p_source_id IS NULL OR p_claim_token IS NULL THEN
        RETURN false;
    END IF;

    UPDATE public.intelligence_source_run_claims
       SET expires_at = pg_catalog.clock_timestamp(),
           released_at = pg_catalog.clock_timestamp()
     WHERE source_id = p_source_id
       AND claim_token = p_claim_token;
    RETURN FOUND;
END
$function$;

-- No guessed application role is granted execution. The owner must grant only
-- the verified Edge service role during the separately approved cloud preflight.
REVOKE ALL ON TABLE public.intelligence_source_run_claims FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gpir_claim_intelligence_source_run(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gpir_release_intelligence_source_run(text, uuid) FROM PUBLIC;

COMMENT ON TABLE public.intelligence_source_run_claims IS
    'M33-G1 finite per-source Edge execution leases; preserves overlap observability, not ingestion evidence.';
COMMENT ON FUNCTION public.gpir_claim_intelligence_source_run(text, uuid, integer) IS
    'Atomic M33-G1 source claim with 60..1800 second stale-claim recovery.';
COMMENT ON FUNCTION public.gpir_release_intelligence_source_run(text, uuid) IS
    'Releases only the matching M33-G1 source claim token.';

COMMIT;
