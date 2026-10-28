import { initializePayPalSubscription } from './gpir-paypal-subscription.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_STATES = new Set(['CREATED', 'APPROVED', 'PENDING', 'CAPTURED', 'DENIED',
  'REFUNDED', 'REVERSED', 'VOIDED', 'FAILED']);
const ONETIME_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD']);
const BILLING_STATES = new Set(['NOT_ACTIVE', 'APPROVAL_PENDING', 'ACTIVE', 'SUSPENDED',
  'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED']);

function sectionAvailability(value, name) {
  return value?.availability?.[name] === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function normalizeReaderSummary(value) {
  if (!value || value.status !== 'OK' || !value.profile || !Array.isArray(value.library) ||
      !Array.isArray(value.payments) || !value.plan) return null;
  const availability = Object.freeze({ profile: sectionAvailability(value, 'profile'),
    library: sectionAvailability(value, 'library'),
    payments: sectionAvailability(value, 'payments'),
    plan: sectionAvailability(value, 'plan'),
    libraryPass: sectionAvailability(value, 'libraryPass'),
    subscriptionCheckout: sectionAvailability(value, 'subscriptionCheckout') });
  const library = availability.library === 'AVAILABLE'
    ? value.library.flatMap(item => UUID.test(item?.supabaseRecordId || '') &&
    typeof item?.publicationId === 'string' && item.publicationId ? [{
      publicationId: item.publicationId, supabaseRecordId: item.supabaseRecordId,
      accessClass: String(item.accessClass || ''), accessSource: String(item.accessSource || '')
    }] : []) : [];
  const payments = availability.payments === 'AVAILABLE'
    ? value.payments.flatMap(item => UUID.test(item?.id || '') &&
    ((UUID.test(item?.supabaseRecordId || '') && typeof item?.publicationId === 'string') ||
      (item?.paymentKind === 'PREMIUM_LIBRARY_PASS' &&
        item?.publicationId === 'PREMIUM_LIBRARY' && item?.supabaseRecordId == null)) &&
    ONETIME_CURRENCIES.has(item.currency) && PAYMENT_STATES.has(item.status) &&
    Number.isSafeInteger(item.expectedAmountMinor) ? [{ ...item,
      capturedAmountMinor: Number.isSafeInteger(item.capturedAmountMinor) ? item.capturedAmountMinor : null,
      createdAt: isoOrNull(item.createdAt), capturedAt: isoOrNull(item.capturedAt)
    }] : []) : [];
  const planStatus = ['ACTIVE', 'INACTIVE', 'NOT_ENROLLED'].includes(value.plan.status)
    ? value.plan.status : 'NOT_ENROLLED';
  const environment = ['sandbox', 'production'].includes(value.environment)
    ? value.environment : null;
  if (!environment) return null;
  const billingStatus = BILLING_STATES.has(value.plan.billingStatus)
    ? value.plan.billingStatus : 'NOT_ACTIVE';
  const passStatus = ['ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED'].includes(
    value.libraryPass?.status) ? value.libraryPass.status : null;
  const passFrom = isoOrNull(value.libraryPass?.effectiveFrom);
  const passUntil = isoOrNull(value.libraryPass?.effectiveUntil);
  const libraryPass = passStatus && value.libraryPass?.scope === 'PREMIUM_LIBRARY' &&
    UUID.test(value.libraryPass?.sourceOrderId || '') && passFrom && passUntil
    ? Object.freeze({ status: passStatus, scope: 'PREMIUM_LIBRARY',
      sourceOrderId: value.libraryPass.sourceOrderId,
      effectiveFrom: passFrom, effectiveUntil: passUntil }) : null;
  const offer = availability.subscriptionCheckout === 'AVAILABLE' &&
    UUID.test(value.subscriptionOffer?.id || '') && value.subscriptionOffer?.currency === 'USD' &&
    Number.isSafeInteger(value.subscriptionOffer?.unitAmountMinor) &&
    value.subscriptionOffer.unitAmountMinor > 0 &&
    ['MONTH', 'YEAR'].includes(value.subscriptionOffer?.billingInterval)
    ? Object.freeze({ id: value.subscriptionOffer.id,
      displayName: typeof value.subscriptionOffer.displayName === 'string'
        ? value.subscriptionOffer.displayName : 'GPIR reader plan',
      currency: value.subscriptionOffer.currency,
      unitAmountMinor: value.subscriptionOffer.unitAmountMinor,
      billingInterval: value.subscriptionOffer.billingInterval }) : null;
  return Object.freeze({ environment, availability, subscriptionOffer: offer, libraryPass,
    profile: Object.freeze({
    email: typeof value.profile.email === 'string' ? value.profile.email : null,
    displayName: typeof value.profile.displayName === 'string' ? value.profile.displayName : null,
    memberSince: isoOrNull(value.profile.memberSince),
    emailVerified: value.profile.emailVerified === true
  }), library: Object.freeze(library), payments: Object.freeze(payments),
  plan: Object.freeze({ status: planStatus,
    accessClass: value.plan.accessClass === 'ENTITLED' ? 'ENTITLED' : null,
    effectiveFrom: isoOrNull(value.plan.effectiveFrom),
    effectiveUntil: isoOrNull(value.plan.effectiveUntil), billingStatus,
    paymentConfirmed: value.plan.paymentConfirmed === true }),
  summary: Object.freeze({
    libraryCount: availability.library === 'AVAILABLE' ? library.length : null,
    paymentCount: availability.payments === 'AVAILABLE' ? payments.length : null,
    activePurchaseCount: Number.isInteger(value.summary?.activePurchaseCount)
      ? Math.max(0, value.summary.activePurchaseCount) : null }) });
}

export function formatMoney(minor, currency = 'USD', locale = 'en-US') {
  if (!Number.isSafeInteger(minor) || minor < 0 || !ONETIME_CURRENCIES.has(currency)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

export function formatDate(value, locale = 'en-US') {
  const iso = isoOrNull(value); if (!iso) return 'Not available';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    .format(new Date(iso));
}

export async function requestReaderSummary({ endpoint, token, fetchImpl = fetch }) {
  let url;
  try { url = new URL(endpoint); } catch { return { status: 'ERROR', code: 'INVALID_ENDPOINT' }; }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname))) return { status: 'ERROR', code: 'INVALID_ENDPOINT' };
  if (typeof token !== 'string' || !token) return { status: 'ERROR', code: 'SESSION_REQUIRED' };
  let result;
  try {
    result = await fetchImpl(url, { method: 'GET', cache: 'no-store', credentials: 'omit',
      redirect: 'error', headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  } catch { return { status: 'ERROR', code: 'READER_SUMMARY_UNAVAILABLE' }; }
  let body = null; try { body = await result.json(); } catch {}
  if (result.status === 401) return { status: 'ERROR', code: 'SESSION_REQUIRED' };
  if (!result.ok) return { status: 'ERROR', code: body?.code || 'READER_SUMMARY_UNAVAILABLE' };
  const summary = normalizeReaderSummary(body);
  return summary ? { status: 'OK', summary } : { status: 'ERROR', code: 'MALFORMED_SUMMARY' };
}

function textElement(document, tag, text, className) {
  const element = document.createElement(tag); element.textContent = text;
  if (className) element.className = className; return element;
}

function emptyState(document, title, detail) {
  const box = textElement(document, 'div', '', 'my-gpir-empty');
  box.append(textElement(document, 'strong', title), textElement(document, 'p', detail)); return box;
}

function renderProfile(document, target, profile) {
  if (!target) return;
  const values = [
    ['Reader name', profile.displayName || 'Not provided'], ['Email address', profile.email || 'Not available'],
    ['Email status', profile.emailVerified ? 'Verified' : 'Verification pending'],
    ['Member since', formatDate(profile.memberSince)]
  ];
  const list = textElement(document, 'dl', '', 'my-gpir-profile');
  for (const [label, value] of values) {
    const group = document.createElement('div');
    group.append(textElement(document, 'dt', label), textElement(document, 'dd', value)); list.append(group);
  }
  target.replaceChildren(list);
}

function renderLibrary(document, target, library, available = true) {
  if (!target) return;
  if (!available) {
    target.replaceChildren(emptyState(document, 'Your library is temporarily unavailable.',
      'Protected publications remain locked until entitlement verification is available.'));
    return;
  }
  if (!library.length) {
    target.replaceChildren(emptyState(document, 'Your library is ready for its first publication.',
      'No paid publication or plan access has been activated for this account. Public GPIR research remains available from the main repository.'));
    return;
  }
  const list = textElement(document, 'ul', '', 'my-gpir-list');
  for (const item of library) {
    const row = textElement(document, 'li', '', 'my-gpir-library-item');
    const identity = document.createElement('div');
    identity.append(textElement(document, 'strong', item.publicationId),
      textElement(document, 'code', item.supabaseRecordId));
    const label = item.accessSource === 'ONE_TIME_PURCHASE' ? 'Purchased' :
      item.accessSource === 'PREMIUM_LIBRARY_PASS' ? 'Premium Library pass' :
      item.accessSource === 'PLAN' ? 'Plan access' : 'Reader access';
    row.append(identity, textElement(document, 'span', label, 'my-gpir-badge')); list.append(row);
  }
  target.replaceChildren(list);
}

function renderPayments(document, target, payments, available = true) {
  if (!target) return;
  if (!available) {
    target.replaceChildren(emptyState(document, 'Payment history is temporarily unavailable.',
      'No payment or subscription state has been inferred. Please try again later.'));
    return;
  }
  if (!payments.length) {
    target.replaceChildren(emptyState(document, 'No payment history yet.',
      'No one-time purchase is recorded for this account. No charge or payment method is on file.'));
    return;
  }
  const wrap = textElement(document, 'div', '', 'my-gpir-table-wrap');
  const table = textElement(document, 'table', '', 'my-gpir-table');
  const head = document.createElement('thead'); const headRow = document.createElement('tr');
  for (const label of ['Date', 'Publication', 'Amount', 'Status']) headRow.append(textElement(document, 'th', label));
  head.append(headRow); const body = document.createElement('tbody');
  for (const payment of payments) {
    const row = document.createElement('tr');
    row.append(textElement(document, 'td', formatDate(payment.createdAt)),
      textElement(document, 'td', payment.publicationId),
      textElement(document, 'td', formatMoney(payment.capturedAmountMinor ?? payment.expectedAmountMinor,
        payment.currency)), textElement(document, 'td', payment.status)); body.append(row);
  }
  table.append(head, body); wrap.append(table); target.replaceChildren(wrap);
}

function renderPlan(document, target, plan, libraryPass, available = true, libraryAvailable = true) {
  if (!target) return;
  if (!available) {
    target.replaceChildren(emptyState(document, 'Plan status is temporarily unavailable.',
      'No subscription state or publication access has been inferred.'));
    return;
  }
  const box = textElement(document, 'div', '', 'my-gpir-plan'); const copy = document.createElement('div');
  const title = libraryPass?.status === 'ACTIVE' ? 'Premium Library pass active' :
    libraryPass?.status === 'PENDING' ? 'Premium Library pass pending' :
    libraryPass?.status === 'EXPIRED' ? 'Premium Library pass expired' :
    libraryPass?.status === 'REVOKED' ? 'Premium Library pass revoked' :
    plan.status === 'ACTIVE' && plan.accessClass === 'ENTITLED'
    ? 'GPIR entitled reader plan' : plan.status === 'ACTIVE' ? 'Reader billing plan active' :
    plan.status === 'INACTIVE' ? 'Reader plan inactive' : 'Free registered reader';
  const detail = libraryPass?.status === 'ACTIVE'
    ? `One-time Premium Library access is active through ${formatDate(libraryPass.effectiveUntil)}.` +
      (plan.billingStatus === 'ACTIVE' ? ' Subscription billing is also active.' :
        ' No recurring subscription is attached to this pass.')
    : libraryPass?.status === 'PENDING'
      ? `One-time Premium Library access begins ${formatDate(libraryPass.effectiveFrom)}.`
    : libraryPass?.status === 'EXPIRED'
      ? `One-time Premium Library access expired ${formatDate(libraryPass.effectiveUntil)}.`
    : libraryPass?.status === 'REVOKED'
      ? 'The one-time Premium Library entitlement was revoked and does not grant access.'
    : plan.status === 'ACTIVE' && !libraryAvailable
    ? 'Subscription billing is active. Publication access remains locked until entitlement verification is available.'
    : plan.status === 'ACTIVE'
    ? `Access is active${plan.effectiveUntil ? ` through ${formatDate(plan.effectiveUntil)}` : ''}.` +
      (plan.billingStatus === 'ACTIVE' ? ' Subscription billing is active.' :
        ' Subscription billing is not active.')
    : plan.billingStatus === 'APPROVAL_PENDING'
      ? 'Subscription approval is pending. Access will remain unchanged until the server verifies activation.'
      : 'Subscription billing is not active. No recurring plan or payment method is attached to this account.';
  copy.append(textElement(document, 'h3', title), textElement(document, 'p', detail));
  box.append(copy, textElement(document, 'span', libraryPass
    ? `PASS ${libraryPass.status}` : plan.status.replace('_', ' '), 'my-gpir-badge'));
  target.replaceChildren(box);
}

function renderMetrics(document, summary) {
  const values = { library: summary.libraryCount, payments: summary.paymentCount,
    purchases: summary.activePurchaseCount };
  for (const [name, value] of Object.entries(values)) {
    const target = document.querySelector(`[data-reader-metric="${name}"]`);
    if (target) target.textContent = Number.isInteger(value) ? String(value) : '—';
  }
}

export function renderReaderDashboard(document, summary) {
  renderMetrics(document, summary.summary); renderProfile(document,
    document.querySelector('[data-reader-profile]'), summary.profile);
  renderLibrary(document, document.querySelector('[data-reader-library]'), summary.library,
    summary.availability.library === 'AVAILABLE');
  renderPayments(document, document.querySelector('[data-reader-payments]'), summary.payments,
    summary.availability.payments === 'AVAILABLE');
  renderPlan(document, document.querySelector('[data-reader-plan]'), summary.plan,
    summary.libraryPass,
    summary.availability.plan === 'AVAILABLE', summary.availability.library === 'AVAILABLE');
  const root = document.querySelector('[data-reader-dashboard]');
  if (root) root.dataset.state = Object.values(summary.availability).includes('UNAVAILABLE')
    ? 'partial' : 'ready';
}

export function clearReaderDashboard(document) {
  for (const selector of ['[data-reader-profile]', '[data-reader-library]',
    '[data-reader-payments]', '[data-reader-plan]']) {
    document.querySelector(selector)?.replaceChildren();
  }
  for (const name of ['library', 'payments', 'purchases']) {
    const target = document.querySelector(`[data-reader-metric="${name}"]`);
    if (target) target.textContent = '—';
  }
  const subscription = document.querySelector('[data-gpir-paypal-subscription]');
  if (subscription) subscription.hidden = true;
}

function dashboardEndpoint(global) {
  if (global.GPIR_READER_DASHBOARD_CONFIG?.endpoint)
    return global.GPIR_READER_DASHBOARD_CONFIG.endpoint;
  const url = global.GPIR_SUPABASE_PUBLIC_CONFIG?.url;
  return url ? `${String(url).replace(/\/$/, '')}/functions/v1/gpir-reader-summary` : null;
}

export async function initializeReaderDashboard({ global = window, document = global.document,
  fetchImpl = global.fetch?.bind(global) } = {}) {
  const root = document?.querySelector?.('[data-reader-dashboard]');
  if (!root) return false;
  const client = global.GPIR_SUPABASE_CLIENT;
  const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
  let sessionResult;
  try { sessionResult = await client?.auth?.getSession(); } catch {}
  const session = sessionResult?.data?.session;
  if (!session?.user || !session.access_token) {
    global.GPIRReaderAuth?.rememberReturnTo?.(returnTo);
    global.location.assign(`/reader/sign-in/?returnTo=${encodeURIComponent(returnTo)}`); return false;
  }
  const endpoint = dashboardEndpoint(global);
  const status = document.querySelector('[data-reader-dashboard-status]');
  const refreshButton = document.querySelector('[data-reader-refresh]');
  const refresh = async () => {
    if (refreshButton) refreshButton.disabled = true;
    if (status) status.textContent = 'Refreshing your GPIR account…';
    const result = await requestReaderSummary({ endpoint, token: session.access_token, fetchImpl });
    if (refreshButton) refreshButton.disabled = false;
    if (result.status !== 'OK') {
      clearReaderDashboard(document);
      if (result.code === 'SESSION_REQUIRED') {
        global.GPIRReaderAuth?.rememberReturnTo?.(returnTo);
        global.location.assign(`/reader/sign-in/?returnTo=${encodeURIComponent(returnTo)}`); return false;
      }
      root.dataset.state = 'error';
      if (status) { status.textContent = 'Your account summary is temporarily unavailable. Please try again.';
        status.className = 'my-gpir-status my-gpir-error'; }
      return false;
    }
    renderReaderDashboard(document, result.summary);
    await initializePayPalSubscription({ global, document, summary: result.summary, fetchImpl });
    if (status) {
      status.textContent = root.dataset.state === 'partial'
        ? 'Your profile is available. Some protected account sections are temporarily unavailable.'
        : 'Your account is up to date.';
      status.className = root.dataset.state === 'partial'
        ? 'my-gpir-status my-gpir-warning' : 'my-gpir-status';
    }
    return true;
  };
  refreshButton?.addEventListener('click', () => { void refresh(); });
  global.addEventListener('gpir:paypal-payment-verified', () => { void refresh(); });
  global.addEventListener('gpir:paypal-sandbox-captured', () => { void refresh(); });
  global.addEventListener('gpir:reader-signed-out', () => {
    clearReaderDashboard(document); root.dataset.state = 'signed-out';
    if (status) { status.textContent = 'Signed out. Protected account information was cleared.';
      status.className = 'my-gpir-status'; }
  });
  return refresh();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
    void initializeReaderDashboard();
  }); else void initializeReaderDashboard();
}
