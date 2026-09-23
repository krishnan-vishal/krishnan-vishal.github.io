'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft, compareGoldenEvidence } = require('../../scripts/m35/build-contentful-draft');

const dashboardId = 'VK-GPI-APAC-IND-2026-005';
const asset = '../../assets/dashboards/VK-GPIR-APAC-IND-DB-001.png';
function countryRecord() {
  return convertLegacyContent({ sourcePath: 'pages/countries/india.html',
    sourceUrl: 'https://old.example/india.html', missingAssets: [asset],
    content: '<title>India Country Intelligence</title><div class="chapter-content">' +
      `<img src="${asset}"><p>Dashboard Reference ID <strong>${dashboardId}</strong>, published 20 June 2026.</p>` +
      '<section id="snapshot"><h2>Executive Snapshot</h2><p>Evidence-backed editorial summary.</p></section>' +
      '<p>Inbound C2C remittances and Outbound C2C remittances.</p>' +
      '<table><tr><th>Metric</th><th>CY2025 actual</th></tr><tr><td>Volume</td><td>42</td></tr>' +
      '<tr><td>Count</td><td>Data Under Development</td></tr></table>' +
      '<section id="sources"><h2>Sources & Verification Status</h2><li>UN DESA</li></section></div>' });
}
function bodyText(draft) {
  return draft.fields.editorialBody.content.map(paragraph => paragraph.content[0].value).join('\n');
}

test('dry-run payload is deterministic for identical normalized input', () => {
  const record = countryRecord();
  assert.deepEqual(buildContentfulDraft(record), buildContentfulDraft(structuredClone(record)));
});

test('draft factory performs no filesystem, Contentful, Supabase or network writes', () => {
  const http = require('node:http');
  const https = require('node:https');
  const originals = [fs.writeFileSync, http.request, http.get, https.request, https.get];
  const forbidden = () => { throw new Error('downstream write or network call'); };
  try {
    fs.writeFileSync = http.request = http.get = https.request = https.get = forbidden;
    assert.equal(buildContentfulDraft(countryRecord()).contentType, 'GPIR Publication');
  } finally {
    [fs.writeFileSync, http.request, http.get, https.request, https.get] = originals;
  }
});

test('provisional page identity is never promoted to a durable publication ID', () => {
  const draft = buildContentfulDraft(countryRecord());
  assert.equal(draft.fields.gpirPublicationId, null);
  assert.ok(draft.sourceRecordIdentity.provisionalId.startsWith('VK-GPIR-SRC-'));
  assert.deepEqual(draft.sourceRecordIdentity.referencedPublicationIds, [dashboardId]);
  assert.ok(draft.mappingGaps.some(gap => gap.field === 'gpirPublicationId'));
});

test('approved evidence-backed identity can map without adopting dashboard reference', () => {
  const record = countryRecord();
  record.identityStatus = 'mapped';
  record.gpirPublicationId = 'VK-GPI-APAC-IND-PAGE-001';
  const draft = buildContentfulDraft(record);
  assert.equal(draft.fields.gpirPublicationId, 'VK-GPI-APAC-IND-PAGE-001');
  assert.deepEqual(draft.sourceRecordIdentity.referencedPublicationIds, [dashboardId]);
});

test('every upstream warning propagates with class, field, reason and reviewer', () => {
  const record = countryRecord();
  const draft = buildContentfulDraft(record);
  assert.deepEqual(draft.migrationWarnings.map(item => item.code),
    record.exceptions.warnings.map(item => item.code));
  assert.ok(draft.migrationWarnings.every(item => item.warningClass && item.affectedField && item.reason && item.reviewer));
  assert.ok(draft.migrationWarnings.some(item => item.warningClass === 'W1'));
  assert.ok(draft.migrationWarnings.some(item => item.warningClass === 'W2'));
  assert.ok(draft.migrationWarnings.some(item => item.warningClass === 'W4'));
});

test('missing exact date, durable lineage and Supabase ID create mapping gaps', () => {
  const draft = buildContentfulDraft(countryRecord());
  for (const field of ['dataCutOffDate', 'editionLineageId', 'supabaseRecordId'])
    assert.ok(draft.mappingGaps.some(gap => gap.field === field));
  assert.equal(draft.fields.dataCutOffDate, null);
  assert.equal(Object.hasOwn(draft.fields, 'dataCutoffDate'), false);
  assert.equal(draft.fields.editionLineageId, null);
  assert.equal(draft.fields.supabaseRecordId, null);
});

test('clean editorial summary and body are mapped without source registry items', () => {
  const draft = buildContentfulDraft(countryRecord());
  assert.equal(draft.fields.executiveSummary, 'Evidence-backed editorial summary.');
  assert.ok(bodyText(draft).includes('Inbound C2C remittances'));
  assert.ok(!bodyText(draft).includes('Sources & Verification Status'));
  assert.ok(!bodyText(draft).includes('UN DESA'));
});

test('structured table candidates are not dumped into Editorial Body', () => {
  const draft = buildContentfulDraft(countryRecord());
  assert.ok(!bodyText(draft).includes('Metric CY2025 actual Volume 42'));
  assert.ok(draft.fields.sourceValidationSummary.includes('Structured candidates requiring review: 1/1'));
});

test('media is a descriptor only and missing asset retains W1', () => {
  const draft = buildContentfulDraft(countryRecord());
  assert.equal(draft.fields.dashboardAsset, null);
  assert.equal(draft.mediaAssociations.length, 1);
  assert.equal(draft.mediaAssociations[0].reference, asset);
  assert.equal(draft.mediaAssociations[0].status, 'unresolved-missing');
  assert.equal(draft.mediaAssociations[0].uploadPlanned, false);
  assert.ok(draft.migrationWarnings.some(warning => warning.warningClass === 'W1'));
});

test('Supabase ID is never fabricated from structured candidates', () => {
  assert.equal(buildContentfulDraft(countryRecord()).fields.supabaseRecordId, null);
});

test('publishEligible is always false, including for a PASS record', () => {
  const pass = convertLegacyContent({ sourcePath: 'legacy/example.html',
    content: '<meta name="gpir-publication-id" content="VK-GPI-EX-2026-001">' +
      '<title>Example</title><p>Editorial.</p>' });
  assert.equal(pass.validationStatus, 'PASS');
  assert.equal(buildContentfulDraft(pass).publishEligible, false);
  assert.equal(buildContentfulDraft(countryRecord()).publishEligible, false);
});

test('unresolved WARN and mapping gaps require review', () => {
  const draft = buildContentfulDraft(countryRecord());
  assert.equal(draft.fields.validationStatus, 'WARN');
  assert.equal(draft.reviewRequired, true);
  assert.ok(draft.mappingGaps.length > 0);
});

test('legacy URL stays exact and separate from canonical candidate', () => {
  const draft = buildContentfulDraft(countryRecord());
  assert.equal(draft.fields.legacySourceUrl, 'https://old.example/india.html');
  assert.notEqual(draft.fields.canonicalUrlCandidate, draft.fields.legacySourceUrl);
});

test('technical Draft state remains distinct from source publication status', () => {
  const record = countryRecord();
  record.publication.status = 'CURRENT';
  const draft = buildContentfulDraft(record);
  assert.equal(draft.technicalState, 'Draft');
  assert.equal(draft.fields.publicationStatus, 'CURRENT');
});

test('India golden parity reports supported fields without injecting dashboard metadata', () => {
  const sourcePath = 'pages/countries/india.html';
  const content = fs.readFileSync(sourcePath, 'utf8');
  const record = convertLegacyContent({ sourcePath, content, missingAssets: [asset] });
  const draft = buildContentfulDraft(record);
  const parity = compareGoldenEvidence(draft, {
    dashboardReferenceId: dashboardId,
    gpirPublicationId: dashboardId,
    publicationTitle: 'India – Cross-Border Payments Intelligence (C2C) Dashboard',
    publicationType: 'Dashboard', publicationStatus: 'Published', region: 'APAC',
    countryMarket: 'India', directionScope: 'Both', useCasePaymentCategory: 'C2C',
    publicationDate: '20 June 2026', dataPeriod: 'CY2025 / CY2026 YTD (Jan-May)',
    outlook: '2027-2032', version: '1.0', editionLineageId: 'GPIR-APAC-IND-C2C',
    legacySourceUrl: 'https://fintechoisis.com/pages/countries/india.html'
  });
  assert.equal(parity.dashboardReferenceId, 'MATCH');
  assert.equal(parity.gpirPublicationId, 'PARTIAL_MATCH');
  assert.equal(parity.region, 'MAPPING_REQUIRED');
  assert.equal(parity.directionScope, 'MATCH');
  assert.equal(parity.publicationDate, 'MAPPING_REQUIRED');
  assert.equal(draft.fields.publicationDate, null);
  assert.equal(parity.publicationTitle, 'NOT_SOURCE_SUPPORTED');
  assert.equal(parity.editionLineageId, 'MAPPING_REQUIRED');
  assert.equal(parity.legacySourceUrl, 'NOT_SOURCE_SUPPORTED');
  assert.equal(draft.fields.gpirPublicationId, null);
});

test('schema validates required dry-run structures and refuses publish eligibility', () => {
  const schema = require('../../schemas/m35/contentful-draft.schema.json');
  const draft = buildContentfulDraft(countryRecord());
  for (const key of schema.required) assert.ok(key in draft);
  assert.equal(Object.keys(draft.fields).length, 22);
  for (const key of schema.properties.fields.required) assert.ok(key in draft.fields);
  assert.equal(schema.properties.publishEligible.const, false);
  assert.equal(schema.properties.fields.properties.dashboardAsset.type, 'null');
  assert.equal(draft.publishEligible, false);
});

test('representative payload conforms to the dry-run schema', () => {
  const schema = require('../../schemas/m35/contentful-draft.schema.json');
  function conforms(value, rule) {
    if (rule.$ref) return conforms(value, rule.$ref.split('/').slice(1)
      .reduce((node, key) => node[key], schema));
    if (rule.type) {
      const types = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (!types.some(type => type === 'null' ? value === null
        : type === 'array' ? Array.isArray(value)
          : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
            : typeof value === type)) return false;
    }
    if ('const' in rule && value !== rule.const) return false;
    if (rule.enum && !rule.enum.includes(value)) return false;
    if (rule.pattern && typeof value === 'string' && !new RegExp(rule.pattern).test(value)) return false;
    if (rule.required && rule.required.some(key => !(key in value))) return false;
    if (rule.properties && value && typeof value === 'object') {
      for (const [key, child] of Object.entries(rule.properties))
        if (key in value && !conforms(value[key], child)) return false;
      if (rule.additionalProperties === false && Object.keys(value)
        .some(key => !(key in rule.properties))) return false;
    }
    if (rule.items && Array.isArray(value) && !value.every(item => conforms(item, rule.items))) return false;
    return true;
  }
  const draft = buildContentfulDraft(countryRecord());
  assert.ok(conforms(draft, schema));
  const invalid = structuredClone(draft);
  invalid.publishEligible = true;
  assert.equal(conforms(invalid, schema), false);
});

test('all five approved sources can build dry-run payloads twice without repository output', () => {
  const pages = ['pages/countries/india.html', 'pages/countries/singapore.html',
    'pages/regions/apac.html', 'pages/research/global-payments-landscape.html',
    'pages/chapters/corridor-factbook.html'];
  function run() {
    return pages.map(sourcePath => {
      const content = fs.readFileSync(sourcePath, 'utf8');
      const refs = [...content.matchAll(/(?:src|href)=["']([^"']+\.(?:png|jpe?g|svg|webp))["']/gi)]
        .map(match => match[1]);
      const missingAssets = refs.filter(ref => !/^https?:/i.test(ref) &&
        !fs.existsSync(path.resolve(path.dirname(sourcePath), ref)));
      return buildContentfulDraft(convertLegacyContent({ sourcePath, content, missingAssets }));
    });
  }
  const first = run();
  assert.deepEqual(first, run());
  assert.equal(first.length, 5);
  assert.ok(first.every(draft => draft.fields.gpirPublicationId === null &&
    draft.publishEligible === false && draft.reviewRequired === true &&
    draft.fields.supabaseRecordId === null && draft.fields.validationStatus === 'WARN'));
  assert.deepEqual(first.map(draft => draft.mediaAssociations.length), [1, 1, 0, 0, 0]);
  assert.ok(!bodyText(first[3]).includes('International Organizations'));
  assert.ok(!bodyText(first[3]).includes('References & Bibliography'));
  assert.ok(!bodyText(first[4]).includes('Primary: FXC Intelligence'));
});
