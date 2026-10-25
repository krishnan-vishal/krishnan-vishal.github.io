import { PAYPAL_BILLING_ID, PAYPAL_TRANSACTION_ID, UUID, paypalJson, supabaseRpc }
  from '../_shared/gpir-paypal.mjs';
import { subscriptionTransactionsPath, verifiedSubscriptionAdjustmentTransaction }
  from '../_shared/gpir-subscription-payment-reconciliation.mjs';

function linkedId(resource, relations) {
  const link = resource?.links?.find(item => relations.includes(item?.rel));
  const candidate = typeof link?.href === 'string'
    ? link.href.split('/').filter(Boolean).at(-1) : null;
  return PAYPAL_TRANSACTION_ID.test(candidate || '') ? candidate : null;
}

export function saleTransactionIdForAdjustment(event) {
  if (!['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'].includes(event?.event_type))
    return null;
  const resource = event.resource;
  const candidate = resource?.sale_id ||
    (event.event_type === 'PAYMENT.SALE.REVERSED' ? resource?.id : null);
  return PAYPAL_TRANSACTION_ID.test(candidate || '') ? candidate :
    linkedId(resource, ['sale', 'up', 'parent_payment']);
}

function storedPayment(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || !UUID.test(row.local_subscription_id || '') ||
      !UUID.test(row.user_id || '') ||
      !PAYPAL_BILLING_ID.test(row.paypal_subscription_id || '') ||
      !PAYPAL_BILLING_ID.test(row.paypal_plan_id || '') ||
      !PAYPAL_TRANSACTION_ID.test(row.paypal_transaction_id || '') ||
      !/^[A-Z]{3}$/.test(row.currency || '') ||
      !Number.isSafeInteger(Number(row.gross_amount_minor)) ||
      Number(row.gross_amount_minor) <= 0 ||
      !Number.isFinite(Date.parse(row.provider_completed_at || ''))) return null;
  return Object.freeze({ ...row, gross_amount_minor: Number(row.gross_amount_minor) });
}

export async function reconcileSubscriptionAdjustment({ event, config, accessToken, fetchImpl }) {
  const transactionId = saleTransactionIdForAdjustment(event);
  const adjustmentId = event?.resource?.id;
  if (!transactionId || !PAYPAL_TRANSACTION_ID.test(adjustmentId || ''))
    return { ok: false, code: 'SUBSCRIPTION_ADJUSTMENT_IDENTITY_INVALID' };
  const lookup = await supabaseRpc({ config, fetchImpl,
    name: 'gpir_get_subscription_payment_for_webhook_v1',
    body: { p_paypal_transaction_id: transactionId,
      p_environment: config.PAYMENT_ENVIRONMENT } });
  const local = lookup.ok ? storedPayment(lookup.data) : null;
  if (!local || local.paypal_transaction_id !== transactionId)
    return { ok: false, code: 'SUBSCRIPTION_ADJUSTMENT_PAYMENT_NOT_FOUND' };

  const subscription = await paypalJson({ config, accessToken, fetchImpl,
    path: `/v1/billing/subscriptions/${encodeURIComponent(local.paypal_subscription_id)}` });
  if (!subscription.ok || subscription.data?.id !== local.paypal_subscription_id ||
      subscription.data?.custom_id !== local.local_subscription_id ||
      subscription.data?.plan_id !== local.paypal_plan_id)
    return { ok: false, code: 'SUBSCRIPTION_ADJUSTMENT_OWNER_MISMATCH' };

  const completedAt = Date.parse(local.provider_completed_at);
  const start = new Date(completedAt - 3 * 86400000).toISOString();
  const end = new Date(completedAt + 3 * 86400000).toISOString();
  const path = subscriptionTransactionsPath(local.paypal_subscription_id, start, end);
  const transactions = path
    ? await paypalJson({ config, accessToken, fetchImpl, path }) : null;
  if (!transactions?.ok || !Array.isArray(transactions.data?.transactions) ||
      Number(transactions.data?.total_pages || 1) !== 1)
    return { ok: false, code: 'SUBSCRIPTION_ADJUSTMENT_PROVIDER_UNAVAILABLE' };
  const verified = verifiedSubscriptionAdjustmentTransaction(transactions.data, {
    paypalSubscriptionId: local.paypal_subscription_id, transactionId,
    expectedCurrency: local.currency,
    expectedAmountMinor: local.gross_amount_minor,
    expectedCompletedAt: local.provider_completed_at,
    eventType: event.event_type
  });
  if (!verified)
    return { ok: false, code: 'SUBSCRIPTION_ADJUSTMENT_UNVERIFIED' };

  const recorded = await supabaseRpc({ config, fetchImpl,
    name: 'gpir_record_subscription_payment_adjustment_v1',
    body: { p_local_subscription_id: local.local_subscription_id,
      p_reader_user_id: local.user_id,
      p_paypal_subscription_id: local.paypal_subscription_id,
      p_paypal_transaction_id: transactionId,
      p_paypal_adjustment_id: adjustmentId,
      p_provider_event_id: event.id,
      p_environment: config.PAYMENT_ENVIRONMENT,
      p_adjustment_type: event.event_type.endsWith('REFUNDED') ? 'REFUND' : 'REVERSAL',
      p_resulting_payment_status: verified.resultingStatus,
      p_provider_adjusted_at: event.create_time || null } });
  if (!recorded.ok || !['RECORDED', 'DUPLICATE'].includes(recorded.data))
    return { ok: false, code: 'SUBSCRIPTION_ADJUSTMENT_WRITE_FAILED' };
  return { ok: true, status: recorded.data,
    adjustmentStatus: verified.resultingStatus };
}

export { storedPayment };
