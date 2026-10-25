import { PAYPAL_BILLING_ID, PAYPAL_ID, UUID, storedSubscription, supabaseRpc, paypalJson } from '../_shared/gpir-paypal.mjs';
import { verifiedSubscriptionTransaction, subscriptionTransactionsPath } from '../_shared/gpir-subscription-payment-reconciliation.mjs';

// PayPal subscription renewals use PAYMENT.SALE.COMPLETED with billing_agreement_id.
// The event is only a hint; the authoritative amount/status comes from PayPal's
// subscription-scoped transaction API, never from the webhook payload.
export async function reconcileSubscriptionSale({ event, config, accessToken, fetchImpl }) {
  const subscriptionId = event?.resource?.billing_agreement_id;
  const transactionId = event?.resource?.id;
  if (!PAYPAL_BILLING_ID.test(subscriptionId || '') || !PAYPAL_ID.test(transactionId || ''))
    return { ok: false, code: 'SUBSCRIPTION_SALE_IDENTITY_INVALID' };
  const provider = await paypalJson({ config, accessToken, fetchImpl,
    path: `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}` });
  if (!provider.ok || provider.data?.id !== subscriptionId ||
      provider.data?.status !== 'ACTIVE' || !UUID.test(provider.data?.custom_id || ''))
    return { ok: false, code: 'SUBSCRIPTION_PROVIDER_MISMATCH' };
  const localId = provider.data.custom_id;
  const lookup = await supabaseRpc({ config, fetchImpl,
    name: 'gpir_get_paypal_subscription_for_webhook_v3',
    body: { p_local_subscription_id: localId, p_paypal_subscription_id: subscriptionId,
      p_environment: config.PAYMENT_ENVIRONMENT } });
  const local = lookup.ok ? storedSubscription(lookup.data) : null;
  if (!local || local.local_subscription_id !== localId ||
      local.paypal_plan_id !== provider.data.plan_id || !UUID.test(local.user_id || ''))
    return { ok: false, code: 'SUBSCRIPTION_LOCAL_MISMATCH' };
  const contextResult = await supabaseRpc({ config, fetchImpl,
    name: 'gpir_subscription_reconciliation_context_v1',
    body: { p_user_id: local.user_id, p_paypal_subscription_id: subscriptionId,
      p_environment: config.PAYMENT_ENVIRONMENT } });
  const rows = contextResult.data;
  const context = contextResult.ok && Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!context || context.local_subscription_id !== localId ||
      context.paypal_plan_id !== local.paypal_plan_id ||
      !Number.isSafeInteger(Number(context.expected_amount_minor)))
    return { ok: false, code: 'SUBSCRIPTION_CONTEXT_MISMATCH' };

  // Search the event's time window, not the original approval's last-30-days window.
  // PayPal limits transaction queries to 31 days; a bounded +/- 3 day range
  // handles normal delivery delay without accepting ambiguous multi-page results.
  const timestamp = Date.parse(event.create_time || '');
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300000)
    return { ok: false, code: 'SUBSCRIPTION_EVENT_TIME_INVALID' };
  const start = new Date(timestamp - 3 * 86400000).toISOString();
  const end = new Date(Math.min(Date.now() + 300000, timestamp + 3 * 86400000)).toISOString();
  const path = subscriptionTransactionsPath(subscriptionId, start, end);
  if (!path) return { ok: false, code: 'SUBSCRIPTION_TRANSACTION_WINDOW_INVALID' };
  const transactions = await paypalJson({ config, accessToken, fetchImpl, path });
  if (!transactions.ok || !Array.isArray(transactions.data?.transactions) ||
      Number(transactions.data?.total_pages || 1) !== 1)
    return { ok: false, code: 'SUBSCRIPTION_TRANSACTIONS_UNAVAILABLE' };
  const match = verifiedSubscriptionTransaction(transactions.data, {
    paypalSubscriptionId: subscriptionId, transactionId,
    expectedCurrency: context.expected_currency,
    expectedAmountMinor: Number(context.expected_amount_minor) });
  if (!match) return { ok: false, code: 'SUBSCRIPTION_TRANSACTION_UNVERIFIED' };
  const nextBillingTime = provider.data?.billing_info?.next_billing_time;
  if (!Number.isFinite(Date.parse(nextBillingTime || '')))
    return { ok: false, code: 'SUBSCRIPTION_PERIOD_UNVERIFIED' };
  const recorded = await supabaseRpc({ config, fetchImpl,
    name: 'gpir_record_verified_subscription_payment_v1',
    body: { p_local_subscription_id: localId, p_reader_user_id: local.user_id,
      p_paypal_subscription_id: subscriptionId, p_paypal_transaction_id: transactionId,
      p_environment: config.PAYMENT_ENVIRONMENT, p_currency: match.currency,
      p_gross_amount_minor: match.grossAmountMinor,
      p_provider_completed_at: match.providerCompletedAt,
      p_provider_evidence_source: 'PAYPAL_VERIFIED_WEBHOOK',
      p_provider_event_id: event.id } });
  if (!recorded.ok || !['RECORDED', 'DUPLICATE'].includes(recorded.data))
    return { ok: false, code: 'SUBSCRIPTION_LEDGER_WRITE_FAILED' };
  const finalized = await supabaseRpc({ config, fetchImpl,
    name: 'gpir_finalize_paypal_subscription_v2',
    body: { p_local_subscription_id: localId,
      p_paypal_subscription_id: subscriptionId, p_status: 'ACTIVE',
      p_effective_from: provider.data?.start_time || null,
      p_effective_until: nextBillingTime,
      p_environment: config.PAYMENT_ENVIRONMENT } });
  if (!finalized.ok || finalized.data !== true)
    return { ok: false, code: 'SUBSCRIPTION_PERIOD_RECONCILIATION_FAILED' };
  return { ok: true, status: recorded.data };
}
