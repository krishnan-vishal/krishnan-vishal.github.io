-- M39 pre-activation rollback. Refuses destructive rollback once any production
-- payment state or subscription record exists. Preserve ledgers after activation.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.gpir_payment_offers WHERE environment = 'PRODUCTION') OR
     EXISTS (SELECT 1 FROM public.gpir_payment_orders WHERE environment = 'PRODUCTION') OR
     EXISTS (SELECT 1 FROM public.gpir_paypal_subscriptions) THEN
    RAISE EXCEPTION 'M39_ROLLBACK_REFUSED_PAYMENT_STATE_EXISTS';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.gpir_finalize_paypal_subscription_v2(uuid, text, text, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.gpir_get_paypal_subscription_for_webhook_v2(uuid, text, text);
DROP FUNCTION IF EXISTS public.gpir_get_paypal_subscription_v2(uuid, text, text);
DROP FUNCTION IF EXISTS public.gpir_attach_paypal_subscription_v2(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.gpir_prepare_paypal_subscription_v2(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.gpir_finish_paypal_webhook_event_v2(text, text, text, text);
DROP FUNCTION IF EXISTS public.gpir_claim_paypal_webhook_event_v2(text, text, text, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.gpir_reverse_paypal_capture_v2(text, text, text);
DROP FUNCTION IF EXISTS public.gpir_finalize_paypal_capture_v2(uuid, text, text, text, bigint, text, text, text);
DROP FUNCTION IF EXISTS public.gpir_get_paypal_order_for_webhook_v2(text, uuid, text);
DROP FUNCTION IF EXISTS public.gpir_get_paypal_order_v2(uuid, text, text);
DROP FUNCTION IF EXISTS public.gpir_attach_paypal_order_v2(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.gpir_prepare_paypal_order_v2(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.gpir_list_entitlement_candidates_v2();

DROP TABLE public.gpir_paypal_subscriptions;
DROP TABLE public.gpir_subscription_plans;

ALTER TABLE public.gpir_payment_webhook_events
  DROP CONSTRAINT gpir_payment_webhook_events_environment_provider_event_id_key;
ALTER TABLE public.gpir_payment_webhook_events
  ADD CONSTRAINT gpir_payment_webhook_events_provider_event_id_key UNIQUE (provider_event_id);
ALTER TABLE public.gpir_payment_webhook_events DROP COLUMN environment;

ALTER TABLE public.gpir_publication_purchase_entitlements
  DROP CONSTRAINT gpir_publication_purchase_entitlements_pkey;
ALTER TABLE public.gpir_publication_purchase_entitlements
  ADD PRIMARY KEY (user_id, supabase_record_id);
ALTER TABLE public.gpir_publication_purchase_entitlements DROP COLUMN environment;

ALTER TABLE public.gpir_payment_orders
  DROP CONSTRAINT gpir_payment_orders_environment_check;
ALTER TABLE public.gpir_payment_orders
  ADD CONSTRAINT gpir_payment_orders_environment_check CHECK (environment = 'SANDBOX');

ALTER TABLE public.gpir_payment_offers
  DROP CONSTRAINT gpir_payment_offer_environment_status,
  DROP CONSTRAINT gpir_payment_offers_environment_check,
  DROP CONSTRAINT gpir_payment_offers_status_check;
ALTER TABLE public.gpir_payment_offers
  ADD CONSTRAINT gpir_payment_offers_environment_check CHECK (environment = 'SANDBOX'),
  ADD CONSTRAINT gpir_payment_offers_status_check
    CHECK (status IN ('DRAFT', 'SANDBOX_ACTIVE', 'INACTIVE'));

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
END; $$;
