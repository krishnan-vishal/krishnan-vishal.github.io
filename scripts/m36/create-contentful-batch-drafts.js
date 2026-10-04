'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { extractDocx, richTextFromParagraphs, sha256, slugify,
  sourceExecutiveSummary } = require('./content-factory-batch');

const root = path.resolve(__dirname, '../..');
const locale = 'en-US';
const input = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/c1/candidate-inventory-input.json'), 'utf8'));
const authority = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/c1/supabase-reconciliation.json'), 'utf8'));
const outputPath = path.join(root, 'artifacts/m36/c1/contentful-draft-readback.json');
const env = process.env;
for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT']) {
  if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
}
const apiRoot = `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
  `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}`;

function request(method, requestPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const requestHeaders = { Authorization: `Bearer ${env.CONTENTFUL_MANAGEMENT_TOKEN}`,
      Accept: 'application/vnd.contentful.management.v1+json', ...headers };
    let data = null;
    if (body !== null) {
      data = JSON.stringify(body);
      requestHeaders['Content-Type'] = 'application/vnd.contentful.management.v1+json';
      requestHeaders['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request({ hostname: 'api.contentful.com', method,
      path: requestPath, headers: requestHeaders }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
        if (response.statusCode < 200 || response.statusCode >= 300)
          return reject(new Error(`Contentful ${method} failed with status ${response.statusCode}: ${parsed?.message || text}`));
        resolve(parsed);
      });
    });
    req.on('error', reject);
    if (data !== null) req.write(data);
    req.end();
  });
}

function localized(value) { return { [locale]: value }; }

function payloadFor(candidate) {
  const identity = authority.candidates[candidate.candidateKey];
  if (!identity?.identityAllocationPerformed || identity.accessClass !== 'PUBLIC')
    throw new Error(`${candidate.candidateKey} lacks its governed PUBLIC identity.`);
  if (candidate.dashboardRelationship !== 'NONE')
    throw new Error(`${candidate.candidateKey} does not have the explicit dashboard NONE decision.`);
  const source = extractDocx(candidate.sourcePath);
  if (source.sourceSha256 !== identity.sourceSha256)
    throw new Error(`${candidate.candidateKey} source hash changed after identity allocation.`);
  const slug = slugify(source.title.value);
  const editorialBody = richTextFromParagraphs(source.paragraphs);
  const summary = sourceExecutiveSummary(source.paragraphs);
  const fields = {
    gpirPublicationId: localized(identity.publicationId),
    publicationTitle: localized(source.title.value),
    slug: localized(slug),
    publicationType: localized('Research Publication'),
    executiveSummary: localized(summary),
    editorialBody: localized(editorialBody),
    sourceValidationSummary: localized(`Owner-approved DOCX source; SHA-256 ${source.sourceSha256}; source unit ${identity.sourceUnitKey}.`),
    canonicalUrlCandidate: localized(`/${slug}/`),
    editionLineageId: localized(identity.lineageId),
    supabaseRecordId: localized(identity.supabaseRecordId),
    migrationStatus: localized('Native'),
    validationStatus: localized('PASS')
  };
  return { fields, evidence: { title: source.title.value, sourcePath: candidate.sourcePath,
    sourceUnitKey: identity.sourceUnitKey, sourceSha256: source.sourceSha256,
    sourceByteLength: source.sourceByteLength, paragraphCount: source.paragraphCount,
    moduleCount: source.modules.length, summary, canonicalRouteCandidate: `/${slug}/`,
    editorialBodySha256: sha256(Buffer.from(JSON.stringify(editorialBody))) } };
}

function equalFields(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function findByPublicationId(publicationId) {
  const query = new URLSearchParams({ content_type: 'gpirPublication',
    'fields.gpirPublicationId': publicationId, limit: '2' });
  const response = await request('GET', `${apiRoot}/entries?${query}`);
  if (!Array.isArray(response.items) || response.items.length > 1)
    throw new Error(`Duplicate Contentful entries found for ${publicationId}.`);
  return response.items[0] || null;
}

async function routeOwners(route) {
  const query = new URLSearchParams({ content_type: 'gpirPublication',
    'fields.canonicalUrlCandidate': route, limit: '3' });
  const response = await request('GET', `${apiRoot}/entries?${query}`);
  return response.items || [];
}

async function reconcile(candidate, pass) {
  const expected = payloadFor(candidate);
  const publicationId = expected.fields.gpirPublicationId[locale];
  const route = expected.fields.canonicalUrlCandidate[locale];
  const owners = await routeOwners(route);
  if (owners.some(item => item.fields?.gpirPublicationId?.[locale] !== publicationId))
    throw new Error(`Canonical route collision for ${route}.`);
  let entry = await findByPublicationId(publicationId);
  let operation = 'EXISTING_DRAFT_REUSED';
  let writes = 0;
  if (!entry) {
    entry = await request('POST', `${apiRoot}/entries`, expected,
      { 'X-Contentful-Content-Type': 'gpirPublication' });
    operation = 'CREATED_UNPUBLISHED_DRAFT';
    writes = 1;
  } else if (!equalFields(entry.fields, expected.fields)) {
    if (pass === 2) throw new Error(`Second pass unexpectedly requires a write for ${publicationId}.`);
    entry = await request('PUT', `${apiRoot}/entries/${encodeURIComponent(entry.sys.id)}`, expected,
      { 'X-Contentful-Version': String(entry.sys.version) });
    operation = 'RECONCILED_UNPUBLISHED_DRAFT';
    writes = 1;
  }
  const readback = await request('GET', `${apiRoot}/entries/${encodeURIComponent(entry.sys.id)}`);
  if (!equalFields(readback.fields, expected.fields))
    throw new Error(`Contentful readback differs for ${publicationId}.`);
  if (readback.sys.publishedVersion || readback.sys.archivedVersion)
    throw new Error(`${publicationId} is not an unpublished active draft.`);
  return { candidateKey: candidate.candidateKey, pass, operation, writes,
    entryId: readback.sys.id, entryVersion: readback.sys.version,
    publicationId, lineageId: readback.fields.editionLineageId[locale],
    supabaseRecordId: readback.fields.supabaseRecordId[locale], access: 'PUBLIC', dashboard: 'NONE',
    canonicalRouteCandidate: route, published: false, archived: false,
    fieldNames: Object.keys(readback.fields).sort(), evidence: expected.evidence,
    readback: { state: 'PASS', exactFieldMatch: true, unpublishedDraft: true,
      sourceHashMatch: true, routeUnique: true, fabricatedOptionalFields: [] } };
}

async function main() {
  const candidates = input.candidates.filter(item => item.includeInBatch === true);
  if (candidates.length !== 2) throw new Error('M36-C1 must remain bounded to exactly two active candidates.');
  const first = [];
  for (const candidate of candidates) first.push(await reconcile(candidate, 1));
  const second = [];
  for (const candidate of candidates) second.push(await reconcile(candidate, 2));
  if (second.some(item => item.writes !== 0)) throw new Error('Second pass performed an unnecessary write.');
  const result = {
    schemaVersion: 'M36-C1-1.0', batchId: input.batchId,
    mode: 'CONTENTFUL_DRAFT_ONLY', generatedAt: new Date().toISOString(),
    externalWrites: { contentfulEntries: first.reduce((sum, item) => sum + item.writes, 0),
      contentfulAssets: 0, publishes: 0 },
    firstPass: { writes: first.reduce((sum, item) => sum + item.writes, 0), candidates: first },
    secondPass: { writes: 0, duplicateDrafts: 0, routeCollisions: 0, candidates: second },
    candidates: Object.fromEntries(first.map(item => [item.candidateKey, {
      entryId: item.entryId, firstPassWritePerformed: item.writes > 0,
      publicationId: item.publicationId, lineageId: item.lineageId,
      supabaseRecordId: item.supabaseRecordId, access: item.access, dashboard: item.dashboard,
      canonicalRouteCandidate: item.canonicalRouteCandidate, evidence: item.evidence,
      readback: item.readback
    }]))
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ batchId: result.batchId,
    firstPassWrites: result.firstPass.writes, secondPassWrites: result.secondPass.writes,
    drafts: first.map(item => ({ publicationId: item.publicationId, entryId: item.entryId })) }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
