'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft } = require('../../scripts/m35/build-contentful-draft');
const { generateManifest } = require('../../scripts/m35/generate-migration-manifest');

function convert(statusMeta = '', extra = '', sourcePath = 'pages/chapters/example.html') {
  return convertLegacyContent({ sourcePath,
    content: `${statusMeta}<title>Example Intelligence</title><div class="chapter-content">` +
      `<p>Evidence-backed editorial summary.</p>${extra}</div>` });
}

test('schemas constrain publication status to CURRENT, HISTORICAL or null', () => {
  const normalized = require('../../schemas/m35/migration-record.schema.json');
  const draft = require('../../schemas/m35/contentful-draft.schema.json');
  assert.deepEqual(normalized.properties.publication.properties.status.enum,
    ['CURRENT', 'HISTORICAL', null]);
  assert.deepEqual(draft.properties.fields.properties.publicationStatus.enum,
    ['CURRENT', 'HISTORICAL', null]);
});

test('explicit canonical metadata maps CURRENT with evidence and keeps technical Draft separate', () => {
  const record = convert('<meta name="gpir-publication-status" content="CURRENT">');
  const draft = buildContentfulDraft(record);
  assert.equal(record.publication.status, 'CURRENT');
  assert.deepEqual(record.publication.statusEvidence, {
    evidenceType: 'EXPLICIT_PAGE_METADATA',
    evidenceLocation: 'meta[name="gpir-publication-status"]',
    mappingRule: 'M35_EXPLICIT_CANONICAL_PUBLICATION_STATUS'
  });
  assert.equal(draft.fields.publicationStatus, 'CURRENT');
  assert.equal(draft.technicalState, 'Draft');
});

test('explicit HISTORICAL preserves lineage without deleting content', () => {
  const record = convert('<meta name="gpir-publication-status" content="HISTORICAL">');
  assert.equal(record.publication.status, 'HISTORICAL');
  assert.equal(record.lineage.state, 'historical');
  assert.ok(record.editorialNarrative.includes('Evidence-backed editorial summary.'));
});

test('Published, draft and unsupported values cannot become business lifecycle states', () => {
  for (const value of ['Published', 'published', 'Draft', 'draft', 'ARCHIVED']) {
    const record = convert(`<meta name="gpir-publication-status" content="${value}">`,
      '<p>Pending Verification.</p>');
    assert.equal(record.publication.status, null);
    assert.equal(record.publication.statusEvidence.mappingRule,
      'LEGACY_LIFECYCLE_NOT_EVIDENCED');
    assert.equal(buildContentfulDraft(record).fields.publicationStatus, null);
  }
});

test('HTML existence, filename and general historical prose provide no status', () => {
  const record = convert('', '<p>Historical payments background.</p>',
    'pages/chapters/current-historical-archive.html');
  assert.equal(record.publication.status, null);
  assert.equal(buildContentfulDraft(record).fields.publicationStatus, null);
});

test('conflicting metadata fails closed', () => {
  const record = convert('<meta name="gpir-publication-status" content="CURRENT">' +
    '<meta name="gpir-publication-status" content="HISTORICAL">');
  assert.equal(record.publication.status, null);
  assert.ok(record.exceptions.warnings.some(item => item.code === 'PUBLICATION_STATUS_CONFLICT'));
});

test('common estate mapping leaves unsupported statuses unresolved without touching HTML', () => {
  const root = path.resolve(__dirname, '../..');
  const before = fs.readFileSync(path.join(root, 'pages/chapters/corridor-factbook.html'));
  const { manifest } = generateManifest(root);
  assert.equal(manifest.records.length, 32);
  assert.ok(manifest.records.every(record =>
    ['CURRENT', 'HISTORICAL', null].includes(record.publicationStatus.value)));
  assert.ok(manifest.records.every(record => record.publicationStatus.value === null ||
    record.publicationStatus.evidenceType && record.publicationStatus.mappingRule));
  assert.deepEqual(fs.readFileSync(path.join(root, 'pages/chapters/corridor-factbook.html')), before);
});
