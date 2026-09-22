'use strict';

// Luhn check digit over the twelve decimal sequence digits. Business metadata never enters the ID.
function luhnSum(digits) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = Number(digits[index]);
    if (double) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
    double = !double;
  }
  return sum;
}

function checkDigit(sequence) {
  if (!/^\d{12}$/.test(sequence)) throw new TypeError('Sequence must contain twelve digits.');
  return String((10 - (luhnSum(`${sequence}0`) % 10)) % 10);
}

function governedId(kind, sequence) {
  if (!['P', 'L'].includes(kind) || !Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999999999)
    throw new RangeError('Invalid governed identity sequence.');
  const digits = String(sequence).padStart(12, '0');
  return `VK-GPIR-${kind}-${digits}-${checkDigit(digits)}`;
}

function validGovernedId(id) {
  const match = /^VK-GPIR-[PL]-(\d{12})-(\d)$/.exec(id || '');
  return Boolean(match && checkDigit(match[1]) === match[2]);
}

function validSourceNativeId(id) {
  if (/^VK-GPIR-[PL]-\d{12}-\d$/.test(id || '')) return validGovernedId(id);
  return /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(id || '');
}

function clone(value) {
  return structuredClone(value);
}

class InMemoryIdentityRegistry {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    this.bySourceUnit = new Map();
    this.byPublicationId = new Map();
    this.nextPublication = 1;
    this.nextLineage = 1;
    this.testMode = true;
  }

  resolve(request = {}) {
    const key = request.sourceUnitKey;
    const relatedObjectIds = (request.relatedObjectIds || []).map(item => ({
      type: item.type, value: item.value, evidence: item.evidence
    }));
    const shell = (identityStatus, reason) => ({
      sourceUnitKey: key || null, gpirPublicationId: null, editionLineageId: null,
      publicationType: request.publicationType || null,
      sourceLegacyPath: request.sourceLegacyPath || null,
      sourceHash: request.sourceHash || null,
      sourceNativeIds: request.claimedPublicationId ? [request.claimedPublicationId] : [],
      relatedObjectIds, assignmentMethod: null, assignmentTimestamp: null,
      identityStatus, collisionState: identityStatus === 'COLLISION_REVIEW' ? 'review' : 'none',
      testIdentityOnly: true,
      lineageBasisKey: request.lineageSourceUnitKey || key || null,
      previousPublicationId: null, reason
    });
    if (!key) return shell('PROVISIONAL', 'Controlled-intake sourceUnitKey is required.');
    if (typeof key !== 'string' || !key.startsWith('fixture:'))
      return shell('BLOCKED', 'Local adapter accepts explicit fixture sourceUnitKeys only.');
    if (!request.publicationType)
      return shell('BLOCKED', 'Publication type is required for controlled intake.');
    if (relatedObjectIds.some(item => !item.type || !item.value || !item.evidence))
      return shell('BLOCKED', 'Related identifiers require type, value and evidence.');

    const existing = this.bySourceUnit.get(key);
    if (existing) {
      if (existing.publicationType !== request.publicationType ||
          (request.claimedPublicationId && request.claimedPublicationId !== existing.gpirPublicationId) ||
          (request.lineageSourceUnitKey && request.lineageSourceUnitKey !== existing.lineageBasisKey))
        return shell('COLLISION_REVIEW', 'Source unit conflicts with an existing publication assignment.');
      return clone(existing);
    }

    const claimedId = request.claimedPublicationId || null;
    if (claimedId) {
      if (relatedObjectIds.some(item => item.value === claimedId))
        return shell('BLOCKED', 'A related object ID cannot be promoted to publication identity.');
      const evidence = request.sourceNativeEvidence;
      if (!validSourceNativeId(claimedId) || !evidence?.isSamePublication ||
          !evidence?.uniquenessEstablished || !evidence?.citation)
        return shell('PROVISIONAL', 'Claimed source-native ID lacks exact-publication and uniqueness evidence.');
      const owner = this.byPublicationId.get(claimedId);
      if (owner && owner !== key)
        return shell('COLLISION_REVIEW', 'Publication ID is already claimed by a different source unit.');
    }

    const lineageBasisKey = request.lineageSourceUnitKey || key;
    const predecessor = request.lineageSourceUnitKey
      ? this.bySourceUnit.get(request.lineageSourceUnitKey) : null;
    if (request.lineageSourceUnitKey && !predecessor)
      return shell('BLOCKED', 'Explicit predecessor source unit was not found.');

    // All conflicts are checked before counters or indexes change: one synchronous fixture transaction.
    let publicationSequence = this.nextPublication;
    while (!claimedId && this.byPublicationId.has(governedId('P', publicationSequence)))
      publicationSequence++;
    const publicationId = claimedId || governedId('P', publicationSequence);
    const lineageId = predecessor ? predecessor.editionLineageId : governedId('L', this.nextLineage);
    if (this.byPublicationId.has(publicationId))
      return shell('COLLISION_REVIEW', 'Publication ID is already assigned.');
    const identity = {
      sourceUnitKey: key, gpirPublicationId: publicationId, editionLineageId: lineageId,
      publicationType: request.publicationType,
      sourceLegacyPath: request.sourceLegacyPath || null,
      sourceHash: request.sourceHash || null,
      sourceNativeIds: claimedId ? [claimedId] : [],
      relatedObjectIds,
      assignmentMethod: claimedId ? 'source-native' : 'governed-sequence',
      assignmentTimestamp: this.now(),
      identityStatus: claimedId ? 'SOURCE_NATIVE' : 'GOVERNED_ASSIGNED',
      testIdentityOnly: true,
      collisionState: 'none', lineageBasisKey,
      previousPublicationId: predecessor?.gpirPublicationId || null,
      reason: null
    };
    this.bySourceUnit.set(key, identity);
    this.byPublicationId.set(publicationId, key);
    if (!claimedId) this.nextPublication = publicationSequence + 1;
    if (!predecessor) this.nextLineage++;
    return clone(identity);
  }
}

function contentfulIdentityEligible(identity, { testIdentityOnly = false } = {}) {
  return !testIdentityOnly && !identity?.testIdentityOnly && Boolean(identity?.gpirPublicationId) &&
    ['SOURCE_NATIVE', 'GOVERNED_ASSIGNED'].includes(identity.identityStatus);
}

function resolveIdentity(normalizedRecord, request, registry) {
  if (!normalizedRecord || !registry || typeof registry.resolve !== 'function')
    throw new TypeError('Normalized record and registry adapter are required.');
  const relatedObjectIds = [
    ...(normalizedRecord.referencedPublicationIds || []).map(value => ({
      type: 'dashboard-reference', value, evidence: 'Source Reference ID'
    })),
    ...(request?.relatedObjectIds || [])
  ];
  const identity = registry.resolve({
    ...request,
    publicationType: request?.publicationType || normalizedRecord.family,
    sourceLegacyPath: normalizedRecord.provenance?.sourcePath,
    sourceHash: normalizedRecord.provenance?.sourceHash,
    relatedObjectIds
  });
  const record = clone(normalizedRecord);
  if (identity.gpirPublicationId) {
    record.gpirPublicationId = identity.gpirPublicationId;
    record.lineage = { ...record.lineage, editionId: identity.editionLineageId };
  }
  // Fixture IDs travel for review but remain provisional to the existing Draft Factory.
  record.identityStatus = 'provisional';
  return {
    identity, normalizedRecord: record,
    TEST_IDENTITY_ONLY: true,
    NOT_FOR_CONTENTFUL_WRITE: true,
    NOT_FOR_SUPABASE_PERSISTENCE: true,
    contentfulEligible: contentfulIdentityEligible(identity, { testIdentityOnly: true })
  };
}

module.exports = { InMemoryIdentityRegistry, resolveIdentity, contentfulIdentityEligible,
  checkDigit, governedId, validGovernedId };
