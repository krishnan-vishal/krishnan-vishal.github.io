import { initializePayPalSubscription } from './gpir-paypal-subscription.mjs';
import { initializePayPalOnetimeCheckout } from './gpir-paypal-onetime.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_STATES = new Set(['CREATED', 'APPROVED', 'PENDING', 'CAPTURED', 'DENIED',
  'REFUNDED', 'REVERSED', 'VOIDED', 'FAILED']);
const PAYMENT_STATUS_PATTERN = /^[A-Z][A-Z0-9_]{0,31}$/;
const ONETIME_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD']);
const BILLING_STATES = new Set(['NOT_ACTIVE', 'APPROVAL_PENDING', 'ACTIVE', 'SUSPENDED',
  'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED']);
const PROTECTED_SECTIONS = Object.freeze(['profile', 'library', 'payments', 'plan',
  'libraryPass']);
const dashboardInitializations = new WeakMap();

function sectionAvailability(value, name) {
  return value?.availability?.[name] === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeText(value, max = 160) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function safePublicationDestination(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  try {
    const url = new URL(value, 'https://fintechoisis.com');
    return url.origin === 'https://fintechoisis.com'
      ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}

function normalizedPaymentStatus(value) {
  return PAYMENT_STATES.has(value) ? value :
    typeof value === 'string' && PAYMENT_STATUS_PATTERN.test(value) ? 'UNCONFIRMED' : null;
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
    typeof item?.publicationId === 'string' && item.publicationId &&
    item.accessClass === 'ENTITLED' ? [{
      publicationId: item.publicationId, supabaseRecordId: item.supabaseRecordId,
      accessClass: String(item.accessClass || ''), accessSource: String(item.accessSource || ''),
      title: safeText(item.title || item.publicationTitle, 180),
      summary: safeText(item.summary || item.description, 280),
      publishedAt: isoOrNull(item.publishedAt),
      destination: safePublicationDestination(item.destination)
    }] : []) : [];
  const payments = availability.payments === 'AVAILABLE'
    ? value.payments.flatMap(item => {
      const status = normalizedPaymentStatus(item?.status);
      if (!UUID.test(item?.id || '') ||
          !((UUID.test(item?.supabaseRecordId || '') && typeof item?.publicationId === 'string') ||
            (item?.paymentKind === 'PREMIUM_LIBRARY_PASS' &&
              item?.publicationId === 'PREMIUM_LIBRARY' && item?.supabaseRecordId == null)) ||
          !ONETIME_CURRENCIES.has(item.currency) || !status ||
          !Number.isSafeInteger(item.expectedAmountMinor) || item.expectedAmountMinor < 0) return [];
      return [{ ...item, status,
        capturedAmountMinor: Number.isSafeInteger(item.capturedAmountMinor) &&
          item.capturedAmountMinor >= 0 ? item.capturedAmountMinor : null,
        createdAt: isoOrNull(item.createdAt), capturedAt: isoOrNull(item.capturedAt)
      }];
    }) : [];
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
    email: safeText(value.profile.email, 254),
    displayName: safeText(value.profile.displayName, 120),
    country: safeText(value.profile.country, 80),
    organization: safeText(value.profile.organization, 140),
    accountStatus: safeText(value.profile.accountStatus, 60),
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

export function paymentPresentation(payment, locale = 'en-US') {
  const status = normalizedPaymentStatus(payment?.status) || 'UNCONFIRMED';
  const expected = formatMoney(payment?.expectedAmountMinor, payment?.currency, locale);
  const captured = formatMoney(payment?.capturedAmountMinor, payment?.currency, locale);
  const statusValues = {
    CREATED: ['Order created — not paid', 'neutral'],
    APPROVED: ['Approved — capture pending', 'pending'],
    PENDING: ['Payment processing', 'pending'],
    CAPTURED: ['Payment completed', 'success'],
    FAILED: ['Payment failed', 'error'],
    DENIED: ['Payment denied', 'error'],
    VOIDED: ['Order voided', 'neutral'],
    REFUNDED: ['Payment refunded', 'warning'],
    REVERSED: ['Payment reversed', 'warning'],
    UNCONFIRMED: ['Status unconfirmed', 'neutral']
  };
  const [statusLabel, tone] = statusValues[status];
  if (['CREATED', 'APPROVED', 'PENDING'].includes(status)) {
    return Object.freeze({ status, statusLabel, tone, amountLabel: 'Expected amount',
      amountValue: expected, amountNote: null });
  }
  if (status === 'CAPTURED') {
    return Object.freeze({ status, statusLabel, tone, amountLabel: 'Paid amount',
      amountValue: captured === '—' ? 'Not available' : captured, amountNote: null });
  }
  if (['FAILED', 'DENIED', 'VOIDED'].includes(status)) {
    return Object.freeze({ status, statusLabel, tone, amountLabel: 'Not paid',
      amountValue: null, amountNote: expected === '—' ? null : `Expected amount ${expected}` });
  }
  if (status === 'REFUNDED' || status === 'REVERSED') {
    return Object.freeze({ status, statusLabel, tone,
      amountLabel: status === 'REFUNDED' ? 'Refunded' : 'Reversed', amountValue: null,
      amountNote: captured === '—' ? null : `Original paid amount ${captured}` });
  }
  return Object.freeze({ status, statusLabel, tone, amountLabel: 'Amount unconfirmed',
    amountValue: null, amountNote: expected === '—' ? null : `Reported expected amount ${expected}` });
}

export function recurringSubscriptionPresentation(plan, { available = true,
  libraryAvailable = true } = {}) {
  if (!available) return Object.freeze({ title: 'Recurring subscription',
    statusLabel: 'Status unavailable', tone: 'neutral',
    detail: 'Subscription billing status is temporarily unavailable.',
    accessDetail: 'No publication access has been inferred.' });
  const states = {
    ACTIVE: ['Active', 'success', 'Recurring subscription billing is active.'],
    APPROVAL_PENDING: ['Approval pending', 'pending',
      'Subscription approval is pending; billing activation is not yet confirmed.'],
    SUSPENDED: ['Suspended', 'warning', 'Recurring subscription billing is suspended.'],
    CANCELLED: ['Cancelled', 'neutral', 'The recurring subscription is cancelled.'],
    EXPIRED: ['Expired', 'neutral', 'The recurring subscription has expired.'],
    PAYMENT_FAILED: ['Payment failed', 'error',
      'The recurring subscription reports a payment failure.'],
    NOT_ACTIVE: ['Not active', 'neutral', 'No active recurring subscription is reported.']
  };
  const [statusLabel, tone, detail] = states[plan?.billingStatus] || states.NOT_ACTIVE;
  const accessDetail = !libraryAvailable
    ? 'Publication access verification is temporarily unavailable.'
    : plan?.status === 'ACTIVE' && plan?.accessClass === 'ENTITLED'
      ? 'Publication access is authorized by the current server response.'
      : 'Publication access is not authorized by the current server response.';
  return Object.freeze({ title: 'Recurring subscription', statusLabel, tone, detail,
    accessDetail });
}

export function libraryPassPresentation(libraryPass, { available = true,
  libraryAvailable = true } = {}) {
  if (!available) return Object.freeze({ title: 'One-time Premium Library pass',
    statusLabel: 'Status unavailable', tone: 'neutral',
    detail: 'One-time pass status is temporarily unavailable.' });
  if (!libraryPass) return Object.freeze({ title: 'One-time Premium Library pass',
    statusLabel: 'No active pass', tone: 'neutral',
    detail: 'No one-time Premium Library pass is reported for this account.' });
  if (libraryPass.status === 'ACTIVE') {
    const expiry = isoOrNull(libraryPass.effectiveUntil)
      ? ` through ${formatDate(libraryPass.effectiveUntil)}` : '';
    const restriction = libraryAvailable ? '' :
      ' Protected publications remain locked until entitlement verification is available.';
    return Object.freeze({ title: 'One-time Premium Library pass', statusLabel: 'Active',
      tone: 'success', detail: `One-time Premium Library access is active${expiry}.${restriction}` });
  }
  if (libraryPass.status === 'PENDING') {
    const begins = isoOrNull(libraryPass.effectiveFrom)
      ? ` ${formatDate(libraryPass.effectiveFrom)}` : '';
    return Object.freeze({ title: 'One-time Premium Library pass', statusLabel: 'Pending',
      tone: 'pending', detail: `One-time Premium Library access begins${begins}; it is not active yet.` });
  }
  if (libraryPass.status === 'EXPIRED') {
    const expiry = isoOrNull(libraryPass.effectiveUntil)
      ? ` ${formatDate(libraryPass.effectiveUntil)}` : '';
    return Object.freeze({ title: 'One-time Premium Library pass', statusLabel: 'Expired',
      tone: 'neutral', detail: `The one-time Premium Library pass expired${expiry}.` });
  }
  return Object.freeze({ title: 'One-time Premium Library pass', statusLabel: 'Revoked',
    tone: 'error', detail: 'The one-time Premium Library pass was revoked and grants no access.' });
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

export function readerProfileEntries(profile) {
  const values = [];
  if (profile?.displayName) values.push(['Reader name', profile.displayName]);
  if (profile?.email) {
    values.push([profile.emailVerified ? 'Verified email' : 'Email address', profile.email]);
    values.push(['Email status', profile.emailVerified ? 'Verified' : 'Not verified']);
  }
  if (profile?.country) values.push(['Country', profile.country]);
  if (profile?.organization) values.push(['Organization', profile.organization]);
  if (profile?.accountStatus) values.push(['Account status', profile.accountStatus]);
  if (profile?.memberSince) values.push(['Member since', formatDate(profile.memberSince)]);
  return Object.freeze(values.map(entry => Object.freeze(entry)));
}

export function publicationPresentation(item) {
  const accessLabel = item?.accessSource === 'ONE_TIME_PURCHASE' ? 'One-time purchase' :
    item?.accessSource === 'PREMIUM_LIBRARY_PASS' ? 'Premium Library pass' :
    item?.accessSource === 'PLAN' ? 'Reader plan' : 'Authorized access';
  const metadata = [
    ['Publication ID', item?.publicationId],
    ['Record ID', item?.supabaseRecordId],
    ['Access source', accessLabel]
  ];
  if (item?.publishedAt) metadata.push(['Published', formatDate(item.publishedAt)]);
  return Object.freeze({ title: item?.title || 'Authorized publication',
    summary: item?.summary || null,
    metadata: Object.freeze(metadata.filter(([, value]) => Boolean(value))
      .map(entry => Object.freeze(entry))),
    destination: safePublicationDestination(item?.destination) });
}

function renderProfile(document, target, profile) {
  if (!target) return;
  const values = readerProfileEntries(profile);
  if (!values.length) {
    target.replaceChildren(emptyState(document, 'Profile details are not available.',
      'No optional reader profile fields were supplied by the authorized account response.'));
    return;
  }
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
    const presentation = publicationPresentation(item);
    const row = textElement(document, 'li', '', 'my-gpir-publication');
    const header = textElement(document, 'div', '', 'my-gpir-publication__header');
    header.append(textElement(document, 'h3', presentation.title),
      textElement(document, 'span', 'Authorized', 'my-gpir-badge'));
    row.append(header);
    if (presentation.summary) row.append(textElement(document, 'p', presentation.summary,
      'my-gpir-publication__summary'));
    const metadata = textElement(document, 'dl', '', 'my-gpir-publication__metadata');
    for (const [label, value] of presentation.metadata) {
      const group = document.createElement('div');
      group.append(textElement(document, 'dt', label), textElement(document, 'dd', value));
      metadata.append(group);
    }
    row.append(metadata);
    if (presentation.destination) {
      const action = textElement(document, 'a', 'Open publication', 'my-gpir-publication__action');
      action.href = presentation.destination;
      action.setAttribute('aria-label', `Open ${presentation.title}`);
      row.append(action);
    }
    list.append(row);
  }
  target.replaceChildren(list);
}

function statusBadge(document, label, tone) {
  const badge = textElement(document, 'span', label,
    `my-gpir-status-badge my-gpir-status-badge--${tone}`);
  badge.setAttribute('aria-label', `Status: ${label}`);
  return badge;
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
  for (const label of ['Transaction date', 'Publication', 'Amount', 'Status'])
    headRow.append(textElement(document, 'th', label));
  head.append(headRow); const body = document.createElement('tbody');
  for (const payment of payments) {
    const row = document.createElement('tr');
    const presentation = paymentPresentation(payment);
    const date = document.createElement('td'); date.dataset.label = 'Transaction date';
    date.append(textElement(document, 'span', `Created ${formatDate(payment.createdAt)}`,
      'my-gpir-payment-primary'));
    if (payment.capturedAt) date.append(textElement(document, 'small',
      `Completed ${formatDate(payment.capturedAt)}`, 'my-gpir-payment-note'));
    const publication = document.createElement('td'); publication.dataset.label = 'Publication';
    publication.className = 'my-gpir-payment-publication';
    publication.append(textElement(document, 'strong', payment.publicationId));
    if (payment.supabaseRecordId) publication.append(textElement(document, 'code',
      payment.supabaseRecordId));
    const amount = document.createElement('td'); amount.dataset.label = 'Amount';
    amount.append(textElement(document, 'strong', presentation.amountLabel,
      'my-gpir-payment-primary'));
    if (presentation.amountValue) amount.append(textElement(document, 'span',
      presentation.amountValue));
    if (presentation.amountNote) amount.append(textElement(document, 'small',
      presentation.amountNote, 'my-gpir-payment-note'));
    const status = document.createElement('td'); status.dataset.label = 'Status';
    status.append(statusBadge(document, presentation.statusLabel, presentation.tone));
    row.append(date, publication, amount, status); body.append(row);
  }
  table.append(head, body); wrap.append(table); target.replaceChildren(wrap);
}

function productPanel(document, product, presentation, accessDetail = null) {
  const panel = textElement(document, 'article', '', 'my-gpir-product');
  panel.dataset.product = product;
  const header = textElement(document, 'div', '', 'my-gpir-product__header');
  header.append(textElement(document, 'h3', presentation.title),
    statusBadge(document, presentation.statusLabel, presentation.tone));
  panel.append(header, textElement(document, 'p', presentation.detail,
    'my-gpir-product__detail'));
  if (accessDetail) panel.append(textElement(document, 'p', accessDetail,
    'my-gpir-product__access'));
  return panel;
}

function renderPlan(document, target, plan, libraryPass, available = true,
  libraryAvailable = true, libraryPassAvailable = true) {
  if (!target) return;
  const subscription = recurringSubscriptionPresentation(plan, { available, libraryAvailable });
  const pass = libraryPassPresentation(libraryPass,
    { available: libraryPassAvailable, libraryAvailable });
  const products = textElement(document, 'div', '', 'my-gpir-products');
  products.append(productPanel(document, 'subscription', subscription,
    subscription.accessDetail), productPanel(document, 'pass', pass));
  target.replaceChildren(products);
}

export function overviewValues(summary) {
  const account = summary?.availability?.profile === 'AVAILABLE'
    ? summary.profile?.accountStatus || (summary.profile?.emailVerified ? 'Verified' : 'Available')
    : null;
  return Object.freeze({ library: summary?.summary?.libraryCount,
    payments: summary?.summary?.paymentCount,
    purchases: summary?.summary?.activePurchaseCount, account });
}

function renderMetrics(document, summary) {
  const values = overviewValues(summary);
  for (const [name, value] of Object.entries(values)) {
    const target = document.querySelector(`[data-reader-metric="${name}"]`);
    if (target) target.textContent = Number.isInteger(value) || typeof value === 'string'
      ? String(value) : '—';
  }
}

export function renderReaderDashboard(document, summary) {
  renderMetrics(document, summary); renderProfile(document,
    document.querySelector('[data-reader-profile]'), summary.profile);
  renderLibrary(document, document.querySelector('[data-reader-library]'), summary.library,
    summary.availability.library === 'AVAILABLE');
  renderPayments(document, document.querySelector('[data-reader-payments]'), summary.payments,
    summary.availability.payments === 'AVAILABLE');
  renderPlan(document, document.querySelector('[data-reader-plan]'), summary.plan,
    summary.libraryPass,
    summary.availability.plan === 'AVAILABLE', summary.availability.library === 'AVAILABLE',
    summary.availability.libraryPass === 'AVAILABLE');
  const root = document.querySelector('[data-reader-dashboard]');
  if (root) root.dataset.state = readerDashboardState(summary);
}

export function readerDashboardState(summary) {
  return PROTECTED_SECTIONS.some(name => summary?.availability?.[name] === 'UNAVAILABLE')
    ? 'partial' : 'ready';
}

export function readerDashboardStatus(summary) {
  return readerDashboardState(summary) === 'partial'
    ? Object.freeze({ message: 'Some account sections are temporarily unavailable. Unverified information remains hidden.',
      className: 'my-gpir-status my-gpir-warning' })
    : Object.freeze({ message: 'Your account is up to date.', className: 'my-gpir-status' });
}

export function clearReaderDashboard(document) {
  for (const selector of ['[data-reader-profile]', '[data-reader-library]',
    '[data-reader-payments]', '[data-reader-plan]']) {
    document.querySelector(selector)?.replaceChildren();
  }
  for (const name of ['library', 'payments', 'purchases', 'account']) {
    const target = document.querySelector(`[data-reader-metric="${name}"]`);
    if (target) target.textContent = '—';
  }
  const subscription = document.querySelector('[data-gpir-paypal-subscription]');
  if (subscription) subscription.hidden = true;
  const onetime = document.querySelector('[data-gpir-paypal-onetime]');
  if (onetime) onetime.hidden = true;
}

function dashboardEndpoint(global) {
  if (global.GPIR_READER_DASHBOARD_CONFIG?.endpoint)
    return global.GPIR_READER_DASHBOARD_CONFIG.endpoint;
  const url = global.GPIR_SUPABASE_PUBLIC_CONFIG?.url;
  return url ? `${String(url).replace(/\/$/, '')}/functions/v1/gpir-reader-summary` : null;
}

async function setupReaderDashboard({ global, document, fetchImpl, root }) {
  const client = global.GPIR_SUPABASE_CLIENT;
  const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
  let session = null;
  try {
    session = global.GPIRReaderAuth?.sessionReady
      ? await global.GPIRReaderAuth.sessionReady
      : (await client?.auth?.getSession())?.data?.session;
  } catch {}
  if (!session?.user || !session.access_token) {
    global.GPIRReaderAuth?.rememberReturnTo?.(returnTo);
    global.location.assign(`/reader/sign-in/?returnTo=${encodeURIComponent(returnTo)}`);
    return false;
  }
  const endpoint = dashboardEndpoint(global);
  const status = document.querySelector('[data-reader-dashboard-status]');
  const refreshButton = document.querySelector('[data-reader-refresh]');
  let requestInFlight = null;
  let signedOut = false;
  const performRefresh = async () => {
    if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = 'Refresh account'; }
    if (status) { status.textContent = root.dataset.state === 'loading'
      ? 'Loading your GPIR account…' : 'Refreshing your GPIR account…';
      status.className = 'my-gpir-status'; }
    const result = await requestReaderSummary({ endpoint, token: session.access_token, fetchImpl });
    if (refreshButton) refreshButton.disabled = false;
    if (result.status !== 'OK') {
      clearReaderDashboard(document);
      if (result.code === 'SESSION_REQUIRED') {
        global.GPIRReaderAuth?.rememberReturnTo?.(returnTo);
        global.location.assign(`/reader/sign-in/?returnTo=${encodeURIComponent(returnTo)}`);
        return false;
      }
      root.dataset.state = 'unavailable';
      if (refreshButton) refreshButton.textContent = 'Retry account load';
      if (status) {
        status.textContent = 'Your account data could not be loaded. Protected information remains hidden.';
        status.className = 'my-gpir-status my-gpir-error';
      }
      return false;
    }
    renderReaderDashboard(document, result.summary);
    await Promise.allSettled([
      initializePayPalOnetimeCheckout({ global, document, fetchImpl }),
      initializePayPalSubscription({ global, document, summary: result.summary, fetchImpl })
    ]);
    if (status) {
      const presentation = readerDashboardStatus(result.summary);
      status.textContent = presentation.message; status.className = presentation.className;
    }
    return true;
  };
  const refresh = () => {
    if (signedOut) return Promise.resolve(false);
    if (requestInFlight) return requestInFlight;
    requestInFlight = performRefresh().finally(() => { requestInFlight = null; });
    return requestInFlight;
  };
  refreshButton?.addEventListener('click', () => { void refresh(); });
  global.addEventListener('gpir:paypal-payment-verified', () => { void refresh(); });
  global.addEventListener('gpir:onetime-payment-verified', () => { void refresh(); });
  global.addEventListener('gpir:paypal-sandbox-captured', () => { void refresh(); });
  global.addEventListener('gpir:reader-signed-out', () => {
    signedOut = true; clearReaderDashboard(document); root.dataset.state = 'signed-out';
    if (status) { status.textContent = 'Signed out. Protected account information was cleared.';
      status.className = 'my-gpir-status'; }
  });
  return refresh();
}

export async function initializeReaderDashboard({ global = window, document = global.document,
  fetchImpl = global.fetch?.bind(global) } = {}) {
  const root = document?.querySelector?.('[data-reader-dashboard]');
  if (!root) return false;
  const existing = dashboardInitializations.get(root);
  if (existing) return existing;
  const initialization = setupReaderDashboard({ global, document, fetchImpl, root });
  dashboardInitializations.set(root, initialization);
  return initialization;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
    void initializeReaderDashboard();
  }); else void initializeReaderDashboard();
}
