-- M37: isolated PayPal Orders v2 one-time Sandbox checkout.
-- Additive only. No offer is activated or priced by this migration.
-- Production deployment is forbidden until the release gates are separately approved.

CREATE TABLE public.gpir_onetime_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id text NOT NULL CHECK (pass_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$'),
  supabase_record_id uuid NOT NULL
    REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  publication_id text NOT NULL,
  sku text NOT NULL CHECK (length(btrim(sku)) BETWEEN 3 AND 64),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 127),
  currency text NOT NULL CHECK (currency IN ('USD','EUR','GBP','SGD','AUD','JPY','CAD')),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor > 0),
  access_duration_days integer NOT NULL CHECK (access_duration_days BETWEEN 1 AND 366),
  environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX'),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SANDBOX_ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pass_id, currency, environment),
  UNIQUE (sku, currency, environment)
);

CREATE TRIGGER gpir_onetime_offer_identity
BEFORE INSERT OR UPDATE OF supabase_record_id, publication_id
ON public.gpir_onetime_offers
FOR EACH ROW EXECUTE FUNCTION public.gpir_validate_publication_policy_identity();

CREATE TABLE public.gpir_onetime_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES public.gpir_onetime_offers(id) ON DELETE RESTRICT,
  supabase_record_id uuid NOT NULL
    REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  publication_id text NOT NULL,
  environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX'),
  client_request_id uuid NOT NULL,
  provider_request_id text NOT NULL UNIQUE,
  paypal_order_id text UNIQUE,
  paypal_capture_id text UNIQUE,
  currency text NOT NULL CHECK (currency IN ('USD','EUR','GBP','SGD','AUD','JPY','CAD')),
  expected_amount_minor bigint NOT NULL CHECK (expected_amount_minor > 0),
  captured_amount_minor bigint CHECK (captured_amount_minor > 0),
  access_duration_days integer NOT NULL CHECK (access_duration_days BETWEEN 1 AND 366),
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN
    ('CREATED','APPROVED','PENDING','CAPTURED','DENIED','REFUNDED','REVERSED','VOIDED','FAILED')),
  provider_status text,
  provider_debug_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  UNIQUE (user_id, client_request_id),
  CONSTRAINT gpir_onetime_capture_consistent CHECK (
    (status = 'CAPTURED' AND paypal_capture_id IS NOT NULL AND
      captured_amount_minor = expected_amount_minor AND captured_at IS NOT NULL)
    OR status <> 'CAPTURED'
  )
);

CREATE INDEX gpir_onetime_orders_user_publication_idx
  ON public.gpir_onetime_orders (user_id, supabase_record_id, status);

CREATE TABLE public.gpir_onetime_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_order_id uuid NOT NULL UNIQUE
    REFERENCES public.gpir_onetime_orders(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  supabase_record_id uuid NOT NULL
    REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  publication_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gpir_onetime_entitlement_window CHECK (effective_until > effective_from),
  CONSTRAINT gpir_onetime_entitlement_revocation CHECK (
    (status = 'ACTIVE' AND revoked_at IS NULL) OR
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX gpir_onetime_entitlements_lookup_idx
  ON public.gpir_onetime_entitlements
  (user_id, supabase_record_id, publication_id, status, effective_until);

CREATE TRIGGER gpir_onetime_entitlement_identity
BEFORE INSERT OR UPDATE OF supabase_record_id, publication_id
ON public.gpir_onetime_entitlements
FOR EACH ROW EXECUTE FUNCTION public.gpir_validate_publication_policy_identity();

CREATE TABLE public.gpir_onetime_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE CHECK (length(provider_event_id) BETWEEN 1 AND 128),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 128),
  resource_id text CHECK (resource_id IS NULL OR length(resource_id) BETWEEN 1 AND 128),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX'),
  processing_status text NOT NULL DEFAULT 'PROCESSING'
    CHECK (processing_status IN ('PROCESSING','PROCESSED','IGNORED','ERROR')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  last_error_code text,
  provider_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.gpir_onetime_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_onetime_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_onetime_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_onetime_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gpir_onetime_offers, public.gpir_onetime_orders,
  public.gpir_onetime_entitlements, public.gpir_onetime_webhook_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gpir_onetime_offers,
  public.gpir_onetime_orders, public.gpir_onetime_entitlements,
  public.gpir_onetime_webhook_events TO service_role;

CREATE FUNCTION public.gpir_list_onetime_offers(p_environment text)
RETURNS TABLE(offer_id uuid, pass_id text, publication_id text,
  supabase_record_id uuid, display_name text, currency text,
  unit_amount_minor bigint, access_duration_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT offer.id, offer.pass_id, offer.publication_id,
    offer.supabase_record_id, offer.display_name, offer.currency,
    offer.unit_amount_minor, offer.access_duration_days
  FROM public.gpir_onetime_offers AS offer
  WHERE offer.environment = p_environment AND p_environment = 'SANDBOX'
    AND offer.status = 'SANDBOX_ACTIVE'
  ORDER BY offer.pass_id, offer.currency;
$$;

CREATE FUNCTION public.gpir_prepare_onetime_order(
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
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OFFER_UNAVAILABLE'; END IF;

  INSERT INTO public.gpir_onetime_orders
    (id, user_id, offer_id, supabase_record_id, publication_id,
     client_request_id, provider_request_id, currency,
     expected_amount_minor, access_duration_days)
  VALUES
    (new_order_id, p_user_id, selected_offer.id, selected_offer.supabase_record_id,
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

CREATE FUNCTION public.gpir_attach_onetime_order(
  p_local_order_id uuid, p_paypal_order_id text, p_provider_status text,
  p_provider_debug_id text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.gpir_onetime_orders
     SET paypal_order_id = p_paypal_order_id, provider_status = p_provider_status,
         provider_debug_id = p_provider_debug_id, updated_at = now()
   WHERE id = p_local_order_id AND environment = p_environment
     AND p_environment = 'SANDBOX' AND status = 'CREATED'
     AND (paypal_order_id IS NULL OR paypal_order_id = p_paypal_order_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE FUNCTION public.gpir_get_onetime_order(
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
  LEFT JOIN public.gpir_onetime_entitlements AS entitlements
    ON entitlements.source_order_id = orders.id
  WHERE orders.user_id = p_user_id AND orders.paypal_order_id = p_paypal_order_id
    AND orders.environment = p_environment AND p_environment = 'SANDBOX';
$$;

CREATE FUNCTION public.gpir_get_onetime_order_for_webhook(
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
  LEFT JOIN public.gpir_onetime_entitlements AS entitlements
    ON entitlements.source_order_id = orders.id
  WHERE orders.id = p_local_order_id
    AND orders.paypal_order_id = p_paypal_order_id
    AND orders.environment = p_environment AND p_environment = 'SANDBOX';
$$;

CREATE FUNCTION public.gpir_finalize_onetime_capture(
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
      FROM public.gpir_onetime_entitlements AS entitlement
     WHERE entitlement.source_order_id = selected_order.id;
    RETURN QUERY SELECT selected_order.paypal_capture_id = p_paypal_capture_id,
      v_effective_until; RETURN;
  END IF;
  IF selected_order.status IN ('REFUNDED','REVERSED','VOIDED','DENIED') THEN
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
  INSERT INTO public.gpir_onetime_entitlements
    (source_order_id, user_id, supabase_record_id, publication_id,
     status, effective_from, effective_until)
  VALUES (selected_order.id, selected_order.user_id, selected_order.supabase_record_id,
    selected_order.publication_id, 'ACTIVE', now(), v_effective_until)
  ON CONFLICT (source_order_id) DO NOTHING;
  RETURN QUERY SELECT true, v_effective_until;
END;
$$;

CREATE FUNCTION public.gpir_mark_onetime_order_status(
  p_paypal_order_id text, p_paypal_capture_id text,
  p_provider_status text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE changed integer;
DECLARE mapped_status text;
BEGIN
  mapped_status := CASE p_provider_status
    WHEN 'APPROVED' THEN 'APPROVED' WHEN 'PENDING' THEN 'PENDING'
    WHEN 'DENIED' THEN 'DENIED' WHEN 'DECLINED' THEN 'DENIED'
    WHEN 'VOIDED' THEN 'VOIDED' WHEN 'CANCELLED' THEN 'VOIDED' ELSE NULL END;
  IF mapped_status IS NULL OR p_environment <> 'SANDBOX' THEN RETURN false; END IF;
  UPDATE public.gpir_onetime_orders
     SET paypal_capture_id = COALESCE(paypal_capture_id, p_paypal_capture_id),
         status = mapped_status, provider_status = p_provider_status, updated_at = now()
   WHERE paypal_order_id = p_paypal_order_id AND environment = p_environment
     AND status NOT IN ('CAPTURED','REFUNDED','REVERSED');
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE FUNCTION public.gpir_reverse_onetime_capture(
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
  UPDATE public.gpir_onetime_entitlements SET status = 'REVOKED', revoked_at = now(),
    updated_at = now() WHERE source_order_id = selected_order.id AND status = 'ACTIVE';
  RETURN true;
END;
$$;

CREATE FUNCTION public.gpir_claim_onetime_webhook_event(
  p_provider_event_id text, p_event_type text, p_resource_id text,
  p_payload_sha256 text, p_provider_created_at timestamptz, p_environment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE claimed_id uuid;
DECLARE existing_event public.gpir_onetime_webhook_events%ROWTYPE;
BEGIN
  IF p_environment <> 'SANDBOX' THEN RETURN 'CONFLICT'; END IF;
  INSERT INTO public.gpir_onetime_webhook_events
    (provider_event_id, event_type, resource_id, payload_sha256,
     provider_created_at, environment)
  VALUES (p_provider_event_id, p_event_type, p_resource_id, p_payload_sha256,
    p_provider_created_at, p_environment)
  ON CONFLICT (provider_event_id) DO NOTHING RETURNING id INTO claimed_id;
  IF claimed_id IS NOT NULL THEN RETURN 'CLAIMED'; END IF;
  SELECT * INTO existing_event FROM public.gpir_onetime_webhook_events
   WHERE provider_event_id = p_provider_event_id FOR UPDATE;
  IF existing_event.payload_sha256 <> p_payload_sha256 OR
     existing_event.event_type <> p_event_type THEN RETURN 'CONFLICT'; END IF;
  IF existing_event.processing_status = 'ERROR' OR
     (existing_event.processing_status = 'PROCESSING' AND
      existing_event.updated_at < now() - interval '10 minutes') THEN
    UPDATE public.gpir_onetime_webhook_events
       SET processing_status = 'PROCESSING', attempt_count = attempt_count + 1,
           updated_at = now(), last_error_code = NULL WHERE id = existing_event.id;
    RETURN 'CLAIMED';
  END IF;
  IF existing_event.processing_status = 'PROCESSING' THEN RETURN 'IN_PROGRESS'; END IF;
  RETURN 'DUPLICATE';
END;
$$;

CREATE FUNCTION public.gpir_finish_onetime_webhook_event(
  p_provider_event_id text, p_processing_status text,
  p_error_code text, p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE changed integer;
BEGIN
  IF p_environment <> 'SANDBOX' OR
     p_processing_status NOT IN ('PROCESSED','IGNORED','ERROR') THEN RETURN false; END IF;
  UPDATE public.gpir_onetime_webhook_events
     SET processing_status = p_processing_status, last_error_code = p_error_code,
         processed_at = CASE WHEN p_processing_status IN ('PROCESSED','IGNORED')
                             THEN now() ELSE NULL END,
         updated_at = now()
   WHERE provider_event_id = p_provider_event_id AND environment = p_environment;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE FUNCTION public.gpir_resolve_onetime_entitlement(
  p_user_id uuid, p_publication_id text, p_supabase_record_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gpir_onetime_entitlements AS entitlement
    WHERE entitlement.user_id = p_user_id
      AND entitlement.publication_id = p_publication_id
      AND entitlement.supabase_record_id = p_supabase_record_id
      AND entitlement.status = 'ACTIVE'
      AND entitlement.effective_from <= CURRENT_TIMESTAMP
      AND entitlement.effective_until > CURRENT_TIMESTAMP
  );
$$;

REVOKE ALL ON FUNCTION public.gpir_list_onetime_offers(text),
  public.gpir_prepare_onetime_order(uuid,text,text,uuid,text),
  public.gpir_attach_onetime_order(uuid,text,text,text,text),
  public.gpir_get_onetime_order(uuid,text,text),
  public.gpir_get_onetime_order_for_webhook(text,uuid,text),
  public.gpir_finalize_onetime_capture(uuid,text,text,text,bigint,text,text,text),
  public.gpir_mark_onetime_order_status(text,text,text,text),
  public.gpir_reverse_onetime_capture(text,text,text),
  public.gpir_claim_onetime_webhook_event(text,text,text,text,timestamptz,text),
  public.gpir_finish_onetime_webhook_event(text,text,text,text),
  public.gpir_resolve_onetime_entitlement(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gpir_list_onetime_offers(text),
  public.gpir_prepare_onetime_order(uuid,text,text,uuid,text),
  public.gpir_attach_onetime_order(uuid,text,text,text,text),
  public.gpir_get_onetime_order(uuid,text,text),
  public.gpir_get_onetime_order_for_webhook(text,uuid,text),
  public.gpir_finalize_onetime_capture(uuid,text,text,text,bigint,text,text,text),
  public.gpir_mark_onetime_order_status(text,text,text,text),
  public.gpir_reverse_onetime_capture(text,text,text),
  public.gpir_claim_onetime_webhook_event(text,text,text,text,timestamptz,text),
  public.gpir_finish_onetime_webhook_event(text,text,text,text),
  public.gpir_resolve_onetime_entitlement(uuid,text,uuid)
  TO service_role;

COMMENT ON TABLE public.gpir_onetime_offers IS
  'Owner-controlled Sandbox prices for isolated one-time publication passes; migration seeds no prices.';
COMMENT ON TABLE public.gpir_onetime_entitlements IS
  'Publication-specific, expiring grants backed by a verified one-time PayPal capture.';
