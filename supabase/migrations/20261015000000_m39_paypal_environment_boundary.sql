-- M39: append-only PayPal environment and subscription boundary.
-- Production remains disabled until Edge configuration is explicitly enabled and
-- owner-approved LIVE_ACTIVE offers/plans are inserted. No live record is seeded.

ALTER TABLE public.gpir_payment_offers
  DROP CONSTRAINT IF EXISTS gpir_payment_offers_environment_check,
  DROP CONSTRAINT IF EXISTS gpir_payment_offers_status_check;
ALTER TABLE public.gpir_payment_offers
  ADD CONSTRAINT gpir_payment_offers_environment_check
    CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  ADD CONSTRAINT gpir_payment_offers_status_check
    CHECK (status IN ('DRAFT', 'SANDBOX_ACTIVE', 'LIVE_ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT gpir_payment_offer_environment_status CHECK (
    status NOT IN ('SANDBOX_ACTIVE', 'LIVE_ACTIVE') OR
    (environment = 'SANDBOX' AND status = 'SANDBOX_ACTIVE') OR
    (environment = 'PRODUCTION' AND status = 'LIVE_ACTIVE'));

ALTER TABLE public.gpir_payment_orders
  DROP CONSTRAINT IF EXISTS gpir_payment_orders_environment_check;
ALTER TABLE public.gpir_payment_orders
  ADD CONSTRAINT gpir_payment_orders_environment_check
    CHECK (environment IN ('SANDBOX', 'PRODUCTION'));

ALTER TABLE public.gpir_publication_purchase_entitlements
  ADD COLUMN environment text NOT NULL DEFAULT 'SANDBOX'
    CHECK (environment IN ('SANDBOX', 'PRODUCTION'));
ALTER TABLE public.gpir_publication_purchase_entitlements
  DROP CONSTRAINT gpir_publication_purchase_entitlements_pkey;
ALTER TABLE public.gpir_publication_purchase_entitlements
  ADD PRIMARY KEY (user_id, supabase_record_id, environment);

ALTER TABLE public.gpir_payment_webhook_events
  ADD COLUMN environment text NOT NULL DEFAULT 'SANDBOX'
    CHECK (environment IN ('SANDBOX', 'PRODUCTION'));
ALTER TABLE public.gpir_payment_webhook_events
  DROP CONSTRAINT IF EXISTS gpir_payment_webhook_events_provider_event_id_key;
ALTER TABLE public.gpir_payment_webhook_events
  ADD UNIQUE (environment, provider_event_id);

CREATE TABLE public.gpir_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  paypal_plan_id text NOT NULL,
  plan_code text NOT NULL,
  display_name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor > 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('MONTH', 'YEAR')),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SANDBOX_ACTIVE', 'LIVE_ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, paypal_plan_id),
  UNIQUE (environment, plan_code),
  CONSTRAINT gpir_subscription_plan_environment_status CHECK (
    status NOT IN ('SANDBOX_ACTIVE', 'LIVE_ACTIVE') OR
    (environment = 'SANDBOX' AND status = 'SANDBOX_ACTIVE') OR
    (environment = 'PRODUCTION' AND status = 'LIVE_ACTIVE'))
);

CREATE TABLE public.gpir_paypal_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.gpir_subscription_plans(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  client_request_id uuid NOT NULL,
  provider_request_id text NOT NULL,
  paypal_subscription_id text,
  status text NOT NULL DEFAULT 'APPROVAL_PENDING' CHECK (status IN
    ('APPROVAL_PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED')),
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, user_id, client_request_id),
  UNIQUE (environment, provider_request_id),
  UNIQUE (environment, paypal_subscription_id),
  CONSTRAINT gpir_subscription_window CHECK (
    effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from)
);

CREATE INDEX gpir_paypal_subscriptions_user_status_idx
  ON public.gpir_paypal_subscriptions (environment, user_id, status);

ALTER TABLE public.gpir_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_paypal_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gpir_subscription_plans,
  public.gpir_paypal_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gpir_subscription_plans,
  public.gpir_paypal_subscriptions TO service_role;

CREATE FUNCTION public.gpir_prepare_paypal_order_v2(
  p_user_id uuid, p_offer_id uuid, p_client_request_id uuid, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, provider_request_id text,
  publication_id text, supabase_record_id uuid, sku text, display_name text,
  currency text, expected_amount_minor bigint, order_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE selected_offer public.gpir_payment_offers%ROWTYPE;
  selected_order public.gpir_payment_orders%ROWTYPE; new_order_id uuid := gen_random_uuid();
  required_status text;
BEGIN
  IF p_environment NOT IN ('SANDBOX', 'PRODUCTION') THEN
    RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_INVALID';
  END IF;
  required_status := CASE WHEN p_environment = 'SANDBOX'
    THEN 'SANDBOX_ACTIVE' ELSE 'LIVE_ACTIVE' END;
  SELECT * INTO selected_offer FROM public.gpir_payment_offers
   WHERE id = p_offer_id AND environment = p_environment AND status = required_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OFFER_UNAVAILABLE'; END IF;
  INSERT INTO public.gpir_payment_orders
    (id, user_id, offer_id, supabase_record_id, publication_id, environment,
     client_request_id, provider_request_id, currency, expected_amount_minor)
  VALUES (new_order_id, p_user_id, selected_offer.id, selected_offer.supabase_record_id,
    selected_offer.publication_id, p_environment, p_client_request_id,
    'gpir-' || lower(p_environment) || '-' || new_order_id::text,
    selected_offer.currency, selected_offer.unit_amount_minor)
  ON CONFLICT (user_id, client_request_id) DO NOTHING;
  SELECT * INTO selected_order FROM public.gpir_payment_orders
   WHERE user_id = p_user_id AND client_request_id = p_client_request_id
     AND environment = p_environment;
  IF NOT FOUND OR selected_order.offer_id <> p_offer_id THEN
    RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN QUERY SELECT selected_order.id, selected_order.paypal_order_id,
    selected_order.provider_request_id, selected_order.publication_id,
    selected_order.supabase_record_id, selected_offer.sku, selected_offer.display_name,
    selected_order.currency, selected_order.expected_amount_minor, selected_order.status;
END; $$;

CREATE FUNCTION public.gpir_list_entitlement_candidates_v2()
RETURNS TABLE(publication_id text, supabase_record_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT policy.publication_id, policy.supabase_record_id
  FROM public.gpir_publication_access_policies AS policy
  WHERE policy.status = 'ACTIVE' AND policy.access_class = 'ENTITLED'
  ORDER BY policy.publication_id
  LIMIT 500;
$$;

CREATE FUNCTION public.gpir_attach_paypal_order_v2(
  p_local_order_id uuid, p_paypal_order_id text, p_provider_status text,
  p_provider_debug_id text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.gpir_payment_orders SET paypal_order_id = p_paypal_order_id,
    provider_status = p_provider_status, provider_debug_id = p_provider_debug_id,
    updated_at = now() WHERE id = p_local_order_id AND environment = p_environment
    AND status = 'CREATED' AND (paypal_order_id IS NULL OR paypal_order_id = p_paypal_order_id);
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END; $$;

CREATE FUNCTION public.gpir_get_paypal_order_v2(
  p_user_id uuid, p_paypal_order_id text, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, provider_request_id text,
  publication_id text, supabase_record_id uuid, currency text,
  expected_amount_minor bigint, order_status text, paypal_capture_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT id, paypal_order_id, provider_request_id, publication_id,
    supabase_record_id, currency, expected_amount_minor, status, paypal_capture_id
  FROM public.gpir_payment_orders WHERE user_id = p_user_id
    AND paypal_order_id = p_paypal_order_id AND environment = p_environment;
$$;

CREATE FUNCTION public.gpir_get_paypal_order_for_webhook_v2(
  p_paypal_order_id text, p_local_order_id uuid, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, provider_request_id text,
  publication_id text, supabase_record_id uuid, currency text,
  expected_amount_minor bigint, order_status text, paypal_capture_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT id, paypal_order_id, provider_request_id, publication_id,
    supabase_record_id, currency, expected_amount_minor, status, paypal_capture_id
  FROM public.gpir_payment_orders WHERE id = p_local_order_id
    AND (paypal_order_id IS NULL OR paypal_order_id = p_paypal_order_id)
    AND environment = p_environment;
$$;

CREATE FUNCTION public.gpir_finalize_paypal_capture_v2(
  p_local_order_id uuid, p_paypal_order_id text, p_paypal_capture_id text,
  p_currency text, p_captured_amount_minor bigint, p_provider_status text,
  p_provider_debug_id text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE selected_order public.gpir_payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO selected_order FROM public.gpir_payment_orders
   WHERE id = p_local_order_id AND environment = p_environment FOR UPDATE;
  IF NOT FOUND OR selected_order.currency <> p_currency OR
     selected_order.expected_amount_minor <> p_captured_amount_minor OR
     (selected_order.paypal_order_id IS NOT NULL AND
      selected_order.paypal_order_id <> p_paypal_order_id) THEN RETURN false; END IF;
  IF selected_order.status = 'CAPTURED' THEN
    RETURN selected_order.paypal_capture_id = p_paypal_capture_id;
  END IF;
  IF selected_order.status IN ('REFUNDED', 'REVERSED', 'VOIDED', 'DENIED') THEN RETURN false; END IF;
  UPDATE public.gpir_payment_orders SET paypal_order_id = p_paypal_order_id,
    paypal_capture_id = p_paypal_capture_id, captured_amount_minor = p_captured_amount_minor,
    status = 'CAPTURED', provider_status = p_provider_status,
    provider_debug_id = p_provider_debug_id, captured_at = now(), updated_at = now()
   WHERE id = p_local_order_id AND environment = p_environment;
  INSERT INTO public.gpir_publication_purchase_entitlements
    (user_id, supabase_record_id, publication_id, source_payment_order_id,
     environment, status, effective_from, revoked_at)
  VALUES (selected_order.user_id, selected_order.supabase_record_id,
    selected_order.publication_id, selected_order.id, p_environment, 'ACTIVE', now(), NULL)
  ON CONFLICT (user_id, supabase_record_id, environment) DO UPDATE SET
    publication_id = EXCLUDED.publication_id,
    source_payment_order_id = EXCLUDED.source_payment_order_id,
    status = 'ACTIVE', effective_from = now(), revoked_at = NULL, updated_at = now();
  RETURN true;
END; $$;

CREATE FUNCTION public.gpir_reverse_paypal_capture_v2(
  p_paypal_capture_id text, p_reversal_status text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE selected_order public.gpir_payment_orders%ROWTYPE; replacement_order_id uuid;
BEGIN
  IF p_reversal_status NOT IN ('REFUNDED', 'REVERSED') THEN RETURN false; END IF;
  SELECT * INTO selected_order FROM public.gpir_payment_orders
   WHERE paypal_capture_id = p_paypal_capture_id AND environment = p_environment FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.gpir_payment_orders SET status = p_reversal_status,
    provider_status = p_reversal_status, updated_at = now() WHERE id = selected_order.id;
  SELECT id INTO replacement_order_id FROM public.gpir_payment_orders
   WHERE user_id = selected_order.user_id AND supabase_record_id = selected_order.supabase_record_id
     AND environment = p_environment AND status = 'CAPTURED' AND id <> selected_order.id
   ORDER BY captured_at DESC LIMIT 1;
  IF replacement_order_id IS NULL THEN
    UPDATE public.gpir_publication_purchase_entitlements SET status = 'REVOKED',
      revoked_at = now(), updated_at = now() WHERE user_id = selected_order.user_id
      AND supabase_record_id = selected_order.supabase_record_id AND environment = p_environment;
  ELSE
    UPDATE public.gpir_publication_purchase_entitlements
      SET source_payment_order_id = replacement_order_id, status = 'ACTIVE',
        revoked_at = NULL, updated_at = now() WHERE user_id = selected_order.user_id
      AND supabase_record_id = selected_order.supabase_record_id AND environment = p_environment;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION public.gpir_claim_paypal_webhook_event_v2(
  p_provider_event_id text, p_event_type text, p_resource_id text,
  p_payload_sha256 text, p_provider_created_at timestamptz, p_environment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE claimed_id uuid; existing_event public.gpir_payment_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.gpir_payment_webhook_events
    (provider_event_id, event_type, resource_id, payload_sha256, provider_created_at, environment)
  VALUES (p_provider_event_id, p_event_type, p_resource_id, p_payload_sha256,
    p_provider_created_at, p_environment)
  ON CONFLICT (environment, provider_event_id) DO NOTHING RETURNING id INTO claimed_id;
  IF claimed_id IS NOT NULL THEN RETURN 'CLAIMED'; END IF;
  SELECT * INTO existing_event FROM public.gpir_payment_webhook_events
   WHERE environment = p_environment AND provider_event_id = p_provider_event_id FOR UPDATE;
  IF existing_event.payload_sha256 <> p_payload_sha256 OR
     existing_event.event_type <> p_event_type THEN RETURN 'CONFLICT'; END IF;
  IF existing_event.processing_status = 'ERROR' OR
     (existing_event.processing_status = 'PROCESSING' AND
      existing_event.updated_at < now() - interval '10 minutes') THEN
    UPDATE public.gpir_payment_webhook_events SET processing_status = 'PROCESSING',
      attempt_count = attempt_count + 1, updated_at = now(), last_error_code = NULL
     WHERE id = existing_event.id; RETURN 'CLAIMED';
  END IF;
  IF existing_event.processing_status = 'PROCESSING' THEN RETURN 'IN_PROGRESS'; END IF;
  RETURN 'DUPLICATE';
END; $$;

CREATE FUNCTION public.gpir_finish_paypal_webhook_event_v2(
  p_provider_event_id text, p_processing_status text, p_error_code text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  IF p_processing_status NOT IN ('PROCESSED', 'IGNORED', 'ERROR') THEN RETURN false; END IF;
  UPDATE public.gpir_payment_webhook_events SET processing_status = p_processing_status,
    last_error_code = p_error_code,
    processed_at = CASE WHEN p_processing_status IN ('PROCESSED', 'IGNORED') THEN now() ELSE NULL END,
    updated_at = now() WHERE environment = p_environment
      AND provider_event_id = p_provider_event_id;
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END; $$;

CREATE FUNCTION public.gpir_prepare_paypal_subscription_v2(
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
  RETURN QUERY SELECT selected_subscription.id, selected_subscription.paypal_subscription_id,
    selected_subscription.provider_request_id, selected_plan.paypal_plan_id,
    selected_subscription.status;
END; $$;

CREATE FUNCTION public.gpir_attach_paypal_subscription_v2(
  p_local_subscription_id uuid, p_paypal_subscription_id text,
  p_provider_status text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.gpir_paypal_subscriptions SET paypal_subscription_id = p_paypal_subscription_id,
    status = p_provider_status, updated_at = now() WHERE id = p_local_subscription_id
    AND environment = p_environment AND status = 'APPROVAL_PENDING'
    AND (paypal_subscription_id IS NULL OR paypal_subscription_id = p_paypal_subscription_id);
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END; $$;

CREATE FUNCTION public.gpir_get_paypal_subscription_v2(
  p_user_id uuid, p_paypal_subscription_id text, p_environment text)
RETURNS TABLE(local_subscription_id uuid, paypal_subscription_id text,
  provider_request_id text, paypal_plan_id text, subscription_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT subscription.id, subscription.paypal_subscription_id,
    subscription.provider_request_id, plan.paypal_plan_id, subscription.status
  FROM public.gpir_paypal_subscriptions AS subscription
  JOIN public.gpir_subscription_plans AS plan ON plan.id = subscription.plan_id
  WHERE subscription.user_id = p_user_id
    AND subscription.paypal_subscription_id = p_paypal_subscription_id
    AND subscription.environment = p_environment AND plan.environment = p_environment;
$$;

CREATE FUNCTION public.gpir_get_paypal_subscription_for_webhook_v2(
  p_local_subscription_id uuid, p_paypal_subscription_id text, p_environment text)
RETURNS TABLE(local_subscription_id uuid, paypal_subscription_id text,
  provider_request_id text, paypal_plan_id text, subscription_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT subscription.id, subscription.paypal_subscription_id,
    subscription.provider_request_id, plan.paypal_plan_id, subscription.status
  FROM public.gpir_paypal_subscriptions AS subscription
  JOIN public.gpir_subscription_plans AS plan ON plan.id = subscription.plan_id
  WHERE subscription.id = p_local_subscription_id
    AND subscription.paypal_subscription_id = p_paypal_subscription_id
    AND subscription.environment = p_environment AND plan.environment = p_environment;
$$;

CREATE FUNCTION public.gpir_finalize_paypal_subscription_v2(
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
END; $$;

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
    OR EXISTS (SELECT 1 FROM public.gpir_paypal_subscriptions AS subscription
      WHERE subscription.user_id = caller AND subscription.status = 'ACTIVE'
        AND subscription.effective_from <= CURRENT_TIMESTAMP
        AND (subscription.effective_until IS NULL OR subscription.effective_until > CURRENT_TIMESTAMP))
  ) THEN RETURN QUERY SELECT 'ALLOW'::text;
  ELSE RETURN QUERY SELECT 'DENY'::text; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.gpir_prepare_paypal_order_v2(uuid, uuid, uuid, text),
  public.gpir_list_entitlement_candidates_v2(),
  public.gpir_attach_paypal_order_v2(uuid, text, text, text, text),
  public.gpir_get_paypal_order_v2(uuid, text, text),
  public.gpir_get_paypal_order_for_webhook_v2(text, uuid, text),
  public.gpir_finalize_paypal_capture_v2(uuid, text, text, text, bigint, text, text, text),
  public.gpir_reverse_paypal_capture_v2(text, text, text),
  public.gpir_claim_paypal_webhook_event_v2(text, text, text, text, timestamptz, text),
  public.gpir_finish_paypal_webhook_event_v2(text, text, text, text),
  public.gpir_prepare_paypal_subscription_v2(uuid, uuid, uuid, text),
  public.gpir_attach_paypal_subscription_v2(uuid, text, text, text),
  public.gpir_get_paypal_subscription_v2(uuid, text, text),
  public.gpir_get_paypal_subscription_for_webhook_v2(uuid, text, text),
  public.gpir_finalize_paypal_subscription_v2(uuid, text, text, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gpir_prepare_paypal_order_v2(uuid, uuid, uuid, text),
  public.gpir_list_entitlement_candidates_v2(),
  public.gpir_attach_paypal_order_v2(uuid, text, text, text, text),
  public.gpir_get_paypal_order_v2(uuid, text, text),
  public.gpir_get_paypal_order_for_webhook_v2(text, uuid, text),
  public.gpir_finalize_paypal_capture_v2(uuid, text, text, text, bigint, text, text, text),
  public.gpir_reverse_paypal_capture_v2(text, text, text),
  public.gpir_claim_paypal_webhook_event_v2(text, text, text, text, timestamptz, text),
  public.gpir_finish_paypal_webhook_event_v2(text, text, text, text),
  public.gpir_prepare_paypal_subscription_v2(uuid, uuid, uuid, text),
  public.gpir_attach_paypal_subscription_v2(uuid, text, text, text),
  public.gpir_get_paypal_subscription_v2(uuid, text, text),
  public.gpir_get_paypal_subscription_for_webhook_v2(uuid, text, text),
  public.gpir_finalize_paypal_subscription_v2(uuid, text, text, timestamptz, timestamptz, text)
  TO service_role;

COMMENT ON TABLE public.gpir_subscription_plans IS
  'Server-authoritative PayPal subscription plans; no LIVE_ACTIVE row is seeded by M39.';
COMMENT ON TABLE public.gpir_paypal_subscriptions IS
  'Environment-scoped PayPal subscription reconciliation state used by the entitlement authority.';
