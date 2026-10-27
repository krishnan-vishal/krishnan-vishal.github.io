-- Sandbox only: return library-pass expiration without altering subscription grants.
CREATE OR REPLACE FUNCTION public.gpir_get_onetime_order(
 p_user_id uuid, p_paypal_order_id text, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, paypal_capture_id text,
 publication_id text, supabase_record_id uuid, currency text,
 expected_amount_minor bigint, access_duration_days integer, order_status text,
 effective_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public
AS $function$
 SELECT orders.id, orders.paypal_order_id, orders.paypal_capture_id,
  orders.publication_id, orders.supabase_record_id, orders.currency,
  orders.expected_amount_minor, orders.access_duration_days, orders.status,
  CASE WHEN orders.publication_id = 'PREMIUM_LIBRARY'
    THEN library.effective_until ELSE publication.effective_until END
 FROM public.gpir_onetime_orders AS orders
 LEFT JOIN public.gpir_onetime_library_entitlements AS library
  ON library.source_order_id = orders.id
 LEFT JOIN public.gpir_onetime_entitlements AS publication
  ON publication.source_order_id = orders.id
 WHERE orders.user_id = p_user_id AND orders.paypal_order_id = p_paypal_order_id
  AND orders.environment = p_environment AND p_environment = 'SANDBOX';
$function$;
