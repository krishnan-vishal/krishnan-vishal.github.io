'use strict';

const { validGovernedId } = require('./identity-authority');

const TYPE_LABELS = Object.freeze({
  country: 'Country Intelligence',
  'regional-directory': 'Regional Directory',
  'research-publication': 'Research Publication',
  'research-chapter': 'Research Chapter'
});

const WARNING_DETAILS = Object.freeze({
  ASSET_MISSING: ['W1', 'dashboardAsset', 'Asset reviewer'],
  IDENTITY_DERIVED: ['W2', 'gpirPublicationId', 'Migration identity owner'],
  IDENTITY_CONFLICT: ['W2', 'gpirPublicationId', 'Migration identity owner'],
  SOURCE_VERIFICATION_PENDING: ['W3', 'sourceValidationSummary', 'Source reviewer'],
  DATA_UNDER_DEVELOPMENT: ['W4', 'structuredIntelligence', 'Structured-data reviewer'],
  FORECAST_REVIEW: ['W5', 'structuredIntelligence', 'Forecast reviewer'],
  STRUCTURED_REVIEW_REQUIRED: ['W7', 'structuredIntelligence', 'Structured-data reviewer']
});

function dateOnly(value) {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value);
  if (!match) return null;
  const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december'].indexOf(match[2].toLowerCase()) + 1;
  if (!month) return null;
  const day = Number(match[1]);
  const year = Number(match[3]);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day)
    return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function richText(paragraphs) {
  return { nodeType: 'document', data: {}, content: paragraphs.map(value => ({
    nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value, marks: [], data: {} }]
  })) };
}

// supabaseRecordId is exclusively public.gpir_identity_publications.id (UUID).
function buildContentfulDraft(record, { identityPackage = null } = {}) {
  if (!record || typeof record !== 'object' || record.schemaVersion !== '1.0.0')
    throw new TypeError('A normalized M35 migration record is required.');
  const publication = record.publication || {};
  const provenance = record.provenance || {};
  const lineage = record.lineage || {};
  const warnings = Array.isArray(record.exceptions?.warnings) ? record.exceptions.warnings : [];
  const candidates = Array.isArray(record.structuredIntelligence) ? record.structuredIntelligence : [];
  const mappingGaps = [];
  const gap = (field, reason, authority) => mappingGaps.push({ field, reason, authority });
  const durableId = record.identityStatus === 'verified' || record.identityStatus === 'mapped'
    ? record.gpirPublicationId : null;
  if (!durableId) gap('gpirPublicationId', 'Page identity is provisional; referenced IDs may describe a different publication.', 'Migration identity owner');

  const type = TYPE_LABELS[publication.type] || null;
  if (!type) gap('publicationType', 'Destination publication vocabulary is unresolved.', 'Editorial mapper');
  const status = typeof publication.status === 'string' && publication.status.trim()
    ? publication.status.trim() : null;
  if (!status) gap('publicationStatus', 'Business publication status lacks source evidence.', 'Editorial mapper');
  if (record.family === 'country' && !publication.region)
    gap('region', 'Country region is not evidence-backed in the normalized record.', 'Migration mapper');
  if (record.family === 'country' && !publication.countryMarket)
    gap('countryMarket', 'Country/market identity is unresolved.', 'Migration mapper');
  if (record.family === 'country' && !publication.directionScope)
    gap('directionScope', 'Payment direction lacks explicit source evidence.', 'Structured-data reviewer');
  if (record.family === 'country' && !publication.useCase)
    gap('useCasePaymentCategory', 'Payment category lacks explicit source evidence.', 'Structured-data reviewer');
  const publicationDate = dateOnly(publication.publicationDate);
  // Internal migration spelling is dataCutoffDate; live Contentful spelling is dataCutOffDate.
  const dataCutOffDate = dateOnly(publication.dataCutoffDate);
  if (!dataCutOffDate) gap('dataCutOffDate', 'A data period does not establish an exact cut-off date.', 'Data steward');
  if (!provenance.sourceUrl) gap('legacySourceUrl', 'The source contains no legacy URL.', 'Migration mapper');
  if (!lineage.editionId) gap('editionLineageId', 'Durable edition/lineage ID is unresolved.', 'Lineage owner');
  let supabaseRecordId = null;
  if (identityPackage !== null) {
    const uuid = identityPackage.publicationRowId;
    const sourceNative = identityPackage.identityStatus === 'SOURCE_NATIVE';
    const validPublication = sourceNative
      ? /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(durableId || '') &&
        !/^VK-GPIR-[PL]-\d{12}-\d$/.test(durableId) &&
        !(record.referencedPublicationIds || []).includes(durableId)
      : /^VK-GPIR-P-\d{12}-\d$/.test(durableId || '') && validGovernedId(durableId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid || '') ||
        identityPackage.gpirPublicationId !== durableId ||
        identityPackage.editionLineageId !== lineage.editionId ||
        !validPublication ||
        !/^VK-GPIR-L-\d{12}-\d$/.test(lineage.editionId || '') ||
        !validGovernedId(lineage.editionId))
      throw new TypeError('supabaseRecordId requires the matching authoritative publication-row UUID and governed identities.');
    supabaseRecordId = uuid;
  } else {
    gap('supabaseRecordId', 'No authoritative Supabase publication-row UUID is present.', 'Supabase data steward');
  }

  const mediaAssociations = (record.assetStatus || []).map(asset => ({
    reference: asset.reference,
    relatedPublicationIds: [...(record.referencedPublicationIds || [])],
    status: asset.status === 'missing' ? 'unresolved-missing' : 'unresolved-reference',
    uploadPlanned: false
  }));
  if (mediaAssociations.length)
    gap('dashboardAsset', 'Media reference requires a reviewed Contentful asset association; no asset was created.', 'Asset reviewer');

  const narrative = record.editorialNarrative || [];
  const sourceSectionIndex = narrative.findIndex(text =>
    /^(?:Sources & Verification Status|References & Bibliography)$/i.test(String(text).trim()));
  const editorialParagraphs = (sourceSectionIndex < 0 ? narrative : narrative.slice(0, sourceSectionIndex)).filter(text =>
    typeof text === 'string' && text.trim() &&
    !/^(?:Source:|Primary:|Secondary:|Sources & Verification Status|References & Bibliography)/i.test(text.trim()) &&
    !(record.provenance?.sourceReferences || []).includes(text));
  const structuredReviewCount = candidates.filter(item => item.reviewRequired).length;
  const warningCodes = warnings.map(item => item.code);
  const sourceValidationSummary = [
    `Source: ${provenance.sourcePath || 'unresolved'}`,
    `SHA-256: ${provenance.sourceHash || 'unresolved'}`,
    `Validation: ${record.validationStatus || 'FAIL'}`,
    `Warnings: ${warningCodes.length ? warningCodes.join(', ') : 'none'}`,
    `Structured candidates requiring review: ${structuredReviewCount}/${candidates.length}`
  ].join('; ');
  const fields = {
    gpirPublicationId: durableId,
    publicationTitle: publication.title || null,
    slug: publication.slug || null,
    publicationType: type,
    publicationStatus: status,
    region: publication.region || null,
    countryMarket: publication.countryMarket || null,
    directionScope: publication.directionScope || null,
    useCasePaymentCategory: publication.useCase || null,
    publicationDate,
    dataCutOffDate,
    executiveSummary: record.executiveSummary || null,
    editorialBody: richText(editorialParagraphs),
    dashboardAsset: null,
    sourceValidationSummary,
    legacySourceUrl: provenance.sourceUrl ?? null,
    canonicalUrlCandidate: record.canonicalUrlCandidate ?? null,
    editionLineageId: durableId && lineage.editionId ? lineage.editionId : null,
    editionLabel: lineage.editionLabel || null,
    supabaseRecordId,
    migrationStatus: 'Dry Run Prepared',
    validationStatus: record.validationStatus || 'FAIL'
  };
  const migrationWarnings = warnings.map(warning => {
    const [warningClass, affectedField, reviewer] = WARNING_DETAILS[warning.code]
      || ['W7', 'sourceValidationSummary', 'Migration reviewer'];
    return { code: warning.code, warningClass, affectedField, reason: warning.message, reviewer };
  });
  const reviewRequired = migrationWarnings.length > 0 || mappingGaps.length > 0 ||
    structuredReviewCount > 0 || fields.validationStatus !== 'PASS';
  return {
    schemaVersion: '1.0.0',
    contentType: 'GPIR Publication',
    technicalState: 'Draft',
    fields,
    mediaAssociations,
    migrationWarnings,
    mappingGaps,
    reviewRequired,
    publishEligible: false,
    sourceRecordIdentity: {
      sourcePath: provenance.sourcePath || null,
      sourceHash: provenance.sourceHash || null,
      identityStatus: record.identityStatus || 'provisional',
      provisionalId: record.identityStatus === 'provisional' ? record.gpirPublicationId : null,
      referencedPublicationIds: [...(record.referencedPublicationIds || [])],
      dataPeriod: publication.dataCutoffDate || null,
      version: lineage.version || null
    }
  };
}

function compareGoldenEvidence(draft, golden) {
  if (!draft || !golden || typeof golden !== 'object') throw new TypeError('Draft and golden evidence are required.');
  const result = {};
  for (const [field, expected] of Object.entries(golden)) {
    if (field === 'dashboardReferenceId') {
      result[field] = draft.sourceRecordIdentity.referencedPublicationIds.includes(expected)
        ? 'MATCH' : 'NOT_SOURCE_SUPPORTED';
      continue;
    }
    if (field === 'outlook') {
      result[field] = 'NOT_SOURCE_SUPPORTED';
      continue;
    }
    const actual = field === 'dataPeriod' || field === 'version'
      ? draft.sourceRecordIdentity[field]
      : draft.fields[field];
    if (field === 'gpirPublicationId' && !actual &&
      draft.sourceRecordIdentity.referencedPublicationIds.includes(expected)) {
      result[field] = 'PARTIAL_MATCH';
    } else if (actual === null || actual === undefined) {
      result[field] = 'MAPPING_REQUIRED';
    } else {
      const comparable = value => String(value).toLowerCase().replace(/[–—]/g, '-').replace(/&ndash;/g, '-')
        .replace(/[,\s]+/g, ' ').trim();
      const left = field === 'publicationDate' ? dateOnly(actual) : comparable(actual);
      const right = field === 'publicationDate' ? dateOnly(expected) : comparable(expected);
      result[field] = left === right ? 'MATCH' : 'NOT_SOURCE_SUPPORTED';
    }
  }
  return result;
}

module.exports = { buildContentfulDraft, compareGoldenEvidence };
