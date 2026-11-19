-- M42 controlled OFAC/FATF source activation.
-- Apply only after migration 20261119090000 and the reviewed
-- gpir-regulatory-fetch deployment. This does not change publication thresholds.
-- Existing 12-hour visibility and archive lifecycle remain authoritative.

begin;

insert into public.source_registry (
    source_id, source_name, country_iso3, country, region_tags, category,
    trust_tier, official_url, acquisition_method, feed_or_index_url,
    poll_minutes, parser_profile, source_status
) values
    (
        'OFAC-US-001',
        'U.S. Department of the Treasury — Office of Foreign Assets Control',
        'USA',
        'United States',
        array['AMERICAS', 'GLOBAL'],
        'Official Sanctions Authority',
        'T1',
        'https://ofac.treasury.gov/sanctions-list-service',
        'A',
        'https://ofac.treasury.gov/recent-actions',
        60,
        'ofac-sls-regulatory-v1',
        'GREEN'
    ),
    (
        'FATF-GLOBAL-001',
        'Financial Action Task Force',
        'FRA',
        'Global',
        array['GLOBAL'],
        'Official Country Classification Authority',
        'T1',
        'https://www.fatf-gafi.org/en/topics/high-risk-and-other-monitored-jurisdictions.html',
        'A',
        'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html',
        60,
        'fatf-country-classification-v1',
        'GREEN'
    )
on conflict (source_id) do update set
    source_name = excluded.source_name,
    country_iso3 = excluded.country_iso3,
    country = excluded.country,
    region_tags = excluded.region_tags,
    category = excluded.category,
    trust_tier = excluded.trust_tier,
    official_url = excluded.official_url,
    acquisition_method = excluded.acquisition_method,
    feed_or_index_url = excluded.feed_or_index_url,
    poll_minutes = excluded.poll_minutes,
    parser_profile = excluded.parser_profile,
    source_status = excluded.source_status;

-- Existing secret-backed Edge invocation pattern. Jobs are offset within the hour
-- and remain independent of the 12-hour presentation window.
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
