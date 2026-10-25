-- M37 G1-01: evidence ledger only. No payment or entitlement is created by this migration.
-- Provider reconciliation (G1-02) must independently verify every row before insertion.
create table if not exists public.gpir_subscription_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('SANDBOX', 'LIVE')),
  local_subscription_id uuid not null,
  reader_user_id uuid not null,
  paypal_subscription_id text not null check (paypal_subscription_id ~ '^I-[A-Za-z0-9]+$'),
  paypal_transaction_id text not null check (paypal_transaction_id ~ '^[A-Za-z0-9]+$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_amount_minor bigint not null check (gross_amount_minor > 0),
  provider_status text not null check (provider_status in ('COMPLETED', 'REFUNDED', 'REVERSED')),
  provider_completed_at timestamptz not null,
  provider_verified_at timestamptz not null default now(),
  provider_evidence_source text not null check (provider_evidence_source in ('PAYPAL_API', 'PAYPAL_VERIFIED_WEBHOOK')),
  provider_event_id text,
  created_at timestamptz not null default now(),
  constraint gpir_subscription_payment_unique_txn unique (environment, paypal_transaction_id),
  constraint gpir_subscription_payment_unique_event unique (environment, provider_event_id)
);
create index if not exists gpir_subscription_payment_owner_lookup
  on public.gpir_subscription_payment_evidence (environment, reader_user_id, local_subscription_id, provider_completed_at desc);
create index if not exists gpir_subscription_payment_provider_lookup
  on public.gpir_subscription_payment_evidence (environment, paypal_subscription_id, provider_status);
alter table public.gpir_subscription_payment_evidence enable row level security;
revoke all on public.gpir_subscription_payment_evidence from public, anon, authenticated;
-- No authenticated-reader policies and no client insert/update/delete privileges.
-- G1-02 will add a narrowly scoped SECURITY DEFINER reconciliation RPC after
-- matching the existing subscription table's actual schema and ownership rules.
comment on table public.gpir_subscription_payment_evidence is
  'M37 G1-01: restricted PayPal subscription payment evidence; ACTIVE billing alone never proves payment.';
