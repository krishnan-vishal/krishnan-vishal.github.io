'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft } = require('../../scripts/m35/build-contentful-draft');
const { INDIA_SOURCE_UNIT_KEY, planIdentity, resolveAuthoritatively } =
  require('../../scripts/m35/supabase-identity-adapter');

const intakeEvidence = Object.freeze({
  controlledSourceUnit: true,
  basis: 'Governed intake: India country HTML publication, legacy primary edition; distinct from dashboard',
  legacyLineageConcept: 'GPIR-APAC-IND-C2C'
});
function india() {
  return convertLegacyContent({ sourcePath: 'pages/countries/india.html',
    content: fs.readFileSync('pages/countries/india.html', 'utf8') });
}
function plan(extra = {}) {
  return planIdentity(india(), { sourceUnitKey: INDIA_SOURCE_UNIT_KEY, intakeEvidence, ...extra });
}

test('dry run performs no Supabase writes and has no network or database client', () => {
  const code = fs.readFileSync(require.resolve('../../scripts/m35/supabase-identity-adapter'), 'utf8');
  assert.doesNotMatch(code, /fetch\s*\(|https?\.request|createClient|from\s*\(|\.rpc\s*\(/);
  assert.equal(plan().productionMutationPerformed, false);
  assert.equal(plan().productionSequenceValuesConsumed, false);
});
test('dry run never invokes the authoritative resolver', () => {
  let calls = 0;
  const result = plan({ capability: { executeResolve() { calls++; throw Error('resolver called'); } } });
  assert.equal(calls, 0);
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(plan().mode, 'inspect-plan-dry-run');
});
test('controlled India sourceUnitKey is deterministic and independent of path and hash', () => {
  assert.equal(INDIA_SOURCE_UNIT_KEY, 'gpir:intake:publication:country:india:html:legacy-primary');
  assert.equal(plan().sourceUnitKey, plan().sourceUnitKey);
  assert.doesNotMatch(INDIA_SOURCE_UNIT_KEY, /pages\/|\.html|https?:|[a-f0-9]{64}/);
});
test('dashboard Reference ID remains related and is never promoted', () => {
  const result = plan();
  assert.equal(result.relatedObjectIds[0].value, 'VK-GPI-APAC-IND-2026-005');
  assert.equal(result.relatedObjectIds[0].type, 'dashboard');
  assert.equal(result.claimedSourceNativePublicationId, null);
  assert.equal(result.existingGpirPublicationId, null);
});
test('dry run fabricates no governed publication or lineage ID', () => {
  const result = plan();
  assert.equal(result.existingGpirPublicationId, null);
  assert.equal(result.existingEditionLineageId, null);
  assert.equal(result.lineageEvidence.governedEditionLineageId, null);
});
test('read-only snapshot can recognize an existing authoritative identity', () => {
  const result = plan({ registrySnapshot: { checked: true, identity: {
    sourceUnitKey: INDIA_SOURCE_UNIT_KEY, identityStatus: 'GOVERNED_ASSIGNED',
    gpirPublicationId: 'VK-GPIR-P-000000000042-0',
    editionLineageId: 'VK-GPIR-L-000000000007-3'
  } } });
  assert.equal(result.existingIdentityFound, 'YES');
  assert.equal(result.identityAction, 'reuse-authoritative-identity');
  assert.equal(result.allocationRequired, false);
  assert.equal(result.contentfulWriteEligible, false);
});
test('unknown production registry state remains explicit', () => {
  const result = plan();
  assert.equal(result.existingIdentityFound, 'UNKNOWN');
  assert.equal(result.identityAction, 'confirm-registry-before-resolution');
  assert.equal(result.allocationRequired, null);
  assert.equal(result.eligibleForAuthoritativeResolution, false);
});
test('mutation mode cannot be entered accidentally', async () => {
  await assert.rejects(resolveAuthoritatively(), /Explicit authoritative mode/);
  assert.throws(() => planIdentity(india(), { sourceUnitKey: 'fixture:india', intakeEvidence }), /controlled/);
  assert.throws(() => planIdentity(india(), { sourceUnitKey: INDIA_SOURCE_UNIT_KEY }), /evidence/);
});
test('India fixture produces expected dry-run plan and preserves warnings', () => {
  const result = plan({ registrySnapshot: { checked: true, identity: null } });
  assert.equal(result.publicationType, 'country');
  assert.equal(result.sourceLegacyPath, 'pages/countries/india.html');
  assert.equal(result.lineageEvidence.legacyConcept, 'GPIR-APAC-IND-C2C');
  assert.equal(result.predecessorEvidence, null);
  assert.equal(result.eligibleForAuthoritativeResolution, true);
  assert.ok(result.warnings.some(item => item.code === 'IDENTITY_DERIVED'));
  assert.ok(result.warnings.some(item => item.code === 'SOURCE_VERIFICATION_PENDING'));
  assert.ok(result.warnings.some(item => item.code === 'DATA_UNDER_DEVELOPMENT'));
});
test('Draft Factory remains compatible without promoting dry-run identity', () => {
  const source = india();
  const draft = buildContentfulDraft(source);
  assert.equal(draft.fields.gpirPublicationId, null);
  assert.equal(draft.fields.editionLineageId, null);
  assert.ok(draft.sourceRecordIdentity.referencedPublicationIds.includes('VK-GPI-APAC-IND-2026-005'));
  assert.equal(draft.publishEligible, false);
});
test('Draft Factory maps a separately supplied authoritative identity in a synthetic record', () => {
  const source = convertLegacyContent({ sourcePath: 'pages/countries/example.html',
    content: '<h1>Example</h1><p>Editorial content.</p>' });
  source.identityStatus = 'mapped';
  source.gpirPublicationId = 'SYNTHETIC-PUBLICATION-ID';
  source.lineage.editionId = 'SYNTHETIC-LINEAGE-ID';
  const draft = buildContentfulDraft(source);
  assert.equal(draft.fields.gpirPublicationId, 'SYNTHETIC-PUBLICATION-ID');
  assert.equal(draft.fields.editionLineageId, 'SYNTHETIC-LINEAGE-ID');
  assert.equal(draft.publishEligible, false);
});
test('mismatched read-only identity snapshot is rejected', () => {
  assert.throws(() => plan({ registrySnapshot: { checked: true,
    identity: { sourceUnitKey: 'gpir:intake:publication:country:other:html:legacy-primary' } } }),
  /another source unit/);
});
