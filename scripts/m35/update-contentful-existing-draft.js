'use strict';

// Capability injection keeps credentials and transport outside this module.
// The only mutation exposed is version-guarded update of an existing Draft.
const LIVE_FIELDS = new Set([
  'gpirPublicationId', 'publicationTitle', 'slug', 'publicationType', 'publicationStatus',
  'region', 'countryMarket', 'directionScope', 'useCasePaymentCategory',
  'publicationDate', 'dataCutOffDate', 'executiveSummary', 'editorialBody',
  'sourceValidationSummary', 'legacySourceUrl', 'canonicalUrlCandidate',
  'editionLineageId', 'editionLabel', 'supabaseRecordId', 'migrationStatus', 'validationStatus'
]);

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function assertDraft(entry, entryId) {
  if (!entry || entry.sys?.id !== entryId || !Number.isInteger(entry.sys.version) ||
      entry.sys.version < 1 || entry.sys.publishedVersion != null ||
      entry.sys.contentType?.sys?.id !== 'gpirPublication')
    throw new Error('Existing GPIR Publication entry must be fetched as an unpublished Draft with a known version.');
}

async function planExistingDraftUpdate({ entryId, desiredFields = {}, authorizedFields = [],
  locale = 'en-US', capability } = {}) {
  if (typeof entryId !== 'string' || !entryId || typeof capability?.readEntry !== 'function')
    throw new Error('Existing entry ID and read-only Contentful capability are required.');
  const entry = await capability.readEntry(entryId);
  assertDraft(entry, entryId);
  const authorized = [...new Set(authorizedFields)];
  if (!authorized.every(field => LIVE_FIELDS.has(field) && Object.hasOwn(desiredFields, field)) ||
      Object.keys(desiredFields).some(field => !authorized.includes(field)) ||
      authorized.some(field => desiredFields[field] == null || desiredFields[field] === ''))
    throw new Error('Only explicitly authorized, supported, non-empty fields may be updated.');
  const changes = {};
  for (const field of authorized) {
    const next = { ...(entry.fields?.[field] || {}), [locale]: desiredFields[field] };
    if (!same(entry.fields?.[field], next)) changes[field] = next;
  }
  return { mode: 'dry-run', entryId, version: entry.sys.version, technicalState: 'DRAFT',
    changes, beforeFields: structuredClone(entry.fields || {}), createEntry: false,
    assetMutation: false, publish: false };
}

async function updateExistingDraft(options = {}) {
  if (options.mode !== 'existing-draft-update' ||
      options.authorization?.approved !== true ||
      options.authorization?.entryId !== options.entryId ||
      typeof options.capability?.updateEntry !== 'function')
    throw new Error('Explicit existing-Draft update mode, matching approval and update capability are required.');
  const plan = await planExistingDraftUpdate(options);
  if (options.expectedVersion !== plan.version)
    throw new Error('Contentful version conflict; re-read and re-authorize the Draft update.');
  if (!Object.keys(plan.changes).length) return { updated: false, plan };
  const fields = { ...structuredClone(plan.beforeFields), ...plan.changes };
  // Transport must send X-Contentful-Version=version; no create/publish/asset capability is used.
  await options.capability.updateEntry({ entryId: plan.entryId, version: plan.version,
    headers: { 'X-Contentful-Version': String(plan.version) }, fields });
  const after = await options.capability.readEntry(plan.entryId);
  assertDraft(after, plan.entryId);
  if (after.sys.version <= plan.version ||
      Object.entries(plan.changes).some(([field, value]) => !same(after.fields?.[field], value)) ||
      Object.entries(plan.beforeFields).some(([field, value]) =>
        !Object.hasOwn(plan.changes, field) && !same(after.fields?.[field], value)) ||
      Object.keys(after.fields || {}).some(field =>
        !Object.hasOwn(fields, field)))
    throw new Error('Post-update Draft verification failed; inspect the existing entry before retrying.');
  return { updated: true, entryId: plan.entryId, beforeVersion: plan.version,
    afterVersion: after.sys.version, changedFields: Object.keys(plan.changes),
    technicalState: 'DRAFT', published: false };
}

module.exports = { planExistingDraftUpdate, updateExistingDraft };
