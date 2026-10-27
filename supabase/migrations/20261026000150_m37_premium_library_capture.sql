-- Forward-only Sandbox-only library-scoped offer/order and capture integration.
-- Requires preceding library entitlement table migration. No offers are seeded.
ALTER TABLE public.gpir_onetime_offers ADD COLUMN scope text NOT NULL DEFAULT 'PUBLICATION'
 CHECK (scope IN ('PUBLICATION','PREMIUM_LIBRARY'));
ALTER TABLE public.gpir_onetime_orders ADD COLUMN scope text NOT NULL DEFAULT 'PUBLICATION'
 CHECK (scope IN ('PUBLICATION','PREMIUM_LIBRARY'));
ALTER TABLE public.gpir_onetime_offers ALTER COLUMN supabase_record_id DROP NOT NULL;
ALTER TABLE public.gpir_onetime_offers ALTER COLUMN publication_id DROP NOT NULL;
ALTER TABLE public.gpir_onetime_orders ALTER COLUMN supabase_record_id DROP NOT NULL;
ALTER TABLE public.gpir_onetime_orders ALTER COLUMN publication_id DROP NOT NULL;
ALTER TABLE public.gpir_onetime_offers ADD CONSTRAINT gpir_onetime_offer_scope_identity CHECK (
 (scope='PREMIUM_LIBRARY' AND supabase_record_id IS NULL AND publication_id IS NULL AND access_duration_days=30)
 OR (scope='PUBLICATION' AND supabase_record_id IS NOT NULL AND publication_id IS NOT NULL)
);
ALTER TABLE public.gpir_onetime_orders ADD CONSTRAINT gpir_onetime_order_scope_identity CHECK (
 (scope='PREMIUM_LIBRARY' AND supabase_record_id IS NULL AND publication_id IS NULL AND access_duration_days=30)
 OR (scope='PUBLICATION' AND supabase_record_id IS NOT NULL AND publication_id IS NOT NULL)
);
DROP TRIGGER gpir_onetime_offer_identity ON public.gpir_onetime_offers;
CREATE TRIGGER gpir_onetime_offer_identity
 BEFORE INSERT OR UPDATE OF supabase_record_id,publication_id
 ON public.gpir_onetime_offers FOR EACH ROW
 WHEN (NEW.scope='PUBLICATION')
 EXECUTE FUNCTION public.gpir_validate_publication_policy_identity();
-- Legacy publication offers remain unselectable by the revised order-preparation function.
CREATE OR REPLACE FUNCTION public.gpir_prepare_onetime_order(
  p_user_id uuid, p_pass_id text, p_currency text,
  p_client_request_id uuid, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, provider_request_id text,
  offer_id uuid, pass_id text, publication_id text, supabase_record_id uuid,
  sku text, display_name text, currency text, expected_amount_minor bigint,
  access_duration_days integer, order_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_offer public.gpir_onetime_offers%ROWTYPE;
  selected_order public.gpir_onetime_orders%ROWTYPE;
  new_order_id uuid := gen_random_uuid();
BEGIN
  IF p_environment <> 'SANDBOX' THEN RAISE EXCEPTION 'ENVIRONMENT_NOT_ALLOWED'; END IF;
  SELECT * INTO selected_offer FROM public.gpir_onetime_offers
   WHERE pass_id = p_pass_id AND currency = p_currency
     AND environment = 'SANDBOX' AND status = 'SANDBOX_ACTIVE';
  IF NOT FOUND OR selected_offer.scope <> 'PREMIUM_LIBRARY' OR selected_offer.access_duration_days <> 30 THEN RAISE EXCEPTION 'PAYMENT_OFFER_UNAVAILABLE'; END IF;

  INSERT INTO public.gpir_onetime_orders
    (id, user_id, offer_id, scope, supabase_record_id, publication_id,
     client_request_id, provider_request_id, currency,
     expected_amount_minor, access_duration_days)
  VALUES
    (new_order_id, p_user_id, selected_offer.id, 'PREMIUM_LIBRARY', selected_offer.supabase_record_id,
     selected_offer.publication_id, p_client_request_id,
     'gpir-onetime-' || new_order_id::text, selected_offer.currency,
     selected_offer.unit_amount_minor, selected_offer.access_duration_days)
  ON CONFLICT (user_id, client_request_id) DO NOTHING;

  SELECT * INTO selected_order FROM public.gpir_onetime_orders
   WHERE user_id = p_user_id AND client_request_id = p_client_request_id;
  IF selected_order.offer_id <> selected_offer.id THEN
    RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN QUERY SELECT selected_order.id, selected_order.paypal_order_id,
    selected_order.provider_request_id, selected_offer.id, selected_offer.pass_id,
    selected_order.publication_id, selected_order.supabase_record_id,
    selected_offer.sku, selected_offer.display_name, selected_order.currency,
    selected_order.expected_amount_minor, selected_order.access_duration_days,
    selected_order.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.gpir_get_onetime_order(
  p_user_id uuid, p_paypal_order_id text, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, paypal_capture_id text,
  publication_id text, supabase_record_id uuid, currency text,
  expected_amount_minor bigint, access_duration_days integer,
  order_status text, effective_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT orders.id, orders.paypal_order_id, orders.paypal_capture_id,
    orders.publication_id, orders.supabase_record_id, orders.currency,
    orders.expected_amount_minor, orders.access_duration_days, orders.status,
    entitlements.effective_until
  FROM public.gpir_onetime_orders AS orders
  LEFT JOIN public.gpir_onetime_library_entitlements AS entitlements
    ON entitlements.source_order_id = orders.id
  WHERE orders.user_id = p_user_id AND orders.paypal_order_id = p_paypal_order_id
    AND orders.environment = p_environment AND p_environment = 'SANDBOX';
$$;

CREATE OR REPLACE FUNCTION public.gpir_get_onetime_order_for_webhook(
  p_paypal_order_id text, p_local_order_id uuid, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, paypal_capture_id text,
  publication_id text, supabase_record_id uuid, currency text,
  expected_amount_minor bigint, access_duration_days integer,
  order_status text, effective_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT orders.id, orders.paypal_order_id, orders.paypal_capture_id,
    orders.publication_id, orders.supabase_record_id, orders.currency,
    orders.expected_amount_minor, orders.access_duration_days, orders.status,
    entitlements.effective_until
  FROM public.gpir_onetime_orders AS orders
  LEFT JOIN public.gpir_onetime_library_entitlements AS entitlements
    ON entitlements.source_order_id = orders.id
  WHERE orders.id = p_local_order_id
    AND orders.paypal_order_id = p_paypal_order_id
    AND orders.environment = p_environment AND p_environment = 'SANDBOX';
$$;

CREATE OR REPLACE FUNCTION public.gpir_finalize_onetime_capture(
  p_local_order_id uuid, p_paypal_order_id text, p_paypal_capture_id text,
  p_currency text, p_captured_amount_minor bigint, p_provider_status text,
  p_provider_debug_id text, p_environment text)
RETURNS TABLE(finalized boolean, effective_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_order public.gpir_onetime_orders%ROWTYPE;
  v_effective_until timestamptz;
BEGIN
  SELECT * INTO selected_order FROM public.gpir_onetime_orders
   WHERE id = p_local_order_id FOR UPDATE;
  IF NOT FOUND OR p_environment <> 'SANDBOX' OR selected_order.environment <> p_environment OR
     selected_order.currency <> p_currency OR
     selected_order.expected_amount_minor <> p_captured_amount_minor OR
     selected_order.paypal_order_id <> p_paypal_order_id THEN
    RETURN QUERY SELECT false, NULL::timestamptz; RETURN;
  END IF;
  IF selected_order.status = 'CAPTURED' THEN
    SELECT entitlement.effective_until INTO v_effective_until
      FROM public.gpir_onetime_library_entitlements AS entitlement
     WHERE entitlement.source_order_id = selected_order.id;
    RETURN QUERY SELECT selected_order.paypal_capture_id = p_paypal_capture_id,
      v_effective_until; RETURN;
  END IF;
  IF selected_order.status IN ('REFUNDED','REVERSED','VOIDED','DENIED') THEN
    RETURN QUERY SELECT false, NULL::timestamptz; RETURN;
  END IF;

  IF selected_order.scope <> 'PREMIUM_LIBRARY' OR NOT EXISTS (
    SELECT 1 FROM public.gpir_onetime_offers offer
     WHERE offer.id = selected_order.offer_id
       AND offer.scope = 'PREMIUM_LIBRARY'
       AND offer.status = 'SANDBOX_ACTIVE'
       AND offer.access_duration_days = 30
  ) THEN
    RETURN QUERY SELECT false, NULL::timestamptz; RETURN;
  END IF;
  v_effective_until := now() + make_interval(days => selected_order.access_duration_days);
  UPDATE public.gpir_onetime_orders
     SET paypal_capture_id = p_paypal_capture_id,
         captured_amount_minor = p_captured_amount_minor,
         status = 'CAPTURED', provider_status = p_provider_status,
         provider_debug_id = p_provider_debug_id,
         captured_at = now(), updated_at = now()
   WHERE id = selected_order.id;
  INSERT INTO public.gpir_onetime_library_entitlements
    (source_order_id, user_id, scope, status, effective_from, effective_until)
  VALUES (selected_order.id, selected_order.user_id, 'PREMIUM_LIBRARY',
    'ACTIVE', now(), v_effective_until)
  ON CONFLICT (source_order_id) DO NOTHING;
  RETURN QUERY SELECT true, v_effective_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.gpir_reverse_onetime_capture(
  p_paypal_capture_id text, p_reversal_status text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE selected_order public.gpir_onetime_orders%ROWTYPE;
BEGIN
  IF p_environment <> 'SANDBOX' OR p_reversal_status NOT IN ('REFUNDED','REVERSED')
    THEN RETURN false; END IF;
  SELECT * INTO selected_order FROM public.gpir_onetime_orders
   WHERE paypal_capture_id = p_paypal_capture_id AND environment = p_environment FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.gpir_onetime_orders SET status = p_reversal_status,
    provider_status = p_reversal_status, updated_at = now() WHERE id = selected_order.id;
  UPDATE public.gpir_onetime_library_entitlements SET status = 'REVOKED', revoked_at = now() WHERE source_order_id = selected_order.id AND status = 'ACTIVE';
  RETURN true;
END;
$$;

