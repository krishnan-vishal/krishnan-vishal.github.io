-- M33-G1 Step 7F.1 owner read-only post-hotfix verification.
-- This reveals no Vault value and performs no function invocation or mutation.

-- V1: exact claim function identity and hardened properties.
WITH claim_function AS (
    SELECT
        procedure.oid,
        procedure.proowner,
        procedure.prosecdef,
        procedure.proconfig,
        pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid)) AS definition
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.oid = 'public.gpir_claim_intelligence_source_run(text,uuid,integer)'::regprocedure
)
SELECT
    'public.gpir_claim_intelligence_source_run(text,uuid,integer)' AS function_signature,
    pg_catalog.pg_get_userbyid(claim_function.proowner) AS function_owner,
    claim_function.prosecdef AS security_definer,
    claim_function.proconfig AS function_configuration,
    pg_catalog.strpos(claim_function.definition, 'pg_catalog.greatest(') = 0
        AS invalid_greatest_qualification_absent,
    pg_catalog.strpos(claim_function.definition, 'pg_catalog.least(') = 0
        AS invalid_least_qualification_absent,
    pg_catalog.strpos(claim_function.definition, 'least(1800, greatest(60, coalesce(p_ttl_seconds, 900)))') > 0
        AS ttl_bounds_expression_present,
    pg_catalog.has_function_privilege('postgres', claim_function.oid, 'EXECUTE') AS postgres_execute,
    pg_catalog.has_function_privilege('service_role', claim_function.oid, 'EXECUTE') AS service_role_execute,
    pg_catalog.has_function_privilege('anon', claim_function.oid, 'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated', claim_function.oid, 'EXECUTE') AS authenticated_execute,
    EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
            coalesce(
                procedure_acl.proacl,
                pg_catalog.acldefault('f', procedure_acl.proowner)
            )
        ) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
    ) AS public_execute
FROM claim_function
JOIN pg_catalog.pg_proc AS procedure_acl
  ON procedure_acl.oid = claim_function.oid;

-- V2: claim table and matching-token release function remain unchanged.
SELECT
    class.relrowsecurity AS rls_enabled,
    class.relforcerowsecurity AS rls_forced,
    pg_catalog.has_function_privilege(
        'service_role',
        'public.gpir_release_intelligence_source_run(text,uuid)',
        'EXECUTE'
    ) AS service_role_release_execute,
    pg_catalog.has_function_privilege(
        'anon',
        'public.gpir_release_intelligence_source_run(text,uuid)',
        'EXECUTE'
    ) AS anon_release_execute,
    pg_catalog.has_function_privilege(
        'authenticated',
        'public.gpir_release_intelligence_source_run(text,uuid)',
        'EXECUTE'
    ) AS authenticated_release_execute,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS release_procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            coalesce(
                release_procedure.proacl,
                pg_catalog.acldefault('f', release_procedure.proowner)
            )
        ) AS privilege
        WHERE release_procedure.oid =
            'public.gpir_release_intelligence_source_run(text,uuid)'::regprocedure
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
    ) AS public_release_execute
FROM pg_catalog.pg_class AS class
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = class.relnamespace
WHERE namespace.nspname = 'public'
  AND class.relname = 'intelligence_source_run_claims'
  AND class.relkind = 'r';

-- V3: the failed first test must not have left an active lease.
SELECT
    source_id,
    expires_at,
    released_at,
    expires_at > pg_catalog.clock_timestamp() AS active
FROM public.intelligence_source_run_claims
WHERE source_id = 'SFA-APAC-001';

-- V4: scheduler remains absent.
SELECT
    jobid,
    jobname,
    schedule,
    active
FROM cron.job
WHERE jobname LIKE 'm33-g1-%'
   OR jobname ILIKE '%gpir%intelligence%'
   OR jobname ILIKE '%intelligence%gpir%'
ORDER BY jobname;

-- V5: protected production boundaries remain at the owner-verified baseline.
WITH observed_counts AS (
    SELECT 'RAW'::text AS measure, pg_catalog.count(*)::bigint AS observed_count
      FROM public.intelligence_raw_ingestion
    UNION ALL
    SELECT 'Candidates', pg_catalog.count(*)::bigint
      FROM public.intelligence_candidates
    UNION ALL
    SELECT 'Rejections', pg_catalog.count(*)::bigint
      FROM public.intelligence_rejection_log
    UNION ALL
    SELECT 'Handoffs', pg_catalog.count(*)::bigint
      FROM public.intelligence_canonical_handoffs
    UNION ALL
    SELECT 'Global announcements', pg_catalog.count(*)::bigint
      FROM public.global_announcements
), expected_counts(measure, expected_count) AS (
    VALUES
        ('RAW'::text, 9::bigint),
        ('Candidates', 9::bigint),
        ('Rejections', 0::bigint),
        ('Handoffs', 0::bigint),
        ('Global announcements', 77::bigint)
)
SELECT
    expected.measure,
    expected.expected_count,
    observed.observed_count,
    observed.observed_count = expected.expected_count AS boundary_unchanged
FROM expected_counts AS expected
JOIN observed_counts AS observed USING (measure)
ORDER BY expected.measure;
