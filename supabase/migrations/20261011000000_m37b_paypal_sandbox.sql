-- M37-B: additive PayPal Sandbox payment boundary.
-- REVIEW-ONLY: this migration is not approved for production deployment.
-- It preserves the existing authentication and reader-entitlement authority,
-- and adds only publication-specific grants backed by a verified capture.

CREATE TABLE public.gpir_payment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_record_id uuid NOT NULL
    REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  publication_id text NOT NULL,
  sku text NOT NULL UNIQUE CHECK (length(btrim(sku)) BETWEEN 3 AND 64),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 127),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor > 0),
  environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX'),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SANDBOX_ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supabase_record_id, publication_id, currency)
);

CREATE TRIGGER gpir_payment_offer_identity
BEFORE INSERT OR UPDATE OF supabase_record_id, publication_id
ON public.gpir_payment_offers
FOR EACH ROW EXECUTE FUNCTION public.gpir_validate_publication_policy_identity();

CREATE TABLE public.gpir_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES public.gpir_payment_offers(id) ON DELETE RESTRICT,
  supabase_record_id uuid NOT NULL
    REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  publication_id text NOT NULL,
  provider text NOT NULL DEFAULT 'PAYPAL' CHECK (provider = 'PAYPAL'),
  environment text NOT NULL DEFAULT 'SANDBOX' CHECK (environment = 'SANDBOX'),
  client_request_id uuid NOT NULL,
  provider_request_id text NOT NULL UNIQUE,
  paypal_order_id text UNIQUE,
  paypal_capture_id text UNIQUE,
  currency text NOT NULL CHECK (currency = 'USD'),
  expected_amount_minor bigint NOT NULL CHECK (expected_amount_minor > 0),
  captured_amount_minor bigint CHECK (captured_amount_minor > 0),
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN
    ('CREATED', 'APPROVED', 'PENDING', 'CAPTURED', 'DENIED', 'REFUNDED',
     'REVERSED', 'VOIDED', 'FAILED')),
  provider_status text,
  provider_debug_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  UNIQUE (user_id, client_request_id),
  CONSTRAINT gpir_payment_capture_consistent CHECK (
    (status = 'CAPTURED' AND paypal_capture_id IS NOT NULL AND
      captured_amount_minor = expected_amount_minor AND captured_at IS NOT NULL)
    OR status <> 'CAPTURED'
  )
);

CREATE INDEX gpir_payment_orders_user_publication_idx
  ON public.gpir_payment_orders (user_id, supabase_record_id, status);

CREATE TABLE public.gpir_publication_purchase_entitlements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  supabase_record_id uuid NOT NULL
    REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  publication_id text NOT NULL,
  source_payment_order_id uuid NOT NULL
    REFERENCES public.gpir_payment_orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, supabase_record_id),
  CONSTRAINT gpir_purchase_entitlement_revocation CHECK (
    (status = 'ACTIVE' AND revoked_at IS NULL) OR
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
  )
);

CREATE TRIGGER gpir_purchase_entitlement_identity
BEFORE INSERT OR UPDATE OF supabase_record_id, publication_id
ON public.gpir_publication_purchase_entitlements
FOR EACH ROW EXECUTE FUNCTION public.gpir_validate_publication_policy_identity();

CREATE TABLE public.gpir_payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE
    CHECK (length(provider_event_id) BETWEEN 1 AND 128),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 128),
  resource_id text CHECK (resource_id IS NULL OR length(resource_id) BETWEEN 1 AND 128),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text NOT NULL DEFAULT 'PROCESSING'
    CHECK (processing_status IN ('PROCESSING', 'PROCESSED', 'IGNORED', 'ERROR')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  last_error_code text,
  provider_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.gpir_payment_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_publication_purchase_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_payment_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gpir_payment_offers,
  public.gpir_payment_orders,
  public.gpir_publication_purchase_entitlements,
  public.gpir_payment_webhook_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gpir_payment_offers,
  public.gpir_payment_orders,
  public.gpir_publication_purchase_entitlements,
  public.gpir_payment_webhook_events
  TO service_role;

CREATE FUNCTION public.gpir_prepare_paypal_order(
  p_user_id uuid,
  p_offer_id uuid,
  p_client_request_id uuid
)
RETURNS TABLE(
  local_order_id uuid,
  paypal_order_id text,
  provider_request_id text,
  publication_id text,
  supabase_record_id uuid,
  sku text,
  display_name text,
  currency text,
  expected_amount_minor bigint,
  order_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_offer public.gpir_payment_offers%ROWTYPE;
  selected_order public.gpir_payment_orders%ROWTYPE;
  new_order_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO selected_offer
    FROM public.gpir_payment_offers
   WHERE id = p_offer_id AND environment = 'SANDBOX' AND status = 'SANDBOX_ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OFFER_UNAVAILABLE'; END IF;

  INSERT INTO public.gpir_payment_orders
    (id, user_id, offer_id, supabase_record_id, publication_id,
     client_request_id, provider_request_id, currency, expected_amount_minor)
  VALUES
    (new_order_id, p_user_id, selected_offer.id, selected_offer.supabase_record_id,
     selected_offer.publication_id, p_client_request_id,
     'gpir-' || new_order_id::text, selected_offer.currency,
     selected_offer.unit_amount_minor)
  ON CONFLICT (user_id, client_request_id) DO NOTHING;

  SELECT * INTO selected_order
    FROM public.gpir_payment_orders
   WHERE user_id = p_user_id AND client_request_id = p_client_request_id;
  IF selected_order.offer_id <> p_offer_id THEN
    RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT';
  END IF;

  RETURN QUERY SELECT selected_order.id, selected_order.paypal_order_id,
    selected_order.provider_request_id, selected_order.publication_id,
    selected_order.supabase_record_id, selected_offer.sku,
    selected_offer.display_name, selected_order.currency,
    selected_order.expected_amount_minor, selected_order.status;
END;
$$;

CREATE FUNCTION public.gpir_attach_paypal_order(
  p_local_order_id uuid,
  p_paypal_order_id text,
  p_provider_status text,
  p_provider_debug_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.gpir_payment_orders
     SET paypal_order_id = p_paypal_order_id,
         provider_status = p_provider_status,
         provider_debug_id = p_provider_debug_id,
         updated_at = now()
   WHERE id = p_local_order_id
     AND environment = 'SANDBOX'
     AND status = 'CREATED'
     AND (paypal_order_id IS NULL OR paypal_order_id = p_paypal_order_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE FUNCTION public.gpir_get_paypal_order(
  p_user_id uuid,
  p_paypal_order_id text
)
RETURNS TABLE(
  local_order_id uuid,
  paypal_order_id text,
  provider_request_id text,
  publication_id text,
  supabase_record_id uuid,
  currency text,
  expected_amount_minor bigint,
  order_status text,
  paypal_capture_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT id, paypal_order_id, provider_request_id, publication_id,
    supabase_record_id, currency, expected_amount_minor, status,
    paypal_capture_id
  FROM public.gpir_payment_orders
  WHERE user_id = p_user_id AND paypal_order_id = p_paypal_order_id
    AND environment = 'SANDBOX';
$$;

CREATE FUNCTION public.gpir_get_paypal_order_for_webhook(
  p_paypal_order_id text,
  p_local_order_id uuid
)
RETURNS TABLE(
  local_order_id uuid,
  paypal_order_id text,
  provider_request_id text,
  publication_id text,
  supabase_record_id uuid,
  currency text,
  expected_amount_minor bigint,
  order_status text,
  paypal_capture_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT id, paypal_order_id, provider_request_id, publication_id,
    supabase_record_id, currency, expected_amount_minor, status,
    paypal_capture_id
  FROM public.gpir_payment_orders
  WHERE id = p_local_order_id
    AND (paypal_order_id IS NULL OR paypal_order_id = p_paypal_order_id)
    AND environment = 'SANDBOX';
$$;

CREATE FUNCTION public.gpir_finalize_paypal_capture(
  p_local_order_id uuid,
  p_paypal_order_id text,
  p_paypal_capture_id text,
  p_currency text,
  p_captured_amount_minor bigint,
  p_provider_status text,
  p_provider_debug_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE selected_order public.gpir_payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO selected_order FROM public.gpir_payment_orders
   WHERE id = p_local_order_id FOR UPDATE;
  IF NOT FOUND OR selected_order.environment <> 'SANDBOX' OR
     selected_order.currency <> p_currency OR
     selected_order.expected_amount_minor <> p_captured_amount_minor OR
     (selected_order.paypal_order_id IS NOT NULL AND
      selected_order.paypal_order_id <> p_paypal_order_id) THEN
    RETURN false;
  END IF;
  IF selected_order.status = 'CAPTURED' THEN
    RETURN selected_order.paypal_capture_id = p_paypal_capture_id;
  END IF;
  IF selected_order.status IN ('REFUNDED', 'REVERSED', 'VOIDED', 'DENIED') THEN
    RETURN false;
  END IF;

  UPDATE public.gpir_payment_orders
     SET paypal_order_id = p_paypal_order_id,
         paypal_capture_id = p_paypal_capture_id,
         captured_amount_minor = p_captured_amount_minor,
         status = 'CAPTURED', provider_status = p_provider_status,
         provider_debug_id = p_provider_debug_id,
         captured_at = now(), updated_at = now()
   WHERE id = p_local_order_id;

  INSERT INTO public.gpir_publication_purchase_entitlements
    (user_id, supabase_record_id, publication_id, source_payment_order_id,
     status, effective_from, revoked_at)
  VALUES
    (selected_order.user_id, selected_order.supabase_record_id,
     selected_order.publication_id, selected_order.id, 'ACTIVE', now(), NULL)
  ON CONFLICT (user_id, supabase_record_id) DO UPDATE
    SET publication_id = EXCLUDED.publication_id,
        source_payment_order_id = EXCLUDED.source_payment_order_id,
        status = 'ACTIVE', effective_from = now(), revoked_at = NULL,
        updated_at = now();
  RETURN true;
END;
$$;

CREATE FUNCTION public.gpir_reverse_paypal_capture(
  p_paypal_capture_id text,
  p_reversal_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_order public.gpir_payment_orders%ROWTYPE;
  replacement_order_id uuid;
BEGIN
  IF p_reversal_status NOT IN ('REFUNDED', 'REVERSED') THEN RETURN false; END IF;
  SELECT * INTO selected_order FROM public.gpir_payment_orders
   WHERE paypal_capture_id = p_paypal_capture_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.gpir_payment_orders SET status = p_reversal_status,
    provider_status = p_reversal_status, updated_at = now()
   WHERE id = selected_order.id;

  SELECT id INTO replacement_order_id
    FROM public.gpir_payment_orders
   WHERE user_id = selected_order.user_id
     AND supabase_record_id = selected_order.supabase_record_id
     AND status = 'CAPTURED' AND id <> selected_order.id
   ORDER BY captured_at DESC LIMIT 1;
  IF replacement_order_id IS NULL THEN
    UPDATE public.gpir_publication_purchase_entitlements
       SET status = 'REVOKED', revoked_at = now(), updated_at = now()
     WHERE user_id = selected_order.user_id
       AND supabase_record_id = selected_order.supabase_record_id;
  ELSE
    UPDATE public.gpir_publication_purchase_entitlements
       SET source_payment_order_id = replacement_order_id,
           status = 'ACTIVE', revoked_at = NULL, updated_at = now()
     WHERE user_id = selected_order.user_id
       AND supabase_record_id = selected_order.supabase_record_id;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.gpir_claim_paypal_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_resource_id text,
  p_payload_sha256 text,
  p_provider_created_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  claimed_id uuid;
  existing_event public.gpir_payment_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.gpir_payment_webhook_events
    (provider_event_id, event_type, resource_id, payload_sha256,
     provider_created_at)
  VALUES
    (p_provider_event_id, p_event_type, p_resource_id, p_payload_sha256,
     p_provider_created_at)
  ON CONFLICT (provider_event_id) DO NOTHING
  RETURNING id INTO claimed_id;
  IF claimed_id IS NOT NULL THEN RETURN 'CLAIMED'; END IF;

  SELECT * INTO existing_event FROM public.gpir_payment_webhook_events
   WHERE provider_event_id = p_provider_event_id FOR UPDATE;
  IF existing_event.payload_sha256 <> p_payload_sha256 OR
     existing_event.event_type <> p_event_type THEN
    RETURN 'CONFLICT';
  END IF;
  IF existing_event.processing_status = 'ERROR' OR
     (existing_event.processing_status = 'PROCESSING' AND
      existing_event.updated_at < now() - interval '10 minutes') THEN
    UPDATE public.gpir_payment_webhook_events
       SET processing_status = 'PROCESSING', attempt_count = attempt_count + 1,
           updated_at = now(), last_error_code = NULL
     WHERE id = existing_event.id;
    RETURN 'CLAIMED';
  END IF;
  IF existing_event.processing_status = 'PROCESSING' THEN RETURN 'IN_PROGRESS'; END IF;
  RETURN 'DUPLICATE';
END;
$$;

CREATE FUNCTION public.gpir_finish_paypal_webhook_event(
  p_provider_event_id text,
  p_processing_status text,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE changed integer;
BEGIN
  IF p_processing_status NOT IN ('PROCESSED', 'IGNORED', 'ERROR') THEN
    RETURN false;
  END IF;
  UPDATE public.gpir_payment_webhook_events
     SET processing_status = p_processing_status,
         last_error_code = p_error_code,
         processed_at = CASE WHEN p_processing_status IN ('PROCESSED', 'IGNORED')
                             THEN now() ELSE NULL END,
         updated_at = now()
   WHERE provider_event_id = p_provider_event_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.gpir_prepare_paypal_order(uuid, uuid, uuid),
  public.gpir_attach_paypal_order(uuid, text, text, text),
  public.gpir_get_paypal_order(uuid, text),
  public.gpir_get_paypal_order_for_webhook(text, uuid),
  public.gpir_finalize_paypal_capture(uuid, text, text, text, bigint, text, text),
  public.gpir_reverse_paypal_capture(text, text),
  public.gpir_claim_paypal_webhook_event(text, text, text, text, timestamptz),
  public.gpir_finish_paypal_webhook_event(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gpir_prepare_paypal_order(uuid, uuid, uuid),
  public.gpir_attach_paypal_order(uuid, text, text, text),
  public.gpir_get_paypal_order(uuid, text),
  public.gpir_get_paypal_order_for_webhook(text, uuid),
  public.gpir_finalize_paypal_capture(uuid, text, text, text, bigint, text, text),
  public.gpir_reverse_paypal_capture(text, text),
  public.gpir_claim_paypal_webhook_event(text, text, text, text, timestamptz),
  public.gpir_finish_paypal_webhook_event(text, text, text)
  TO service_role;

-- Preserve the existing decision surface. A verified, active one-time purchase
-- is an additional way to satisfy an ENTITLED publication policy.
CREATE OR REPLACE FUNCTION public.resolve_publication_entitlement(
  p_publication_id text,
  p_supabase_record_id text
)
RETURNS TABLE(decision text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  policy public.gpir_publication_access_policies%ROWTYPE;
  caller uuid := auth.uid();
BEGIN
  IF p_publication_id IS NULL OR btrim(p_publication_id) = '' OR
     p_supabase_record_id IS NULL OR
     p_supabase_record_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT 'DENY'::text; RETURN;
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
      SELECT 1 FROM public.gpir_user_access_profiles AS profile
       WHERE profile.user_id = caller AND profile.access_class = 'ENTITLED'
         AND profile.status = 'ACTIVE' AND profile.effective_from <= CURRENT_TIMESTAMP
         AND (profile.effective_until IS NULL OR profile.effective_until > CURRENT_TIMESTAMP)
    ) OR EXISTS (
      SELECT 1 FROM public.gpir_publication_purchase_entitlements AS purchase
       WHERE purchase.user_id = caller
         AND purchase.supabase_record_id = policy.supabase_record_id
         AND purchase.publication_id = policy.publication_id
         AND purchase.status = 'ACTIVE'
         AND purchase.effective_from <= CURRENT_TIMESTAMP
    )
  ) THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSE
    RETURN QUERY SELECT 'DENY'::text;
  END IF;
END;
$$;

COMMENT ON TABLE public.gpir_payment_offers IS
  'Server-authoritative one-time publication prices. M37-B permits SANDBOX only.';
COMMENT ON TABLE public.gpir_publication_purchase_entitlements IS
  'Publication-specific grants created only by verified PayPal capture reconciliation.';
