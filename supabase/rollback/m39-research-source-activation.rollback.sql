-- Preserve acquired evidence and audit history. Disable rather than delete.
begin;

select cron.unschedule(jobname)
from cron.job
where jobname in ('m39-fintechnews-sg-ingestion', 'm39-atlas-payments-ingestion');

update public.source_registry
set source_status = 'DISABLED'
where source_id in ('FINTECHNEWS-SG-008', 'ATLAS-APAC-009', 'FXC-GLOBAL-010');

commit;
