-- M42 controlled hourly activation. Apply only after source registration,
-- dry-run canaries, oldest-to-newest FATF/OFAC backfill and a successful current run.
-- Existing 95% publication and 12-hour presentation gates remain authoritative.

begin;

select cron.schedule(job.name, job.schedule, format($job$
select net.http_post(
    url := 'https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-regulatory-fetch',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', secret.decrypted_secret,
        'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := jsonb_build_object('source_id', %L, 'mode', 'CURRENT', 'dry_run', false),
    timeout_milliseconds := 55000
)
from vault.decrypted_secrets as secret
where secret.name = 'gpir_edge_function_secret'
  and secret.decrypted_secret is not null
  and secret.decrypted_secret <> '';
$job$, job.source_id))
from (values
    ('m42-ofac-regulatory-hourly', '5 * * * *', 'OFAC-US-001'),
    ('m42-fatf-classification-hourly', '35 * * * *', 'FATF-GLOBAL-001')
) as job(name, schedule, source_id);

commit;
