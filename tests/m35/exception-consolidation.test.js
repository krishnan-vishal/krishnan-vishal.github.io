'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { governedId } = require('../../scripts/m35/identity-authority');
const { reconcileIdentityRows, readIdentityBatch } =
  require('../../scripts/m35/reconcile-identity-registry');
const { generateManifest, generateManifestWithRegistry, summarizeExceptions } =
  require('../../scripts/m35/generate-migration-manifest');

const root = path.resolve(__dirname, '../..');
const PRE_REDIRECT_SOURCE_CANDIDATES = 34;
const POST_REDIRECT_SOURCE_CANDIDATES = 2;
const GOVERNED_REDIRECTS = 32;
const GOVERNED_PUBLICATIONS = 32;
const POST_REDIRECT_CANDIDATE_PATHS = [
  'pages/countries/qatar.html',
  'pages/countries/saudi-arabia.html'
];

test('post-redirect discovery separates residual candidates from governed redirects', () => {
  const { manifest, exceptions } = generateManifest(root);
  assert.equal(manifest.summary.emptyPlaceholdersExcluded, 16);
  assert.equal(manifest.summary.discovery.REVIEW_DISCOVERY, 0);
  assert.equal(exceptions.discovery.length, 0);
  assert.equal(manifest.records.length, POST_REDIRECT_SOURCE_CANDIDATES);
  assert.equal(manifest.summary.discovery.MIGRATION_ELIGIBLE,
    POST_REDIRECT_SOURCE_CANDIDATES);
  assert.deepEqual(manifest.records.map(item => item.sourcePath),
    POST_REDIRECT_CANDIDATE_PATHS);
  assert.equal(manifest.summary.discovery.REDIRECT_OR_ALIAS, GOVERNED_REDIRECTS);
  assert.equal(POST_REDIRECT_SOURCE_CANDIDATES + GOVERNED_REDIRECTS,
    PRE_REDIRECT_SOURCE_CANDIDATES);
  assert.equal(require('../../routes.json').recordCount, GOVERNED_PUBLICATIONS);
  assert.equal(manifest.discovery.filter(item =>
    item.reasonCodes.includes('GENERATED_GOVERNED_PUBLICATION_SHELL')).length, 32);
  assert.equal(manifest.discovery.filter(item =>
    item.reasonCodes.includes('OUT_OF_SCOPE_APPLICATION_PAGE')).length, 46);
});

test('blocking fields are explicit and optional legacy metadata never blocks', () => {
  const { manifest } = generateManifest(root);
  const summary = summarizeExceptions(manifest);
  assert.equal(summary.blockingFields.publicationStatus, undefined);
  assert.equal(summary.blockingFields.directionScope, undefined);
  assert.equal(summary.blockingFields.useCasePaymentCategory, undefined);
  assert.equal(summary.blockingFields.publicationDate, undefined);
  assert.equal(summary.blockingFields.editionLabel, undefined);
  assert.equal(summary.fieldContract.dataCutOffDate, 'NON_BLOCKING_MAPPING_GAP');
  assert.equal(summary.reasonCodes.find(item => item.reasonCode ===
    'BLOCKING_FIELD_PUBLICATION_STATUS'), undefined);
});

test('one read-only batch distinguishes existing, missing and conflicting identities', async () => {
  const records = [
    { sourceUnitKey: 'gpir:intake:publication:country:alpha:html:legacy-primary',
      relatedIdentifiers: [{ value: 'VK-GPI-APAC-ALPHA-DASH-1' }] },
    { sourceUnitKey: 'gpir:intake:publication:country:beta:html:legacy-primary',
      relatedIdentifiers: [] }
  ];
  const row = { sourceUnitKey: records[0].sourceUnitKey,
    id: 'b7d85c60-40dd-42af-be54-3da9154fd433',
    gpirPublicationId: governedId('P', 2), editionLineageId: governedId('L', 2),
    identityStatus: 'GOVERNED_ASSIGNED' };
  let calls = 0;
  const result = await readIdentityBatch(records, { readIdentities: async keys => {
    calls++;
    assert.deepEqual(keys, records.map(item => item.sourceUnitKey));
    return [row];
  } });
  assert.equal(calls, 1);
  assert.equal(result[records[0].sourceUnitKey].state, 'EXISTING_GOVERNED_IDENTITY');
  assert.equal(result[records[0].sourceUnitKey].publicationIdentity, row.gpirPublicationId);
  assert.equal(result[records[1].sourceUnitKey].state, 'NO_EXISTING_IDENTITY');
  assert.equal(reconcileIdentityRows(records, [row, row])[records[0].sourceUnitKey].state,
    'IDENTITY_COLLISION_OR_CONFLICT');
  assert.equal(reconcileIdentityRows(records)[records[0].sourceUnitKey].state,
    'REGISTRY_LOOKUP_UNAVAILABLE');
});

test('unavailable registry remains explicit and never implies allocation', () => {
  const { manifest } = generateManifest(root);
  assert.equal(manifest.summary.identityReconciliation.REGISTRY_LOOKUP_UNAVAILABLE,
    POST_REDIRECT_SOURCE_CANDIDATES);
  assert.ok(manifest.records.every(item =>
    item.identityActionForF4K === 'REGISTRY_LOOKUP_REQUIRED'));
});

test('common manifest engine recognizes a governed row from one read batch', async () => {
  const baseline = generateManifest(root);
  const key = baseline.manifest.records[0].sourceUnitKey;
  let calls = 0;
  const result = await generateManifestWithRegistry(root, {
    readIdentities: async keys => {
      calls++;
      assert.equal(keys.length, POST_REDIRECT_SOURCE_CANDIDATES);
      assert.deepEqual(baseline.manifest.records.map(item => item.sourcePath),
        POST_REDIRECT_CANDIDATE_PATHS);
      return [{ sourceUnitKey: key, id: 'b7d85c60-40dd-42af-be54-3da9154fd433',
        gpirPublicationId: governedId('P', 2),
        editionLineageId: governedId('L', 2), identityStatus: 'GOVERNED_ASSIGNED' }];
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.manifest.summary.identityReconciliation.EXISTING_GOVERNED_IDENTITY, 1);
  assert.equal(result.manifest.summary.identityReconciliation.NO_EXISTING_IDENTITY, 1);
  assert.equal(result.manifest.records[0].publicationIdentity, governedId('P', 2));
});
