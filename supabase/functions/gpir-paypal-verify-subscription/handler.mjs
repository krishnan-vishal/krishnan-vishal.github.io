import { PAYPAL_BILLING_ID, authenticateSupabaseUser, jsonResponse,
  paymentConfiguration, paypalAccessToken, paypalJson, safeError,
  storedSubscription, supabaseRpc, validateBrowserRequest }
  from '../_shared/gpir-paypal.mjs';
import { subscriptionTransactionsPath, verifiedSubscriptionTransaction }
  from '../_shared/gpir-subscription-payment-reconciliation.mjs';

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
    const contextResult = await supabaseRpc({ config, fetchImpl,
      name: 'gpir_subscription_reconciliation_context_v1',
      body: { p_user_id: user.id, p_paypal_subscription_id: input.subscriptionId,
        p_environment: config.PAYMENT_ENVIRONMENT } });
    const rows = contextResult.data;
    const context = contextResult.ok && Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!context || context.local_subscription_id !== local.local_subscription_id ||
        context.paypal_plan_id !== local.paypal_plan_id ||
        !Number.isSafeInteger(Number(context.expected_amount_minor)))
      return safeError(503, 'PAYMENT_RECONCILIATION_UNAVAILABLE', origin, env);
    // PayPal limits transaction queries to bounded date windows. This initial
    // approval-return check covers the last 30 days; older payments require a
    // separate server-side historical reconciliation, not an access shortcut.
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86400000);
    const path = subscriptionTransactionsPath(input.subscriptionId,
      start.toISOString(), end.toISOString());
    const transactions = path ? await paypalJson({ config, accessToken, fetchImpl, path }) : null;
    if (!transactions?.ok || !Array.isArray(transactions.data?.transactions))
      return safeError(503, 'PAYPAL_TRANSACTIONS_UNAVAILABLE', origin, env);
    const expected = { paypalSubscriptionId: input.subscriptionId,
      expectedCurrency: context.expected_currency,
      expectedAmountMinor: Number(context.expected_amount_minor) };
    const matches = transactions.data.transactions.map(row =>
      verifiedSubscriptionTransaction({ transactions: [row] },
        { ...expected, transactionId: row?.id })).filter(Boolean);
    // Never guess which of several billing periods to record on an approval return.
    // G1-03 handles subsequent renewal transactions through verified webhooks.
    if (matches.length !== 1 || transactions.data.total_pages > 1)
      return jsonResponse(200, { status: 'ACTIVE', environment: config.PAYPAL_ENVIRONMENT,
        entitlement: 'SERVER_VERIFIED', paymentConfirmed: false,
        subscriptionId: input.subscriptionId }, origin, env);
    const match = matches[0];
    const recorded = await supabaseRpc({ config, fetchImpl,
      name: 'gpir_record_verified_subscription_payment_v1',
      body: { p_local_subscription_id: local.local_subscription_id,
        p_reader_user_id: user.id, p_paypal_subscription_id: input.subscriptionId,
        p_paypal_transaction_id: match.paypalTransactionId,
        p_environment: config.PAYMENT_ENVIRONMENT, p_currency: match.currency,
        p_gross_amount_minor: match.grossAmountMinor,
        p_provider_completed_at: match.providerCompletedAt,
        p_provider_evidence_source: 'PAYPAL_API', p_provider_event_id: null } });
    if (!recorded.ok || !['RECORDED', 'DUPLICATE'].includes(recorded.data))
      return safeError(503, 'PAYMENT_LEDGER_RECONCILIATION_FAILED', origin, env);
    return jsonResponse(200, { status: 'ACTIVE', environment: config.PAYPAL_ENVIRONMENT,
      entitlement: 'SERVER_VERIFIED', paymentConfirmed: true,
      subscriptionId: input.subscriptionId }, origin, env);
  };
}

export { validInput };
