import { PAYPAL_BILLING_ID, PAYPAL_ID, valueToMinor } from './gpir-paypal.mjs';

// PayPal subscriptions transactions endpoint: the caller supplies an authenticated,
// owner-matched local subscription and a provider response fetched server-side.
export function verifiedSubscriptionTransaction(provider, {
  paypalSubscriptionId, transactionId, expectedCurrency, expectedAmountMinor
}) {
  if (!PAYPAL_BILLING_ID.test(paypalSubscriptionId || '') ||
      !PAYPAL_ID.test(transactionId || '') ||
      !/^[A-Z]{3}$/.test(expectedCurrency || '') ||
      !Number.isSafeInteger(expectedAmountMinor) || expectedAmountMinor <= 0 ||
      !Array.isArray(provider?.transactions)) return null;
  const matches = provider.transactions.filter(row => row?.id === transactionId);
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (row.status !== 'COMPLETED' ||
      row.amount_with_breakdown?.gross_amount?.currency_code !== expectedCurrency ||
      valueToMinor(row.amount_with_breakdown?.gross_amount?.value) !== expectedAmountMinor ||
      !Number.isFinite(Date.parse(row.time || ''))) return null;
  // Provider response belongs to the subscription-specific endpoint; never accept
  // a browser-supplied transaction collection or infer payment from billing ACTIVE.
  return Object.freeze({
    paypalSubscriptionId, paypalTransactionId: row.id,
    currency: expectedCurrency, grossAmountMinor: expectedAmountMinor,
    providerStatus: 'COMPLETED', providerCompletedAt: row.time
  });
}

export function subscriptionTransactionsPath(subscriptionId, startTime, endTime) {
  if (!PAYPAL_BILLING_ID.test(subscriptionId || '') ||
      !Number.isFinite(Date.parse(startTime || '')) ||
      !Number.isFinite(Date.parse(endTime || '')) ||
      Date.parse(startTime) >= Date.parse(endTime)) return null;
  const query = new URLSearchParams({ start_time: startTime, end_time: endTime });
  return `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/transactions?${query}`;
}
