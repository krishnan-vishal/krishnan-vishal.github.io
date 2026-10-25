-- M37 G1-02: correct unassigned record handling in restricted payment writer.
-- Sandbox acceptance: original PayPal payment reconciled once (HTTP 200, paymentConfirmed true).
-- No payment evidence is inserted by this migration.
create or replace function public.gpir_record_verified_subscription_payment_v1(
    p_local_subscription_id uuid,
    p_reader_user_id uuid,
    p_paypal_subscription_id text,
    p_paypal_transaction_id text,
    p_environment text,
    p_currency text,
    p_gross_amount_minor bigint,
    p_provider_completed_at timestamptz,
    p_provider_evidence_source text,
    p_provider_event_id text default null
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
    v_subscription record;
    v_existing record;
begin
    if p_environment not in ('SANDBOX', 'PRODUCTION')
       or p_local_subscription_id is null
       or p_reader_user_id is null
       or p_paypal_subscription_id is null
       or p_paypal_transaction_id is null
       or p_provider_completed_at is null
       or p_provider_completed_at > now() + interval '5 minutes'
       or p_provider_evidence_source not in ('PAYPAL_API', 'PAYPAL_VERIFIED_WEBHOOK')
    then
        return 'REJECTED';
    end if;

    select sub.id, sub.user_id, sub.paypal_subscription_id, sub.status,
           plan.currency, plan.unit_amount_minor
      into v_subscription
      from public.gpir_paypal_subscriptions as sub
      join public.gpir_subscription_plans as plan
        on plan.id = sub.plan_id
       and plan.environment = sub.environment
     where sub.id = p_local_subscription_id
       and sub.user_id = p_reader_user_id
       and sub.environment = p_environment
       and sub.paypal_subscription_id = p_paypal_subscription_id
       and sub.status = 'ACTIVE'
     for update of sub;

    if not found then
        return 'REJECTED';
    end if;

    if v_subscription.currency is distinct from p_currency
       or v_subscription.unit_amount_minor is distinct from p_gross_amount_minor
    then
        return 'REJECTED';
    end if;

    select evidence.*
      into v_existing
      from public.gpir_subscription_payment_evidence as evidence
     where evidence.environment = p_environment
       and (evidence.paypal_transaction_id = p_paypal_transaction_id
            or (p_provider_event_id is not null
                and evidence.provider_event_id = p_provider_event_id))
     for update;

    if found then
        if v_existing.local_subscription_id = p_local_subscription_id
           and v_existing.reader_user_id = p_reader_user_id
           and v_existing.paypal_subscription_id = p_paypal_subscription_id
           and v_existing.paypal_transaction_id = p_paypal_transaction_id
           and v_existing.currency = p_currency
           and v_existing.gross_amount_minor = p_gross_amount_minor
           and v_existing.provider_status = 'COMPLETED'
           and v_existing.provider_completed_at = p_provider_completed_at
        then
            return 'DUPLICATE';
        end if;
        return 'CONFLICT';
    end if;

    insert into public.gpir_subscription_payment_evidence (
        environment, local_subscription_id, reader_user_id,
        paypal_subscription_id, paypal_transaction_id, currency,
        gross_amount_minor, provider_status, provider_completed_at,
        provider_evidence_source, provider_event_id
    )
    values (
        p_environment, p_local_subscription_id, p_reader_user_id,
        p_paypal_subscription_id, p_paypal_transaction_id, p_currency,
        p_gross_amount_minor, 'COMPLETED', p_provider_completed_at,
        p_provider_evidence_source, p_provider_event_id
    );
    return 'RECORDED';
exception when unique_violation then
    return 'CONFLICT';
end;
$function$;

revoke all on function public.gpir_record_verified_subscription_payment_v1(
 uuid,uuid,text,text,text,text,bigint,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.gpir_record_verified_subscription_payment_v1(
 uuid,uuid,text,text,text,text,bigint,timestamptz,text,text) to service_role;
comment on function public.gpir_record_verified_subscription_payment_v1(
 uuid,uuid,text,text,text,text,bigint,timestamptz,text,text)
is 'Service-role-only provider-verified recurring payment writer; safely handles missing subscription records and preserves duplicate protection.';
