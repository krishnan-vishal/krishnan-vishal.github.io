-- M33-G1 Step 7A claim-layer rollback. PREPARED ONLY.
-- Run only after the three M33 ingestion schedules have been disabled and no
-- source claim is active. This never touches RAW, candidates, runs or sources.

BEGIN;

DROP FUNCTION IF EXISTS public.gpir_release_intelligence_source_run(text, uuid);
DROP FUNCTION IF EXISTS public.gpir_claim_intelligence_source_run(text, uuid, integer);
DROP TABLE IF EXISTS public.intelligence_source_run_claims;

COMMIT;
