-- Owner-controlled registration of the existing PayPal LIVE plan. No PayPal object is created.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.gpir_subscription_plans WHERE environment = 'PRODUCTION') THEN
    RAISE EXCEPTION 'PRODUCTION_SUBSCRIPTION_PLAN_ALREADY_REGISTERED';
  END IF;
END;
$$;

INSERT INTO public.gpir_subscription_plans
  (id, environment, paypal_plan_id, plan_code, display_name, currency,
   unit_amount_minor, billing_interval, status)
VALUES
  ('f22bdcc8-be02-49e7-b861-349cbce9b74d', 'PRODUCTION',
   'P-27X20868857312141NLKYMXI', 'GPIR_PREMIUM_MONTHLY',
   'GPIR Premium Monthly', 'USD', 999, 'MONTH', 'LIVE_ACTIVE');

COMMIT;
