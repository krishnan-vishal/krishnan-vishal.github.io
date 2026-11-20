-- SEP-01 private durable queue. Apply only after release review.
create table if not exists public.gpir_sep01_jobs (
 job_id text primary key,
 idempotency_key text not null unique,
 branch text not null,
 locked_paths text[] not null check (cardinality(locked_paths)>0),
 scope text not null,
 capability text not null default 'code',
 sensitivity_tier text,
 remaining_budget numeric not null default 0,
 status text not null default 'QUEUED',
 provider text,
 checkpoint_commit text check (checkpoint_commit is null or checkpoint_commit ~ '^[a-f0-9]{40}$'),
 last_safe_step text,
 reason text,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
alter table public.gpir_sep01_jobs enable row level security;
revoke all on public.gpir_sep01_jobs from public,anon,authenticated;
grant select,insert,update on public.gpir_sep01_jobs to service_role;
create unique index if not exists gpir_sep01_one_active_branch
 on public.gpir_sep01_jobs(branch)
 where status in ('CLAIMED','CHECKPOINTED','PR_READY','CI_VERIFIED','RELEASE_ELIGIBLE');
create index if not exists gpir_sep01_queued_created
 on public.gpir_sep01_jobs(created_at) where status='QUEUED';
