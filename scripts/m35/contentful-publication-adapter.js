'use strict';

const CANONICAL_ORIGIN = 'https://fintechoisis.com';
const REQUIRED_FIELDS = Object.freeze([
  'gpirPublicationId', 'editionLineageId', 'supabaseRecordId',
  'publicationTitle', 'publicationType', 'canonicalUrlCandidate',
  'executiveSummary', 'editorialBody'
]);

function scalar(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function optionalString(fields, name) {
  const value = scalar(fields[name]);
  return typeof value === 'string' ? value : null;
}

function canonicalPath(value) {
  if (typeof value !== 'string') throw new Error('A governed canonical path is required.');
  let route = value.trim();
  if (!route.startsWith('/') || route.startsWith('//') || /[?#]/.test(route) || route.includes('..'))
    throw new Error(`Invalid governed canonical path: ${route || '<empty>'}`);
  route = route.replace(/\/+/g, '/');
  if (!route.endsWith('/')) route += '/';
  if (route === '/') throw new Error('A publication cannot claim the homepage route.');
  return route;
}

function dashboardAssetState(value) {
  const id = value?.sys?.id || value?.sys?.urn || null;
  return Object.freeze({
    state: id ? 'REFERENCE_REQUIRES_RESOLUTION' : 'NONE',
    referenceId: id,
    renderable: false
  });
}

function adaptPublication(record) {
  if (!record || typeof record !== 'object' || !record.fields || typeof record.fields !== 'object')
    throw new TypeError('A Contentful publication record with fields is required.');
  const fields = record.fields;
  const missing = REQUIRED_FIELDS.filter(name => {
    const value = fields[name];
    return value == null || (typeof value === 'string' && !value.trim());
  });
  if (missing.length) throw new Error(`Missing required governed publication fields: ${missing.join(', ')}`);

  const route = canonicalPath(optionalString(fields, 'canonicalUrlCandidate'));
  const identity = optionalString(fields, 'gpirPublicationId');
  const lineage = optionalString(fields, 'editionLineageId');
  const supabaseRecordId = optionalString(fields, 'supabaseRecordId');
  if (!identity || !lineage || !supabaseRecordId)
    throw new Error('Governed publication, lineage and Supabase identities are required.');

  return Object.freeze({
    schemaVersion: '1.0.0',
    entryId: record.entryId || null,
    identity,
    lineage,
    supabaseRecordId,
    title: optionalString(fields, 'publicationTitle'),
    publicationType: optionalString(fields, 'publicationType'),
    publicationStatus: optionalString(fields, 'publicationStatus'),
    publicationDate: optionalString(fields, 'publicationDate'),
    editionLabel: optionalString(fields, 'editionLabel'),
    market: optionalString(fields, 'countryMarket'),
    region: optionalString(fields, 'region'),
    directionScope: optionalString(fields, 'directionScope'),
    useCasePaymentCategory: optionalString(fields, 'useCasePaymentCategory'),
    route,
    canonicalUrl: `${CANONICAL_ORIGIN}${route}`,
    summary: optionalString(fields, 'executiveSummary'),
    body: fields.editorialBody,
    provenance: Object.freeze({
      legacySourceUrl: optionalString(fields, 'legacySourceUrl'),
      validationSummary: optionalString(fields, 'sourceValidationSummary')
    }),
    internal: Object.freeze({
      migrationStatus: optionalString(fields, 'migrationStatus'),
      validationStatus: optionalString(fields, 'validationStatus'),
      asset: dashboardAssetState(fields.dashboardAsset)
    }),
    auth: Object.freeze({
      authority: 'supabase',
      entitlement: 'gpir-publication',
      publicationId: identity,
      supabaseRecordId
    })
  });
}

function adaptEstate(records) {
  if (!Array.isArray(records)) throw new TypeError('Contentful records must be an array.');
  const publications = records.map(adaptPublication).sort((a, b) => a.route.localeCompare(b.route, 'en'));
  const routes = new Map();
  for (const publication of publications) {
    if (routes.has(publication.route))
      throw new Error(`Duplicate governed canonical route: ${publication.route}`);
    routes.set(publication.route, publication);
  }
  return Object.freeze({
    publications: Object.freeze(publications),
    routes,
    resolve(pathname) {
      try { return routes.get(canonicalPath(pathname)) || null; }
      catch { return null; }
    }
  });
}

module.exports = { CANONICAL_ORIGIN, adaptEstate, adaptPublication, canonicalPath, scalar };
