-- M37 Sandbox-only repair: qualify RPC columns that conflict with RETURNS TABLE
-- output variables while preserving the existing Premium Library identity model.

CREATE OR REPLACE FUNCTION public.gpir_prepare_onetime_order(
    p_user_id uuid,
    p_pass_id text,
    p_currency text,
    p_client_request_id uuid,
    p_environment text
)
RETURNS TABLE(
    local_order_id uuid,
    paypal_order_id text,
    provider_request_id text,
    offer_id uuid,
    pass_id text,
    publication_id text,
    supabase_record_id uuid,
    sku text,
    display_name text,
    currency text,
    expected_amount_minor bigint,
    access_duration_days integer,
    order_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    selected_offer public.gpir_onetime_offers%ROWTYPE;
    selected_order public.gpir_onetime_orders%ROWTYPE;
BEGIN
    IF p_environment <> 'SANDBOX' THEN
        RAISE EXCEPTION 'Unsupported payment environment';
    END IF;

    SELECT offer.*
    INTO selected_offer
    FROM public.gpir_onetime_offers AS offer
    WHERE offer.pass_id = p_pass_id
      AND offer.currency = p_currency
      AND offer.environment = 'SANDBOX'
      AND offer.status = 'SANDBOX_ACTIVE'
      AND offer.publication_id = 'PREMIUM_LIBRARY'
      AND offer.supabase_record_id IS NULL
      AND offer.access_duration_days = 30;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer unavailable';
    END IF;

    INSERT INTO public.gpir_onetime_orders (
        id,
        user_id,
        offer_id,
        supabase_record_id,
        publication_id,
        client_request_id,
        provider_request_id,
        currency,
        expected_amount_minor,
        access_duration_days,
        environment
    )
    VALUES (
        gen_random_uuid(),
        p_user_id,
        selected_offer.id,
        selected_offer.supabase_record_id,
        selected_offer.publication_id,
        p_client_request_id,
        p_client_request_id::text,
        selected_offer.currency,
        selected_offer.amount_minor,
        selected_offer.access_duration_days,
        'SANDBOX'
    )
    ON CONFLICT ON CONSTRAINT gpir_onetime_orders_user_id_client_request_id_key
    DO NOTHING;

    SELECT orders.*
    INTO selected_order
    FROM public.gpir_onetime_orders AS orders
    WHERE orders.user_id = p_user_id
      AND orders.client_request_id = p_client_request_id;

    IF NOT FOUND
       OR selected_order.offer_id IS DISTINCT FROM selected_offer.id THEN
        RAISE EXCEPTION 'Idempotency key conflict';
    END IF;

    RETURN QUERY
    SELECT
        selected_order.id,
        selected_order.paypal_order_id,
        selected_order.provider_request_id,
        selected_offer.id,
        selected_offer.pass_id,
        selected_offer.publication_id,
        selected_offer.supabase_record_id,
        selected_offer.sku,
        selected_offer.display_name,
        selected_offer.currency,
        selected_order.expected_amount_minor,
        selected_order.access_duration_days,
        selected_order.status;
END;
$function$;

REVOKE ALL ON FUNCTION public.gpir_prepare_onetime_order(
    uuid,
    text,
    text,
    uuid,
    text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gpir_prepare_onetime_order(
    uuid,
    text,
    text,
    uuid,
    text
) TO service_role;
