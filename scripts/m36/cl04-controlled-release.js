'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const locale = 'en-US';
const targets = Object.freeze([
  Object.freeze({
    publicationId: 'VK-GPIR-P-000000000034-9',
    lineageId: 'VK-GPIR-L-000000000034-9',
    supabaseRecordId: '5d9c73c3-52e2-4dde-a621-7c8d0d5b2cab',
    entryId: '53bt9kTDAIHVvCCGne4HwL',
    route: '/global-and-cross-border-payments-market-intelligence-report/',
    slug: 'global-and-cross-border-payments-market-intelligence-report',
    modules: 6,
    sourceSha256: 'F57CCA73682F6852024D200F344AA29DCADAA8E2A32FF98525EA767F5987975B'
  }),
  Object.freeze({
    publicationId: 'VK-GPIR-P-000000000035-6',
    lineageId: 'VK-GPIR-L-000000000035-6',
    supabaseRecordId: '21c1e39f-cefa-4e57-8ade-57c69ab0d036',
    entryId: '5XUjNDKIxcoyHFM3x0meh3',
    route: '/cross-border-payments/',
    slug: 'cross-border-payments',
    modules: 38,
    sourceSha256: 'B8440EEB821FA7408B1F8F894FA8DFAC44819B06A3D901F420CE61DFBF59A2F7'
  })
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function deLocalize(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([name, value]) =>
    [name, value && typeof value === 'object' && locale in value ? value[locale] : value]));
}

function apiConfiguration(env = process.env) {
  for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT']) {
    if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
  }
  return {
    token: env.CONTENTFUL_MANAGEMENT_TOKEN,
    space: env.CONTENTFUL_SPACE_ID,
    environment: env.CONTENTFUL_ENVIRONMENT,
    root: `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
      `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}`
  };
}

function requestJson(config, method, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: 'api.contentful.com', method, path: requestPath,
      headers: { Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.contentful.management.v1+json', ...headers } }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`Contentful ${method} failed with status ${response.statusCode}: ${parsed.message || text}`));
        }
        resolve(parsed);
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function previewEvidence(target) {
  const previewPath = path.join(root, 'artifacts/m36/cl03a', target.publicationId, 'index.html');
  const html = fs.readFileSync(previewPath, 'utf8');
  const modules = [...html.matchAll(/id="research-module-[^"]+"[^>]*class="gpir-research-module(?:\s|"|--)/g)].length;
  if (modules !== target.modules) throw new Error(`${target.publicationId} module count mismatch.`);
  const report = JSON.parse(fs.readFileSync(path.join(root,
    'artifacts/m36/cl03a/presentation-normalization-report.json'), 'utf8'));
  const checksum = report.authoredContentChecksums?.[target.publicationId];
  if (!checksum?.match || checksum.before !== target.sourceSha256 || checksum.after !== target.sourceSha256) {
    throw new Error(`${target.publicationId} authored checksum mismatch.`);
  }
  return { previewPath, previewSha256: sha256(Buffer.from(html)), modules, html };
}

function routeEvidence(target) {
  const directory = path.join(root, target.slug);
  const htmlFile = path.join(root, `${target.slug}.html`);
  const existingPaths = [directory, htmlFile].filter(candidate => fs.existsSync(candidate));
  const registryPath = path.join(root, 'routes.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const collisions = registry.routes.filter(item => item.route.toLowerCase() === target.route.toLowerCase() ||
    item.identity === target.publicationId);
  return { status: existingPaths.length || collisions.length ? 'BLOCKED_ROUTE_COLLISION' : 'AVAILABLE_NO_EXISTING_ROUTE',
    existingPaths, registryCollisions: collisions.length };
}

async function contentfulEvidence(config, target, expectedPublished) {
  const entry = await requestJson(config, 'GET', `${config.root}/entries/${encodeURIComponent(target.entryId)}`);
  const fields = deLocalize(entry.fields);
  const query = `${config.root}/entries?content_type=gpirPublication&fields.gpirPublicationId=${encodeURIComponent(target.publicationId)}&limit=3`;
  const collection = await requestJson(config, 'GET', query);
  const mismatches = [];
  if (entry.sys.contentType?.sys?.id !== 'gpirPublication') mismatches.push('contentType');
  if (fields.gpirPublicationId !== target.publicationId) mismatches.push('publicationId');
  if (fields.editionLineageId !== target.lineageId) mismatches.push('lineageId');
  if (fields.supabaseRecordId !== target.supabaseRecordId) mismatches.push('supabaseRecordId');
  if (fields.canonicalUrlCandidate !== target.route) mismatches.push('route');
  if (fields.slug !== target.slug) mismatches.push('slug');
  if (fields.dashboardAsset) mismatches.push('dashboard');
  if (collection.total !== 1 || collection.items?.[0]?.sys?.id !== target.entryId) mismatches.push('duplicateEntry');
  if (entry.sys.archivedVersion) mismatches.push('archived');
  if (expectedPublished === false && entry.sys.publishedVersion) mismatches.push('alreadyPublished');
  if (expectedPublished === true && !entry.sys.publishedVersion) mismatches.push('notPublished');
  if (mismatches.length) throw new Error(`${target.publicationId} Contentful mismatch: ${mismatches.join(', ')}`);
  return { entry, fields, evidence: {
    space: entry.sys.space?.sys?.id, environment: entry.sys.environment?.sys?.id,
    entryId: entry.sys.id, contentType: entry.sys.contentType?.sys?.id,
    version: entry.sys.version, publishedVersion: entry.sys.publishedVersion || null,
    publishedAt: entry.sys.publishedAt || null, updatedAt: entry.sys.updatedAt,
    publicationId: fields.gpirPublicationId, lineageId: fields.editionLineageId,
    supabaseRecordId: fields.supabaseRecordId, access: 'PUBLIC', dashboard: 'NONE',
    route: fields.canonicalUrlCandidate, duplicates: collection.total - 1
  } };
}

async function preflight({ expectPublished = false, checkRoutes = true } = {}) {
  const config = apiConfiguration();
  const publications = [];
  for (const target of targets) {
    const preview = previewEvidence(target);
    const contentful = await contentfulEvidence(config, target, expectPublished);
    const route = checkRoutes ? routeEvidence(target) : null;
    if (route && route.status !== 'AVAILABLE_NO_EXISTING_ROUTE') {
      throw new Error(`${target.publicationId} ${route.status}.`);
    }
    publications.push({ ...target, preview: {
      path: preview.previewPath, checksum: preview.previewSha256, modules: preview.modules },
    contentful: contentful.evidence, route });
  }
  return { status: 'PASS', space: config.space, environment: config.environment, publications };
}

async function publish() {
  const config = apiConfiguration();
  const before = await preflight({ expectPublished: false, checkRoutes: true });
  const results = [];
  for (const item of before.publications) {
    const target = targets.find(candidate => candidate.entryId === item.entryId);
    const published = await requestJson(config, 'PUT',
      `${config.root}/entries/${encodeURIComponent(target.entryId)}/published`,
      { 'X-Contentful-Version': String(item.contentful.version) });
    const readback = await contentfulEvidence(config, target, true);
    if (readback.entry.sys.publishedVersion !== published.sys.publishedVersion) {
      throw new Error(`${target.publicationId} publish readback version mismatch.`);
    }
    results.push({ publicationId: target.publicationId, entryId: target.entryId,
      versionBefore: item.contentful.version, versionAfter: readback.evidence.version,
      publishedVersion: readback.evidence.publishedVersion,
      publishedAt: readback.evidence.publishedAt, identity: readback.evidence.publicationId,
      lineageId: readback.evidence.lineageId, result: 'PUBLISHED_ONCE_READBACK_PASS' });
  }
  return { status: 'PASS', space: config.space, environment: config.environment,
    publishedCount: results.length, results };
}

function productionHtml(previewHtml) {
  const html = previewHtml
    .replace('<meta name="robots" content="noindex,nofollow">', '')
    .replace('<meta name="gpir-preview" content="owner-review-only">', '')
    .replace(/<style>\.gpir-owner-preview-banner[\s\S]*?<\/style>/, '')
    .replace('<div class="gpir-owner-preview-banner">OWNER REVIEW PREVIEW · PRESENTATION NORMALIZATION · UNPUBLISHED</div>', '');
  if (/OWNER REVIEW|UNPUBLISHED|noindex|Registered reader access/i.test(html)) {
    throw new Error('Preview-only or reader-gate content remains in production HTML.');
  }
  return html;
}

function prepareRoutes() {
  const registryPath = path.join(root, 'routes.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const created = [];
  for (const target of targets) {
    const route = routeEvidence(target);
    if (route.status !== 'AVAILABLE_NO_EXISTING_ROUTE') throw new Error(`${target.publicationId} ${route.status}.`);
    const preview = previewEvidence(target);
    const html = productionHtml(preview.html);
    const folder = path.join(root, target.slug);
    fs.mkdirSync(folder, { recursive: false });
    const output = path.join(folder, 'index.html');
    fs.writeFileSync(output, html, 'utf8');
    registry.routes.push({ identity: target.publicationId, route: target.route,
      canonicalUrl: `https://fintechoisis.com${target.route}`,
      publicationType: 'Research Publication', authAuthority: 'supabase',
      controlledValidation: false });
    created.push({ publicationId: target.publicationId, route: target.route,
      path: output, sha256: sha256(Buffer.from(html)), modules: target.modules });
  }
  registry.routes.sort((a, b) => a.route.localeCompare(b.route));
  registry.recordCount = registry.routes.length;
  if (new Set(registry.routes.map(item => item.route.toLowerCase())).size !== registry.routes.length ||
      new Set(registry.routes.map(item => item.identity)).size !== registry.routes.length) {
    throw new Error('Route registry duplicate detected.');
  }
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return { status: 'PASS', routesCreated: created, registryCount: registry.recordCount };
}

async function main() {
  const mode = process.argv[2];
  let result;
  if (mode === '--preflight') result = await preflight({ expectPublished: false, checkRoutes: true });
  else if (mode === '--publish') result = await publish();
  else if (mode === '--readback') result = await preflight({ expectPublished: true, checkRoutes: false });
  else if (mode === '--prepare-routes') result = prepareRoutes();
  else throw new Error('Use --preflight, --publish, --readback, or --prepare-routes.');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { contentfulEvidence, preflight, prepareRoutes, productionHtml,
  publish, routeEvidence, sha256, targets };
