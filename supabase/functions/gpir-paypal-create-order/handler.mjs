import { PAYPAL_ID, UUID, authenticateSupabaseUser, jsonResponse, minorToValue,
  paymentConfiguration, paypalAccessToken, paypalJson, preparedOrder, safeError,
  supabaseRpc, validateBrowserRequest } from '../_shared/gpir-paypal.mjs';

function validInput(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    UUID.test(value.offerId || '') && UUID.test(value.clientRequestId || '');
}

export function createPayPalCreateOrderHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    const boundary = validateBrowserRequest(request, env);
    if (boundary.error) return boundary.error;
    const { origin } = boundary;
    const config = paymentConfiguration(env);
    if (!config) return safeError(503, 'SANDBOX_CONFIGURATION_REQUIRED', origin, env);

    let input;
    try { input = await request.json(); } catch {
      return safeError(400, 'MALFORMED_REQUEST', origin, env);
    }
    if (!validInput(input)) return safeError(400, 'INVALID_ORDER_REQUEST', origin, env);
    const user = await authenticateSupabaseUser({ request, config, fetchImpl });
    if (!user) return safeError(401, 'SESSION_REQUIRED', origin, env);

    const prepared = await supabaseRpc({ config, name: 'gpir_prepare_paypal_order', fetchImpl,
      body: { p_user_id: user.id, p_offer_id: input.offerId,
        p_client_request_id: input.clientRequestId } });
    const local = prepared.ok ? preparedOrder(prepared.data) : null;
    if (!local) return safeError(409, 'PAYMENT_OFFER_OR_REQUEST_UNAVAILABLE', origin, env);
    if (local.paypal_order_id) {
      if (!PAYPAL_ID.test(local.paypal_order_id))
        return safeError(503, 'PAYMENT_STATE_INVALID', origin, env);
      return jsonResponse(200, { status: 'CREATED', environment: 'sandbox',
        orderId: local.paypal_order_id }, origin, env);
    }

    const amount = minorToValue(local.expected_amount_minor);
    const accessToken = await paypalAccessToken({ config, fetchImpl });
    if (!accessToken || !amount) return safeError(503, 'PAYPAL_PROVIDER_UNAVAILABLE', origin, env);
    const provider = await paypalJson({ config, accessToken, fetchImpl,
      path: '/v2/checkout/orders', method: 'POST', requestId: local.provider_request_id,
      body: { intent: 'CAPTURE', purchase_units: [{ reference_id: local.local_order_id,
        custom_id: local.local_order_id, invoice_id: local.provider_request_id,
        description: local.display_name,
        amount: { currency_code: local.currency, value: amount,
          breakdown: { item_total: { currency_code: local.currency, value: amount } } },
        items: [{ name: local.display_name, sku: local.sku, quantity: '1',
          category: 'DIGITAL_GOODS', unit_amount: {
            currency_code: local.currency, value: amount } }] }],
        payment_source: { paypal: { experience_context: {
          shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' } } } }
    });
    if (!provider.ok || !PAYPAL_ID.test(provider.data?.id || '') ||
        !['CREATED', 'PAYER_ACTION_REQUIRED'].includes(provider.data?.status))
      return safeError(502, 'PAYPAL_ORDER_CREATION_FAILED', origin, env);

    const attached = await supabaseRpc({ config, name: 'gpir_attach_paypal_order', fetchImpl,
      body: { p_local_order_id: local.local_order_id,
        p_paypal_order_id: provider.data.id, p_provider_status: provider.data.status,
        p_provider_debug_id: provider.debugId } });
    if (!attached.ok || attached.data !== true)
      return safeError(503, 'PAYMENT_RECONCILIATION_PENDING', origin, env);
    return jsonResponse(201, { status: 'CREATED', environment: 'sandbox',
      orderId: provider.data.id }, origin, env);
  };
}

export { validInput };
