'use strict';

// Network and credentials are injected. Planning is the default; allocation is opt-in.
const { validGovernedId } = require('./identity-authority');
const INDIA_SOURCE_UNIT_KEY = 'gpir:intake:publication:country:india:html:legacy-primary';

function assertSourceUnitKey(value) {
  if (typeof value !== 'string' || !/^gpir:intake:publication:[a-z0-9][a-z0-9:.-]*$/.test(value) ||
      /^(?:fixture|test):/i.test(value) || /\s/.test(value))
    throw new TypeError('A controlled, non-fixture publication sourceUnitKey is required.');
  return value;
}

function planIdentity(record, { sourceUnitKey, registrySnapshot = null,
  intakeEvidence = null } = {}) {
  if (!record || record.schemaVersion !== '1.0.0')
    throw new TypeError('A normalized M35 migration record is required.');
  const key = assertSourceUnitKey(sourceUnitKey);
  if (!intakeEvidence || intakeEvidence.controlledSourceUnit !== true ||
      typeof intakeEvidence.basis !== 'string' || !intakeEvidence.basis.trim())
    throw new TypeError('Controlled intake evidence for sourceUnitKey is required.');
  const checked = registrySnapshot?.checked === true;
  const existing = checked ? registrySnapshot.identity || null : null;
  if (existing && existing.sourceUnitKey !== key)
    throw new TypeError('Read-only identity snapshot belongs to another source unit.');
  const warnings = (record.exceptions?.warnings || []).map(item => ({
    code: item.code, message: item.message
  }));
  const relatedObjectIds = (record.referencedPublicationIds || []).map(value => ({
    type: 'dashboard', value, relationship: 'referenced-by-publication',
    evidence: 'Legacy page Reference ID', verificationState: 'SOURCE_OBSERVED'
  }));
  const existingId = existing?.gpirPublicationId || null;
  const existingLineageId = existing?.editionLineageId || null;
  const existingState = existing?.identityStatus || null;
  const authoritative = ['SOURCE_NATIVE', 'GOVERNED_ASSIGNED'].includes(existingState) &&
    typeof existingId === 'string' && typeof existingLineageId === 'string';
  const claimedSourceNativeId = record.identityStatus === 'verified' &&
    !relatedObjectIds.some(item => item.value === record.gpirPublicationId)
    ? record.gpirPublicationId : null;
  return Object.freeze({
    mode: 'inspect-plan-dry-run', sourceUnitKey: key,
    sourceUnitKeyBasis: intakeEvidence.basis,
    sourceLegacyPath: record.provenance?.sourcePath || null,
    sourceHash: record.provenance?.sourceHash || null,
    publicationType: record.publication?.type || record.family || null,
    existingIdentityFound: !checked ? 'UNKNOWN' : existing ? 'YES' : 'NO',
    existingIdentityStatus: existingState,
    existingGpirPublicationId: existingId,
    existingEditionLineageId: existingLineageId,
    claimedSourceNativePublicationId: claimedSourceNativeId,
    relatedObjectIds,
    predecessorEvidence: null,
    lineageEvidence: {
      sourceEditionLabel: record.lineage?.editionLabel || null,
      sourceVersion: record.lineage?.version || null,
      legacyConcept: intakeEvidence.legacyLineageConcept || null,
      governedEditionLineageId: existingLineageId
    },
    warnings,
    identityAction: authoritative ? 'reuse-authoritative-identity'
      : checked && existing ? 'review-existing-unresolved-identity'
        : checked ? 'governed-resolution-required' : 'confirm-registry-before-resolution',
    allocationRequired: authoritative ? false : checked && existing ? null : checked ? true : null,
    productionMutationRequiredAtF4E2: authoritative ? false : checked && !existing ? true : null,
    eligibleForAuthoritativeResolution: checked && !authoritative && !existing &&
      record.validationStatus !== 'FAIL' && !claimedSourceNativeId,
    contentfulWriteEligible: false,
    productionMutationPerformed: false,
    productionSequenceValuesConsumed: false
  });
}

async function inspectIdentity(record, options = {}) {
  if (typeof options.readCapability?.readIdentity !== 'function')
    throw new Error('A separate read-only identity inspection capability is required.');
  const key = assertSourceUnitKey(options.sourceUnitKey);
  const identity = await options.readCapability.readIdentity(key);
  return planIdentity(record, { ...options,
    registrySnapshot: { checked: true, identity: identity || null } });
}

async function resolveAuthoritatively(record, options = {}) {
  if (options.mode !== 'authoritative-resolve' ||
      options.authorization?.approved !== true ||
      options.authorization?.sourceUnitKey !== options.sourceUnitKey ||
      typeof options.capability?.executeResolve !== 'function')
    throw new Error('Explicit authoritative mode, matching approval and injected resolver capability are required.');
  const plan = planIdentity(record, options);
  if (plan.existingIdentityFound === 'UNKNOWN' ||
      plan.existingIdentityStatus === 'COLLISION_REVIEW' ||
      plan.existingIdentityStatus === 'BLOCKED' ||
      record.validationStatus === 'FAIL')
    throw new Error('Authoritative resolution requires a reviewed registry snapshot and non-failing source.');
  const claim = options.sourceNativeClaim || null;
  if (plan.claimedSourceNativePublicationId &&
      claim?.id !== plan.claimedSourceNativePublicationId)
    throw new Error('Source-evidenced publication ID requires an explicit matching governed claim review.');
  if (claim && (!/^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(claim.id || '') ||
      /^VK-GPIR-[PL]-\d{12}-\d$/.test(claim.id) ||
      !claim.evidence?.isSamePublication || !claim.evidence?.uniquenessEstablished ||
      !claim.evidence?.citation || plan.relatedObjectIds.some(item => item.value === claim.id)))
    throw new Error('Source-native claim requires exact-publication evidence and cannot be a related ID.');
  const request = Object.freeze({
    functionName: 'public.gpir_identity_resolve',
    sourceUnitKey: plan.sourceUnitKey,
    publicationType: plan.publicationType,
    actorProcess: options.authorization.actorProcess,
    sourceLegacyPath: plan.sourceLegacyPath,
    sourceHash: plan.sourceHash,
    claimedPublicationId: claim?.id || null,
    claimEvidence: claim?.evidence || {},
    predecessorSourceUnitKey: options.predecessorSourceUnitKey || null,
    migrationProvenance: { sourceUnitKeyBasis: plan.sourceUnitKeyBasis,
      sourceLegacyPath: plan.sourceLegacyPath, sourceHash: plan.sourceHash }
  });
  if (!request.actorProcess || request.claimedPublicationId &&
      plan.relatedObjectIds.some(item => item.value === request.claimedPublicationId))
    throw new Error('Actor/process and publication-only claim are required.');
  const row = await options.capability.executeResolve(request);
  if (!row || row.sourceUnitKey !== plan.sourceUnitKey ||
      !['GOVERNED_ASSIGNED', 'SOURCE_NATIVE', 'PROVISIONAL', 'COLLISION_REVIEW', 'BLOCKED'].includes(row.identityStatus))
    throw new Error('Resolver returned an invalid or mismatched registry row.');
  if (!['GOVERNED_ASSIGNED', 'SOURCE_NATIVE'].includes(row.identityStatus))
    return { identity: row, normalizedRecord: null, contentfulIdentityEligible: false };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id || '') ||
      !/^VK-GPIR-L-\d{12}-\d$/.test(row.editionLineageId || '') ||
      !validGovernedId(row.editionLineageId) ||
      row.gpirPublicationId === row.editionLineageId ||
      plan.relatedObjectIds.some(item => [row.gpirPublicationId, row.editionLineageId].includes(item.value)) ||
      (row.identityStatus === 'GOVERNED_ASSIGNED' &&
       (!/^VK-GPIR-P-\d{12}-\d$/.test(row.gpirPublicationId || '') ||
        !/^VK-GPIR-L-\d{12}-\d$/.test(row.editionLineageId) ||
        !validGovernedId(row.gpirPublicationId) || !validGovernedId(row.editionLineageId) ||
        row.assignmentMethod !== 'governed-sequence')) ||
      (row.identityStatus === 'SOURCE_NATIVE' &&
       (row.gpirPublicationId !== claim?.id || row.assignmentMethod !== 'source-native')))
    throw new Error('Resolver result violates the governed identity contract.');
  if (plan.existingIdentityFound === 'YES' &&
      (plan.existingGpirPublicationId !== row.gpirPublicationId ||
       plan.existingEditionLineageId !== row.editionLineageId))
    throw new Error('Resolver retry did not return the existing authoritative identity.');
  const normalizedRecord = structuredClone(record);
  normalizedRecord.gpirPublicationId = row.gpirPublicationId;
  normalizedRecord.identityStatus = 'mapped';
  normalizedRecord.lineage.editionId = row.editionLineageId;
  return { identity: row, normalizedRecord,
    identityPackage: { publicationRowId: row.id, gpirPublicationId: row.gpirPublicationId,
      editionLineageId: row.editionLineageId }, contentfulIdentityEligible: true };
}

module.exports = { INDIA_SOURCE_UNIT_KEY, planIdentity, inspectIdentity, resolveAuthoritatively };
