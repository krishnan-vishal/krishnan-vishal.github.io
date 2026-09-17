-- M33-G1 Step 6E-G10 — OWNER-EXECUTED PRODUCTION ONBOARDING ONLY
-- Preconditions evidenced by G8/G10: source_registry PK is source_id;
-- acquisition_method A is the existing RSS/feed vocabulary; NULL region_tags
-- is the existing convention. This script touches public.source_registry only.

BEGIN;

INSERT INTO public.source_registry (
    source_id,
    source_name,
    country_iso3,
    country,
    region_tags,
    category,
    trust_tier,
    official_url,
    acquisition_method,
    feed_or_index_url,
    poll_minutes,
    parser_profile,
    source_status
) VALUES (
    'PYMNTS-GLOBAL-004',
    'PYMNTS',
    'USA',
    'Global',
    NULL,
    'Financial Services Media',
    'T3',
    'https://www.pymnts.com/',
    'A',
    'https://www.pymnts.com/feed/',
    60,
    'universal-finance',
    'GREEN'
)
ON CONFLICT (source_id) DO NOTHING;

-- Returns only the requested source for owner verification. If the ID existed,
-- the insert was a no-op and this SELECT returns the pre-existing record.
SELECT
    source_id,
    source_name,
    country_iso3,
    country,
    region_tags,
    category,
    trust_tier,
    official_url,
    acquisition_method,
    feed_or_index_url,
    poll_minutes,
    parser_profile,
    source_status
FROM public.source_registry
WHERE source_id = 'PYMNTS-GLOBAL-004';

COMMIT;
