-- Guarded P2 production rollback. Refuse to remove governed state while in use.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.gpir_publication_access_policies
              WHERE premium_plan_id IS NOT NULL) THEN
    RAISE EXCEPTION 'P2_ROLLBACK_REFUSED_PREMIUM_ASSIGNMENTS_EXIST';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gpir_paypal_subscriptions
              WHERE status IN ('APPROVAL_PENDING', 'ACTIVE', 'SUSPENDED')) THEN
    RAISE EXCEPTION 'P2_ROLLBACK_REFUSED_NONTERMINAL_SUBSCRIPTIONS_EXIST';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gpir_paypal_subscriptions
              WHERE payment_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'P2_ROLLBACK_REFUSED_CONFIRMED_PAYMENTS_EXIST';
  END IF;
END;
$$;

DROP FUNCTION public.gpir_subscription_payment_confirmed_v2(uuid, text, text);
DROP FUNCTION public.gpir_confirm_paypal_subscription_payment_v2(
  uuid, text, timestamptz, timestamptz, timestamptz, text);
DROP INDEX public.gpir_paypal_subscriptions_one_nonterminal_plan_idx;

CREATE OR REPLACE FUNCTION public.gpir_prepare_paypal_subscription_v2(
  p_user_id uuid, p_plan_id uuid, p_client_request_id uuid, p_environment text)
RETURNS TABLE(local_subscription_id uuid, paypal_subscription_id text,
  provider_request_id text, paypal_plan_id text, subscription_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE selected_plan public.gpir_subscription_plans%ROWTYPE;
  selected_subscription public.gpir_paypal_subscriptions%ROWTYPE;
  new_id uuid := gen_random_uuid(); required_status text;
BEGIN
  required_status := CASE WHEN p_environment = 'SANDBOX'
    THEN 'SANDBOX_ACTIVE' WHEN p_environment = 'PRODUCTION'
    THEN 'LIVE_ACTIVE' ELSE NULL END;
  IF required_status IS NULL THEN RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_INVALID'; END IF;
  SELECT * INTO selected_plan FROM public.gpir_subscription_plans
   WHERE id = p_plan_id AND environment = p_environment AND status = required_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBSCRIPTION_PLAN_UNAVAILABLE'; END IF;
  INSERT INTO public.gpir_paypal_subscriptions
    (id, user_id, plan_id, environment, client_request_id, provider_request_id)
  VALUES (new_id, p_user_id, p_plan_id, p_environment, p_client_request_id,
    'gpir-sub-' || lower(p_environment) || '-' || new_id::text)
  ON CONFLICT (environment, user_id, client_request_id) DO NOTHING;
  SELECT * INTO selected_subscription FROM public.gpir_paypal_subscriptions
   WHERE environment = p_environment AND user_id = p_user_id
     AND client_request_id = p_client_request_id;
  IF NOT FOUND OR selected_subscription.plan_id <> p_plan_id THEN
    RAISE EXCEPTION 'SUBSCRIPTION_IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN QUERY SELECT selected_subscription.id,
    selected_subscription.paypal_subscription_id,
    selected_subscription.provider_request_id, selected_plan.paypal_plan_id,
    selected_subscription.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.gpir_finalize_paypal_subscription_v2(
  p_local_subscription_id uuid, p_paypal_subscription_id text, p_status text,
  p_effective_from timestamptz, p_effective_until timestamptz, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  IF p_status NOT IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED')
    THEN RETURN false; END IF;
  UPDATE public.gpir_paypal_subscriptions SET status = p_status,
    effective_from = CASE WHEN p_status = 'ACTIVE'
      THEN COALESCE(p_effective_from, effective_from, now())
      ELSE COALESCE(p_effective_from, effective_from) END,
    effective_until = p_effective_until, updated_at = now()
   WHERE id = p_local_subscription_id AND paypal_subscription_id = p_paypal_subscription_id
     AND environment = p_environment;
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_publication_entitlement(
  p_publication_id text, p_supabase_record_id text)
RETURNS TABLE(decision text) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE policy public.gpir_publication_access_policies%ROWTYPE; caller uuid := auth.uid();
BEGIN
  IF p_publication_id IS NULL OR btrim(p_publication_id) = '' OR
     p_supabase_record_id IS NULL OR
     p_supabase_record_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'DENY'::text; RETURN;
  END IF;
  SELECT access_policy.* INTO policy FROM public.gpir_publication_access_policies AS access_policy
   WHERE access_policy.publication_id = p_publication_id
     AND access_policy.supabase_record_id::text = lower(p_supabase_record_id);
  IF NOT FOUND OR policy.status <> 'ACTIVE' THEN RETURN QUERY SELECT 'DENY'::text;
  ELSIF policy.access_class = 'PUBLIC' THEN RETURN QUERY SELECT 'ALLOW'::text;
  ELSIF caller IS NULL THEN RETURN QUERY SELECT 'DENY'::text;
  ELSIF policy.access_class = 'AUTHENTICATED' THEN RETURN QUERY SELECT 'ALLOW'::text;
  ELSIF policy.access_class = 'ENTITLED' AND (
    EXISTS (SELECT 1 FROM public.gpir_user_access_profiles AS profile
      WHERE profile.user_id = caller AND profile.access_class = 'ENTITLED'
        AND profile.status = 'ACTIVE' AND profile.effective_from <= CURRENT_TIMESTAMP
        AND (profile.effective_until IS NULL OR profile.effective_until > CURRENT_TIMESTAMP))
    OR EXISTS (SELECT 1 FROM public.gpir_publication_purchase_entitlements AS purchase
      WHERE purchase.user_id = caller AND purchase.supabase_record_id = policy.supabase_record_id
        AND purchase.publication_id = policy.publication_id AND purchase.status = 'ACTIVE'
        AND purchase.effective_from <= CURRENT_TIMESTAMP)
  ) THEN RETURN QUERY SELECT 'ALLOW'::text;
  ELSE RETURN QUERY SELECT 'DENY'::text; END IF;
END;
$$;

ALTER TABLE public.gpir_publication_access_policies
  DROP CONSTRAINT gpir_publication_access_policies_premium_entitled_check,
  DROP CONSTRAINT gpir_publication_access_policies_premium_plan_fk,
  DROP COLUMN premium_plan_id;
ALTER TABLE public.gpir_paypal_subscriptions DROP COLUMN payment_confirmed_at;

COMMIT;
