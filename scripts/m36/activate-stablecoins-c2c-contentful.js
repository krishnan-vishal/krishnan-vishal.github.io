'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const locale = 'en-US';
const entryId = '6spQ5pgDwU7HBF561d4Umv';
const publicationId = 'VK-GPIR-P-000000000033-1';
const lineageId = 'VK-GPIR-L-000000000033-1';
const supabaseRecordId = '09d86c5b-e508-4dab-8908-a40328842070';
const route = '/stablecoins-cross-border-money-movement-c2c/';
const dashboardReference = 'VK-GPIR-STBL-C2C-2026-001';
const dashboardHash = 'A908E87B0204580825772748EC11E09AF0E04DAC6F2B9436675799D407432CCB';
const ownerAlt = 'GPIR Stablecoins Global Money Movements Intelligence dashboard covering cross-border payments, remittances, trade, treasury and financial inclusion, with C2C corridors, stablecoin networks, FX and off-ramping, regulation, AML and 2026–2035 outlook.';
const master = 'F:\\RepositoryJFY26\\Digital Currency\\Stable Coins MFY26\\Master research Papers\\GPIR\\VK-GPIR-STBL-C2C-2026-001.jpg';
const output = path.join(root, 'artifacts', 'm36', 'b3d');
const fixtureFile = path.join(root, 'artifacts', 'm36', 'b3c', 'stablecoins-render-fixture.json');
const sourceFile = path.join(root, 'artifacts', 'm36', 'b3b', 'stablecoins-normalized-intake-record.json');
const env = process.env;

for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT']) {
  if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
}

const spaceRoot = `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}`;
const environmentRoot = `${spaceRoot}/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}`;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function json(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function request(method, requestPath, body = null, headers = {}, hostname = 'api.contentful.com') {
  return new Promise((resolve, reject) => {
    const requestHeaders = {
      Authorization: `Bearer ${env.CONTENTFUL_MANAGEMENT_TOKEN}`,
      Accept: 'application/vnd.contentful.management.v1+json',
      ...headers
    };
    let data = null;
    if (body !== null) {
      data = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      requestHeaders['Content-Type'] = Buffer.isBuffer(body)
        ? 'application/octet-stream' : 'application/vnd.contentful.management.v1+json';
      requestHeaders['Content-Length'] = data.length;
    }
    const req = https.request({ hostname, method, path: requestPath,
      headers: requestHeaders }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed = {};
        if (raw.length) {
          try { parsed = JSON.parse(raw.toString('utf8')); }
          catch { parsed = raw; }
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = Buffer.isBuffer(parsed) ? parsed.toString('utf8') : parsed?.message;
          return reject(new Error(`Contentful ${method} ${requestPath} failed with status ${response.statusCode}: ${message || 'unknown error'}`));
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location)
        return resolve(download(new URL(response.headers.location, url).href));
      if (response.statusCode !== 200)
        return reject(new Error(`Processed dashboard download failed with status ${response.statusCode}.`));
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function exactLocalized(value) {
  return value?.[locale] ?? null;
}

function link(id, linkType) {
  return { sys: { type: 'Link', linkType, id } };
}

async function findOrCreateAsset(masterBytes) {
  const query = new URLSearchParams({ query: dashboardReference, limit: '100' });
  const search = await request('GET', `${environmentRoot}/assets?${query}`);
  const exact = (search.items || []).filter(item =>
    exactLocalized(item.fields?.title) === dashboardReference &&
    exactLocalized(item.fields?.description) === ownerAlt &&
    exactLocalized(item.fields?.file)?.fileName === `${dashboardReference}.jpg`);
  if (exact.length > 1) throw new Error('Duplicate exact dashboard assets found; refusing ambiguous association.');
  if (exact.length === 1) return { asset: exact[0], operation: 'EXISTING_ASSET_REUSED' };

  const upload = await request('POST', `${spaceRoot}/uploads`, masterBytes, {}, 'upload.contentful.com');
  const asset = await request('POST', `${environmentRoot}/assets`, {
    fields: {
      title: { [locale]: dashboardReference },
      description: { [locale]: ownerAlt },
      file: { [locale]: {
        contentType: 'image/jpeg',
        fileName: `${dashboardReference}.jpg`,
        uploadFrom: link(upload.sys.id, 'Upload')
      } }
    }
  });
  await request('PUT', `${environmentRoot}/assets/${asset.sys.id}/files/${locale}/process`, null,
    { 'X-Contentful-Version': String(asset.sys.version) });
  return { asset, operation: 'CREATED_AND_PROCESSING' };
}

async function processedAsset(assetId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const asset = await request('GET', `${environmentRoot}/assets/${assetId}`);
    if (exactLocalized(asset.fields?.file)?.url) return asset;
    await sleep(1000);
  }
  throw new Error('Contentful dashboard asset processing did not complete within 30 seconds.');
}

function moduleBodies(editorialBody) {
  const content = editorialBody?.content || [];
  const modules = [];
  let current = null;
  for (const node of content) {
    if (node.nodeType === 'heading-2') {
      current = { heading: node.content?.map(item => item.value || '').join('') || '', bodies: [] };
      modules.push(current);
    } else if (current) {
      current.bodies.push(node);
    }
  }
  return modules;
}

async function main() {
  const masterBytes = fs.readFileSync(master);
  if (sha256(masterBytes) !== dashboardHash) throw new Error('Approved dashboard master checksum mismatch.');
  const fixture = json(fixtureFile);
  const source = json(sourceFile);
  const editorialBody = fixture.record.fields.editorialBody;
  const preparedModules = moduleBodies(editorialBody);
  if (preparedModules.length !== 10 || source.editorialNarrative.length !== 10)
    throw new Error('Prepared generic research presentation is not 10 modules.');
  preparedModules.forEach((module, index) => {
    const bodyText = module.bodies.flatMap(node => node.content || []).map(item => item.value || '').join('');
    if (bodyText !== source.editorialNarrative[index])
      throw new Error(`Prepared module ${index + 1} does not exactly match the authoritative body.`);
  });

  const contentType = await request('GET', `${environmentRoot}/content_types/gpirPublication`);
  const fieldTypes = Object.fromEntries((contentType.fields || []).map(field => [field.id, field]));
  if (!fieldTypes.publicationStatus || !fieldTypes.dashboardAsset || !fieldTypes.editorialBody)
    throw new Error('Contentful gpirPublication is missing one or more B3D fields.');

  const entryBefore = await request('GET', `${environmentRoot}/entries/${entryId}`);
  const beforeFields = entryBefore.fields || {};
  const identityChecks = [
    [exactLocalized(beforeFields.gpirPublicationId), publicationId, 'publication ID'],
    [exactLocalized(beforeFields.editionLineageId), lineageId, 'lineage ID'],
    [exactLocalized(beforeFields.supabaseRecordId), supabaseRecordId, 'Supabase record ID'],
    [exactLocalized(beforeFields.canonicalUrlCandidate), route, 'canonical route']
  ];
  for (const [actual, expected, label] of identityChecks) {
    if (actual !== expected) throw new Error(`Contentful ${label} mismatch before activation.`);
  }
  if (entryBefore.sys.publishedVersion || entryBefore.sys.archivedVersion)
    throw new Error('B3D requires the governed entry to remain an unpublished, unarchived Draft.');

  let { asset, operation: assetOperation } = await findOrCreateAsset(masterBytes);
  asset = await processedAsset(asset.sys.id);
  const processedFile = exactLocalized(asset.fields.file);
  const processedBytes = await download(processedFile.url.startsWith('//') ? `https:${processedFile.url}` : processedFile.url);
  if (sha256(processedBytes) !== dashboardHash || processedBytes.length !== masterBytes.length)
    throw new Error('Processed Contentful dashboard bytes do not match the approved master.');
  if (exactLocalized(asset.fields.description) !== ownerAlt)
    throw new Error('Processed Contentful dashboard alt text mismatch.');

  const intendedFields = {
    ...beforeFields,
    editorialBody: { [locale]: editorialBody },
    publicationStatus: { [locale]: 'CURRENT' },
    dashboardAsset: { [locale]: link(asset.sys.id, 'Asset') }
  };
  const unchanged = JSON.stringify(beforeFields) === JSON.stringify(intendedFields);
  const entryUpdated = unchanged ? entryBefore : await request('PUT', `${environmentRoot}/entries/${entryId}`,
    { fields: intendedFields }, { 'X-Contentful-Version': String(entryBefore.sys.version) });
  const entry = await request('GET', `${environmentRoot}/entries/${entryId}`);
  const fields = entry.fields || {};
  const readbackModules = moduleBodies(exactLocalized(fields.editorialBody));
  const readbackBodies = readbackModules.map(module => module.bodies.flatMap(node => node.content || [])
    .map(item => item.value || '').join(''));
  const moduleEquality = readbackBodies.filter((body, index) => body === source.editorialNarrative[index]).length;
  const association = exactLocalized(fields.dashboardAsset)?.sys?.id;
  const allowedNewFields = new Set(['publicationStatus', 'dashboardAsset']);
  const unexpectedFields = Object.keys(fields).filter(name => !(name in beforeFields) && !allowedNewFields.has(name));
  const checks = {
    publicationId: exactLocalized(fields.gpirPublicationId) === publicationId,
    lineageId: exactLocalized(fields.editionLineageId) === lineageId,
    supabaseRecordId: exactLocalized(fields.supabaseRecordId) === supabaseRecordId,
    route: exactLocalized(fields.canonicalUrlCandidate) === route,
    publicationStatus: exactLocalized(fields.publicationStatus) === 'CURRENT',
    modules: readbackModules.length === 10 && moduleEquality === 10,
    dashboardAssociation: association === asset.sys.id,
    dashboardAlt: exactLocalized(asset.fields.description) === ownerAlt,
    dashboardChecksum: sha256(processedBytes) === dashboardHash,
    noFabricatedMetadata: unexpectedFields.length === 0,
    entryUnpublished: !entry.sys.publishedVersion,
    assetUnpublished: !asset.sys.publishedVersion
  };
  if (Object.values(checks).some(value => value !== true))
    throw new Error(`Contentful B3D readback failed: ${JSON.stringify(checks)}`);

  const result = {
    schemaVersion: 'M36-B3D-1.0',
    status: 'PASS',
    asset: {
      id: asset.sys.id,
      operation: assetOperation,
      state: 'PROCESSED_UNPUBLISHED',
      version: asset.sys.version,
      published: false,
      fileName: processedFile.fileName,
      contentType: processedFile.contentType,
      byteLength: processedBytes.length,
      sha256: sha256(processedBytes),
      altExact: true
    },
    draft: {
      id: entry.sys.id,
      operation: unchanged ? 'EXISTING_ACTIVATION_REUSED' : 'UPDATED_UNPUBLISHED_DRAFT',
      version: entry.sys.version,
      published: false,
      archived: Boolean(entry.sys.archivedVersion),
      publicationStatus: exactLocalized(fields.publicationStatus),
      moduleReadback: `${moduleEquality}/10`,
      dashboardAssetId: association
    },
    checks,
    contentfulWrites: {
      uploadCreated: assetOperation === 'CREATED_AND_PROCESSING' ? 1 : 0,
      assetCreated: assetOperation === 'CREATED_AND_PROCESSING' ? 1 : 0,
      assetProcessed: assetOperation === 'CREATED_AND_PROCESSING' ? 1 : 0,
      entryUpdated: unchanged ? 0 : 1,
      published: 0
    }
  };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'contentful-activation-readback.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
