'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { adaptPublication } = require('../m35/contentful-publication-adapter');
const { controlledValidationAuthorization } = require('../m35/contentful-auth-boundary');
const { renderPublicationPage } = require('../m35/contentful-publication-renderer');

const root = path.resolve(__dirname, '..', '..');
const b3b = path.join(root, 'artifacts', 'm36', 'b3b');
const output = path.join(root, 'artifacts', 'm36', 'b3c');
const preview = path.join(output, 'preview');
const master = 'F:\\RepositoryJFY26\\Digital Currency\\Stable Coins MFY26\\Master research Papers\\GPIR\\VK-GPIR-STBL-C2C-2026-001.jpg';
const dashboardFile = 'VK-GPIR-STBL-C2C-2026-001.jpg';
const expectedDashboardHash = 'A908E87B0204580825772748EC11E09AF0E04DAC6F2B9436675799D407432CCB';
const ownerAlt = 'GPIR Stablecoins Global Money Movements Intelligence dashboard covering cross-border payments, remittances, trade, treasury and financial inclusion, with C2C corridors, stablecoin networks, FX and off-ramping, regulation, AML and 2026–2035 outlook.';
const moduleTitles = [
  'Executive Intelligence',
  'Foundations',
  'Global Market & Supply',
  'Payment Economics / Use Cases',
  'Infrastructure & Liquidity',
  'Corridors / FX / Rails',
  'Regulatory Intelligence',
  'AML / Risk / Systemic Intelligence',
  'Institutional Infrastructure & Ecosystem',
  'Strategic Outlook'
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function textNode(value) {
  return { nodeType: 'text', value, marks: [], data: {} };
}

function buildModuleBody(modules) {
  const content = [];
  modules.forEach((module, index) => {
    content.push({ nodeType: 'heading-2', data: {},
      content: [textNode(`${module.moduleNumber} — ${moduleTitles[index]}`)] });
    content.push({ nodeType: 'paragraph', data: {}, content: [textNode(module.sourceText)] });
  });
  return { nodeType: 'document', data: {}, content };
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function main() {
  const contentfulPayload = readJson(path.join(b3b, 'stablecoins-contentful-entry-payload.json'));
  const normalized = readJson(path.join(b3b, 'stablecoins-normalized-intake-record.json'));
  const identity = readJson(path.join(b3b, 'stablecoins-proposed-identity.json'));
  const navigation = readJson(path.join(b3b, 'stablecoins-proposed-navigation-mapping.json'));
  if (hash(master) !== expectedDashboardHash) throw new Error('Dashboard master checksum mismatch.');
  const fields = Object.fromEntries(Object.entries(contentfulPayload.fields)
    .map(([name, localized]) => [name, localized['en-US']]));
  fields.editorialBody = buildModuleBody(normalized.editorialNarrative.map((sourceText, index) => ({
    moduleNumber: String(index + 1).padStart(2, '0'), sourceText
  })));
  const dashboardWebPath = `/artifacts/m36/b3c/preview/assets/${dashboardFile}`;
  const record = {
    entryId: '6spQ5pgDwU7HBF561d4Umv',
    fields,
    presentation: {
      accessClass: 'AUTHENTICATED',
      publicDescription: 'Governed GPIR research on Stablecoins, Cross-Border Money Movement and C2C. Authentication required.',
      topicContext: navigation.discoveryPath,
      primaryDashboard: {
        reference: 'VK-GPIR-STBL-C2C-2026-001',
        role: 'PRIMARY_PUBLICATION_DASHBOARD',
        src: dashboardWebPath,
        highResolutionHref: dashboardWebPath,
        alt: ownerAlt,
        width: 1536,
        height: 1024,
        sha256: expectedDashboardHash
      },
      historicalEditions: []
    }
  };
  const publication = adaptPublication(record);
  if (publication.identity !== identity.publicationId || publication.lineage !== identity.lineageId ||
      publication.supabaseRecordId !== identity.supabaseRecordId)
    throw new Error('B3B identity mismatch.');
  const anonymous = renderPublicationPage(publication);
  const authorized = renderPublicationPage(publication,
    { authorization: controlledValidationAuthorization(publication) });
  const firstProtectedText = normalized.editorialNarrative[0].slice(0, 80);
  if (anonymous.includes(firstProtectedText) || anonymous.includes(ownerAlt) ||
      anonymous.includes('VK-GPIR-STBL-C2C-2026-001'))
    throw new Error('Anonymous shell contains protected research presentation.');
  if (!authorized.includes(firstProtectedText) || !authorized.includes(ownerAlt) ||
      publication.researchModules.length !== 10)
    throw new Error('Authorized preview is incomplete.');
  const copiedDashboard = path.join(preview, 'assets', dashboardFile);
  fs.mkdirSync(path.dirname(copiedDashboard), { recursive: true });
  fs.copyFileSync(master, copiedDashboard);
  if (hash(copiedDashboard) !== expectedDashboardHash) throw new Error('Preview dashboard copy changed bytes.');
  write(path.join(preview, 'anonymous', 'stablecoins-cross-border-money-movement-c2c', 'index.html'), anonymous);
  write(path.join(preview, 'authorized', 'stablecoins-cross-border-money-movement-c2c', 'index.html'), authorized);
  const fixture = { schemaVersion: 'M36-B3C-1.0', record,
    presentationEvidence: { ownerAltText: ownerAlt, moduleTitleBasis: 'M36-B3C owner-approved ordering',
      sourceModuleCount: normalized.editorialNarrative.length, factualTransformationPerformed: false } };
  write(path.join(output, 'stablecoins-render-fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);
  const assetPayload = {
    schemaVersion: 'M36-B3C-1.0', created: false,
    fields: {
      title: { 'en-US': 'VK-GPIR-STBL-C2C-2026-001' },
      description: { 'en-US': ownerAlt },
      file: { 'en-US': { contentType: 'image/jpeg', fileName: dashboardFile,
        uploadFrom: { sys: { type: 'Link', linkType: 'Upload', id: 'DEFERRED_NOT_CREATED' } } } }
    },
    governance: { role: 'PRIMARY_PUBLICATION_DASHBOARD', sha256: expectedDashboardHash,
      byteLength: 631419, sourceMasterUnchanged: true, publicationId: identity.publicationId }
  };
  write(path.join(output, 'stablecoins-contentful-asset-payload.json'), `${JSON.stringify(assetPayload, null, 2)}\n`);
  const result = {
    schemaVersion: 'M36-B3C-1.0', status: 'PASS',
    anonymousPreview: path.relative(root, path.join(preview, 'anonymous', 'stablecoins-cross-border-money-movement-c2c', 'index.html')).replace(/\\/g, '/'),
    authorizedPreview: path.relative(root, path.join(preview, 'authorized', 'stablecoins-cross-border-money-movement-c2c', 'index.html')).replace(/\\/g, '/'),
    moduleCount: publication.researchModules.length, dashboardHash: hash(copiedDashboard),
    ownerAltExact: publication.primaryDashboard.alt === ownerAlt,
    anonymousProtectedContentAbsent: true, historicalEditionsRendered: false,
    viewportContract: ['desktop', 'tablet', 'mobile', '320px']
  };
  write(path.join(output, 'stablecoins-preview-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
