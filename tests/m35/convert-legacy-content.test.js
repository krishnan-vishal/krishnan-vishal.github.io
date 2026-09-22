'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');

const content = '<!doctype html><title>India Payments</title><h1>VK-GPI-APAC-IND-2026-005</h1>' +
  '<p>Editorial assessment.</p><table><tr><th>Metric</th><th>CY2026 actual</th></tr>' +
  '<tr><td>Volume</td><td>42</td></tr></table>' +
  '<img src="/assets/dashboard.png"><a href="https://example.org/source">Source</a>';
const base = { sourcePath: 'legacy/india.html', sourceUrl: 'https://old.example/india.html', content,
  metadata: { editionId: 'IND-2026', editionLabel: '2026 edition', version: '1.0',
    previousEditionId: 'IND-2025', historical: true } };

test('deterministic record and source hash', () => {
  const first = convertLegacyContent(base);
  assert.deepEqual(first, convertLegacyContent(structuredClone(base)));
  assert.equal(first.provenance.sourceHash, createHash('sha256').update(content).digest('hex'));
});

test('GPIR identity ignores downstream IDs and URLs', () => {
  const first = convertLegacyContent(base);
  const changed = convertLegacyContent({ ...base, sourceUrl: 'https://new.example/path',
    metadata: { ...base.metadata, contentfulId: 'cms-1', supabaseId: 'db-2', modelId: 'ai-3' } });
  assert.equal(first.gpirPublicationId, 'VK-GPI-APAC-IND-2026-005');
  assert.equal(first.gpirPublicationId, changed.gpirPublicationId);
});

test('A-F classification, provenance, separation, assets, lineage and URLs', () => {
  const record = convertLegacyContent({ ...base, metadata: { ...base.metadata,
    gpirPublicationId: 'VK-GPI-APAC-IND-2026-005', canonicalUrlCandidate: '/india-payments/' } });
  assert.deepEqual(record.targets, ['A', 'B', 'C', 'D', 'E']);
  assert.equal(record.validationStatus, 'PASS');
  assert.deepEqual(record.editorialNarrative, ['Editorial assessment.']);
  assert.equal(record.structuredIntelligence[0].text, 'Metric CY2026 actual Volume 42');
  assert.deepEqual(record.assetReferences, ['/assets/dashboard.png']);
  assert.deepEqual(record.provenance.sourceReferences, ['https://example.org/source']);
  assert.equal(record.provenance.sourcePath, base.sourcePath);
  assert.equal(record.provenance.sourceUrl, base.sourceUrl);
  assert.equal(record.canonicalUrlCandidate, '/india-payments/');
  assert.equal(record.lineage.previousEditionId, 'IND-2025');
  assert.equal(record.lineage.state, 'historical');
});

test('WARN and review target for incomplete but convertible source', () => {
  const record = convertLegacyContent({ sourcePath: 'legacy/unknown.html', content: '<p>Text</p>' });
  assert.equal(record.validationStatus, 'WARN');
  assert.ok(record.targets.includes('F'));
  assert.ok(record.exceptions.warnings.some(item => item.code === 'IDENTITY_DERIVED'));
});

test('FAIL and explicit fatal exception for invalid input', () => {
  const record = convertLegacyContent({ content: '' });
  assert.equal(record.validationStatus, 'FAIL');
  assert.ok(record.exceptions.errors.some(item => item.code === 'SOURCE_PATH_REQUIRED'));
  assert.ok(record.exceptions.errors.some(item => item.code === 'SOURCE_CONTENT_REQUIRED'));
  assert.ok(record.targets.includes('F'));
});

test('extraction performs no downstream, filesystem or network writes', () => {
  const fs = require('node:fs');
  const http = require('node:http');
  const https = require('node:https');
  const original = { writeFileSync: fs.writeFileSync, request: http.request, httpGet: http.get,
    httpsRequest: https.request, httpsGet: https.get };
  const forbidden = () => { throw new Error('external write/network call attempted'); };
  try {
    fs.writeFileSync = forbidden;
    http.request = http.get = https.request = https.get = forbidden;
    assert.equal(convertLegacyContent(base).validationStatus, 'PASS');
  } finally {
    fs.writeFileSync = original.writeFileSync;
    http.request = original.request;
    http.get = original.httpGet;
    https.request = original.httpsRequest;
    https.get = original.httpsGet;
  }
});

test('country page identity stays provisional while dashboard ID and missing asset are retained', () => {
  const asset = '../../assets/dashboards/VK-GPIR-APAC-IND-DB-001.png';
  const record = convertLegacyContent({ sourcePath: 'pages/countries/india.html',
    content: `<title>India</title><div class="chapter-content"><img src="${asset}">` +
      '<p>Reference ID <strong>VK-GPI-APAC-IND-2026-005</strong>, published 20 June 2026.</p>' +
      '<p>Draft — Pending Verification. Data Under Development.</p></div>',
    missingAssets: [asset] });
  assert.equal(record.identityStatus, 'provisional');
  assert.notEqual(record.gpirPublicationId, 'VK-GPI-APAC-IND-2026-005');
  assert.deepEqual(record.referencedPublicationIds, ['VK-GPI-APAC-IND-2026-005']);
  assert.equal(record.publication.publicationDate, null);
  assert.equal(record.assetStatus[0].status, 'missing');
  assert.equal(record.validationStatus, 'WARN');
  assert.ok(record.sourceNotes.some(note => note.includes('Data Under Development')));
});

test('Singapore dashboard publication date remains related evidence, not page date', () => {
  const sourcePath = 'pages/countries/singapore.html';
  const content = fs.readFileSync(sourcePath, 'utf8');
  const first = convertLegacyContent({ sourcePath, content });
  const second = convertLegacyContent({ sourcePath, content });
  assert.equal(first.publication.publicationDate, null);
  assert.deepEqual(first.referencedPublicationIds, ['VK-GPI-APAC-SGP-2026-006']);
  assert.ok(first.provenance.sourceReferences.some(ref => ref.includes('published 20 June 2026')));
  assert.deepEqual(first, second);
});

test('explicit page-level publication metadata is accepted', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/countries/example.html',
    content: '<meta property="article:published_time" content="21 June 2026">' +
      '<div class="chapter-content"><h1>Example</h1></div>' });
  assert.equal(record.publication.publicationDate, '21 June 2026');
});

test('citation dates and data periods do not establish a page publication date', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/countries/example.html',
    content: '<div class="chapter-content"><h1>Example</h1>' +
      '<p>Source: Research report, published 20 June 2026.</p>' +
      '<p>Data period CY2025 / CY2026 YTD (Jan-May).</p></div>' });
  assert.equal(record.publication.publicationDate, null);
  assert.equal(record.publication.dataCutoffDate, 'CY2025 / CY2026 YTD (Jan-May)');
});

test('regional tiles stay in one record with Active and Coming Soon states', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/regions/apac.html',
    content: '<title>APAC</title><div class="chapter-content">' +
      '<a class="directory-tile" href="../countries/india.html"><h3>India</h3><span class="country-status--active">Active</span></a>' +
      '<span class="directory-tile"><h3>Japan</h3><span class="country-status--coming-soon">Coming Soon</span></span></div>' });
  assert.equal(record.family, 'regional-directory');
  assert.equal(record.structuredIntelligence.length, 2);
  assert.deepEqual(record.structuredIntelligence.map(item => item.status), ['Active', 'Coming Soon']);
  assert.equal(record.structuredIntelligence[0].href, '../countries/india.html');
});

test('research edition and bibliography are distinct from historical chronology', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/research/example.html',
    content: '<title>Research</title><section class="page-content">' +
      '<p>Historical Background: 1944 to 2025.</p><table><tr><th>Year</th><td>1944</td></tr></table>' +
      '<section class="references-section"><h2>References & Bibliography</h2><p>Bank for International Settlements</p></section>' +
      '</section><p>Version 1.0 • July 2026</p>' });
  assert.equal(record.tableCandidates.length, 1);
  assert.equal(record.lineage.version, 'Version 1.0');
  assert.equal(record.lineage.state, 'current');
  assert.ok(record.provenance.sourceReferences.some(item => item.includes('Bank for International Settlements')));
});

test('corridor forecasts are review required and tables remain structured', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/chapters/corridor-factbook.html',
    content: '<title>Factbook</title><div class="chapter-content"><p>Future growth forecast to 2040.</p>' +
      '<table><tr><th>Corridor</th><th>Volume</th></tr><tr><td>A to B</td><td>10</td></tr></table></div>' });
  assert.equal(record.validationStatus, 'WARN');
  assert.ok(record.targets.includes('F'));
  assert.equal(record.tableCandidates[0].rows[1][0], 'A to B');
  assert.ok(record.exceptions.warnings.some(item => item.code === 'FORECAST_REVIEW'));
});

test('explicit page identity is distinct from a referenced dashboard publication', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/countries/example.html',
    content: '<meta name="gpir-publication-id" content="VK-GPI-APAC-EX-2026-001">' +
      '<title>Example</title><div class="chapter-content">' +
      '<p>Dashboard Reference ID <strong>VK-GPI-APAC-EX-2026-002</strong>.</p></div>' });
  assert.equal(record.identityStatus, 'verified');
  assert.equal(record.gpirPublicationId, 'VK-GPI-APAC-EX-2026-001');
  assert.deepEqual(record.referencedPublicationIds, ['VK-GPI-APAC-EX-2026-002']);
});

test('country scope, C2C category and all source-list names follow explicit evidence', () => {
  const html = '<title>Country</title><div class="chapter-content">' +
    '<p>Inbound C2C remittances and Outbound C2C remittances are reported.</p>' +
    '<section id="sources"><ul><li>UN DESA</li><li>Ministry of External Affairs</li></ul></section>' +
    '<div class="data-source-line">Source: National statistics office</div></div>';
  const record = convertLegacyContent({ sourcePath: 'pages/countries/example.html', content: html });
  assert.equal(record.publication.directionScope, 'Both');
  assert.equal(record.publication.useCase, 'C2C');
  assert.ok(record.provenance.sourceReferences.includes('UN DESA'));
  assert.ok(record.provenance.sourceReferences.includes('Ministry of External Affairs'));
  assert.ok(record.provenance.sourceReferences.includes('Source: National statistics office'));
  const onlyInbound = convertLegacyContent({ sourcePath: 'pages/countries/example.html',
    content: '<title>Country</title><div class="chapter-content"><p>Inbound C2C remittances.</p></div>' });
  assert.equal(onlyInbound.publication.directionScope, 'Inbound');
});

test('directory controls and child tile text do not pollute editorial narrative', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/regions/example.html',
    content: '<title>Region</title><p class="chapter-hero-intro">Regional introduction.</p>' +
      '<div class="chapter-content"><aside><h3>Navigate</h3></aside>' +
      '<div class="directory-grid"><a class="directory-tile" href="a.html">' +
      '<div><h3>Market Alpha</h3><span class="country-status--active">Active</span></div>' +
      '<p>Tile-only description.</p></a></div>' +
      '<p class="directory-empty-state" hidden>No countries match your search.</p>' +
      '<p>Editorial directory note.</p></div>' });
  assert.deepEqual(record.editorialNarrative, ['Regional introduction.', 'Editorial directory note.']);
  assert.equal(record.structuredIntelligence.length, 1);
  assert.equal(record.structuredIntelligence[0].market, 'Market Alpha');
});

test('research table of contents is neither narrative nor provenance', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/research/example.html',
    content: '<title>Research</title><section class="page-content">' +
      '<aside class="toc-sidebar"><h3>Contents</h3><li>5. SWIFT Network</li></aside>' +
      '<main class="article-content"><h2>Research findings</h2><p>Substantive analysis.</p></main>' +
      '<section class="references-section"><h2>References & Bibliography</h2>' +
      '<li>SWIFT Documentation</li><li>World Bank</li></section></section>' });
  assert.ok(record.editorialNarrative.includes('Substantive analysis.'));
  assert.ok(!record.editorialNarrative.includes('Contents'));
  assert.ok(!record.provenance.sourceReferences.includes('5. SWIFT Network'));
  assert.ok(record.provenance.sourceReferences.includes('SWIFT Documentation'));
  assert.ok(record.provenance.sourceReferences.includes('World Bank'));
});

test('each structured row distinguishes observed, incomplete, forecast and unknown', () => {
  const record = convertLegacyContent({ sourcePath: 'pages/chapters/example.html',
    content: '<title>Chapter</title><div class="chapter-content">' +
      '<h2>Current data</h2><table><tr><th>Metric</th><th>CY2025 actual</th></tr>' +
      '<tr><td>Observed</td><td>12</td></tr><tr><td>Missing</td><td>Data Under Development</td></tr></table>' +
      '<h2>Future Growth Corridors</h2><table><tr><th>Rail 2035–2040</th></tr>' +
      '<tr><td>Wallet and RTP</td></tr></table>' +
      '<h2>Unqualified data</h2><table><tr><th>Metric</th></tr><tr><td>42</td></tr></table></div>' });
  assert.deepEqual(record.tableCandidates.map(table => table.dataNature), ['incomplete', 'forecast', 'unknown']);
  assert.deepEqual(record.tableCandidates[0].rowReview.slice(1).map(row => row.dataNature),
    ['observed', 'incomplete']);
  assert.ok(record.tableCandidates[0].rowReview[1].reviewRequired === false);
  assert.ok(record.tableCandidates[0].rowReview[2].reviewRequired);
  assert.ok(record.tableCandidates[1].reviewRequired);
  assert.ok(record.tableCandidates[2].reviewRequired);
  assert.deepEqual(record.structuredIntelligence.filter(item => item.kind === 'table')
    .map(item => item.dataNature), ['incomplete', 'forecast', 'unknown']);
});

test('schema requires separate identity and candidate-level review structure', () => {
  const schema = require('../../schemas/m35/migration-record.schema.json');
  assert.ok(schema.required.includes('identityStatus'));
  assert.ok(schema.required.includes('referencedPublicationIds'));
  assert.deepEqual(schema.$defs.reviewState.properties.dataNature.enum,
    ['observed', 'forecast', 'incomplete', 'unknown']);
  assert.ok(schema.$defs.reviewState.required.includes('reviewRequired'));
  assert.ok(schema.$defs.tableCandidate.allOf[1].required.includes('rowReview'));
  assert.equal(schema.properties.tableCandidates.items.$ref, '#/$defs/tableCandidate');
  assert.equal(schema.properties.structuredIntelligence.items.$ref, '#/$defs/candidate');
});

test('emitted record and review candidates conform to the interchange schema', () => {
  const schema = require('../../schemas/m35/migration-record.schema.json');
  function conforms(value, rule) {
    if (rule.$ref) return conforms(value, rule.$ref.split('/').slice(1)
      .reduce((node, key) => node[key], schema));
    if (rule.allOf && !rule.allOf.every(part => conforms(value, part))) return false;
    if (rule.if && conforms(value, rule.if) && !conforms(value, rule.then)) return false;
    if (rule.type) {
      const kinds = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (!kinds.some(kind => kind === 'null' ? value === null
        : kind === 'array' ? Array.isArray(value)
          : kind === 'integer' ? Number.isInteger(value)
            : kind === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
              : typeof value === kind)) return false;
    }
    if ('const' in rule && value !== rule.const) return false;
    if (rule.enum && !rule.enum.includes(value)) return false;
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) return false;
    if (rule.required && rule.required.some(key => !(key in value))) return false;
    if (rule.properties && value && typeof value === 'object') {
      for (const [key, child] of Object.entries(rule.properties))
        if (key in value && !conforms(value[key], child)) return false;
      if (rule.additionalProperties === false && Object.keys(value)
        .some(key => !(key in rule.properties))) return false;
    }
    if (rule.items && Array.isArray(value) && !value.every(item => conforms(item, rule.items))) return false;
    if (rule.uniqueItems && Array.isArray(value) && new Set(value.map(JSON.stringify)).size !== value.length)
      return false;
    return true;
  }
  const record = convertLegacyContent({ sourcePath: 'pages/chapters/example.html',
    content: '<title>Example</title><div class="chapter-content"><h2>Future growth 2040</h2>' +
      '<table><tr><th>Rail</th></tr><tr><td>RTP</td></tr></table></div>' });
  assert.ok(conforms(record, schema));
  const invalid = structuredClone(record);
  invalid.tableCandidates[0].rowReview[1].dataNature = 'validated';
  assert.equal(conforms(invalid, schema), false);
});
