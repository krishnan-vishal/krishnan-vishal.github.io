-- M40 CUTOVER HOLD: this migration is intentionally non-executable until
-- the replacement publisher is deployed, trusted credentials work, and
-- existing Global Alerts publication has passed a live parity check.
-- Do not automatically revoke legacy RPC grants or unschedule the live job.
do $m40_cutover_hold$
begin
  raise exception 'M40_CUTOVER_NOT_AUTHORIZED: verify publisher parity and approve separate release';
end
$m40_cutover_hold$;

-- Coordinate with the protected GitHub publisher; no production application
-- until its environment, credential isolation and schedule are approved.
do $$
declare
  job_id bigint;
begin
  for job_id in select jobid from cron.job where jobname = 'g1-intelligence-publication'
  loop
    perform cron.unschedule(job_id);
  end loop;
end
$$;
