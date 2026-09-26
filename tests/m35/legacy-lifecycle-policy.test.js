'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft } = require('../../scripts/m35/build-contentful-draft');
const { unresolvedRequiredFields, classifyMigrationReadiness } =
  require('../../scripts/m35/classify-migration-readiness');
const { generateManifest } = require('../../scripts/m35/generate-migration-manifest');

const root = path.resolve(__dirname, '../..');
function legacy(content = '<title>Example</title><p>Editorial summary.</p>', metadata = {}) {
  return convertLegacyContent({ sourcePath: 'pages/chapters/example.html', content, metadata });
}

test('legacy null lifecycle carries governed provenance and is nonblocking only in migration mode', () => {
  const record = legacy();
  const draft = buildContentfulDraft(record, { legacyMigration: true });
  assert.equal(record.publication.status, null);
  assert.deepEqual(record.publication.statusEvidence, {
    evidenceType: 'LEGACY_NO_LIFECYCLE_EVIDENCE', evidenceLocation: null,
    mappingRule: 'LEGACY_LIFECYCLE_NOT_EVIDENCED'
  });
  assert.equal(draft.fields.publicationStatus, null);
  assert.ok(!draft.mappingGaps.some(gap => gap.field === 'publicationStatus'));
  assert.ok(!unresolvedRequiredFields(record, draft,
    { allowPendingIdentity: true, legacyMigration: true }).includes('publicationStatus'));
});

test('new-publication validation remains strict', () => {
  const record = legacy();
  const draft = buildContentfulDraft(record);
  assert.ok(draft.mappingGaps.some(gap => gap.field === 'publicationStatus'));
  assert.ok(unresolvedRequiredFields(record, draft, { allowPendingIdentity: true })
    .includes('publicationStatus'));
  const newRecord = structuredClone(record);
  newRecord.migrationStatus = 'new';
  assert.ok(unresolvedRequiredFields(newRecord, draft,
    { allowPendingIdentity: true, legacyMigration: true }).includes('publicationStatus'));
});

test('null lifecycle never becomes CURRENT, HISTORICAL or Contentful workflow state', () => {
  const record = legacy('<title>Example</title><p>Editorial summary. Published online.</p>');
  const draft = buildContentfulDraft(record, { legacyMigration: true });
  assert.equal(record.publication.status, null);
  assert.equal(draft.fields.publicationStatus, null);
  assert.equal(draft.technicalState, 'Draft');
  assert.equal(draft.publishEligible, false);
});

test('review and quality flags remain independent of lifecycle null', () => {
  const record = legacy('<title>Example</title><p>Pending Verification.</p>' +
    '<p>Data Under Development.</p>');
  const draft = buildContentfulDraft(record, { legacyMigration: true });
  assert.equal(record.publication.status, null);
  assert.ok(draft.migrationWarnings.some(item => item.code === 'SOURCE_VERIFICATION_PENDING'));
  assert.ok(draft.migrationWarnings.some(item => item.code === 'DATA_UNDER_DEVELOPMENT'));
  assert.equal(classifyMigrationReadiness(record, draft, null,
    { allowPendingIdentity: true, legacyMigration: true, contentOnly: true }), 'REVIEW_REQUIRED');
});

test('identity readiness stays separate from content readiness', () => {
  const { manifest } = generateManifest(root);
  assert.equal(manifest.summary.contentReadiness.BLOCKED_REQUIRED_FIELD, 0);
  assert.equal(manifest.summary.identityReadiness.REGISTRY_LOOKUP_REQUIRED, 2);
  assert.deepEqual(manifest.records.map(record => record.sourcePath), [
    'pages/countries/qatar.html',
    'pages/countries/saudi-arabia.html'
  ]);
  assert.ok(manifest.records.every(record =>
    record.publicationStatus.value === null &&
    record.publicationStatus.mappingRule === 'LEGACY_LIFECYCLE_NOT_EVIDENCED' &&
    !record.reasonCodes.includes('BLOCKING_FIELD_PUBLICATION_STATUS')));
});

test('future lifecycle transitions are not automatic', () => {
  const record = legacy('<meta name="gpir-publication-status" content="CURRENT">' +
    '<title>Example</title><p>Editorial summary.</p>',
  { previousEditionId: 'older-edition' });
  assert.equal(record.publication.status, 'CURRENT');
  assert.equal(record.lineage.previousEditionId, 'older-edition');
  assert.equal(record.lineage.state, 'current');
});

test('migration Draft and new-publication Draft enforce different null policy', () => {
  const record = legacy();
  const legacyDraft = buildContentfulDraft(record, { legacyMigration: true });
  const newDraft = buildContentfulDraft(record);
  assert.equal(legacyDraft.fields.publicationStatus, null);
  assert.equal(newDraft.fields.publicationStatus, null);
  assert.ok(!legacyDraft.mappingGaps.some(gap => gap.field === 'publicationStatus'));
  assert.ok(newDraft.mappingGaps.some(gap => gap.field === 'publicationStatus'));
});
