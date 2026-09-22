'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft } = require('../../scripts/m35/build-contentful-draft');
const { classifyMigrationReadiness } = require('../../scripts/m35/classify-migration-readiness');

const sourcePath = 'pages/countries/example.html';
function convert(extra = '', metadata = {}) {
  return convertLegacyContent({ sourcePath, metadata,
    content: '<title>Example</title><div class="chapter-content"><p>Inbound C2C remittances.</p>' +
      extra + '</div>' });
}

test('explicit page date survives while related date and cutoff do not', () => {
  const dated = convertLegacyContent({ sourcePath, content:
    '<meta name="publication-date" content="2026-06-21"><title>Example</title>' });
  assert.equal(dated.publication.publicationDate, '2026-06-21');
  const undated = convert('<p>Dashboard published 20 June 2026.</p>' +
    '<p>Data period CY2025 / CY2026 YTD (Jan-May).</p>',
  { dataCutoffDate: '2026-05-31' });
  assert.equal(undated.publication.publicationDate, null);
  assert.equal(undated.lineage.editionLabel, null);
  assert.equal(buildContentfulDraft(undated).fields.publicationDate, null);
  assert.equal(buildContentfulDraft(undated).fields.editionLabel, null);
  assert.ok(!buildContentfulDraft(undated).mappingGaps.some(gap =>
    ['publicationDate', 'editionLabel'].includes(gap.field)));
});

test('authored edition persists; version and data period do not become edition', () => {
  assert.equal(convert('<p>Data period CY2025 / CY2026 YTD (Jan-May).</p>',
    { version: '1.0' }).lineage.editionLabel, null);
  assert.equal(convert('', { editionLabel: 'Annual 2026' }).lineage.editionLabel, 'Annual 2026');
});

test('region uses explicit mapping, not a publication ID token', () => {
  const tokenOnly = convert('', { gpirPublicationId: 'VK-GPI-APAC-EX-2026-001' });
  assert.equal(tokenOnly.publication.region, null);
  assert.equal(convert('', { region: 'APAC' }).publication.region, 'APAC');
});

test('readiness states are deterministic and missing legacy metadata does not block', () => {
  const record = convert('', { region: 'APAC' });
  const draft = buildContentfulDraft(record);
  assert.equal(classifyMigrationReadiness(record, draft), 'BLOCKED_REQUIRED_FIELD');
  const ready = structuredClone(draft);
  for (const key of ['gpirPublicationId', 'publicationTitle', 'slug', 'publicationType',
    'publicationStatus', 'region', 'countryMarket', 'directionScope',
    'useCasePaymentCategory', 'executiveSummary', 'sourceValidationSummary',
    'editionLineageId', 'supabaseRecordId']) ready.fields[key] ||= 'governed';
  ready.fields.publicationDate = null;
  ready.fields.editionLabel = null;
  ready.reviewRequired = false;
  const clean = structuredClone(record);
  clean.validationStatus = 'PASS';
  clean.exceptions.warnings = [];
  assert.equal(classifyMigrationReadiness(clean, ready), 'READY');
  ready.reviewRequired = true;
  assert.equal(classifyMigrationReadiness(clean, ready), 'REVIEW_REQUIRED');
  assert.equal(classifyMigrationReadiness(clean, ready,
    { identityStatus: 'COLLISION_REVIEW', collisionState: 'review' }), 'IDENTITY_CONFLICT');
  assert.equal(classifyMigrationReadiness(clean, ready), 'REVIEW_REQUIRED');
});
