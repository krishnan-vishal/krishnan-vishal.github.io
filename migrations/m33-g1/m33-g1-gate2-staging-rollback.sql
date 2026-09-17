-- M33-G1 Step 6A non-destructive rollback package.
-- VERSION-CONTROLLED BUILD ARTIFACT ONLY. DO NOT APPLY WITHOUT OWNER APPROVAL.
-- This disables the new mutation paths while retaining every evidence row and
-- additive object. Exact prior function definitions must be captured from the
-- target immediately before a future controlled application and restored only
-- after their checksums, owners and grants are verified.

BEGIN;

CREATE OR REPLACE FUNCTION public.gpir_process_raw_record(p_raw_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    RETURN 'M33_G1_ROLLBACK_DISABLED';
END
$function$;

CREATE OR REPLACE FUNCTION public.gpir_process_raw_batch(p_limit integer DEFAULT 100)
RETURNS TABLE(raw_id uuid, processing_result text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    RETURN;
END
$function$;

CREATE OR REPLACE FUNCTION public.gpir_create_canonical_handoff(p_candidate_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
    RETURN 'M33_G1_ROLLBACK_DISABLED';
END
$function$;

REVOKE ALL ON FUNCTION public.gpir_process_raw_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gpir_process_raw_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gpir_create_canonical_handoff(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.gpir_process_raw_record(uuid) IS
    'M33-G1 rollback disabled; restore owner-captured prior definition after verification';
COMMENT ON FUNCTION public.gpir_process_raw_batch(integer) IS
    'M33-G1 rollback disabled; restore owner-captured prior definition after verification';
COMMENT ON FUNCTION public.gpir_create_canonical_handoff(uuid) IS
    'M33-G1 rollback disabled; retained handoff evidence is immutable';

-- Deliberately retained during rollback:
-- additive columns and constraints; RAW/rejection/review/candidate/handoff
-- evidence; the handoff table; and the safer future-insert ticker default.
-- The existing legacy production path remains the Last-Known-Good baseline.

COMMIT;
