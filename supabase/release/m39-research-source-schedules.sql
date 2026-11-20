-- Apply only after both source canaries and the bounded historical backfill
-- complete without source-contract failures. Reuses the existing Vault secret
-- and governed fetch function; no credential is stored in this file.
begin;

select cron.schedule(job.name, job.schedule, format($job$
select net.http_post(
  url := 'https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-intelligence-fetch',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', secret.decrypted_secret,
    'Authorization', 'Bearer ' || secret.decrypted_secret
  ),
  body := jsonb_build_object('source_id', %L, 'dry_run', false),
  timeout_milliseconds := 55000
)
from vault.decrypted_secrets as secret
where secret.name = 'gpir_edge_function_secret'
  and secret.decrypted_secret is not null
  and secret.decrypted_secret <> '';
$job$, job.source_id))
from (values
  ('m39-fintechnews-sg-ingestion', '50 * * * *', 'FINTECHNEWS-SG-008'),
  ('m39-atlas-payments-ingestion', '55 * * * *', 'ATLAS-APAC-009')
) as job(name, schedule, source_id);

commit;
