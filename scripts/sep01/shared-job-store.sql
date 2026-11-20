-- SEP-01: private command state; apply only through reviewed release.
-- Public schema is used for PostgREST RPC routing; RLS and privileges deny client access.
create table if not exists public.gpir_sep01_jobs (
  job_id text primary key,
  idempotency_key text not null,
  revision bigint not null default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint sep01_job_id_valid check (job_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  constraint sep01_revision_valid check (revision > 0)
);
alter table public.gpir_sep01_jobs enable row level security;
revoke all on public.gpir_sep01_jobs from public, anon, authenticated;
grant select, insert, update on public.gpir_sep01_jobs to service_role;

-- CAS update is atomic across workers; stale writers cannot overwrite a checkpoint.
create or replace function public.gpir_sep01_cas_job(
  p_job_id text, p_idempotency_key text, p_expected_revision bigint, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_record public.gpir_sep01_jobs%rowtype;
begin
  if p_job_id !~ '^[A-Za-z0-9_-]{1,100}$' or p_idempotency_key is null
     or length(p_idempotency_key) = 0 or p_payload->>'job_id' is distinct from p_job_id
     or p_payload->>'idempotency_key' is distinct from p_idempotency_key then
    raise exception 'INVALID_JOB_CONTRACT';
  end if;
  -- Serialize ownership claims across independent runners and distinct job IDs.\n  perform pg_catalog.pg_advisory_xact_lock(60401);\n  if p_payload->>'status' in ('CLAIMED','CHECKPOINTED','PR_READY','CI_VERIFIED','RELEASE_ELIGIBLE') and exists (\n    select 1 from public.gpir_sep01_jobs j\n    where j.job_id <> p_job_id\n      and j.payload->>'status' in ('CLAIMED','CHECKPOINTED','PR_READY','CI_VERIFIED','RELEASE_ELIGIBLE')\n      and (j.payload->>'branch' = p_payload->>'branch' or exists (\n        select 1 from jsonb_array_elements_text(coalesce(j.payload->'locked_paths','[]'::jsonb)) a(path)\n        join jsonb_array_elements_text(coalesce(p_payload->'locked_paths','[]'::jsonb)) b(path) using(path)\n      ))\n  ) then raise exception 'WRITER_LOCK_CONFLICT'; end if;\n  if p_expected_revision is null then
    insert into public.gpir_sep01_jobs(job_id,idempotency_key,payload)
    values(p_job_id,p_idempotency_key,p_payload)
    on conflict do nothing returning * into v_record;
  else
    update public.gpir_sep01_jobs
    set revision=revision+1,payload=p_payload,updated_at=now()
    where job_id=p_job_id and idempotency_key=p_idempotency_key
      and revision=p_expected_revision returning * into v_record;
  end if;
  if not found then raise exception 'STALE_REVISION_OR_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('job_id',v_record.job_id,'revision',v_record.revision)
    || v_record.payload;
end $$;
revoke all on function public.gpir_sep01_cas_job(text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.gpir_sep01_cas_job(text,text,bigint,jsonb) to service_role;
