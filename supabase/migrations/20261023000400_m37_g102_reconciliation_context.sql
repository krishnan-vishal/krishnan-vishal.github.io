-- M37 G1-02: server-only plan lookup for reader-owned subscription.
create or replace function public.gpir_subscription_reconciliation_context_v1(
 p_user_id uuid, p_paypal_subscription_id text, p_environment text)
returns table(local_subscription_id uuid, paypal_plan_id text,
 expected_currency text, expected_amount_minor bigint)
language sql stable security definer set search_path = pg_catalog, public
as $$
 select s.id, p.paypal_plan_id, p.currency, p.unit_amount_minor
 from public.gpir_paypal_subscriptions s
 join public.gpir_subscription_plans p on p.id = s.plan_id and p.environment = s.environment
 where s.user_id = p_user_id and s.paypal_subscription_id = p_paypal_subscription_id
   and s.environment = p_environment and s.status = 'ACTIVE'
   and p.status = case when p_environment = 'SANDBOX' then 'SANDBOX_ACTIVE' else 'LIVE_ACTIVE' end
   and p_environment in ('SANDBOX','PRODUCTION')
$$;
revoke all on function public.gpir_subscription_reconciliation_context_v1(uuid,text,text)
 from public, anon, authenticated;
grant execute on function public.gpir_subscription_reconciliation_context_v1(uuid,text,text)
 to service_role;
