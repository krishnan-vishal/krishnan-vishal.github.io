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
