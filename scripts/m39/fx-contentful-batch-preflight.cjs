'use strict';

// Owner-authorized M39 FX Contentful release. Supabase identity and access
// authority are read back before any CMS write. Contentful operations are
// idempotent by governed publication ID, canonical route and deterministic
// technical entry ID.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const manifestPath = path.join(root, 'artifacts/m39/fx-contentful-batch.json');
const reportPath = path.join(root, 'artifacts/m39/fx-contentful-publication-report.json');
const configPath = path.join(root, 'assets/data/fx/fx-config.json');
const locale = 'en-US';
const expectedSpace = 'zym0dk277ju5';
const expectedEnvironment = 'master';
const contentTypeId = 'gpirPublication';
const supabaseRoot = 'https://qlnvhfapctcpzqyuhhth.supabase.co';

function scalar(value) {
  return value?.[locale];
}

function isNonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').toUpperCase();
}

function exactSet(actual, expected, label) {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  if (left.length !== actual.length || JSON.stringify(left) !== JSON.stringify(right))
    throw new Error(`${label} does not match the exact governed set.`);
}

function validateManifest() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (manifest.schemaVersion !== '2.0' || manifest.milestone !== 'M39-FX-CONTENTFUL-25-PAIR' ||
      manifest.contentful?.spaceId !== expectedSpace ||
      manifest.contentful?.environment !== expectedEnvironment ||
      manifest.contentful?.contentType !== contentTypeId || manifest.contentful?.locale !== locale ||
      !Array.isArray(manifest.entries) || manifest.entries.length !== 25)
    throw new Error('Invalid or unpinned M39 FX publication manifest.');

  const expectedPairs = config.featuredPairs.filter(pair => pair !== 'USD/JPY');
  exactSet(manifest.entries.map(entry => entry.pair), expectedPairs, 'M39 FX pair set');
  for (const field of ['publicationIdentity', 'editionLineageId', 'supabaseRecordId',
    'contentfulEntryId', 'canonicalRoute']) {
    const values = manifest.entries.map(entry => entry[field]);
    exactSet(values, values, field);
  }

  for (const entry of manifest.entries) {
    const required = ['pair', 'sourceUnitKey', 'sourceHash', 'publicationIdentity',
      'editionLineageId', 'supabaseRecordId', 'contentfulEntryId', 'canonicalRoute',
      'editorialBodySha256'];
    for (const field of required) {
      if (!isNonempty(entry[field])) throw new Error(`${entry.pair}: missing ${field}.`);
    }
    if (entry.state !== 'APPROVED_FOR_PUBLICATION' || entry.ownerApproved !== true ||
        entry.evidenceApproved !== true || entry.editorialApproval !== 'OWNER_APPROVED_2026-11-07' ||
        entry.publicationStatus !== 'CURRENT' || entry.accessClass !== 'PUBLIC' ||
        !/^VK-GPIR-P-\d{12}-\d$/.test(entry.publicationIdentity) ||
        !/^VK-GPIR-L-\d{12}-\d$/.test(entry.editionLineageId) ||
        !/^[0-9a-f-]{36}$/i.test(entry.supabaseRecordId) ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(entry.contentfulEntryId) ||
        !/^\/[a-z0-9-]+\/$/.test(entry.canonicalRoute) ||
        !/^[A-F0-9]{64}$/.test(entry.sourceHash) ||
        !/^[A-F0-9]{64}$/.test(entry.editorialBodySha256) ||
        sha256(entry.fields.editorialBody) !== entry.editorialBodySha256)
      throw new Error(`${entry.pair}: identity, approval, route or evidence hash gate failed.`);
    if (entry.fields.gpirPublicationId !== entry.publicationIdentity ||
        entry.fields.editionLineageId !== entry.editionLineageId ||
        entry.fields.supabaseRecordId !== entry.supabaseRecordId ||
        entry.fields.publicationStatus !== 'CURRENT' ||
        entry.fields.canonicalUrlCandidate !== entry.canonicalRoute ||
        entry.fields.countryMarket !== entry.pair ||
        entry.fields.directionScope !== undefined ||
        !entry.fields.publicationTitle.toUpperCase().includes(entry.pair))
      throw new Error(`${entry.pair}: Contentful field authority mismatch.`);
    if (entry.datedObservationCount === 2 &&
        !entry.fields.executiveSummary.includes('only two dated'))
      throw new Error(`${entry.pair}: limited coverage disclosure is missing.`);
  }
  if (manifest.entries.filter(entry => entry.datedObservationCount === 2).length !== 7)
    throw new Error('The verified two-observation pair count changed.');
  return manifest;
}

function requireConfiguration() {
  const required = ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID',
    'CONTENTFUL_ENVIRONMENT', 'GPIR_SUPABASE_SECRET_KEY'];
  for (const name of required) {
    if (!isNonempty(process.env[name])) throw new Error(`Missing secure configuration: ${name}`);
  }
  if (process.env.CONTENTFUL_SPACE_ID.trim() !== expectedSpace ||
      process.env.CONTENTFUL_ENVIRONMENT.trim() !== expectedEnvironment)
    throw new Error('Contentful space or environment does not match the approved release manifest.');
}

function apiRoot() {
  return `https://api.contentful.com/spaces/${encodeURIComponent(expectedSpace)}` +
    `/environments/${encodeURIComponent(expectedEnvironment)}`;
}

// Serialize all Contentful Management API requests, including collision lookups.
// Honor the space's reset header and bounded retries on transient throttling.
const contentfulDelayMs = 450;
const contentfulMaxAttempts = 8;
let contentfulQueue = Promise.resolve();
let contentfulNextRequestAt = 0;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function retryDelay(response, attempt) {
  const reset = Number(response.headers.get('x-contentful-ratelimit-reset'));
  const retryAfter = response.headers.get('retry-after');
  const seconds = retryAfter && /^\\d+(?:\\.\\d+)?$/.test(retryAfter) ? Number(retryAfter) : null;
  const explicitMs = Math.max(Number.isFinite(reset) ? reset * 1000 : 0,
    seconds === null ? 0 : seconds * 1000);
  return Math.min(60000, Math.max(1000, explicitMs || 1000 * (2 ** (attempt - 1))));
}
async function contentfulRequest(method, pathname, body = null, headers = {}, allow404 = false) {
  const run = async () => {
    for (let attempt = 1; attempt <= contentfulMaxAttempts; attempt++) {
      const pause = Math.max(0, contentfulNextRequestAt - Date.now());
      if (pause) await wait(pause);
      contentfulNextRequestAt = Date.now() + contentfulDelayMs;
      const response = await fetch(`${apiRoot()}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${process.env.CONTENTFUL_MANAGEMENT_TOKEN}`,
          Accept: 'application/vnd.contentful.management.v1+json',
          ...(body ? { 'Content-Type': 'application/vnd.contentful.management.v1+json' } : {}),
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (allow404 && response.status === 404) return null;
      const text = await response.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { message: text }; }
      if (response.status === 429 && attempt < contentfulMaxAttempts) {
        const delay = retryDelay(response, attempt);
        process.stderr.write(`Contentful throttled (${response.status}); waiting ${delay}ms before retry ${attempt + 1}/${contentfulMaxAttempts}\\n`);
        contentfulNextRequestAt = Date.now() + delay;
        continue;
      }
      if (!response.ok) {
        const details = parsed?.details?.errors?.map(error =>
          `${error.name || 'validation'}:${error.path?.join('.') || 'unknown'}:${error.value ?? ''}`).join('; ');
        throw new Error(`Contentful ${method} ${pathname} failed (${response.status}): ` +
          `${parsed?.message || text}${details ? ` — ${details}` : ''}`);
      }
      return parsed;
    }
  };
  const queued = contentfulQueue.then(run, run);
  contentfulQueue = queued.catch(() => {});
  return queued;
}

async function supabaseRequest(method, pathname, body = null) {
  const secret = process.env.GPIR_SUPABASE_SECRET_KEY;
  const requestHeaders = new Headers({ Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });
  requestHeaders.set('apikey', secret);
  const response = await fetch(`${supabaseRoot}${pathname}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok)
    throw new Error(`Supabase ${method} ${pathname} failed (${response.status}): ${parsed?.message || text}`);
  return parsed;
}

async function verifySupabaseAuthority(entries) {
  const ids = entries.map(entry => entry.supabaseRecordId);
  // Identity registry is intentionally not exposed to the workflow API role.
  // Its 25 governed assignments are independently verified by privileged review.
  // The existing publication-policy trigger enforces that each policy references
  // a valid governed identity pair. Check the authorized service-role policy readback
  // instead of widening registry permissions or invoking the CL-03C-only RPC.
  const params = new URLSearchParams({
    select: 'supabase_record_id,publication_id,access_class,status,classification_source,review_state',
    supabase_record_id: `in.(${ids.join(',')})`
  });
  const policies = await supabaseRequest('GET', `/rest/v1/gpir_publication_access_policies?${params}`);
  exactSet(policies.map(row => row.supabase_record_id), ids, 'Supabase access-policy readback');
  for (const entry of entries) {
    const policy = policies.find(row => row.supabase_record_id === entry.supabaseRecordId);
    if (policy?.publication_id !== entry.publicationIdentity || policy?.access_class !== 'PUBLIC' ||
        policy?.status !== 'ACTIVE' || policy?.review_state !== 'EVIDENCED' ||
        policy?.classification_source !== 'M39_FX_OWNER_APPROVED_CONTENTFUL_2026_11_07')
      throw new Error(`${entry.pair}: PUBLIC access-policy readback failed.`);
  }
  return { identityAuthority: 'governed-policy-identity-trigger', policies: policies.length };
}

function localizeFields(fields) {
  return Object.fromEntries(Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => [name, { [locale]: value }]));
}

function desiredFieldsMatch(actual, desired) {
  return Object.entries(desired).every(([name, localized]) =>
    JSON.stringify(actual?.[name]?.[locale]) === JSON.stringify(localized[locale]));
}

function isCurrentlyPublished(entry) {
  return Number.isInteger(entry?.sys?.publishedVersion) &&
    entry.sys.publishedVersion === entry.sys.version - 1 && !entry.sys?.archivedVersion;
}

function richTextNodeTypes(value, result = new Set()) {
  if (!value || typeof value !== 'object') return result;
  // Contentful Rich Text always permits document, paragraph and text; enabledNodeTypes
  // constrains optional block types (such as headings), not the base paragraph node.
  if (typeof value.nodeType === 'string' && !['document', 'paragraph', 'text'].includes(value.nodeType))
    result.add(value.nodeType);
  for (const child of value.content || []) richTextNodeTypes(child, result);
  return result;
}

function validateFieldValue(field, value, pair) {
  for (const validation of field.validations || []) {
    if (validation.size && typeof value === 'string') {
      if (Number.isInteger(validation.size.min) && value.length < validation.size.min ||
          Number.isInteger(validation.size.max) && value.length > validation.size.max)
        throw new Error(`${pair}: ${field.id} violates Contentful size validation.`);
    }
    if (Array.isArray(validation.in) && !validation.in.includes(value))
      throw new Error(`${pair}: ${field.id} violates Contentful vocabulary validation.`);
    if (validation.regexp?.pattern && typeof value === 'string' &&
        !new RegExp(validation.regexp.pattern, validation.regexp.flags || '').test(value))
      throw new Error(`${pair}: ${field.id} violates Contentful pattern validation.`);
    if (Array.isArray(validation.enabledNodeTypes) && field.type === 'RichText') {
      const unsupported = [...richTextNodeTypes(value)]
        .filter(nodeType => !validation.enabledNodeTypes.includes(nodeType));
      if (unsupported.length)
        throw new Error(`${pair}: ${field.id} uses unsupported RichText nodes: ${unsupported.join(', ')}.`);
    }
  }
}

async function inspectSchema(entries) {
  const type = await contentfulRequest('GET', `/content_types/${contentTypeId}`);
  const fields = new Map((type.fields || []).map(field => [field.id, field]));
  const payloadNames = [...new Set(entries.flatMap(entry => Object.keys(entry.fields)))];
  const missing = payloadNames.filter(name => !fields.has(name));
  if (missing.length) throw new Error(`Contentful model is missing fields: ${missing.join(', ')}`);
  if (fields.get('editorialBody')?.type !== 'RichText')
    throw new Error('Contentful editorialBody is not RichText.');
  const absentRequired = [...fields.values()].filter(field => field.required &&
    entries.some(entry => entry.fields[field.id] === null || entry.fields[field.id] === undefined));
  if (absentRequired.length)
    throw new Error(`Required Contentful fields are absent: ${absentRequired.map(field => field.id).join(', ')}`);
  for (const entry of entries) {
    for (const [name, value] of Object.entries(entry.fields))
      validateFieldValue(fields.get(name), value, entry.pair);
  }
  return { id: type.sys.id, version: type.sys.version, fieldCount: fields.size,
    validatedFields: payloadNames.sort() };
}

async function queryEntries(field, value) {
  const params = new URLSearchParams({ content_type: contentTypeId, [`fields.${field}`]: value, limit: '2' });
  const collection = await contentfulRequest('GET', `/entries?${params}`);
  if (!Array.isArray(collection.items)) throw new Error('Contentful returned an invalid entry collection.');
  return collection.items;
}

async function locateEntry(entry) {
  const [byIdentity, byRoute, byTechnicalId] = await Promise.all([
    queryEntries('gpirPublicationId', entry.publicationIdentity),
    queryEntries('canonicalUrlCandidate', entry.canonicalRoute),
    contentfulRequest('GET', `/entries/${encodeURIComponent(entry.contentfulEntryId)}`, null, {}, true)
  ]);
  if (byIdentity.length > 1 || byRoute.length > 1)
    throw new Error(`${entry.pair}: duplicate governed identity or canonical route exists in Contentful.`);
  const candidates = [byIdentity[0], byRoute[0], byTechnicalId].filter(Boolean);
  const ids = [...new Set(candidates.map(candidate => candidate.sys.id))];
  if (ids.length > 1)
    throw new Error(`${entry.pair}: Contentful identity, route and technical ID resolve to different entries.`);
  const existing = candidates[0] || null;
  if (existing && scalar(existing.fields?.gpirPublicationId) !== entry.publicationIdentity)
    throw new Error(`${entry.pair}: existing Contentful target belongs to another publication identity.`);
  return existing;
}

function validateReadback(item, entry, desiredFields) {
  if (item?.sys?.contentType?.sys?.id !== contentTypeId ||
      item.sys.id !== entry.contentfulEntryId ||
      !desiredFieldsMatch(item.fields, desiredFields) ||
      scalar(item.fields.gpirPublicationId) !== entry.publicationIdentity ||
      scalar(item.fields.editionLineageId) !== entry.editionLineageId ||
      scalar(item.fields.supabaseRecordId) !== entry.supabaseRecordId ||
      scalar(item.fields.publicationStatus) !== 'CURRENT' ||
      scalar(item.fields.canonicalUrlCandidate) !== entry.canonicalRoute)
    throw new Error(`${entry.pair}: Contentful governed readback mismatch.`);
}

async function reconcileEntry(entry, publish) {
  const desiredFields = localizeFields(entry.fields);
  let item = await locateEntry(entry);
  let operation = 'EXISTING_ENTRY_VERIFIED';
  let entryWrites = 0;
  let publishes = 0;

  if (!publish) {
    return { pair: entry.pair, publicationId: entry.publicationIdentity,
      entryId: item?.sys?.id || entry.contentfulEntryId,
      state: item ? (isCurrentlyPublished(item) ? 'EXISTING_PUBLISHED' : 'EXISTING_DRAFT') : 'READY_TO_CREATE' };
  }

  if (!item) {
    item = await contentfulRequest('PUT', `/entries/${encodeURIComponent(entry.contentfulEntryId)}`,
      { fields: desiredFields }, { 'X-Contentful-Content-Type': contentTypeId });
    operation = 'CREATED';
    entryWrites++;
  } else {
    if (item.sys.id !== entry.contentfulEntryId)
      throw new Error(`${entry.pair}: pre-existing governed entry uses an unexpected technical ID.`);
    if (!desiredFieldsMatch(item.fields, desiredFields)) {
      item = await contentfulRequest('PUT', `/entries/${encodeURIComponent(item.sys.id)}`,
        { fields: { ...item.fields, ...desiredFields } }, { 'X-Contentful-Version': String(item.sys.version) });
      operation = 'RECONCILED';
      entryWrites++;
    }
  }
  validateReadback(item, entry, desiredFields);
  if (!isCurrentlyPublished(item)) {
    item = await contentfulRequest('PUT', `/entries/${encodeURIComponent(item.sys.id)}/published`,
      null, { 'X-Contentful-Version': String(item.sys.version) });
    publishes++;
    operation += '_AND_PUBLISHED';
  }
  const readback = await contentfulRequest('GET', `/entries/${encodeURIComponent(item.sys.id)}`);
  validateReadback(readback, entry, desiredFields);
  if (!isCurrentlyPublished(readback))
    throw new Error(`${entry.pair}: Contentful publication readback is not current.`);
  return {
    pair: entry.pair, publicationId: entry.publicationIdentity, lineageId: entry.editionLineageId,
    supabaseRecordId: entry.supabaseRecordId, entryId: readback.sys.id,
    canonicalRoute: entry.canonicalRoute, operation, entryWrites, publishes,
    version: readback.sys.version, publishedVersion: readback.sys.publishedVersion,
    editorialBodySha256: entry.editorialBodySha256
  };
}

async function main() {
  const manifest = validateManifest();
  const localOnly = process.argv.includes('--local-check');
  const publish = process.argv.includes('--publish-approved');
  if (localOnly && publish) throw new Error('Select one execution mode.');
  if (localOnly) {
    process.stdout.write(`${JSON.stringify({ status: 'LOCAL_PREPARATION_PASS',
      entries: manifest.entries.length,
      limitedCoveragePairs: manifest.entries.filter(entry => entry.datedObservationCount === 2).map(entry => entry.pair),
      publicationIds: manifest.entries.map(entry => entry.publicationIdentity) }, null, 2)}\n`);
    return;
  }

  requireConfiguration();
  const schema = await inspectSchema(manifest.entries);
  const supabase = await verifySupabaseAuthority(manifest.entries);
  const publications = [];
  for (const entry of manifest.entries) publications.push(await reconcileEntry(entry, publish));
  const totals = {
    publications: publications.length,
    contentfulEntryWrites: publications.reduce((sum, entry) => sum + (entry.entryWrites || 0), 0),
    contentfulPublishes: publications.reduce((sum, entry) => sum + (entry.publishes || 0), 0),
    duplicateEntries: 0, identityChanges: 0, supabasePolicyChanges: 0
  };
  const report = {
    schemaVersion: 'M39-FX-CONTENTFUL-2.0', status: publish ? 'PASS_PUBLISHED' : 'PASS_PREFLIGHT',
    completedAt: new Date().toISOString(),
    mode: publish ? 'IDEMPOTENT_CREATE_RECONCILE_AND_PUBLISH' : 'READ_ONLY_PREFLIGHT',
    contentful: { spaceId: expectedSpace, environment: expectedEnvironment, schema },
    supabase, publications, totals, blockers: []
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`M39 FX publication blocked: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { desiredFieldsMatch, isCurrentlyPublished, localizeFields,
  locateEntry, reconcileEntry, validateFieldValue, validateManifest, validateReadback };
