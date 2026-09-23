'use strict';

const { validGovernedId } = require('./identity-authority');

function reconcileIdentityRows(records, rows = null) {
  if (rows === null) return Object.fromEntries(records.map(record =>
    [record.sourceUnitKey, { state: 'REGISTRY_LOOKUP_UNAVAILABLE',
      publicationIdentity: null, publicationUuid: null, lineageIdentity: null,
      registryAssignmentState: null, identityActionForF4K: 'REGISTRY_LOOKUP_REQUIRED' }]));
  const requested = new Set(records.map(record => record.sourceUnitKey));
  if (!Array.isArray(rows)) throw new TypeError('Read-only identity rows must be an array.');
  const byKey = new Map();
  for (const row of rows) {
    if (!requested.has(row.sourceUnitKey)) throw new TypeError('Registry returned an unexpected source unit.');
    const list = byKey.get(row.sourceUnitKey) || [];
    list.push(row);
    byKey.set(row.sourceUnitKey, list);
  }
  return Object.fromEntries(records.map(record => {
    const found = byKey.get(record.sourceUnitKey) || [];
    if (!found.length) return [record.sourceUnitKey, {
      state: 'NO_EXISTING_IDENTITY', publicationIdentity: null, publicationUuid: null,
      lineageIdentity: null, registryAssignmentState: null,
      identityActionForF4K: 'IDENTITY_ALLOCATION_REQUIRED' }];
    const row = found[0];
    const authoritative = found.length === 1 &&
      ['GOVERNED_ASSIGNED', 'SOURCE_NATIVE'].includes(row.identityStatus) &&
      typeof row.gpirPublicationId === 'string' &&
      typeof row.editionLineageId === 'string' &&
      validGovernedId(row.editionLineageId) &&
      (row.identityStatus !== 'GOVERNED_ASSIGNED' ||
        validGovernedId(row.gpirPublicationId)) &&
      !(record.relatedIdentifiers || []).some(item => item.value === row.gpirPublicationId);
    return [record.sourceUnitKey, {
      state: authoritative ? 'EXISTING_GOVERNED_IDENTITY' : 'IDENTITY_COLLISION_OR_CONFLICT',
      publicationIdentity: authoritative ? row.gpirPublicationId : null,
      publicationUuid: authoritative ? row.id || null : null,
      lineageIdentity: authoritative ? row.editionLineageId : null,
      registryAssignmentState: row.identityStatus || null,
      identityActionForF4K: authoritative ? 'REUSE_EXISTING_IDENTITY' : 'IDENTITY_REVIEW_REQUIRED'
    }];
  }));
}

async function readIdentityBatch(records, capability) {
  if (typeof capability?.readIdentities !== 'function') return reconcileIdentityRows(records);
  const keys = records.map(record => record.sourceUnitKey);
  const rows = await capability.readIdentities(keys);
  return reconcileIdentityRows(records, rows);
}

module.exports = { reconcileIdentityRows, readIdentityBatch };
