-- Preserve all existing recurring, publication and profile entitlement branches.
-- Add one-time Premium Library access only for active ENTITLED publications.
CREATE OR REPLACE FUNCTION public.resolve_publication_entitlement(p_publication_id text, p_supabase_record_id text)
 RETURNS TABLE(decision text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  policy public.gpir_publication_access_policies%ROWTYPE;
  caller uuid := auth.uid();
BEGIN
  IF p_publication_id IS NULL OR btrim(p_publication_id) = '' OR
     p_supabase_record_id IS NULL OR
     p_supabase_record_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'DENY'::text;
    RETURN;
  END IF;

  SELECT access_policy.* INTO policy
    FROM public.gpir_publication_access_policies AS access_policy
   WHERE access_policy.publication_id = p_publication_id
     AND access_policy.supabase_record_id::text = lower(p_supabase_record_id);

  IF NOT FOUND OR policy.status <> 'ACTIVE' THEN
    RETURN QUERY SELECT 'DENY'::text;
  ELSIF policy.access_class = 'PUBLIC' THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSIF caller IS NULL THEN
    RETURN QUERY SELECT 'DENY'::text;
  ELSIF policy.access_class = 'AUTHENTICATED' THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSIF policy.access_class = 'ENTITLED' AND (
    EXISTS (
      SELECT 1
        FROM public.gpir_user_access_profiles AS profile
       WHERE profile.user_id = caller
         AND profile.access_class = 'ENTITLED'
         AND profile.status = 'ACTIVE'
         AND profile.effective_from <= CURRENT_TIMESTAMP
         AND (profile.effective_until IS NULL OR
              profile.effective_until > CURRENT_TIMESTAMP)
    )
    OR EXISTS (
      SELECT 1
        FROM public.gpir_publication_purchase_entitlements AS purchase
       WHERE purchase.user_id = caller
         AND purchase.supabase_record_id = policy.supabase_record_id
         AND purchase.publication_id = policy.publication_id
         AND purchase.status = 'ACTIVE'
         AND purchase.effective_from <= CURRENT_TIMESTAMP
    )
    OR EXISTS (
      SELECT 1
        FROM public.gpir_onetime_library_entitlements AS library_pass
       WHERE library_pass.user_id = caller
         AND library_pass.scope = 'PREMIUM_LIBRARY'
         AND library_pass.status = 'ACTIVE'
         AND library_pass.effective_from <= CURRENT_TIMESTAMP
         AND library_pass.effective_until > CURRENT_TIMESTAMP
         AND policy.access_class = 'ENTITLED'
         AND policy.status = 'ACTIVE'
    )
    OR (
      policy.premium_plan_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM public.gpir_paypal_subscriptions AS subscription
          JOIN public.gpir_subscription_plans AS plan
            ON plan.id = subscription.plan_id
           AND plan.environment = subscription.environment
         WHERE subscription.user_id = caller
           AND subscription.plan_id = policy.premium_plan_id
           AND plan.plan_code = 'GPIR_PREMIUM_MONTHLY'
           AND plan.status = CASE subscription.environment
             WHEN 'SANDBOX' THEN 'SANDBOX_ACTIVE'
             WHEN 'PRODUCTION' THEN 'LIVE_ACTIVE'
           END
           AND subscription.status = 'ACTIVE'
           AND subscription.effective_from <= CURRENT_TIMESTAMP
           AND (subscription.effective_until IS NULL OR
                subscription.effective_until > CURRENT_TIMESTAMP)
      )
    )
  ) THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSE
    RETURN QUERY SELECT 'DENY'::text;
  END IF;
END;
$function$

