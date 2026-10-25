-- Sandbox-only capture grant: full GPIR Premium Library for 30 days.
-- Run only after 20261026000100 and 20261026000200.
-- No offers or payments are seeded. Existing recurring entitlements are untouched.
ALTER TABLE public.gpir_onetime_offers DROP CONSTRAINT IF EXISTS gpir_onetime_offers_supabase_record_id_fkey;
ALTER TABLE public.gpir_onetime_orders DROP CONSTRAINT IF EXISTS gpir_onetime_orders_supabase_record_id_fkey;
ALTER TABLE public.gpir_onetime_offers ALTER COLUMN supabase_record_id DROP NOT NULL;
ALTER TABLE public.gpir_onetime_orders ALTER COLUMN supabase_record_id DROP NOT NULL;
ALTER TABLE public.gpir_onetime_offers
 ADD CONSTRAINT gpir_onetime_offers_library_scope CHECK (
   (pass_id = 'GPIR_PREMIUM_LIBRARY_30D' AND publication_id = 'PREMIUM_LIBRARY'
      AND supabase_record_id IS NULL AND access_duration_days = 30)
   OR (pass_id <> 'GPIR_PREMIUM_LIBRARY_30D' AND supabase_record_id IS NOT NULL)
 );
ALTER TABLE public.gpir_onetime_orders
 ADD CONSTRAINT gpir_onetime_orders_library_scope CHECK (
   (publication_id = 'PREMIUM_LIBRARY' AND supabase_record_id IS NULL AND access_duration_days = 30)
   OR (publication_id <> 'PREMIUM_LIBRARY' AND supabase_record_id IS NOT NULL)
 );
-- Preserve the existing publication identity validation for publication-specific offers,
-- while accepting only the explicitly governed library SKU without a fake publication FK.
CREATE FUNCTION public.gpir_validate_onetime_offer_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $
BEGIN
  IF NEW.pass_id = 'GPIR_PREMIUM_LIBRARY_30D' THEN
    IF NEW.publication_id <> 'PREMIUM_LIBRARY' OR NEW.supabase_record_id IS NOT NULL
       OR NEW.access_duration_days <> 30 THEN
      RAISE EXCEPTION 'INVALID_PREMIUM_LIBRARY_OFFER';
    END IF;
  ELSE
    RAISE EXCEPTION 'PUBLICATION_SPECIFIC_OFFER_DISABLED';
  END IF;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS gpir_onetime_offer_identity ON public.gpir_onetime_offers;
CREATE TRIGGER gpir_onetime_offer_identity
BEFORE INSERT OR UPDATE ON public.gpir_onetime_offers
FOR EACH ROW EXECUTE FUNCTION public.gpir_validate_onetime_offer_scope();

-- Existing RPCs remain; replace capture and reversal grants to use independent library entitlements.
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
  IF NOT EXISTS (
    SELECT 1 FROM public.gpir_onetime_offers AS offer
    WHERE offer.id = selected_order.offer_id
      AND offer.pass_id = 'GPIR_PREMIUM_LIBRARY_30D'
      AND offer.publication_id = 'PREMIUM_LIBRARY'
      AND offer.access_duration_days = 30
  ) THEN
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
