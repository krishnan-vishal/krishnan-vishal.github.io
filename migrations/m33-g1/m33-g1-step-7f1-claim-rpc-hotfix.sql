-- M33-G1 Step 7F.1 owner-only production repair.
-- Repairs only the deployed claim RPC's invalid qualification of PostgreSQL
-- conditional expressions. It does not drop or mutate the claim table, touch
-- intelligence evidence, invoke the Edge Function, or activate a scheduler.

BEGIN;

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

    -- GREATEST and LEAST are PostgreSQL conditional expressions, not
    -- schema-resolved functions. They must remain unqualified.
    bounded_ttl := least(1800, greatest(60, coalesce(p_ttl_seconds, 900)));
    lease_expires_at := pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => bounded_ttl);

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

-- Reassert the deployed least-privilege contract after replacement.
REVOKE ALL ON FUNCTION public.gpir_claim_intelligence_source_run(text, uuid, integer)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gpir_claim_intelligence_source_run(text, uuid, integer)
    TO service_role;

COMMENT ON FUNCTION public.gpir_claim_intelligence_source_run(text, uuid, integer) IS
    'Atomic M33-G1 source claim with 60..1800 second stale-claim recovery.';

COMMIT;
