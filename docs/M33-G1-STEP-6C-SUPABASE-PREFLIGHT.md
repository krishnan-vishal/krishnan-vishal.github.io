# M33-G1 Step 6C — Supabase Read-only Preflight

## Status

**STOPPED at the access gate.** The working branch was clean and correctly
checked out; Step 6A was reviewed and Step 6B isolated PostgreSQL proof is
PASS. This workspace has no authenticated, read-only Supabase metadata
inspection path. No credential was requested or used, and no Supabase action
was performed.

No schema, data, function, policy, grant, scheduler, publication, ticker or
deployment change is authorized or made by this record.

## Owner-run read-only catalog capture

Run the following in the authenticated Supabase SQL Editor. They use only
catalog views and `SELECT`; they do not invoke GPIR functions or retrieve RAW
content.

```sql
-- Tables, columns, defaults and RLS.
SELECT c.relname AS table_name, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression,
       c.relrowsecurity AS rls_enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname IN ('source_registry','intelligence_raw_ingestion','intelligence_candidates','intelligence_rejection_log','intelligence_ingestion_runs','global_announcements')
ORDER BY c.relname, a.attnum;

-- Constraints, indexes, policies and function metadata/definitions.
SELECT c.relname, con.conname, con.contype, pg_catalog.pg_get_constraintdef(con.oid)
FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid = con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('source_registry','intelligence_raw_ingestion','intelligence_candidates','intelligence_rejection_log','intelligence_ingestion_runs','global_announcements');
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname='public';
SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_function_result(p.oid), p.provolatile, p.prosecdef, p.proconfig, pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_hash, pg_catalog.pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('gpir_rejection_reason','gpir_intelligence_assessment','gpir_process_raw_record','gpir_process_raw_batch');

-- Counts only and scheduler metadata where the extension is installed.
SELECT 'intelligence_raw_ingestion' AS name, count(*) FROM public.intelligence_raw_ingestion UNION ALL SELECT 'intelligence_candidates', count(*) FROM public.intelligence_candidates UNION ALL SELECT 'intelligence_rejection_log', count(*) FROM public.intelligence_rejection_log UNION ALL SELECT 'intelligence_ingestion_runs', count(*) FROM public.intelligence_ingestion_runs UNION ALL SELECT 'global_announcements', count(*) FROM public.global_announcements;
SELECT jobid, schedule, command, active FROM cron.job WHERE command ~* 'gpir_process_raw|gpir_create_canonical_handoff';
```

After owner-supplied output is available, compare it to the Step 6A migration
and capture the rollback baseline before any controlled application decision.
