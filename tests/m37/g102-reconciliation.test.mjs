import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedSubscriptionTransaction, subscriptionTransactionsPath }
  from '../../supabase/functions/_shared/gpir-subscription-payment-reconciliation.mjs';

const expected = { paypalSubscriptionId: 'I-674CH86A89ES',
  transactionId: '7UC82239V8074274K', expectedCurrency: 'USD', expectedAmountMinor: 999 };
const transaction = { id: expected.transactionId, status: 'COMPLETED',
  time: '2026-10-18T12:46:46Z',
  amount_with_breakdown: { gross_amount: { currency_code: 'USD', value: '9.99' } } };
test('matching completed recurring transaction is accepted (synthetic provider fixture)', () => {
  assert.deepEqual(verifiedSubscriptionTransaction({ transactions: [transaction] }, expected), {
    paypalSubscriptionId: expected.paypalSubscriptionId,
    paypalTransactionId: expected.transactionId, currency: 'USD', grossAmountMinor: 999,
    providerStatus: 'COMPLETED', providerCompletedAt: transaction.time
  });
});
for (const [name, change] of [
  ['missing transaction', { transactions: [] }],
  ['duplicate transaction', { transactions: [transaction, transaction] }],
  ['pending transaction', { transactions: [{ ...transaction, status: 'PENDING' }] }],
  ['wrong amount', { transactions: [{ ...transaction,
    amount_with_breakdown: { gross_amount: { currency_code: 'USD', value: '1.00' } } }] }],
  ['wrong currency', { transactions: [{ ...transaction,
    amount_with_breakdown: { gross_amount: { currency_code: 'EUR', value: '9.99' } } }] }],
  ['wrong transaction ID', { transactions: [{ ...transaction, id: 'OTHER123456' }] }],
  ['invalid timestamp', { transactions: [{ ...transaction, time: 'not-a-date' }] }]
]) test(`reject ${name}`, () => assert.equal(
  verifiedSubscriptionTransaction(change, expected), null));
test('subscription-specific API path requires a valid window', () => {
  assert.match(subscriptionTransactionsPath(expected.paypalSubscriptionId,
    '2026-10-18T00:00:00Z', '2026-10-20T00:00:00Z'),
    /^\/v1\/billing\/subscriptions\/I-674CH86A89ES\/transactions\?/);
  assert.equal(subscriptionTransactionsPath(expected.paypalSubscriptionId,
    '2026-10-20T00:00:00Z', '2026-10-18T00:00:00Z'), null);
});
