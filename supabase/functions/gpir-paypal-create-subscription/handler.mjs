import { PAYPAL_BILLING_ID, UUID, authenticateSupabaseUser, jsonResponse,
  paymentConfiguration, paypalAccessToken, paypalJson, safeError,
  storedSubscription, supabaseRpc, validateBrowserRequest }
  from '../_shared/gpir-paypal.mjs';

function validInput(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    UUID.test(value.planId || '') && UUID.test(value.clientRequestId || '');
}

export function createPayPalCreateSubscriptionHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    const boundary = validateBrowserRequest(request, env);
    if (boundary.error) return boundary.error;
    const { origin } = boundary;
    const config = paymentConfiguration(env);
    if (!config) return safeError(503, 'PAYMENT_CONFIGURATION_REQUIRED', origin, env);
    let input;
    try { input = await request.json(); } catch {
      return safeError(400, 'MALFORMED_REQUEST', origin, env);
    }
    if (!validInput(input)) return safeError(400, 'INVALID_SUBSCRIPTION_REQUEST', origin, env);
    const user = await authenticateSupabaseUser({ request, config, fetchImpl });
    if (!user) return safeError(401, 'SESSION_REQUIRED', origin, env);
    const prepared = await supabaseRpc({ config,
      name: 'gpir_prepare_paypal_subscription_v2', fetchImpl,
      body: { p_user_id: user.id, p_plan_id: input.planId,
        p_client_request_id: input.clientRequestId,
        p_environment: config.PAYMENT_ENVIRONMENT } });
    const local = prepared.ok ? storedSubscription(prepared.data) : null;
    if (!local) return safeError(409, 'SUBSCRIPTION_PLAN_OR_REQUEST_UNAVAILABLE', origin, env);
    if (local.paypal_subscription_id)
      return jsonResponse(200, { status: local.subscription_status,
        environment: config.PAYPAL_ENVIRONMENT,
        subscriptionId: local.paypal_subscription_id }, origin, env);

    const accessToken = await paypalAccessToken({ config, fetchImpl });
    if (!accessToken) return safeError(503, 'PAYPAL_PROVIDER_UNAVAILABLE', origin, env);
    const provider = await paypalJson({ config, accessToken, fetchImpl,
      path: '/v1/billing/subscriptions', method: 'POST',
      requestId: local.provider_request_id,
      body: { plan_id: local.paypal_plan_id, custom_id: local.local_subscription_id,
        application_context: { shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW' } } });
    if (!provider.ok || !PAYPAL_BILLING_ID.test(provider.data?.id || '') ||
        !['APPROVAL_PENDING', 'APPROVED', 'ACTIVE'].includes(provider.data?.status))
      return safeError(502, 'PAYPAL_SUBSCRIPTION_CREATION_FAILED', origin, env);
    const status = provider.data.status === 'ACTIVE' ? 'ACTIVE' : 'APPROVAL_PENDING';
    const attached = await supabaseRpc({ config,
      name: 'gpir_attach_paypal_subscription_v2', fetchImpl,
      body: { p_local_subscription_id: local.local_subscription_id,
        p_paypal_subscription_id: provider.data.id, p_provider_status: status,
        p_environment: config.PAYMENT_ENVIRONMENT } });
    if (!attached.ok || attached.data !== true)
      return safeError(503, 'SUBSCRIPTION_RECONCILIATION_PENDING', origin, env);
    return jsonResponse(201, { status, environment: config.PAYPAL_ENVIRONMENT,
      subscriptionId: provider.data.id }, origin, env);
  };
}

export { validInput };
