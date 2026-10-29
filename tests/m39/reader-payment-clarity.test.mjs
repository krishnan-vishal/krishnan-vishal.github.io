import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { libraryPassPresentation, normalizeReaderSummary, paymentPresentation,
  recurringSubscriptionPresentation }
  from '../../assets/js/gpir-reader-dashboard.mjs';

const paymentId = '11111111-1111-4111-8111-111111111111';
const recordId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';

function payment(status, overrides = {}) {
  return { id: paymentId, publicationId: 'VK-GPIR-P-M39-01',
    supabaseRecordId: recordId, currency: 'USD', expectedAmountMinor: 999,
    capturedAmountMinor: null, status, createdAt: '2026-10-29T08:00:00Z',
    capturedAt: null, ...overrides };
}

test('non-captured payment states use expected or not-paid language and never paid language', () => {
  const expectations = {
    CREATED: ['Order created — not paid', 'Expected amount'],
    APPROVED: ['Approved — capture pending', 'Expected amount'],
    PENDING: ['Payment processing', 'Expected amount'],
    FAILED: ['Payment failed', 'Not paid'],
    DENIED: ['Payment denied', 'Not paid'],
    VOIDED: ['Order voided', 'Not paid']
  };
  for (const [status, [statusLabel, amountLabel]] of Object.entries(expectations)) {
    const result = paymentPresentation(payment(status));
    assert.equal(result.statusLabel, statusLabel);
    assert.equal(result.amountLabel, amountLabel);
    assert.notEqual(result.amountLabel, 'Paid amount');
    if (['CREATED', 'APPROVED', 'PENDING'].includes(status))
      assert.equal(result.amountValue, '$9.99');
  }
});

test('captured payment displays only the verified captured amount', () => {
  const captured = paymentPresentation(payment('CAPTURED', {
    capturedAmountMinor: 875, capturedAt: '2026-10-29T08:02:00Z' }));
  assert.equal(captured.statusLabel, 'Payment completed');
  assert.equal(captured.amountLabel, 'Paid amount');
  assert.equal(captured.amountValue, '$8.75');

  const unavailable = paymentPresentation(payment('CAPTURED'));
  assert.equal(unavailable.amountLabel, 'Paid amount');
  assert.equal(unavailable.amountValue, 'Not available');
  assert.notEqual(unavailable.amountValue, '$9.99');
});

test('refunded and reversed payments preserve original verified amount without calling it paid now', () => {
  for (const [status, statusLabel, amountLabel] of [
    ['REFUNDED', 'Payment refunded', 'Refunded'],
    ['REVERSED', 'Payment reversed', 'Reversed']
  ]) {
    const result = paymentPresentation(payment(status, { capturedAmountMinor: 999 }));
    assert.equal(result.statusLabel, statusLabel);
    assert.equal(result.amountLabel, amountLabel);
    assert.equal(result.amountNote, 'Original paid amount $9.99');
  }
});

test('unknown server payment status remains visibly unconfirmed', () => {
  const summary = normalizeReaderSummary({ status: 'OK', environment: 'production',
    profile: {}, library: [], payments: [payment('SETTLEMENT_REVIEW')],
    plan: { status: 'NOT_ENROLLED', billingStatus: 'NOT_ACTIVE' },
    availability: { profile: 'AVAILABLE', library: 'AVAILABLE', payments: 'AVAILABLE',
      plan: 'AVAILABLE', libraryPass: 'AVAILABLE', subscriptionCheckout: 'UNAVAILABLE' },
    summary: {} });
  assert.equal(summary.payments.length, 1);
  assert.equal(summary.payments[0].status, 'UNCONFIRMED');
  const result = paymentPresentation(summary.payments[0]);
  assert.equal(result.statusLabel, 'Status unconfirmed');
  assert.equal(result.amountLabel, 'Amount unconfirmed');
  assert.notEqual(result.amountLabel, 'Paid amount');
});

test('all recurring billing states remain independent from publication entitlement', () => {
  const labels = {
    ACTIVE: 'Active', APPROVAL_PENDING: 'Approval pending', SUSPENDED: 'Suspended',
    CANCELLED: 'Cancelled', EXPIRED: 'Expired', PAYMENT_FAILED: 'Payment failed',
    NOT_ACTIVE: 'Not active'
  };
  for (const [billingStatus, label] of Object.entries(labels)) {
    const result = recurringSubscriptionPresentation({ status: 'ACTIVE', accessClass: null,
      billingStatus });
    assert.equal(result.statusLabel, label);
    assert.match(result.accessDetail, /not authorized/i);
  }
  const entitled = recurringSubscriptionPresentation({ status: 'ACTIVE',
    accessClass: 'ENTITLED', billingStatus: 'NOT_ACTIVE' });
  assert.match(entitled.accessDetail, /authorized by the current server response/i);
  assert.equal(entitled.statusLabel, 'Not active');
});

test('one-time pass states render independently and only server dates are displayed', () => {
  const activePass = { status: 'ACTIVE', effectiveFrom: '2026-10-29T00:00:00Z',
    effectiveUntil: '2026-11-28T00:00:00Z', sourceOrderId: orderId };
  const subscription = recurringSubscriptionPresentation({ status: 'ACTIVE',
    accessClass: 'ENTITLED', billingStatus: 'ACTIVE' });
  const active = libraryPassPresentation(activePass);
  assert.equal(subscription.statusLabel, 'Active');
  assert.equal(active.statusLabel, 'Active');
  assert.match(active.detail, /Nov 28, 2026/);
  assert.doesNotMatch(active.detail, /recurring|subscription/i);

  const pending = libraryPassPresentation({ ...activePass, status: 'PENDING' });
  assert.equal(pending.statusLabel, 'Pending');
  assert.match(pending.detail, /not active yet/i);
  assert.equal(libraryPassPresentation({ ...activePass, status: 'EXPIRED' }).statusLabel,
    'Expired');
  assert.equal(libraryPassPresentation({ ...activePass, status: 'REVOKED' }).statusLabel,
    'Revoked');
  assert.equal(libraryPassPresentation(null).statusLabel, 'No active pass');
});

test('partial availability never fabricates subscription, pass or publication access', () => {
  const subscription = recurringSubscriptionPresentation({}, { available: false });
  const pass = libraryPassPresentation(null, { available: false });
  const restricted = recurringSubscriptionPresentation({ status: 'ACTIVE',
    accessClass: 'ENTITLED', billingStatus: 'ACTIVE' }, { libraryAvailable: false });
  assert.equal(subscription.statusLabel, 'Status unavailable');
  assert.match(subscription.accessDetail, /No publication access has been inferred/);
  assert.equal(pass.statusLabel, 'Status unavailable');
  assert.match(restricted.accessDetail, /temporarily unavailable/);
});

test('responsive payment layout uses bounded mobile cards and preserves focus styles', async () => {
  const css = await readFile(new URL('../../assets/css/my-gpir.css', import.meta.url), 'utf8');
  const dashboard = await readFile(new URL(
    '../../assets/js/gpir-reader-dashboard.mjs', import.meta.url), 'utf8');
  const html = await readFile(new URL('../../reader/my-gpir/index.html', import.meta.url), 'utf8');
  assert.match(css, /\.my-gpir-main,\.my-gpir-grid,\.my-gpir-card,\[data-reader-payments\]\{min-width:0;max-width:100%\}/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.my-gpir-table\{display:block;min-width:0\}/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*\.my-gpir-table tr\{grid-template-columns:1fr\}/);
  assert.match(css, /\.my-gpir-products\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.my-gpir-nav a:focus-visible[\s\S]*outline:3px solid var\(--gpir-gold\)/);
  assert.match(dashboard, /date\.dataset\.label = 'Transaction date'/);
  assert.match(dashboard, /statusBadge\(document, presentation\.statusLabel, presentation\.tone\)/);
  assert.match(html, /my-gpir\.css\?v=20261029b/);
  assert.match(html, /gpir-reader-dashboard\.mjs\?v=20261029b/);
});
