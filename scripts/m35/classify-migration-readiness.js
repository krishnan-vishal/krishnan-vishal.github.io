'use strict';

// Contentful's historical publication date and edition label are optional for
// legacy Drafts. The live content model must match this contract before writes.
const REQUIRED_FIELDS = Object.freeze([
  'gpirPublicationId', 'publicationTitle', 'slug', 'publicationType',
  'publicationStatus', 'region', 'countryMarket',
  'executiveSummary', 'editorialBody',
  'sourceValidationSummary', 'editionLineageId', 'supabaseRecordId'
]);
const CONDITIONAL_ABSENCE_WARNINGS = new Set(['SCOPE_UNRESOLVED', 'USE_CASE_UNRESOLVED']);

function substantiveWarnings(record) {
  return (record.exceptions?.warnings || []).filter(item =>
    !CONDITIONAL_ABSENCE_WARNINGS.has(item.code));
}

function effectiveValidationStatus(record) {
  if (record.validationStatus === 'FAIL' || record.exceptions?.errors?.length) return 'FAIL';
  return substantiveWarnings(record).length ? 'WARN' : 'PASS';
}

function legacyLifecycleNotEvidenced(record, legacyMigration) {
  return legacyMigration === true && record.migrationStatus === 'extracted' &&
    Boolean(record.provenance?.sourcePath) && record.publication?.status === null &&
    record.publication?.statusEvidence?.evidenceType === 'LEGACY_NO_LIFECYCLE_EVIDENCE' &&
    record.publication?.statusEvidence?.mappingRule === 'LEGACY_LIFECYCLE_NOT_EVIDENCED';
}

function unresolvedRequiredFields(record, draft,
  { allowPendingIdentity = false, legacyMigration = false } = {}) {
  if (!record || !draft?.fields) throw new TypeError('Normalized record and Draft are required.');
  const pendingIdentityFields = allowPendingIdentity
    ? ['gpirPublicationId', 'editionLineageId', 'supabaseRecordId'] : [];
  const conditionalFields = record.family === 'country'
    ? [] : ['region', 'countryMarket'];
  return REQUIRED_FIELDS.filter(field => !pendingIdentityFields.includes(field) &&
    !conditionalFields.includes(field) &&
    !(field === 'publicationStatus' && legacyLifecycleNotEvidenced(record, legacyMigration)) &&
    (draft.fields[field] == null ||
    draft.fields[field] === '' || field === 'editorialBody' &&
      !draft.fields.editorialBody.content?.length));
}

function classifyMigrationReadiness(record, draft, identityResolution = null,
  { allowPendingIdentity = false, legacyMigration = false, contentOnly = false } = {}) {
  if (!record || !draft?.fields) throw new TypeError('Normalized record and Draft are required.');
  const identity = identityResolution?.identity || identityResolution;
  const collision = identity &&
    (identity.collisionState && identity.collisionState.toLowerCase() !== 'none' ||
      identity.identityStatus === 'COLLISION_REVIEW');
  if (!contentOnly && (collision || substantiveWarnings(record).some(item => item.code === 'IDENTITY_CONFLICT')))
    return 'IDENTITY_CONFLICT';
  const pendingIdentityFields = allowPendingIdentity
    ? ['gpirPublicationId', 'editionLineageId', 'supabaseRecordId'] : [];
  if (unresolvedRequiredFields(record, draft, { allowPendingIdentity, legacyMigration }).length ||
      record.exceptions?.errors?.length) return 'BLOCKED_REQUIRED_FIELD';
  const remainingGaps = (draft.mappingGaps || []).filter(gap =>
    !pendingIdentityFields.includes(gap.field));
  const migrationWarnings = (draft.migrationWarnings || []).filter(item =>
    !contentOnly || !['IDENTITY_DERIVED', 'IDENTITY_CONFLICT'].includes(item.code));
  const hasContentWarnings = substantiveWarnings(record).some(item =>
    !['IDENTITY_DERIVED', 'IDENTITY_CONFLICT'].includes(item.code));
  if (allowPendingIdentity
    ? migrationWarnings.length || remainingGaps.length ||
      (contentOnly ? hasContentWarnings : effectiveValidationStatus(record) !== 'PASS')
    : draft.reviewRequired || effectiveValidationStatus(record) !== 'PASS') return 'REVIEW_REQUIRED';
  return 'READY';
}

module.exports = { classifyMigrationReadiness, unresolvedRequiredFields,
  substantiveWarnings, effectiveValidationStatus, legacyLifecycleNotEvidenced,
  REQUIRED_FIELDS };
