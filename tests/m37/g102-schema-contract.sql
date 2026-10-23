-- M37 G1-02 read-only schema contract. Run in GPIR Sandbox only.
-- Returns column names/types and foreign-key relationships; no reader data or secrets.
select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('gpir_paypal_subscriptions', 'gpir_subscription_plans',
                     'gpir_subscription_payment_evidence')
order by table_name, ordinal_position;

select con.conrelid::regclass::text as table_name, con.conname as constraint_name,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid in (
  'public.gpir_paypal_subscriptions'::regclass,
  'public.gpir_subscription_plans'::regclass,
  'public.gpir_subscription_payment_evidence'::regclass)
order by table_name, constraint_name;
