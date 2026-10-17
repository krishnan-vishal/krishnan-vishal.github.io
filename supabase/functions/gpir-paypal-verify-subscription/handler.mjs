import { PAYPAL_BILLING_ID, authenticateSupabaseUser, jsonResponse,
  paymentConfiguration, paypalAccessToken, paypalJson, safeError,
  storedSubscription, supabaseRpc, validateBrowserRequest }
  from '../_shared/gpir-paypal.mjs';

function validInput(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    PAYPAL_BILLING_ID.test(value.subscriptionId || '');
}

export function createPayPalVerifySubscriptionHandler({ env, fetchImpl = fetch }) {
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
    const lookup = await supabaseRpc({ config,
      name: 'gpir_get_paypal_subscription_v2', fetchImpl,
      body: { p_user_id: user.id, p_paypal_subscription_id: input.subscriptionId,
        p_environment: config.PAYMENT_ENVIRONMENT } });
    const local = lookup.ok ? storedSubscription(lookup.data) : null;
    if (!local) return safeError(404, 'SUBSCRIPTION_NOT_FOUND', origin, env);
    const accessToken = await paypalAccessToken({ config, fetchImpl });
    if (!accessToken) return safeError(503, 'PAYPAL_PROVIDER_UNAVAILABLE', origin, env);
    const provider = await paypalJson({ config, accessToken, fetchImpl,
      path: `/v1/billing/subscriptions/${encodeURIComponent(input.subscriptionId)}` });
    if (!provider.ok || provider.data?.id !== input.subscriptionId ||
        provider.data?.custom_id !== local.local_subscription_id ||
        provider.data?.plan_id !== local.paypal_plan_id || provider.data?.status !== 'ACTIVE')
      return safeError(409, 'SUBSCRIPTION_NOT_ACTIVE_OR_MISMATCHED', origin, env);
    const finalized = await supabaseRpc({ config,
      name: 'gpir_finalize_paypal_subscription_v2', fetchImpl,
      body: { p_local_subscription_id: local.local_subscription_id,
        p_paypal_subscription_id: input.subscriptionId, p_status: 'ACTIVE',
        p_effective_from: provider.data.start_time || null,
        p_effective_until: provider.data.billing_info?.next_billing_time || null,
        p_environment: config.PAYMENT_ENVIRONMENT } });
    if (!finalized.ok || finalized.data !== true)
      return safeError(503, 'SUBSCRIPTION_RECONCILIATION_PENDING', origin, env);
    return jsonResponse(200, { status: 'ACTIVE', environment: config.PAYPAL_ENVIRONMENT,
      entitlement: 'SERVER_VERIFIED', subscriptionId: input.subscriptionId }, origin, env);
  };
}

export { validInput };
