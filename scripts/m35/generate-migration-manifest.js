'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { convertLegacyContent } = require('./convert-legacy-content');
const { buildContentfulDraft } = require('./build-contentful-draft');
const { planIdentity } = require('./supabase-identity-adapter');
const { classifyMigrationReadiness, unresolvedRequiredFields,
  substantiveWarnings, effectiveValidationStatus } = require('./classify-migration-readiness');
const { reconcileIdentityRows } = require('./reconcile-identity-registry');

const DISCOVERY_STATES = [
  'MIGRATION_ELIGIBLE', 'APPLICATION_SHELL', 'NAVIGATION_OR_INDEX',
  'REDIRECT_OR_ALIAS', 'HISTORICAL_CONTENT', 'NON_PUBLICATION', 'REVIEW_DISCOVERY'
];
const READINESS_STATES = [
  'READY', 'REVIEW_REQUIRED', 'BLOCKED_REQUIRED_FIELD', 'IDENTITY_CONFLICT'
];
const ACTIONS = ['RECONCILE_EXISTING_DRAFT', 'CREATE_DRAFT', 'REVIEW', 'BLOCK'];

function htmlPaths(root) {
  const result = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.isDirectory()) {
        if (!['.git', 'node_modules', 'artifacts'].includes(entry.name))
          visit(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        result.push(path.relative(root, path.join(dir, entry.name)).replace(/\\/g, '/'));
      }
    }
  }
  visit(root);
  return result.sort();
}

function discover(sourcePath, html) {
  if (!html.trim()) return { state: 'NON_PUBLICATION', reasonCodes: ['EMPTY_PLACEHOLDER'] };
  if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(html) ||
      /(?:window\.)?location\.(?:replace|assign)\s*\(/i.test(html))
    return { state: 'REDIRECT_OR_ALIAS', reasonCodes: ['EXPLICIT_REDIRECT'] };
  if (/^Archive\/index[^/]*\.html$/i.test(sourcePath))
    return { state: 'HISTORICAL_CONTENT', reasonCodes: ['ARCHIVED_SITE_INDEX_NON_PUBLICATION'] };
  if (sourcePath === 'index.html')
    return { state: 'NAVIGATION_OR_INDEX', reasonCodes: ['SITE_INDEX'] };
  if (sourcePath === '404.html' || sourcePath === 'pages/template.html' ||
      sourcePath.startsWith('assets/'))
    return { state: 'APPLICATION_SHELL', reasonCodes: ['SHELL_OR_TEMPLATE'] };
  if (/\bdata-gpir-entitlement=["']gpir-publication["']/i.test(html) &&
      /\bdata-gpir-edge-endpoint=/i.test(html))
    return { state: 'APPLICATION_SHELL', reasonCodes: ['GENERATED_GOVERNED_PUBLICATION_SHELL'] };
  if (sourcePath.startsWith('pages/legal/'))
    return { state: 'NON_PUBLICATION', reasonCodes: ['LEGAL_PAGE'] };
  if (/^pages\/(?:fx|intelligence)\//.test(sourcePath))
    return { state: 'NON_PUBLICATION', reasonCodes: ['OUT_OF_SCOPE_APPLICATION_PAGE'] };
  if (/^pages\/(?:chapters|countries|regions|research)\/[^/]+\.html$/.test(sourcePath))
    return { state: 'MIGRATION_ELIGIBLE', reasonCodes: ['PUBLICATION_PATH_AND_CONTENT'] };
  return { state: 'REVIEW_DISCOVERY', reasonCodes: ['UNCLASSIFIED_HTML_SOURCE'] };
}

function sourceUnitKey(sourcePath) {
  const match = /^pages\/(chapters|countries|regions|research)\/([a-z0-9-]+)\.html$/.exec(sourcePath);
  if (!match) throw new TypeError('Eligible publication path required.');
  const kind = { chapters: 'chapter', countries: 'country', regions: 'region', research: 'research' }[match[1]];
  return `gpir:intake:publication:${kind}:${match[2]}:html:legacy-primary`;
}

function evidence(value, basis) {
  return value == null ? null : { basis, value };
}

function reasonCodes(record, draft, identityPlan, classification, blockingFields) {
  const codes = new Set();
  for (const item of substantiveWarnings(record)) codes.add(item.code);
  for (const item of record.exceptions?.errors || []) codes.add(item.code);
  for (const gap of draft.mappingGaps || []) {
    if (['gpirPublicationId', 'editionLineageId', 'supabaseRecordId'].includes(gap.field)) continue;
    codes.add(`FIELD_UNRESOLVED_${gap.field.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`);
  }
  if (identityPlan.existingIdentityFound === 'UNKNOWN') codes.add('IDENTITY_REGISTRY_UNCHECKED');
  for (const field of blockingFields)
    codes.add(`BLOCKING_FIELD_${field.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`);
  if (classification === 'IDENTITY_CONFLICT') codes.add('IDENTITY_EVIDENCE_CONFLICT');
  return [...codes].sort();
}

function regionalTaxonomy(root, paths) {
  const labels = { apac: 'APAC', europe: 'Europe', 'middle-east': 'Middle East',
    africa: 'Africa', americas: 'Americas', latam: 'LATAM' };
  const membership = new Map();
  for (const sourcePath of paths.filter(p => p.startsWith('pages/regions/'))) {
    const region = labels[path.basename(sourcePath, '.html')];
    if (!region) continue;
    const html = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    for (const tile of html.matchAll(/<a\b[^>]*class=["'][^"']*directory-tile[^"']*["'][^>]*>/gi)) {
      const country = /\bhref=["']\.\.\/countries\/([a-z0-9-]+)\.html["']/i.exec(tile[0])?.[1];
      if (!country) continue;
      const list = membership.get(country) || [];
      list.push({ region, sourcePath });
      membership.set(country, list);
    }
  }
  return membership;
}

function makeRecord(sourcePath, html, taxonomy) {
  const country = /^pages\/countries\/([a-z0-9-]+)\.html$/.exec(sourcePath)?.[1];
  const regions = country ? taxonomy.get(country) || [] : [];
  const region = regions.length === 1 ? regions[0].region : null;
  const normalized = convertLegacyContent({ sourcePath, content: html,
    metadata: region ? { region } : {} });
  const draft = buildContentfulDraft(normalized, { legacyMigration: true });
  const key = sourceUnitKey(sourcePath);
  const identityPlan = planIdentity(normalized, { sourceUnitKey: key,
    intakeEvidence: { controlledSourceUnit: true,
      basis: 'Deterministic repository path candidate; registry reconciliation required before allocation.' } });
  const contentReadiness = classifyMigrationReadiness(normalized, draft, null,
    { allowPendingIdentity: true, legacyMigration: true, contentOnly: true });
  const blockingFields = unresolvedRequiredFields(normalized, draft,
    { allowPendingIdentity: true, legacyMigration: true });
  const fields = draft.fields;
  const reason = reasonCodes(normalized, draft, identityPlan, contentReadiness,
    blockingFields);
  if (normalized.publication.status === null) {
    reason.push('LEGACY_LIFECYCLE_NOT_EVIDENCED');
    reason.sort();
  }
  const reviewFlags = reason.filter(code => [
    'SOURCE_VERIFICATION_PENDING', 'DATA_UNDER_DEVELOPMENT',
    'FIELD_UNRESOLVED_DASHBOARD_ASSET', 'FORECAST_REVIEW',
    'STRUCTURED_REVIEW_REQUIRED', 'FIELD_UNRESOLVED_DATA_CUT_OFF_DATE'
  ].includes(code));
  const migrationAction = contentReadiness === 'BLOCKED_REQUIRED_FIELD' ||
    contentReadiness === 'IDENTITY_CONFLICT' ? 'BLOCK' : 'REVIEW';
  return {
    sourcePath, sourceUnitKey: key, sourceUnitKeyBasis: identityPlan.sourceUnitKeyBasis,
    title: normalized.publication.title || null, slug: normalized.publication.slug || null,
    publicationType: normalized.publication.type || null,
    publicationStatus: { value: fields.publicationStatus,
      evidenceType: normalized.publication.statusEvidence?.evidenceType || null,
      evidenceLocation: normalized.publication.statusEvidence?.evidenceLocation || null,
      mappingRule: normalized.publication.statusEvidence?.mappingRule || null },
    region: normalized.publication.region || null,
    countryMarket: normalized.publication.countryMarket || null,
    directionScope: normalized.publication.directionScope || null,
    useCasePaymentCategory: normalized.publication.useCase || null,
    publicationDate: fields.publicationDate,
    publicationDateEvidence: evidence(fields.publicationDate, 'Explicit publication-level metadata'),
    editionLabel: normalized.lineage.editionLabel,
    editionLabelEvidence: evidence(normalized.lineage.editionLabel, 'Authored/source edition evidence'),
    dataCutOffDate: fields.dataCutOffDate,
    dataPeriod: normalized.publication.dataCutoffDate && !fields.dataCutOffDate
      ? normalized.publication.dataCutoffDate : null,
    publicationIdentity: identityPlan.existingGpirPublicationId ||
      identityPlan.claimedSourceNativePublicationId || null,
    publicationIdentityState: identityPlan.existingIdentityFound === 'UNKNOWN'
      ? 'REGISTRY_UNCHECKED' : identityPlan.existingIdentityStatus || 'PRE_ALLOCATION',
    lineageIdentity: identityPlan.existingEditionLineageId || null,
    lineageIdentityState: identityPlan.existingIdentityFound === 'UNKNOWN'
      ? 'REGISTRY_UNCHECKED' : identityPlan.existingEditionLineageId ? 'EXISTING' : 'PRE_ALLOCATION',
    relatedIdentifiers: identityPlan.relatedObjectIds,
    contentfulEntryState: 'UNCHECKED', migrationAction,
    validationState: effectiveValidationStatus(normalized), blockingFields,
    reviewFlags,
    contentReadiness, identityReadiness: 'REGISTRY_LOOKUP_REQUIRED',
    readinessClassification: contentReadiness, reasonCodes: reason,
    provenanceSummary: { sourceHash: normalized.provenance.sourceHash,
      sourceUrl: normalized.provenance.sourceUrl,
      sourceReferencesCount: normalized.provenance.sourceReferences.length,
      identityEvidence: normalized.identityStatus,
      referencedPublicationIds: normalized.referencedPublicationIds,
      regionEvidence: regions.length === 1 ? regions[0].sourcePath : null }
  };
}

function countBy(items, key, values) {
  return Object.fromEntries(values.map(value => [value, items.filter(item => item[key] === value).length]));
}

function combineReadiness(contentReadiness, identityReadiness) {
  if (identityReadiness === 'CONFLICT') return 'IDENTITY_CONFLICT';
  if (contentReadiness === 'BLOCKED_REQUIRED_FIELD') return 'BLOCKED_REQUIRED_FIELD';
  if (identityReadiness === 'REGISTRY_LOOKUP_REQUIRED' && contentReadiness === 'READY')
    return 'REVIEW_REQUIRED';
  return contentReadiness;
}

function summarizeExceptions(manifest) {
  const aggregate = new Map();
  for (const record of manifest.records.filter(item => item.readinessClassification !== 'READY')) {
    for (const reasonCode of record.reasonCodes) {
      const item = aggregate.get(reasonCode) || { reasonCode, recordCount: 0,
        classification: {}, publicationFamilies: {} };
      item.recordCount++;
      item.classification[record.readinessClassification] =
        (item.classification[record.readinessClassification] || 0) + 1;
      item.publicationFamilies[record.publicationType] =
        (item.publicationFamilies[record.publicationType] || 0) + 1;
      aggregate.set(reasonCode, item);
    }
  }
  const reasonCodes = [...aggregate.values()].sort((a, b) =>
    a.reasonCode.localeCompare(b.reasonCode)).map(item => ({
      ...item,
      percentageOfEligibleEstate: Number((100 * item.recordCount /
        manifest.records.length).toFixed(2)),
      systemicCandidate: item.recordCount > 1
    }));
  const blockingFields = {};
  for (const record of manifest.records) for (const field of record.blockingFields) {
    blockingFields[field] = (blockingFields[field] || 0) + 1;
  }
  const reviewFlags = {};
  for (const record of manifest.records) for (const code of record.reviewFlags) {
    reviewFlags[code] = (reviewFlags[code] || 0) + 1;
  }
  return {
    schemaVersion: '1.0.0', eligibleEstate: manifest.records.length,
    exceptionClasses: manifest.summary.classification,
    discovery: { emptySourcesReviewedStructurally: manifest.summary.emptyPlaceholdersExcluded,
      emptyPlaceholdersExcluded: manifest.summary.emptyPlaceholdersExcluded,
      stillRequiringHumanReview: manifest.summary.discovery.REVIEW_DISCOVERY },
    blockingFields, reviewFlags,
    fieldContract: {
      publicationDate: 'OPTIONAL', editionLabel: 'OPTIONAL',
      publicationStatus: 'LEGACY_NULL_GOVERNED_WITH_PROVENANCE; NEW_PUBLICATION_REQUIRES_LIFECYCLE',
      directionScope: 'CONDITIONAL_ON_SOURCE_DIRECTIONAL_SCOPE',
      useCasePaymentCategory: 'CONDITIONAL_ON_SOURCE_PAYMENT_CATEGORY',
      dataCutOffDate: 'NON_BLOCKING_MAPPING_GAP',
      dashboardAsset: 'NON_BLOCKING_MAPPING_GAP',
      legacySourceUrl: 'NON_BLOCKING_MAPPING_GAP'
    },
    identityReconciliation: manifest.summary.identityReconciliation,
    reasonCodes
  };
}

function generateManifest(root, { identityRows = null } = {}) {
  const discovery = [];
  const records = [];
  const paths = htmlPaths(root);
  const taxonomy = regionalTaxonomy(root, paths);
  for (const sourcePath of paths) {
    const html = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    const result = discover(sourcePath, html);
    discovery.push({ sourcePath, ...result });
    if (result.state === 'MIGRATION_ELIGIBLE') records.push(makeRecord(sourcePath, html, taxonomy));
  }
  const identityByKey = reconcileIdentityRows(records, identityRows);
  for (const record of records) {
    const registry = identityByKey[record.sourceUnitKey];
    record.registryLookupState = registry.state;
    record.identityActionForF4K = registry.identityActionForF4K;
    record.identityReadiness = registry.state === 'EXISTING_GOVERNED_IDENTITY'
      ? 'EXISTING_IDENTITY' : registry.state === 'NO_EXISTING_IDENTITY'
        ? 'ALLOCATION_REQUIRED' : registry.state === 'IDENTITY_COLLISION_OR_CONFLICT'
          ? 'CONFLICT' : 'REGISTRY_LOOKUP_REQUIRED';
    record.publicationUuid = registry.publicationUuid;
    record.registryAssignmentState = registry.registryAssignmentState;
    if (registry.state === 'EXISTING_GOVERNED_IDENTITY') {
      record.publicationIdentity = registry.publicationIdentity;
      record.publicationIdentityState = registry.state;
      record.lineageIdentity = registry.lineageIdentity;
      record.lineageIdentityState = registry.state;
      record.reasonCodes = record.reasonCodes.filter(code => code !== 'IDENTITY_REGISTRY_UNCHECKED');
    } else if (registry.state === 'NO_EXISTING_IDENTITY') {
      record.publicationIdentityState = 'PRE_ALLOCATION';
      record.lineageIdentityState = 'PRE_ALLOCATION';
      record.reasonCodes = record.reasonCodes.filter(code => code !== 'IDENTITY_REGISTRY_UNCHECKED');
      record.reasonCodes.push('IDENTITY_ALLOCATION_REQUIRED');
      record.reasonCodes.sort();
    } else if (registry.state === 'IDENTITY_COLLISION_OR_CONFLICT') {
      record.publicationIdentity = null;
      record.publicationIdentityState = registry.state;
      record.lineageIdentityState = registry.state;
      record.migrationAction = 'BLOCK';
      record.reasonCodes = record.reasonCodes.filter(code => code !== 'IDENTITY_REGISTRY_UNCHECKED');
      record.reasonCodes.push('IDENTITY_EVIDENCE_CONFLICT');
      record.reasonCodes.sort();
    } else {
      record.reasonCodes = record.reasonCodes.filter(code => code !== 'IDENTITY_REGISTRY_UNCHECKED');
      record.reasonCodes.push('REGISTRY_LOOKUP_UNAVAILABLE');
      record.reasonCodes.sort();
    }
    record.readinessClassification = combineReadiness(record.contentReadiness,
      record.identityReadiness);
  }
  const summary = {
    HTML_DISCOVERED_TOTAL: discovery.length,
    discovery: countBy(discovery, 'state', DISCOVERY_STATES),
    classification: countBy(records, 'readinessClassification', READINESS_STATES),
    contentReadiness: countBy(records, 'contentReadiness',
      ['READY', 'REVIEW_REQUIRED', 'BLOCKED_REQUIRED_FIELD']),
    publicationStatusResolution: {
      CURRENT: records.filter(record => record.publicationStatus.value === 'CURRENT').length,
      HISTORICAL: records.filter(record => record.publicationStatus.value === 'HISTORICAL').length,
      unresolved: records.filter(record => record.publicationStatus.value === null).length
    },
    identityReadiness: countBy(records, 'identityReadiness',
      ['EXISTING_IDENTITY', 'ALLOCATION_REQUIRED', 'CONFLICT', 'REGISTRY_LOOKUP_REQUIRED']),
    migrationActions: countBy(records, 'migrationAction', ACTIONS),
    identityReconciliation: countBy(records, 'registryLookupState', [
      'EXISTING_GOVERNED_IDENTITY', 'NO_EXISTING_IDENTITY',
      'IDENTITY_COLLISION_OR_CONFLICT', 'REGISTRY_LOOKUP_UNAVAILABLE'
    ]),
    emptyPlaceholdersExcluded: discovery.filter(item =>
      item.reasonCodes.includes('EMPTY_PLACEHOLDER')).length
  };
  const manifest = { schemaVersion: '1.0.0', summary, discovery, records };
  const exceptions = {
    schemaVersion: '1.0.0', summary: {
      REVIEW_REQUIRED: summary.classification.REVIEW_REQUIRED,
      BLOCKED_REQUIRED_FIELD: summary.classification.BLOCKED_REQUIRED_FIELD,
      IDENTITY_CONFLICT: summary.classification.IDENTITY_CONFLICT,
      REVIEW_DISCOVERY: summary.discovery.REVIEW_DISCOVERY
    },
    records: records.filter(record => record.readinessClassification !== 'READY')
      .map(({ sourcePath, sourceUnitKey, readinessClassification, migrationAction, reasonCodes }) =>
        ({ sourcePath, sourceUnitKey, readinessClassification, migrationAction, reasonCodes })),
    discovery: discovery.filter(item => item.state === 'REVIEW_DISCOVERY')
  };
  return { manifest, exceptions, exceptionSummary: summarizeExceptions(manifest) };
}

async function generateManifestWithRegistry(root, capability) {
  if (typeof capability?.readIdentities !== 'function') return generateManifest(root);
  const initial = generateManifest(root);
  const keys = initial.manifest.records.map(record => record.sourceUnitKey);
  const rows = await capability.readIdentities(keys);
  return generateManifest(root, { identityRows: rows });
}

function writeArtifacts(root) {
  const output = generateManifest(root);
  const target = path.join(root, 'artifacts', 'm35');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'migration-manifest.json'), JSON.stringify(output.manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(target, 'migration-exceptions.json'), JSON.stringify(output.exceptions, null, 2) + '\n');
  fs.writeFileSync(path.join(target, 'migration-exception-summary.json'),
    JSON.stringify(output.exceptionSummary, null, 2) + '\n');
  return output;
}

if (require.main === module) writeArtifacts(path.resolve(__dirname, '../..'));

module.exports = { htmlPaths, discover, regionalTaxonomy, sourceUnitKey,
  combineReadiness, summarizeExceptions, generateManifest, generateManifestWithRegistry,
  writeArtifacts };
