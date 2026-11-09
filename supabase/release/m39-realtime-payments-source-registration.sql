-- M39 real-time payments source activation. Data and schedule only: no table, column, grant,
-- function or threshold changes. Approved after owner direction to move ECB out of the primary
-- real-time acquisition strategy; ECB ingestion (m33-g1-ecb-ingestion) is retained unchanged.
-- Trust tiers follow verified provenance: independent trade journalism is T3 (same as PYMNTS,
-- 95 automatic threshold plus editorial route); the European Payments Council is the SEPA scheme
-- manager and an industry body, matching the existing T1.5 payments associations (threshold 80).
-- Apply only after the matching gpir-intelligence-fetch deployment. Idempotent.
begin;

insert into public.source_registry (
  source_id, source_name, country_iso3, country, region_tags, category,
  trust_tier, official_url, acquisition_method, feed_or_index_url,
  poll_minutes, parser_profile, source_status
) values
  ('PAYMENTSDIVE-US-005', 'Payments Dive', 'USA', 'United States', null,
   'Financial Services Media', 'T3', 'https://www.paymentsdive.com/', 'A',
   'https://www.paymentsdive.com/feeds/news/', 30, 'trade-rss-v1', 'GREEN'),
  ('FINEXTRA-PAY-006', 'Finextra Payments', 'GBR', 'Global', null,
   'Financial Services Media', 'T3', 'https://www.finextra.com/', 'A',
   'https://www.finextra.com/rss/channel.aspx?channel=payments', 60, 'trade-rss-v1', 'GREEN'),
  ('EPC-EUR-007', 'European Payments Council', 'BEL', 'Belgium', null,
   'Payment Scheme Manager', 'T1.5', 'https://www.europeanpaymentscouncil.eu/', 'A',
   'https://www.europeanpaymentscouncil.eu/news-insights', 60, 'epc-news-html-v1', 'GREEN')
on conflict (source_id) do nothing;

-- Same authenticated pattern as the existing hourly ingestion jobs (vault secret, no literal credential).
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
  ('m39-paymentsdive-ingestion', '10,40 * * * *', 'PAYMENTSDIVE-US-005'),
  ('m39-finextra-payments-ingestion', '30 * * * *', 'FINEXTRA-PAY-006'),
  ('m39-epc-ingestion', '55 * * * *', 'EPC-EUR-007'),
  ('m39-rba-ingestion', '35 * * * *', 'TEST-RBA-01')
) as job(name, schedule, source_id);

commit;
