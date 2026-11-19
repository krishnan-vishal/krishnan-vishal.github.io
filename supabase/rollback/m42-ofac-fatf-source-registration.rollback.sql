-- M42 rollback preserves all acquired documents, events, history and checkpoints.
-- Sources are disabled and schedules removed; no validated knowledge is deleted.

begin;

select cron.unschedule(jobname)
from cron.job
where jobname in ('m42-ofac-regulatory-hourly', 'm42-fatf-classification-hourly');

update public.source_registry
set source_status = 'DISABLED'
where (source_id = 'OFAC-US-001' and parser_profile = 'ofac-sls-regulatory-v1')
   or (source_id = 'FATF-GLOBAL-001' and parser_profile = 'fatf-country-classification-v1');

commit;
