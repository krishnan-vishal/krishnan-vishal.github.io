-- M33-G1 Step 6E-G7 — OWNER-EXECUTED READ-ONLY PREFLIGHT ONLY
-- Purpose: resolve the remaining source_registry vocabulary and Global-scope
-- conventions before any PYMNTS onboarding SQL is generated.
-- This script contains no INSERT, UPDATE, DELETE, DDL, function invocation,
-- transaction-control, or access to RAW/candidate/publication tables.

-- Exact source_registry columns, types, nullability and defaults.
SELECT
    a.attnum,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS not_null,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relname = 'source_registry'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

-- Any production constraints, indexes and their exact definitions.
SELECT
    con.conname,
    con.contype,
    pg_catalog.pg_get_constraintdef(con.oid) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'source_registry'
ORDER BY con.conname;

-- Minimal existing semantic examples only: known Source-1/2/blocked Source-3
-- and any already established Global-scoped record. This resolves the
-- single-character acquisition vocabulary and Global field conventions.
SELECT
    source_id,
    country_iso3,
    country,
    region_tags,
    category,
    trust_tier,
    acquisition_method,
    feed_or_index_url,
    poll_minutes,
    parser_profile,
    source_status
FROM public.source_registry
WHERE source_id IN ('SFA-APAC-001', 'CB-APAC-010', 'FS-GLOBAL-003')
   OR lower(country) = 'global'
ORDER BY source_id;
