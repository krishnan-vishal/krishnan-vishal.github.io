import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeReaderSummary, overviewValues, publicationPresentation,
  readerProfileEntries } from '../../assets/js/gpir-reader-dashboard.mjs';
import { activeSection, navigationKeyIndex, syncMyGpirNavigation }
  from '../../assets/js/my-gpir-navigation.mjs';

const recordId = '22222222-2222-4222-8222-222222222222';

function response(overrides = {}) {
  return { status: 'OK', environment: 'production',
    profile: { email: 'reader@example.com', displayName: 'Reader One', emailVerified: true,
      memberSince: '2026-10-01T00:00:00Z' },
    library: [], payments: [],
    plan: { status: 'NOT_ENROLLED', billingStatus: 'NOT_ACTIVE' },
    availability: { profile: 'AVAILABLE', library: 'AVAILABLE', payments: 'AVAILABLE',
      plan: 'AVAILABLE', libraryPass: 'AVAILABLE', subscriptionCheckout: 'UNAVAILABLE' },
    summary: { activePurchaseCount: 0 }, ...overrides };
}

function navigationDocument() {
  const links = ['overview', 'profile', 'library', 'payments', 'plan'].map(section => ({
    dataset: { gpirSection: section },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; }
  }));
  const navigation = { querySelectorAll: () => links };
  const grid = { dataset: {} }; const main = { dataset: {} };
  const document = { querySelector(selector) {
    if (selector === '[data-my-gpir-navigation]') return navigation;
    if (selector === '[data-reader-view]') return grid;
    if (selector === '[data-reader-dashboard]') return main;
    return null;
  } };
  return { document, links, grid, main };
}

test('all five account sections resolve and active navigation state stays synchronized', () => {
  for (const section of ['overview', 'profile', 'library', 'payments', 'plan']) {
    const fixture = navigationDocument();
    assert.equal(activeSection(`#${section}`), section);
    assert.equal(syncMyGpirNavigation(fixture.document, `#${section}`), true);
    assert.equal(fixture.grid.dataset.readerView, section);
    assert.equal(fixture.main.dataset.activeView, section);
    assert.deepEqual(fixture.links.filter(link => link['aria-current'] === 'page')
      .map(link => link.dataset.gpirSection), [section]);
  }
  assert.equal(activeSection('#unknown'), 'overview');
});

test('arrow, Home and End keys provide bounded navigation without replacing native links', () => {
  assert.equal(navigationKeyIndex('ArrowRight', 4, 5), 0);
  assert.equal(navigationKeyIndex('ArrowLeft', 0, 5), 4);
  assert.equal(navigationKeyIndex('ArrowDown', 1, 5), 2);
  assert.equal(navigationKeyIndex('ArrowUp', 1, 5), 0);
  assert.equal(navigationKeyIndex('Home', 3, 5), 0);
  assert.equal(navigationKeyIndex('End', 1, 5), 4);
  assert.equal(navigationKeyIndex('Enter', 1, 5), null);
});

test('profile presentation includes only allowlisted server fields and omits missing data', () => {
  const summary = normalizeReaderSummary(response({ profile: {
    displayName: 'Reader One', email: 'reader@example.com', emailVerified: true,
    country: 'India', organization: 'GPIR Research', accountStatus: 'Active',
    memberSince: '2026-10-01T00:00:00Z', userId: 'internal-user-id',
    accessToken: 'secret-token', providerMetadata: 'private' } }));
  const entries = readerProfileEntries(summary.profile);
  const labels = entries.map(([label]) => label);
  const rendered = JSON.stringify(entries);
  assert.deepEqual(labels, ['Reader name', 'Verified email', 'Email status', 'Country',
    'Organization', 'Account status', 'Member since']);
  assert.doesNotMatch(rendered, /internal-user-id|secret-token|private/);
  assert.deepEqual(readerProfileEntries({}), []);
});

test('library accepts only entitled records and exposes only same-site supplied destinations', () => {
  const summary = normalizeReaderSummary(response({ library: [
    { publicationId: 'VK-GPIR-P-AUTHORIZED', supabaseRecordId: recordId,
      accessClass: 'ENTITLED', accessSource: 'PLAN', title: 'Authorized research',
      destination: '/publications/authorized/' },
    { publicationId: 'VK-GPIR-P-DENIED', supabaseRecordId: recordId,
      accessClass: 'RESTRICTED', accessSource: 'PAYMENT', title: 'Restricted research',
      destination: '/publications/restricted/' },
    { publicationId: 'VK-GPIR-P-EXTERNAL', supabaseRecordId: recordId,
      accessClass: 'ENTITLED', accessSource: 'PLAN', destination: 'https://example.com/private' }
  ] }));
  assert.deepEqual(summary.library.map(item => item.publicationId),
    ['VK-GPIR-P-AUTHORIZED', 'VK-GPIR-P-EXTERNAL']);
  assert.equal(summary.library[0].destination, '/publications/authorized/');
  assert.equal(summary.library[1].destination, null);
  assert.equal(publicationPresentation(summary.library[0]).destination,
    '/publications/authorized/');
  assert.equal(publicationPresentation(summary.library[1]).destination, null);
});

test('unavailable library and KPI data fail closed instead of displaying false zeroes', () => {
  const summary = normalizeReaderSummary(response({
    library: [{ publicationId: 'VK-GPIR-P-AUTHORIZED', supabaseRecordId: recordId,
      accessClass: 'ENTITLED', accessSource: 'PLAN', destination: '/private/' }],
    availability: { profile: 'AVAILABLE', library: 'UNAVAILABLE', payments: 'UNAVAILABLE',
      plan: 'AVAILABLE', libraryPass: 'AVAILABLE', subscriptionCheckout: 'UNAVAILABLE' },
    summary: {} }));
  assert.deepEqual(summary.library, []);
  assert.deepEqual(overviewValues(summary), {
    library: null, payments: null, purchases: null, account: 'Verified' });
});

test('markup and styles cover target desktop, tablet and mobile presentation contracts', async () => {
  const [css, html] = await Promise.all([
    readFile(new URL('../../assets/css/my-gpir.css', import.meta.url), 'utf8'),
    readFile(new URL('../../reader/my-gpir/index.html', import.meta.url), 'utf8')
  ]);
  assert.match(html, /data-gpir-section="overview"[\s\S]*data-gpir-section="profile"[\s\S]*data-gpir-section="library"[\s\S]*data-gpir-section="payments"[\s\S]*data-gpir-section="plan"/);
  assert.match(html, /href="\/reader\/my-gpir\/#profile"/);
  assert.match(html, /data-reader-metric="account">&mdash;</);
  assert.doesNotMatch(html, /data-reader-metric="(?:library|payments|purchases)">0</);
  assert.doesNotMatch(html, />View profile<|>Open library<|>View history<|>View plan</);
  assert.match(css, /width:min\(100% - 2rem,1180px\)/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*grid-column:span 6/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:380px\)[\s\S]*\.my-gpir-nav ul\{grid-template-columns:1fr\}/);
  assert.match(css, /\.my-gpir-publication__metadata\{display:grid/);
  assert.match(css, /\.my-gpir-publication__action:focus-visible\{outline:3px solid var\(--gpir-gold\)/);
  assert.match(css, /body\.my-gpir\{[^}]*font:15px\/1\.55 Arial,sans-serif/);
});
