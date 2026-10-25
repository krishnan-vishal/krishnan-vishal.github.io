-- M37 G1-03: provider-verified recurring-payment ownership, adjustments and
-- entitlement-period reconciliation. Apply only after the M37-B/M39 payment
-- boundary and the M37 G1-01/G1-02 migrations. This migration seeds no data.
begin;

alter table public.gpir_subscription_payment_evidence
  drop constraint if exists gpir_subscription_payment_evidence_provider_status_check;
alter table public.gpir_subscription_payment_evidence
  add constraint gpir_subscription_payment_evidence_provider_status_check
  check (provider_status in
    ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED'));

create table public.gpir_subscription_payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('SANDBOX', 'PRODUCTION')),
  local_subscription_id uuid not null,
  reader_user_id uuid not null,
  paypal_subscription_id text not null
    check (paypal_subscription_id ~ '^I-[A-Za-z0-9]+$'),
  paypal_transaction_id text not null check (paypal_transaction_id ~ '^[A-Za-z0-9]+$'),
  paypal_adjustment_id text not null check (paypal_adjustment_id ~ '^[A-Za-z0-9]+$'),
  provider_event_id text not null,
  adjustment_type text not null check (adjustment_type in ('REFUND', 'REVERSAL')),
  resulting_payment_status text not null,
  provider_adjusted_at timestamptz not null,
  provider_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint gpir_subscription_payment_adjustment_status_check check (
    (adjustment_type = 'REFUND' and resulting_payment_status in
      ('PARTIALLY_REFUNDED', 'REFUNDED'))
    or (adjustment_type = 'REVERSAL' and resulting_payment_status = 'REVERSED')
  ),
  constraint gpir_subscription_payment_adjustment_evidence_fk
    foreign key (environment, paypal_transaction_id)
    references public.gpir_subscription_payment_evidence
      (environment, paypal_transaction_id) on delete restrict,
  constraint gpir_subscription_payment_adjustment_event_unique
    unique (environment, provider_event_id),
  constraint gpir_subscription_payment_adjustment_provider_unique
    unique (environment, adjustment_type, paypal_adjustment_id)
);

create index gpir_subscription_payment_adjustment_owner_idx
  on public.gpir_subscription_payment_adjustments
    (environment, reader_user_id, local_subscription_id, provider_adjusted_at desc);

alter table public.gpir_subscription_payment_adjustments enable row level security;
revoke all on table public.gpir_subscription_payment_adjustments
  from public, anon, authenticated;
grant select, insert on table public.gpir_subscription_payment_adjustments
  to service_role;

-- v2 intentionally remains unchanged for existing callers. Its exact return
-- contract has five columns and does not expose subscription.user_id. v3 adds
-- authoritative ownership without accepting ownership from the webhook/client.
create function public.gpir_get_paypal_subscription_for_webhook_v3(
  p_local_subscription_id uuid,
  p_paypal_subscription_id text,
  p_environment text
)
returns table(
  local_subscription_id uuid,
  paypal_subscription_id text,
  provider_request_id text,
  paypal_plan_id text,
  subscription_status text,
  user_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select subscription.id, subscription.paypal_subscription_id,
    subscription.provider_request_id, plan.paypal_plan_id,
    subscription.status, subscription.user_id
  from public.gpir_paypal_subscriptions as subscription
  join public.gpir_subscription_plans as plan
    on plan.id = subscription.plan_id
   and plan.environment = subscription.environment
  where subscription.id = p_local_subscription_id
    and subscription.paypal_subscription_id = p_paypal_subscription_id
    and subscription.environment = p_environment
    and plan.environment = p_environment
    and p_environment in ('SANDBOX', 'PRODUCTION');
$$;

create function public.gpir_get_subscription_payment_for_webhook_v1(
  p_paypal_transaction_id text,
  p_environment text
)
returns table(
  local_subscription_id uuid,
  user_id uuid,
  paypal_subscription_id text,
  paypal_plan_id text,
  paypal_transaction_id text,
  currency text,
  gross_amount_minor bigint,
  provider_status text,
  provider_completed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select evidence.local_subscription_id, evidence.reader_user_id,
    evidence.paypal_subscription_id, plan.paypal_plan_id,
    evidence.paypal_transaction_id, evidence.currency,
    evidence.gross_amount_minor, evidence.provider_status,
    evidence.provider_completed_at
  from public.gpir_subscription_payment_evidence as evidence
  join public.gpir_paypal_subscriptions as subscription
    on subscription.id = evidence.local_subscription_id
   and subscription.user_id = evidence.reader_user_id
   and subscription.paypal_subscription_id = evidence.paypal_subscription_id
   and subscription.environment = evidence.environment
  join public.gpir_subscription_plans as plan
    on plan.id = subscription.plan_id
   and plan.environment = subscription.environment
  where evidence.paypal_transaction_id = p_paypal_transaction_id
    and evidence.environment = p_environment
    and p_environment in ('SANDBOX', 'PRODUCTION');
$$;

create function public.gpir_record_subscription_payment_adjustment_v1(
  p_local_subscription_id uuid,
  p_reader_user_id uuid,
  p_paypal_subscription_id text,
  p_paypal_transaction_id text,
  p_paypal_adjustment_id text,
  p_provider_event_id text,
  p_environment text,
  p_adjustment_type text,
  p_resulting_payment_status text,
  p_provider_adjusted_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_evidence public.gpir_subscription_payment_evidence%rowtype;
  existing_adjustment public.gpir_subscription_payment_adjustments%rowtype;
begin
  if p_environment not in ('SANDBOX', 'PRODUCTION')
     or p_local_subscription_id is null or p_reader_user_id is null
     or p_paypal_subscription_id is null or p_paypal_transaction_id is null
     or p_paypal_adjustment_id is null or p_provider_event_id is null
     or p_provider_adjusted_at is null
     or p_provider_adjusted_at > now() + interval '5 minutes'
     or not (
       (p_adjustment_type = 'REFUND' and p_resulting_payment_status in
         ('PARTIALLY_REFUNDED', 'REFUNDED'))
       or (p_adjustment_type = 'REVERSAL'
         and p_resulting_payment_status = 'REVERSED')
     )
  then
    return 'REJECTED';
  end if;

  select evidence.* into selected_evidence
  from public.gpir_subscription_payment_evidence as evidence
  where evidence.environment = p_environment
    and evidence.local_subscription_id = p_local_subscription_id
    and evidence.reader_user_id = p_reader_user_id
    and evidence.paypal_subscription_id = p_paypal_subscription_id
    and evidence.paypal_transaction_id = p_paypal_transaction_id
  for update;
  if not found then return 'NOT_FOUND'; end if;

  select adjustment.* into existing_adjustment
  from public.gpir_subscription_payment_adjustments as adjustment
  where adjustment.environment = p_environment
    and (adjustment.provider_event_id = p_provider_event_id
      or (adjustment.adjustment_type = p_adjustment_type
        and adjustment.paypal_adjustment_id = p_paypal_adjustment_id))
  for update;
  if found then
    if existing_adjustment.local_subscription_id = p_local_subscription_id
       and existing_adjustment.reader_user_id = p_reader_user_id
       and existing_adjustment.paypal_subscription_id = p_paypal_subscription_id
       and existing_adjustment.paypal_transaction_id = p_paypal_transaction_id
       and existing_adjustment.paypal_adjustment_id = p_paypal_adjustment_id
       and existing_adjustment.provider_event_id = p_provider_event_id
       and existing_adjustment.adjustment_type = p_adjustment_type
       and existing_adjustment.resulting_payment_status = p_resulting_payment_status
       and existing_adjustment.provider_adjusted_at = p_provider_adjusted_at
    then return 'DUPLICATE'; end if;
    return 'CONFLICT';
  end if;

  if selected_evidence.provider_status = 'REVERSED'
     or (selected_evidence.provider_status = 'REFUNDED'
       and p_resulting_payment_status <> 'REVERSED')
  then
    return 'CONFLICT';
  end if;

  insert into public.gpir_subscription_payment_adjustments (
    environment, local_subscription_id, reader_user_id,
    paypal_subscription_id, paypal_transaction_id, paypal_adjustment_id,
    provider_event_id, adjustment_type, resulting_payment_status,
    provider_adjusted_at
  ) values (
    p_environment, p_local_subscription_id, p_reader_user_id,
    p_paypal_subscription_id, p_paypal_transaction_id, p_paypal_adjustment_id,
    p_provider_event_id, p_adjustment_type, p_resulting_payment_status,
    p_provider_adjusted_at
  );

  update public.gpir_subscription_payment_evidence
  set provider_status = p_resulting_payment_status,
      provider_verified_at = now()
  where id = selected_evidence.id;

  -- A partial refund preserves the current paid period. A full refund or
  -- reversal expires only the affected latest period. A later eligible payment
  -- for the same reader/subscription prevents an older adjustment from removing
  -- current access. Billing status remains provider-controlled.
  if p_resulting_payment_status in ('REFUNDED', 'REVERSED')
     and not exists (
       select 1
       from public.gpir_subscription_payment_evidence as newer
       where newer.environment = p_environment
         and newer.local_subscription_id = p_local_subscription_id
         and newer.reader_user_id = p_reader_user_id
         and newer.id <> selected_evidence.id
         and newer.provider_status in ('COMPLETED', 'PARTIALLY_REFUNDED')
         and (newer.provider_completed_at > selected_evidence.provider_completed_at
           or (newer.provider_completed_at = selected_evidence.provider_completed_at
             and newer.created_at > selected_evidence.created_at))
     )
  then
    update public.gpir_paypal_subscriptions
    set effective_until = least(coalesce(effective_until, now()), now()),
        updated_at = now()
    where id = p_local_subscription_id
      and user_id = p_reader_user_id
      and paypal_subscription_id = p_paypal_subscription_id
      and environment = p_environment;
  end if;

  return 'RECORDED';
exception when unique_violation then
  return 'CONFLICT';
end;
$$;

revoke all on function public.gpir_get_paypal_subscription_for_webhook_v3(
  uuid, text, text),
  public.gpir_get_subscription_payment_for_webhook_v1(text, text),
  public.gpir_record_subscription_payment_adjustment_v1(
    uuid, uuid, text, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.gpir_get_paypal_subscription_for_webhook_v3(
  uuid, text, text),
  public.gpir_get_subscription_payment_for_webhook_v1(text, text),
  public.gpir_record_subscription_payment_adjustment_v1(
    uuid, uuid, text, text, text, text, text, text, text, timestamptz)
  to service_role;

comment on table public.gpir_subscription_payment_adjustments is
  'M37 G1-03 immutable provider-verified refund/reversal audit; no reader access.';
comment on function public.gpir_get_paypal_subscription_for_webhook_v3(
  uuid, text, text) is
  'Service-only webhook lookup adding authoritative subscription.user_id while preserving v2.';
comment on function public.gpir_record_subscription_payment_adjustment_v1(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz) is
  'Service-only idempotent recurring-payment refund/reversal reconciliation. Partial refunds preserve the paid period; latest full refunds/reversals expire it.';

commit;
