-- M37 approved six-currency Production catalogue. Applied to Production through Supabase migration m37_six_currency_disabled_catalog.
-- This file records the deployed additive schema for GitHub review and future environments.
CREATE TABLE IF NOT EXISTS public.gpir_m37_currency_catalog (
 currency text PRIMARY KEY CHECK (currency IN ('USD','EUR','GBP','SGD','AUD','CAD')),
 recurring_amount_minor integer NOT NULL DEFAULT 999 CHECK (recurring_amount_minor=999),
 onetime_amount_minor integer NOT NULL DEFAULT 999 CHECK (onetime_amount_minor=999),
 onetime_duration_days integer NOT NULL DEFAULT 30 CHECK (onetime_duration_days=30),
 recurring_paypal_plan_id text,
 recurring_status text NOT NULL DEFAULT 'PENDING_PROVIDER' CHECK (recurring_status IN ('PENDING_PROVIDER','LIVE_ACTIVE')),
 onetime_status text NOT NULL DEFAULT 'DISABLED' CHECK (onetime_status IN ('DISABLED','LIVE_ACTIVE')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT recurring_plan_required CHECK (recurring_status <> 'LIVE_ACTIVE' OR nullif(btrim(recurring_paypal_plan_id),'') IS NOT NULL)
);
ALTER TABLE public.gpir_m37_currency_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gpir_m37_currency_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.gpir_m37_currency_catalog TO service_role;
INSERT INTO public.gpir_m37_currency_catalog(currency,recurring_paypal_plan_id,recurring_status)
SELECT c.currency, CASE WHEN c.currency='USD' THEN p.paypal_plan_id ELSE NULL END,
CASE WHEN c.currency='USD' AND p.paypal_plan_id IS NOT NULL THEN 'LIVE_ACTIVE' ELSE 'PENDING_PROVIDER' END
FROM (VALUES ('USD'),('EUR'),('GBP'),('SGD'),('AUD'),('CAD')) c(currency)
LEFT JOIN public.gpir_subscription_plans p ON p.currency=c.currency AND p.environment='PRODUCTION' AND p.status='LIVE_ACTIVE' AND p.plan_code='GPIR_PREMIUM_MONTHLY'
ON CONFLICT(currency) DO NOTHING;
