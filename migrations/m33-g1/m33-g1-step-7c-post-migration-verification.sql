-- M33-G1 Step 7C owner read-only post-migration verification.
-- Run only after m33-g1-source-run-claim.sql and before Edge deployment.
-- This file performs SELECT-only catalog/count checks. It does not read or
-- reveal Vault values and does not create, alter, invoke or schedule anything.

-- V1: claim table presence and RLS state.
SELECT
    pg_catalog.to_regclass('public.intelligence_source_run_claims') AS claim_table,
    class.relrowsecurity AS rls_enabled,
    class.relforcerowsecurity AS rls_forced,
    pg_catalog.pg_get_userbyid(class.relowner) AS table_owner
FROM pg_catalog.pg_class AS class
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = class.relnamespace
WHERE namespace.nspname = 'public'
  AND class.relname = 'intelligence_source_run_claims'
  AND class.relkind = 'r';

-- V2: exact RPC definitions, owner, SECURITY DEFINER state, safe search_path,
-- and effective EXECUTE privilege. public_execute must be false; anon_execute
-- and authenticated_execute must be false; service_role_execute must be true.
SELECT
    namespace.nspname AS function_schema,
    procedure.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
    pg_catalog.pg_get_userbyid(procedure.proowner) AS function_owner,
    procedure.prosecdef AS security_definer,
    procedure.proconfig AS function_configuration,
    EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
            coalesce(
                procedure.proacl,
                pg_catalog.acldefault('f', procedure.proowner)
            )
        ) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
    ) AS public_execute,
    pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') AS authenticated_execute,
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') AS service_role_execute
FROM pg_catalog.pg_proc AS procedure
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
      'gpir_claim_intelligence_source_run',
      'gpir_release_intelligence_source_run'
  )
ORDER BY procedure.proname;

-- V3: direct table privileges. No PUBLIC/anon/authenticated/service_role table
-- privilege should appear; the function owner operates through SECURITY DEFINER.
SELECT
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'intelligence_source_run_claims'
ORDER BY grantee, privilege_type;

-- V4: no M33 or GPIR intelligence Cron job may exist before the separately
-- authorized scheduler activation milestone. Expected result: zero rows.
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

-- V5: owner-verified Step 7B production baseline must remain unchanged.
-- Every baseline_unchanged value must be true.
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
        ('Global announcements', 39::bigint)
)
SELECT
    expected.measure,
    expected.expected_count,
    observed.observed_count,
    observed.observed_count = expected.expected_count AS baseline_unchanged
FROM expected_counts AS expected
JOIN observed_counts AS observed USING (measure)
ORDER BY expected.measure;
