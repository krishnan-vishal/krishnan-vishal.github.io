'use strict';

// Contentful's historical publication date and edition label are optional for
// legacy Drafts. The live content model must match this contract before writes.
const REQUIRED_FIELDS = Object.freeze([
  'gpirPublicationId', 'publicationTitle', 'slug', 'publicationType',
  'publicationStatus', 'region', 'countryMarket', 'directionScope',
  'useCasePaymentCategory', 'executiveSummary', 'editorialBody',
  'sourceValidationSummary', 'editionLineageId', 'supabaseRecordId'
]);

function classifyMigrationReadiness(record, draft, identityResolution = null) {
  if (!record || !draft?.fields) throw new TypeError('Normalized record and Draft are required.');
  const identity = identityResolution?.identity || identityResolution;
  const collision = identity &&
    (identity.collisionState && identity.collisionState.toLowerCase() !== 'none' ||
      identity.identityStatus === 'COLLISION_REVIEW');
  if (collision || (record.exceptions?.warnings || []).some(item => item.code === 'IDENTITY_CONFLICT'))
    return 'IDENTITY_CONFLICT';
  const missing = REQUIRED_FIELDS.some(field => draft.fields[field] == null ||
    draft.fields[field] === '' || field === 'editorialBody' &&
      !draft.fields.editorialBody.content?.length);
  if (missing || record.exceptions?.errors?.length) return 'BLOCKED_REQUIRED_FIELD';
  if (draft.reviewRequired || record.validationStatus !== 'PASS') return 'REVIEW_REQUIRED';
  return 'READY';
}

module.exports = { classifyMigrationReadiness, REQUIRED_FIELDS };
