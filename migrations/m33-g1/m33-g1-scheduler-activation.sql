-- M33-G1 Step 7A owner-only scheduler activation artifact. DO NOT RUN YET.
-- Preconditions: Step 7A claim migration applied; owner verifies pg_cron,
-- pg_net, Vault access, least-privilege EXECUTE grants and the existing Edge
-- Function endpoint. This file creates no new ingestion engine.
--
-- Replace the one deliberately guarded non-secret value below with the
-- verified existing production endpoint before controlled activation.

BEGIN;

DO $m33_scheduler$
DECLARE
    edge_function_url text := '__OWNER_VERIFIED_EDGE_FUNCTION_URL__';
    source_record record;
    job_command text;
BEGIN
    IF edge_function_url = '__OWNER_VERIFIED_EDGE_FUNCTION_URL__' THEN
        RAISE EXCEPTION 'M33-G1 scheduler activation requires the owner-verified existing Edge Function URL';
    END IF;

    PERFORM 1 FROM vault.decrypted_secrets WHERE name = 'gpir_edge_function_secret';
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
        'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
              FROM vault.decrypted_secrets
             WHERE name = 'gpir_edge_function_secret'
        )
    ),
    body := jsonb_build_object('source_id', %L, 'dry_run', false)
);
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
