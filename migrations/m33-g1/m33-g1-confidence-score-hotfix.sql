-- M33-G1 Step 6E-D2: confidence score storage compatibility hotfix.
-- Apply only after owner pre-checks; no business-row mutation beyond PostgreSQL's
-- representation change is performed.
BEGIN;

ALTER TABLE public.intelligence_candidates
    ALTER COLUMN confidence_score TYPE numeric(5,2)
    USING confidence_score::numeric(5,2);

COMMIT;
