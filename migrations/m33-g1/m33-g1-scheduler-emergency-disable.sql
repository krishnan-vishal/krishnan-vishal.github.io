-- M33-G1 Step 7A owner-only emergency scheduler disable. DO NOT RUN YET.
-- It unschedules only the three named M33 ingestion jobs. It never deletes or
-- changes source records, RAW, candidates, run history, announcements or ticker.

BEGIN;

DO $m33_disable$
DECLARE
    job_record record;
BEGIN
    FOR job_record IN
        SELECT jobid
          FROM cron.job
         WHERE jobname IN (
            'm33-g1-sfa-ingestion',
            'm33-g1-rbi-ingestion',
            'm33-g1-pymnts-ingestion'
         )
    LOOP
        PERFORM cron.unschedule(job_record.jobid);
    END LOOP;
END
$m33_disable$;

COMMIT;
