-- M37 restricted one-time USD 1 test. REVIEW ONLY; do not apply before approval.
-- Feature flag and authenticated UUID gate are enforced by the create-order Edge Function.
-- This RPC is service-role-only and never changes the public currency catalogue.
-- Requires securely configured DB setting app.gpir_m37_test_reader_uuid (not stored in repo).
-- Apply constraint change and RPC together only after release approval.
ALTER TABLE public.gpir_m37_onetime_orders
  DROP CONSTRAINT gpir_m37_onetime_orders_amount_minor_check;
ALTER TABLE public.gpir_m37_onetime_orders
  ADD CONSTRAINT gpir_m37_onetime_orders_amount_minor_check
  CHECK (amount_minor = 999 OR (currency = 'USD' AND amount_minor = 100));
CREATE OR REPLACE FUNCTION public.gpir_m37_prepare_restricted_usd1_order(
  p_user_id uuid, p_currency text, p_client_request_id uuid)
RETURNS TABLE(local_order_id uuid, offer_id uuid, pass_id text,
  publication_id text, supabase_record_id uuid, display_name text,
  currency text, expected_amount_minor integer, access_duration_days integer,
  paypal_order_id text, provider_request_id text, sku text)
LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE o public.gpir_m37_onetime_orders%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
    THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
  IF p_user_id IS NULL OR p_client_request_id IS NULL OR p_currency <> 'USD'
    OR p_user_id::text IS DISTINCT FROM nullif(current_setting('app.gpir_m37_test_reader_uuid', true), '')
    THEN RAISE EXCEPTION 'INVALID_RESTRICTED_REQUEST'; END IF;
  INSERT INTO public.gpir_m37_onetime_orders
    (user_id, currency, amount_minor, duration_days, client_request_id)
  VALUES (p_user_id, 'USD', 100, 30, p_client_request_id)
  ON CONFLICT (user_id, client_request_id) DO NOTHING;
  SELECT * INTO o FROM public.gpir_m37_onetime_orders x
    WHERE x.user_id=p_user_id AND x.client_request_id=p_client_request_id FOR UPDATE;
  IF NOT FOUND OR o.currency <> 'USD' OR o.amount_minor <> 100
     OR o.duration_days <> 30 OR o.environment <> 'PRODUCTION'
     OR o.status NOT IN ('CREATED','APPROVED','PENDING')
    THEN RAISE EXCEPTION 'RESTRICTED_REQUEST_CONFLICT'; END IF;
  RETURN QUERY SELECT o.id,
    '00000000-0000-4000-8000-000000000100'::uuid,
    'GPIR_PREMIUM_LIBRARY_30D'::text, 'PREMIUM_LIBRARY'::text, NULL::uuid,
    'GPIR Premium Library - 30 Day Pass (restricted test)'::text,
    o.currency, o.amount_minor::integer, o.duration_days::integer,
    o.paypal_order_id, ('gpir-m37-'||o.id::text),
    'GPIR_PREMIUM_LIBRARY_30D'::text;
END $function$;
REVOKE ALL ON FUNCTION public.gpir_m37_prepare_restricted_usd1_order(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gpir_m37_prepare_restricted_usd1_order(uuid,text,uuid) TO service_role;
