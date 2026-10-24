-- M37 G1-02: server-only, database-matched subscription payment reconciliation.
-- Apply AFTER 20261023000200 environment alignment. No transaction is seeded.
create or replace function public.gpir_record_verified_subscription_payment_v1(
 p_local_subscription_id uuid, p_reader_user_id uuid,
 p_paypal_subscription_id text, p_paypal_transaction_id text,
 p_environment text, p_currency text, p_gross_amount_minor bigint,
 p_provider_completed_at timestamptz, p_provider_evidence_source text,
 p_provider_event_id text default null)
returns text
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
 s record;
 existing record;
begin
 if p_environment not in ('SANDBOX','PRODUCTION')
    or p_local_subscription_id is null or p_reader_user_id is null
    or p_paypal_subscription_id is null or p_paypal_transaction_id is null
    or p_provider_completed_at is null or p_provider_completed_at > now() + interval '5 minutes'
    or p_provider_evidence_source not in ('PAYPAL_API','PAYPAL_VERIFIED_WEBHOOK')
 then return 'REJECTED'; end if;
 select s.id, s.user_id, s.paypal_subscription_id, s.status,
        p.currency, p.unit_amount_minor
 into s
 from public.gpir_paypal_subscriptions s
 join public.gpir_subscription_plans p on p.id = s.plan_id
   and p.environment = s.environment
 where s.id = p_local_subscription_id
   and s.user_id = p_reader_user_id
   and s.environment = p_environment
   and s.paypal_subscription_id = p_paypal_subscription_id
   and s.status = 'ACTIVE'
 for update of s;
 if not found or s.currency is distinct from p_currency
    or s.unit_amount_minor is distinct from p_gross_amount_minor
 then return 'REJECTED'; end if;
 select e.* into existing
 from public.gpir_subscription_payment_evidence e
 where e.environment = p_environment
   and (e.paypal_transaction_id = p_paypal_transaction_id
        or (p_provider_event_id is not null and e.provider_event_id = p_provider_event_id))
 for update;
 if found then
   if existing.local_subscription_id = p_local_subscription_id
      and existing.reader_user_id = p_reader_user_id
      and existing.paypal_subscription_id = p_paypal_subscription_id
      and existing.paypal_transaction_id = p_paypal_transaction_id
      and existing.currency = p_currency
      and existing.gross_amount_minor = p_gross_amount_minor
      and existing.provider_status = 'COMPLETED'
      and existing.provider_completed_at = p_provider_completed_at
   then return 'DUPLICATE'; end if;
   return 'CONFLICT';
 end if;
 insert into public.gpir_subscription_payment_evidence
 (environment, local_subscription_id, reader_user_id, paypal_subscription_id,
  paypal_transaction_id, currency, gross_amount_minor, provider_status,
  provider_completed_at, provider_evidence_source, provider_event_id)
 values
 (p_environment, p_local_subscription_id, p_reader_user_id, p_paypal_subscription_id,
  p_paypal_transaction_id, p_currency, p_gross_amount_minor, 'COMPLETED',
  p_provider_completed_at, p_provider_evidence_source, p_provider_event_id);
 return 'RECORDED';
exception when unique_violation then
 return 'CONFLICT';
end $$;
revoke all on function public.gpir_record_verified_subscription_payment_v1(
 uuid,uuid,text,text,text,text,bigint,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.gpir_record_verified_subscription_payment_v1(
 uuid,uuid,text,text,text,text,bigint,timestamptz,text,text) to service_role;
comment on function public.gpir_record_verified_subscription_payment_v1(
 uuid,uuid,text,text,text,text,bigint,timestamptz,text,text)
is 'Service-role-only persistence of provider-verified recurring payments. Caller must verify with PayPal before invocation; this function matches local subscription ownership, plan amount and currency.';
