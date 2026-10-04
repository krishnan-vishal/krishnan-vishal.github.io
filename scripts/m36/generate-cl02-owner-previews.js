'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { adaptPublication } = require('../m35/contentful-publication-adapter');
const { controlledValidationAuthorization } = require('../m35/contentful-auth-boundary');
const { renderPublicationPage } = require('../m35/contentful-publication-renderer');
const { sha256 } = require('./content-factory-batch');

const root = path.resolve(__dirname, '../..');
const outputRoot = path.join(root, 'artifacts/m36/cl02');
const locale = 'en-US';
const targets = [
  { publicationId: 'VK-GPIR-P-000000000034-9', lineageId: 'VK-GPIR-L-000000000034-9',
    entryId: '53bt9kTDAIHVvCCGne4HwL', access: 'PUBLIC', dashboard: 'NONE', expectedModules: 6,
    route: '/global-and-cross-border-payments-market-intelligence-report/' },
  { publicationId: 'VK-GPIR-P-000000000035-6', lineageId: 'VK-GPIR-L-000000000035-6',
    entryId: '5XUjNDKIxcoyHFM3x0meh3', access: 'PUBLIC', dashboard: 'NONE', expectedModules: 38,
    route: '/cross-border-payments/' }
];
const env = process.env;
for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT']) {
  if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
}
const apiRoot = `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
  `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}`;

function requestJson(requestPath) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: 'api.contentful.com', path: requestPath,
      headers: { Authorization: `Bearer ${env.CONTENTFUL_MANAGEMENT_TOKEN}`,
        Accept: 'application/vnd.contentful.management.v1+json' } }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        const parsed = text ? JSON.parse(text) : {};
        if (response.statusCode < 200 || response.statusCode >= 300)
          return reject(new Error(`Contentful read failed with status ${response.statusCode}.`));
        resolve(parsed);
      });
    });
    req.on('error', reject);
  });
}

function deLocalize(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([name, value]) =>
    [name, value && typeof value === 'object' && locale in value ? value[locale] : value]));
}

function plainText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.nodeType === 'text') return node.value || '';
  return (node.content || []).map(plainText).join('');
}

function governedModules(body) {
  const modules = [];
  let current = null;
  for (const node of body?.content || []) {
    if (node.nodeType === 'heading-1') {
      const heading = plainText(node).trim();
      const match = /^(\d{1,3})(?:\s*[—–:\-.]\s*|\s+)(.+)$/i.exec(heading);
      current = { moduleNumber: String(modules.length + 1).padStart(2, '0'),
      title: match ? match[2].trim() : heading, nodes: [] };
      modules.push(current);
    } else if (current) current.nodes.push(node);
  }
  return modules.map(item => ({ moduleNumber: item.moduleNumber, title: item.title,
    sections: item.nodes.length ? [{ body: { nodeType: 'document', data: {}, content: item.nodes } }] : [] }));
}

function ownerPreviewHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\sdata-gpir-[a-z-]+="[^"]*"/gi, '')
    .replace(/<div class="gpir-reader-header"[^>]*><\/div>/gi, '')
    .replace('<head>', '<head><meta name="robots" content="noindex,nofollow"><meta name="gpir-preview" content="owner-review-only">')
    .replace('</head>', '<style>.gpir-owner-preview-banner{position:relative;z-index:20;padding:.55rem 1rem;background:#0F2747;color:#fff;text-align:center;font:700 .78rem/1.4 Inter,sans-serif;letter-spacing:.04em}.gpir-research-module-content h2{font-size:1.2rem;margin:1.35rem 0 .5rem}.gpir-research-module-content h3{font-size:1.05rem;margin:1.15rem 0 .4rem}</style></head>')
    .replace('<body class="gpir-publication-page">', '<body class="gpir-publication-page"><div class="gpir-owner-preview-banner">OWNER REVIEW PREVIEW · UNPUBLISHED</div>');
}

function countRendered(html) {
  return (html.match(/class="gpir-research-module"/g) || []).length;
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const results = [];
  for (const target of targets) {
    const raw = await requestJson(`${apiRoot}/entries/${encodeURIComponent(target.entryId)}`);
    const fields = deLocalize(raw.fields);
    if (raw.sys.publishedVersion) throw new Error(`${target.publicationId} is published; owner preview halted.`);
    if (fields.gpirPublicationId !== target.publicationId || fields.editionLineageId !== target.lineageId ||
      fields.canonicalUrlCandidate !== target.route)
      throw new Error(`${target.publicationId} governed identity or route readback mismatch.`);
    if (fields.dashboardAsset) throw new Error(`${target.publicationId} unexpectedly has a dashboard.`);
    const modules = governedModules(fields.editorialBody);
    if (modules.length !== target.expectedModules)
      throw new Error(`${target.publicationId} expected ${target.expectedModules} modules, found ${modules.length}.`);
    const publication = adaptPublication({ entryId: target.entryId, fields, presentation: {
      accessClass: 'PUBLIC', researchModules: modules, primaryDashboard: null,
      topicContext: [{ label: 'Research' }, { label: fields.publicationTitle }],
      publicDescription: fields.executiveSummary
    } });
    const rendered = ownerPreviewHtml(renderPublicationPage(publication,
      { authorization: controlledValidationAuthorization(publication) }));
    const renderedModules = countRendered(rendered);
    if (renderedModules !== target.expectedModules) throw new Error(`${target.publicationId} render count mismatch.`);
    const visibleText = rendered.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const prohibited = visibleText.match(/Registered reader access|Create free GPIR account|Supabase|Contentful|GitHub/i);
    if (prohibited)
      throw new Error(`${target.publicationId} preview exposes prohibited value: ${prohibited[0]}.`);
    const folder = path.join(outputRoot, target.publicationId);
    fs.mkdirSync(folder, { recursive: true });
    const previewPath = path.join(folder, 'index.html');
    fs.writeFileSync(previewPath, rendered, 'utf8');
    const optionalEvidenceOnly = ['publicationDate', 'editionLabel', 'dataCutOffDate', 'region',
      'countryMarket', 'publicationStatus'].every(name => !fields[name]);
    results.push({ ...target, title: fields.publicationTitle, supabaseRecordId: fields.supabaseRecordId,
      modulesRendered: renderedModules, moduleOrdering: modules.map(item => ({
        number: item.moduleNumber, title: item.title })), sourceProvenance: fields.sourceValidationSummary,
      optionalMetadataEvidenceOnly: optionalEvidenceOnly, draftReadback: 'PASS',
      contentIntegrity: 'PASS', discoveryMetadata: 'SUITABLE_FOR_LATER_DI_LANE',
      previewPath, previewSha256: sha256(Buffer.from(rendered)), published: false });
  }
  const report = { schemaVersion: 'M36-CL-02-1.0', status: 'M36_CL02_OWNER_PREVIEW_READY',
    generatedAt: new Date().toISOString(), renderSystem: 'EXISTING_B3E_PUBLICATION_RENDERER',
    externalWrites: { contentful: 0, supabase: 0, publishes: 0, routeActivations: 0 },
    publications: results, responsiveReview: null, tests: null, blockers: [] };
  fs.writeFileSync(path.join(outputRoot, 'owner-review-report.json'),
    `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(results.map(item => ({ publicationId: item.publicationId,
    modules: item.modulesRendered, previewPath: item.previewPath })), null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
