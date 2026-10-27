-- Sandbox-only readback: resolve 30-day Premium Library passes without changing recurring subscriptions.
CREATE OR REPLACE FUNCTION public.gpir_get_onetime_order(
 p_user_id uuid, p_paypal_order_id text, p_environment text)
RETURNS TABLE(local_order_id uuid, paypal_order_id text, paypal_capture_id text,
 publication_id text, supabase_record_id uuid, currency text,
 expected_amount_minor bigint, access_duration_days integer,
 order_status text, effective_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public
AS $function$
 SELECT o.id, o.paypal_order_id, o.paypal_capture_id,
  o.publication_id, o.supabase_record_id, o.currency,
  o.expected_amount_minor, o.access_duration_days, o.status,
  CASE WHEN o.publication_id = 'PREMIUM_LIBRARY'
   THEN library.effective_until ELSE publication.effective_until END
 FROM public.gpir_onetime_orders AS o
 LEFT JOIN public.gpir_onetime_entitlements AS publication
  ON publication.source_order_id = o.id
 LEFT JOIN public.gpir_onetime_library_entitlements AS library
  ON library.source_order_id = o.id
 WHERE o.user_id = p_user_id AND o.paypal_order_id = p_paypal_order_id
  AND o.environment = p_environment AND p_environment = 'SANDBOX';
$function$;
