-- M33-G1 Step 7F.1 isolated PostgreSQL claim-RPC runtime regression.
-- TEST ONLY. The workflow runs this against its disposable PostgreSQL service.

BEGIN;

DO $regression$
DECLARE
    claim_result record;
    ttl_seconds numeric;
    function_definition text;
    token_default constant uuid := '10000000-0000-4000-8000-000000000001';
    token_overlap constant uuid := '10000000-0000-4000-8000-000000000002';
    token_minimum constant uuid := '10000000-0000-4000-8000-000000000003';
    token_maximum constant uuid := '10000000-0000-4000-8000-000000000004';
    token_null_ttl constant uuid := '10000000-0000-4000-8000-000000000005';
BEGIN
    IF pg_catalog.current_setting('m33_g1.isolated_test', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'M33-G1 Step 7F.1 regression requires isolated-test guard';
    END IF;

    SELECT * INTO STRICT claim_result
    FROM public.gpir_claim_intelligence_source_run(
        'm33-baseline-source', token_default
    );
    ttl_seconds := extract(
        epoch FROM claim_result.active_expires_at - pg_catalog.clock_timestamp()
    );
    IF claim_result.claimed IS DISTINCT FROM true OR ttl_seconds < 895 OR ttl_seconds > 901 THEN
        RAISE EXCEPTION 'Default 900-second claim failed: claimed=%, ttl=%', claim_result.claimed, ttl_seconds;
    END IF;

    SELECT * INTO STRICT claim_result
    FROM public.gpir_claim_intelligence_source_run(
        'm33-baseline-source', token_overlap, 900
    );
    IF claim_result.claimed IS DISTINCT FROM false OR claim_result.overlap_skipped_count <> 1 THEN
        RAISE EXCEPTION 'Active-overlap proof failed: claimed=%, skips=%',
            claim_result.claimed, claim_result.overlap_skipped_count;
    END IF;
    IF public.gpir_release_intelligence_source_run('m33-baseline-source', token_overlap) THEN
        RAISE EXCEPTION 'Non-owner token unexpectedly released active claim';
    END IF;
    IF NOT public.gpir_release_intelligence_source_run('m33-baseline-source', token_default) THEN
        RAISE EXCEPTION 'Matching token failed to release active claim';
    END IF;

    SELECT * INTO STRICT claim_result
    FROM public.gpir_claim_intelligence_source_run(
        'm33-baseline-source', token_minimum, 1
    );
    ttl_seconds := extract(
        epoch FROM claim_result.active_expires_at - pg_catalog.clock_timestamp()
    );
    IF claim_result.claimed IS DISTINCT FROM true OR ttl_seconds < 55 OR ttl_seconds > 61 THEN
        RAISE EXCEPTION 'Minimum TTL bound failed: claimed=%, ttl=%', claim_result.claimed, ttl_seconds;
    END IF;
    IF NOT public.gpir_release_intelligence_source_run('m33-baseline-source', token_minimum) THEN
        RAISE EXCEPTION 'Minimum-bound claim release failed';
    END IF;

    SELECT * INTO STRICT claim_result
    FROM public.gpir_claim_intelligence_source_run(
        'm33-baseline-source', token_maximum, 5000
    );
    ttl_seconds := extract(
        epoch FROM claim_result.active_expires_at - pg_catalog.clock_timestamp()
    );
    IF claim_result.claimed IS DISTINCT FROM true OR ttl_seconds < 1795 OR ttl_seconds > 1801 THEN
        RAISE EXCEPTION 'Maximum TTL bound failed: claimed=%, ttl=%', claim_result.claimed, ttl_seconds;
    END IF;
    IF NOT public.gpir_release_intelligence_source_run('m33-baseline-source', token_maximum) THEN
        RAISE EXCEPTION 'Maximum-bound claim release failed';
    END IF;

    SELECT * INTO STRICT claim_result
    FROM public.gpir_claim_intelligence_source_run(
        'm33-baseline-source', token_null_ttl, NULL
    );
    ttl_seconds := extract(
        epoch FROM claim_result.active_expires_at - pg_catalog.clock_timestamp()
    );
    IF claim_result.claimed IS DISTINCT FROM true OR ttl_seconds < 895 OR ttl_seconds > 901 THEN
        RAISE EXCEPTION 'NULL/default TTL behavior failed: claimed=%, ttl=%', claim_result.claimed, ttl_seconds;
    END IF;
    IF NOT public.gpir_release_intelligence_source_run('m33-baseline-source', token_null_ttl) THEN
        RAISE EXCEPTION 'NULL/default-bound claim release failed';
    END IF;

    SELECT pg_catalog.pg_get_functiondef(
        'public.gpir_claim_intelligence_source_run(text,uuid,integer)'::regprocedure
    ) INTO function_definition;
    IF function_definition ~* 'pg_catalog\.(greatest|least)\s*\(' THEN
        RAISE EXCEPTION 'Invalid conditional-expression qualification remains';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid = 'public.gpir_claim_intelligence_source_run(text,uuid,integer)'::regprocedure
          AND procedure.prosecdef
          AND procedure.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) THEN
        RAISE EXCEPTION 'Claim RPC hardening changed';
    END IF;
    IF NOT pg_catalog.has_function_privilege(
        'service_role', 'public.gpir_claim_intelligence_source_run(text,uuid,integer)', 'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
        'anon', 'public.gpir_claim_intelligence_source_run(text,uuid,integer)', 'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
        'authenticated', 'public.gpir_claim_intelligence_source_run(text,uuid,integer)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Claim RPC least-privilege grants changed';
    END IF;
    IF pg_catalog.has_table_privilege(
        'service_role', 'public.intelligence_source_run_claims', 'SELECT'
    ) OR pg_catalog.has_table_privilege(
        'service_role', 'public.intelligence_source_run_claims', 'INSERT'
    ) OR pg_catalog.has_table_privilege(
        'service_role', 'public.intelligence_source_run_claims', 'UPDATE'
    ) OR pg_catalog.has_table_privilege(
        'service_role', 'public.intelligence_source_run_claims', 'DELETE'
    ) THEN
        RAISE EXCEPTION 'service_role unexpectedly has direct claim-table access';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
        ) AS privilege
        WHERE procedure.oid = 'public.gpir_claim_intelligence_source_run(text,uuid,integer)'::regprocedure
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'PUBLIC retained claim RPC execution';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS class
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = class.relnamespace
        WHERE namespace.nspname = 'public'
          AND class.relname = 'intelligence_source_run_claims'
          AND class.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Claim-table RLS changed';
    END IF;

    RAISE NOTICE 'M33-G1 Step 7F.1 isolated claim RPC runtime regression: PASS';
END
$regression$;

ROLLBACK;
