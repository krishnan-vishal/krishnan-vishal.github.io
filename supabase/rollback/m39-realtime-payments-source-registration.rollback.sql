-- Preserves acquired evidence and foreign-key history: sources are disabled, never deleted.
begin;

update public.source_registry
set source_status = 'DISABLED'
where source_id in ('PAYMENTSDIVE-US-005', 'FINEXTRA-PAY-006', 'EPC-EUR-007')
  and parser_profile in ('trade-rss-v1', 'epc-news-html-v1');

select cron.unschedule(jobname)
from cron.job
where jobname in ('m39-paymentsdive-ingestion', 'm39-finextra-payments-ingestion', 'm39-epc-ingestion', 'm39-rba-ingestion');

commit;
