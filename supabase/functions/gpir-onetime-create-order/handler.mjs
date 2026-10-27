import { UUID, authenticateSupabaseUser, jsonResponse, normalizedOffer,
  onetimeConfiguration, paypalAccessToken, paypalJson, preparedOrder, safeError,
  supabaseRpc, validateBrowserRequest } from '../_shared/gpir-onetime-production.mjs';
import { isSupportedCurrency } from '../_shared/gpir-onetime-currency.mjs';

function validInput(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.passId === 'string' && /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(value.passId) &&
    isSupportedCurrency(value.currency) &&
    UUID.test(value.requestId || '');
}

export function createOnetimeCreateOrderHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    const boundary = validateBrowserRequest(request, env, ['GET', 'POST']);
    if (boundary.error) return boundary.error;
    const { origin } = boundary;
    const config = onetimeConfiguration(env);
    if (!config) return safeError(503, 'ONETIME_CHECKOUT_DISABLED', origin, env);
    const user = await authenticateSupabaseUser({ request, config, fetchImpl });
    if (!user) return safeError(401, 'SESSION_REQUIRED', origin, env);

    if (request.method === 'GET') {
      const listed = await supabaseRpc({ config, name: 'gpir_m37_list_offers',
        body: {}, fetchImpl });
      const offers = Array.isArray(listed.data) ? listed.data.map(normalizedOffer).filter(Boolean) : [];
      if (!listed.ok) return safeError(503, 'OFFER_CATALOG_UNAVAILABLE', origin, env);
      return jsonResponse(200, { status: 'READY', environment: 'live',
        clientId: config.PAYPAL_CLIENT_ID, offers }, origin, env);
    }

    let input;
    try { input = await request.json(); } catch {
      return safeError(400, 'MALFORMED_REQUEST', origin, env);
    }
    if (!validInput(input)) return safeError(400, 'INVALID_ORDER_REQUEST', origin, env);
    const prepared = await supabaseRpc({ config, name: 'gpir_m37_prepare_order', fetchImpl,
      body: { p_user_id: user.id, p_pass_id: input.passId, p_currency: input.currency,
        p_client_request_id: input.requestId } });
    const local = prepared.ok ? preparedOrder(prepared.data) : null;
    if (!local) return safeError(409, 'PAYMENT_OFFER_OR_REQUEST_UNAVAILABLE', origin, env);
    if (local.paypal_order_id) return jsonResponse(200, { status: 'CREATED',
      environment: 'live', orderId: local.paypal_order_id }, origin, env);

    const accessToken = await paypalAccessToken({ config, fetchImpl });
    if (!accessToken || !local.amount)
      return safeError(503, 'PAYPAL_PROVIDER_UNAVAILABLE', origin, env);
    const provider = await paypalJson({ config, accessToken, fetchImpl,
      path: '/v2/checkout/orders', method: 'POST', requestId: local.provider_request_id,
      body: { intent: 'CAPTURE', purchase_units: [{ reference_id: local.local_order_id,
        custom_id: local.local_order_id, invoice_id: local.provider_request_id,
        description: local.displayName,
        amount: { currency_code: local.currency, value: local.amount,
          breakdown: { item_total: { currency_code: local.currency, value: local.amount } } },
        items: [{ name: local.displayName, sku: local.sku, quantity: '1',
          category: 'DIGITAL_GOODS',
          unit_amount: { currency_code: local.currency, value: local.amount } }] }] }
    });
    if (!provider.ok || !/^[A-Z0-9-]{8,64}$/i.test(provider.data?.id || '') ||
        !['CREATED', 'PAYER_ACTION_REQUIRED'].includes(provider.data?.status))
      return safeError(502, 'PAYPAL_ORDER_CREATION_FAILED', origin, env);
    const attached = await supabaseRpc({ config, name: 'gpir_m37_attach_order', fetchImpl,
      body: { p_local_order_id: local.local_order_id, p_paypal_order_id: provider.data.id,
        p_provider_status: provider.data.status, p_provider_debug_id: provider.debugId } });
    if (!attached.ok || attached.data !== true)
      return safeError(503, 'PAYMENT_RECONCILIATION_PENDING', origin, env);
    return jsonResponse(201, { status: 'CREATED', environment: 'live',
      orderId: provider.data.id }, origin, env);
  };
}

export { validInput };
