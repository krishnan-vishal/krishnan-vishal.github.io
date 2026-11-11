const test = require('node:test');
const assert = require('node:assert/strict');
const search = require('../../assets/js/content-search.js');

test('M35 governed route metadata enters shared homepage and ASK GPIR search without protected body', async () => {
  const routes = { schemaVersion: '1.0.0', routes: [
    { identity: 'VK-GPIR-P-000000000035-6', route: '/cross-border-payments/',
      canonicalUrl: 'https://fintechoisis.com/cross-border-payments/',
      authAuthority: 'supabase', controlledValidation: false, publicationType: 'Research Publication',
      body: 'PROTECTED_BODY_MUST_NOT_BE_INDEXED' },
    { identity: 'VK-GPIR-P-000000000035-6', route: '/cross-border-payments/',
      canonicalUrl: 'https://fintechoisis.com/cross-border-payments/',
      authAuthority: 'supabase', controlledValidation: false },
    { identity: 'VK-GPIR-P-000000000036-4', route: '/draft/',
      canonicalUrl: 'https://fintechoisis.com/draft/', authAuthority: 'supabase',
      controlledValidation: true },
    { identity: 'VK-GPIR-P-000000000037-2', route: '/bypass/',
      canonicalUrl: 'https://fintechoisis.com/bypass/', authAuthority: 'none',
      controlledValidation: false }
  ] };
  const entries = search.publicationRouteEntries(routes);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, 'cross-border-payments/');
  assert.equal(entries[0].pageTitle, 'Cross Border Payments');
  assert.ok(!JSON.stringify(entries).includes('PROTECTED_BODY'));
});

test('M35 discovery fails closed for malformed or untrusted route metadata', () => {
  assert.deepEqual(search.publicationRouteEntries({ schemaVersion: 'unknown', routes: [] }), []);
  assert.deepEqual(search.publicationRouteEntries({ schemaVersion: '1.0.0', routes: [
    { identity: 'VK-GPIR-P-000000000035-6', route: '//evil.example/',
      canonicalUrl: 'https://fintechoisis.com//evil.example/', authAuthority: 'supabase',
      controlledValidation: false }
  ] }), []);
});
