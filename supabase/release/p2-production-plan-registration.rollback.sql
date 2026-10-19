BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.gpir_paypal_subscriptions
              WHERE plan_id = 'f22bdcc8-be02-49e7-b861-349cbce9b74d') OR
     EXISTS (SELECT 1 FROM public.gpir_publication_access_policies
              WHERE premium_plan_id = 'f22bdcc8-be02-49e7-b861-349cbce9b74d') THEN
    RAISE EXCEPTION 'PRODUCTION_PLAN_ROLLBACK_REFUSED_PLAN_IN_USE';
  END IF;
END;
$$;

DELETE FROM public.gpir_subscription_plans
 WHERE id = 'f22bdcc8-be02-49e7-b861-349cbce9b74d'
   AND environment = 'PRODUCTION'
   AND paypal_plan_id = 'P-27X20868857312141NLKYMXI';

COMMIT;
