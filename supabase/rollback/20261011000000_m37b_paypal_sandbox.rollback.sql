-- M37-B rollback. Run only after disabling all three M37-B Edge Functions.
-- This intentionally leaves the pre-existing identity, auth, access-policy and
-- user-access-profile tables untouched.

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
  ELSIF policy.access_class = 'ENTITLED' AND EXISTS (
    SELECT 1 FROM public.gpir_user_access_profiles AS profile
     WHERE profile.user_id = caller AND profile.access_class = 'ENTITLED'
       AND profile.status = 'ACTIVE' AND profile.effective_from <= CURRENT_TIMESTAMP
       AND (profile.effective_until IS NULL OR profile.effective_until > CURRENT_TIMESTAMP)
  ) THEN
    RETURN QUERY SELECT 'ALLOW'::text;
  ELSE
    RETURN QUERY SELECT 'DENY'::text;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.gpir_finish_paypal_webhook_event(text, text, text);
DROP FUNCTION IF EXISTS public.gpir_claim_paypal_webhook_event(text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.gpir_reverse_paypal_capture(text, text);
DROP FUNCTION IF EXISTS public.gpir_finalize_paypal_capture(uuid, text, text, text, bigint, text, text);
DROP FUNCTION IF EXISTS public.gpir_get_paypal_order_for_webhook(text, uuid);
DROP FUNCTION IF EXISTS public.gpir_get_paypal_order(uuid, text);
DROP FUNCTION IF EXISTS public.gpir_attach_paypal_order(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.gpir_prepare_paypal_order(uuid, uuid, uuid);
DROP TABLE IF EXISTS public.gpir_payment_webhook_events;
DROP TABLE IF EXISTS public.gpir_publication_purchase_entitlements;
DROP TABLE IF EXISTS public.gpir_payment_orders;
DROP TABLE IF EXISTS public.gpir_payment_offers;
