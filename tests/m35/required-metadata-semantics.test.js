'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft } = require('../../scripts/m35/build-contentful-draft');
const { classifyMigrationReadiness, unresolvedRequiredFields } =
  require('../../scripts/m35/classify-migration-readiness');
const { generateManifest, combineReadiness } =
  require('../../scripts/m35/generate-migration-manifest');

function country(metadata = {}) {
  return convertLegacyContent({ sourcePath: 'pages/countries/example.html',
    content: '<title>Generic Country Intelligence</title><div class="chapter-content">' +
      '<p>General payments infrastructure overview.</p></div>',
    metadata: { region: 'APAC', ...metadata } });
}

test('source publication status is preserved separately from technical Draft state', () => {
  const record = country();
  record.publication.status = 'CURRENT';
  const draft = buildContentfulDraft(record);
  assert.equal(draft.fields.publicationStatus, 'CURRENT');
  assert.equal(draft.technicalState, 'Draft');
});

test('missing source publication status is not fabricated from Draft workflow', () => {
  const record = country({ status: null });
  const draft = buildContentfulDraft(record);
  assert.equal(record.publication.status, null);
  assert.equal(draft.fields.publicationStatus, null);
  assert.ok(unresolvedRequiredFields(record, draft, { allowPendingIdentity: true })
    .includes('publicationStatus'));
});

test('generic country scope and payment category remain conditional and uninferred', () => {
  const record = country();
  const draft = buildContentfulDraft(record);
  assert.equal(record.publication.directionScope, null);
  assert.equal(record.publication.useCase, null);
  assert.equal(draft.fields.directionScope, null);
  assert.equal(draft.fields.useCasePaymentCategory, null);
  assert.ok(!unresolvedRequiredFields(record, draft, { allowPendingIdentity: true })
    .some(field => ['directionScope', 'useCasePaymentCategory'].includes(field)));
  assert.ok(!draft.migrationWarnings.some(item =>
    ['SCOPE_UNRESOLVED', 'USE_CASE_UNRESOLVED'].includes(item.code)));
});

test('explicit scope and use case survive without default inference', () => {
  const draft = buildContentfulDraft(country({ directionScope: 'Inbound', useCase: 'C2C' }));
  assert.equal(draft.fields.directionScope, 'Inbound');
  assert.equal(draft.fields.useCasePaymentCategory, 'C2C');
});

test('missing cutoff remains null and nonblocking', () => {
  const record = country();
  const draft = buildContentfulDraft(record);
  assert.equal(draft.fields.dataCutOffDate, null);
  assert.ok(!unresolvedRequiredFields(record, draft, { allowPendingIdentity: true })
    .includes('dataCutOffDate'));
  assert.deepEqual(unresolvedRequiredFields(record, draft, { allowPendingIdentity: true }),
    ['publicationStatus']);
});

test('manifest separates content readiness from unqueried identity readiness', () => {
  assert.equal(combineReadiness('READY', 'REGISTRY_LOOKUP_REQUIRED'), 'REVIEW_REQUIRED');
  assert.equal(combineReadiness('READY', 'ALLOCATION_REQUIRED'), 'READY');
  assert.equal(combineReadiness('READY', 'CONFLICT'), 'IDENTITY_CONFLICT');
  const { manifest } = generateManifest(path.resolve(__dirname, '../..'));
  assert.equal(manifest.records.length, 32);
  assert.ok(manifest.records.every(record =>
    record.identityReadiness === 'REGISTRY_LOOKUP_REQUIRED'));
  assert.equal(Object.values(manifest.summary.contentReadiness).reduce((a, b) => a + b, 0), 32);
  assert.ok(manifest.records.every(record => record.contentReadiness !== 'READY' ||
    record.readinessClassification !== 'READY'));
});
