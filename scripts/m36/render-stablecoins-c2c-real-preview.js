'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { adaptPublication } = require('../m35/contentful-publication-adapter');
const { controlledValidationAuthorization } = require('../m35/contentful-auth-boundary');
const { renderPublicationPage } = require('../m35/contentful-publication-renderer');

const root = path.resolve(__dirname, '..', '..');
const output = path.join(root, 'artifacts', 'm36', 'b3d');
const preview = path.join(output, 'preview');
const locale = 'en-US';
const publicationId = 'VK-GPIR-P-000000000033-1';
const lineageId = 'VK-GPIR-L-000000000033-1';
const supabaseRecordId = '09d86c5b-e508-4dab-8908-a40328842070';
const entryId = '6spQ5pgDwU7HBF561d4Umv';
const ownerAlt = 'GPIR Stablecoins Global Money Movements Intelligence dashboard covering cross-border payments, remittances, trade, treasury and financial inclusion, with C2C corridors, stablecoin networks, FX and off-ramping, regulation, AML and 2026–2035 outlook.';
const env = process.env;

for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT']) {
  if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
}

function request(hostname, requestPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, method: 'GET', path: requestPath, headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = raw ? JSON.parse(raw) : {}; }
        catch { return reject(new Error(`${hostname} returned non-JSON content.`)); }
        if (response.statusCode < 200 || response.statusCode >= 300)
          return reject(new Error(`${hostname} read failed with status ${response.statusCode}: ${body?.message || 'unknown error'}`));
        resolve(body);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function localizeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([name, value]) => [name, value?.[locale] ?? value]));
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

async function previewToken() {
  if (env.CONTENTFUL_PREVIEW_TOKEN) return env.CONTENTFUL_PREVIEW_TOKEN;
  const keys = await request('api.contentful.com',
    `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}/preview_api_keys?limit=100`,
    env.CONTENTFUL_MANAGEMENT_TOKEN);
  const candidates = (keys.items || []).filter(key => typeof key.accessToken === 'string' && key.accessToken);
  if (candidates.length !== 1)
    throw new Error(`Expected one usable Contentful Preview API key, found ${candidates.length}.`);
  return candidates[0].accessToken;
}

async function main() {
  const token = await previewToken();
  const query = new URLSearchParams({ content_type: 'gpirPublication',
    'sys.id': entryId, include: '2', limit: '2' });
  const collection = await request('preview.contentful.com',
    `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
      `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}/entries?${query}`,
    token);
  if (!Array.isArray(collection.items) || collection.items.length !== 1)
    throw new Error('Contentful Preview API did not return exactly one governed Draft.');

  const require = createRequire(__filename);
  const handlerModule = await import(pathToFileURL(path.join(root, 'supabase', 'functions',
    'gpir-protected-publication', 'handler.mjs')).href);
  const edgePayload = handlerModule.normalizedPayload(collection.items[0], publicationId,
    supabaseRecordId, collection);
  if (!edgePayload?.primaryDashboard || edgePayload.primaryDashboard.alt !== ownerAlt)
    throw new Error('Real Contentful Preview API dashboard resolution failed.');
  const fields = localizeFields(collection.items[0].fields);
  if (fields.editionLineageId !== lineageId || fields.publicationStatus !== 'CURRENT')
    throw new Error('Real Contentful Preview API governance readback failed.');
  const fixture = require(path.join(root, 'artifacts', 'm36', 'b3c', 'stablecoins-render-fixture.json'));
  const record = {
    entryId,
    fields,
    presentation: {
      ...fixture.record.presentation,
      primaryDashboard: edgePayload.primaryDashboard
    }
  };
  const publication = adaptPublication(record);
  if (publication.researchModules.length !== 10)
    throw new Error('Real CMS-backed renderer did not produce 10 modules.');
  const anonymous = renderPublicationPage(publication);
  const authorized = renderPublicationPage(publication,
    { authorization: controlledValidationAuthorization(publication) });
  const authoritativeSource = require(path.join(root, 'artifacts', 'm36', 'b3b',
    'stablecoins-normalized-intake-record.json'));
  const protectedText = authoritativeSource.editorialNarrative[0].slice(0, 80);
  if (anonymous.includes(protectedText) || anonymous.includes(ownerAlt) ||
      anonymous.includes('VK-GPIR-STBL-C2C-2026-001'))
    throw new Error('Anonymous static HTML exposed protected CMS content.');
  if (!authorized.includes(protectedText) || !authorized.includes(ownerAlt))
    throw new Error('Authorized real CMS-backed preview is incomplete.');

  const route = 'stablecoins-cross-border-money-movement-c2c';
  const anonymousFile = path.join(preview, 'anonymous', route, 'index.html');
  const authorizedFile = path.join(preview, 'authorized', route, 'index.html');
  write(anonymousFile, anonymous);
  write(authorizedFile, authorized);
  const result = {
    schemaVersion: 'M36-B3D-1.0', status: 'PASS',
    source: 'REAL_CONTENTFUL_PREVIEW_API_DRAFT',
    contentfulEntryId: entryId,
    publicationId: publication.identity,
    lineageId: publication.lineage,
    publicationStatus: publication.publicationStatus,
    moduleReadback: `${publication.researchModules.length}/10`,
    dashboardAssetId: fields.dashboardAsset?.sys?.id || null,
    dashboardAltExact: publication.primaryDashboard.alt === ownerAlt,
    anonymousProtectedContentAbsent: true,
    anonymousPreview: path.relative(root, anonymousFile).replace(/\\/g, '/'),
    authorizedPreview: path.relative(root, authorizedFile).replace(/\\/g, '/')
  };
  write(path.join(output, 'real-cms-preview-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
