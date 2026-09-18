-- M33-G1 Step 7C owner-only scheduler activation artifact. DO NOT RUN YET.
-- Preconditions: claim migration applied; claim-aware Edge Function deployed;
-- manual normal/overlap/boundary verification passed; owner separately approves
-- scheduler activation. This file creates no new ingestion engine.

BEGIN;

DO $m33_scheduler$
DECLARE
    edge_function_url constant text := 'https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-intelligence-fetch';
    source_record record;
    job_command text;
BEGIN
    PERFORM 1
      FROM vault.decrypted_secrets
     WHERE name = 'gpir_edge_function_secret'
       AND decrypted_secret IS NOT NULL
       AND decrypted_secret <> '';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'M33-G1 scheduler activation requires Vault secret gpir_edge_function_secret';
    END IF;

    FOR source_record IN
        SELECT * FROM (VALUES
            ('m33-g1-sfa-ingestion', '5 * * * *', 'SFA-APAC-001'),
            ('m33-g1-rbi-ingestion', '25 * * * *', 'CB-APAC-010'),
            ('m33-g1-pymnts-ingestion', '45 * * * *', 'PYMNTS-GLOBAL-004')
        ) AS schedule(job_name, cron_expression, source_id)
    LOOP
        -- Owner activation re-checks the proven finite allowlist, registry
        -- health and the currently documented 60-minute poll cadence.
        IF NOT EXISTS (
            SELECT 1 FROM public.source_registry source
             WHERE source.source_id = source_record.source_id
               AND source.source_status = 'GREEN'
               AND source.poll_minutes = 60
        ) THEN
            RAISE EXCEPTION 'M33-G1 scheduler eligibility failed for %', source_record.source_id;
        END IF;

        job_command := pg_catalog.format(
            $command$
SELECT net.http_post(
    url := %L,
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', secret.decrypted_secret,
        'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := jsonb_build_object('source_id', %L, 'dry_run', false)
)
FROM vault.decrypted_secrets AS secret
WHERE secret.name = 'gpir_edge_function_secret'
  AND secret.decrypted_secret IS NOT NULL
  AND secret.decrypted_secret <> '';
$command$,
            edge_function_url,
            source_record.source_id
        );

        -- Idempotent re-application changes only this named M33 job.
        PERFORM cron.unschedule(existing_job.jobid)
          FROM cron.job AS existing_job
         WHERE existing_job.jobname = source_record.job_name;
        PERFORM cron.schedule(source_record.job_name, source_record.cron_expression, job_command);
    END LOOP;
END
$m33_scheduler$;

COMMIT;
