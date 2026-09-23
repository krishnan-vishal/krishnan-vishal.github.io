'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { discover, sourceUnitKey, generateManifest } =
  require('../../scripts/m35/generate-migration-manifest');

const root = path.resolve(__dirname, '../..');

test('discovery separates content, shell, historical index and empty placeholders', () => {
  assert.equal(discover('pages/chapters/example.html', '<p>Research</p>').state, 'MIGRATION_ELIGIBLE');
  assert.equal(discover('404.html', '<h1>404</h1>').state, 'APPLICATION_SHELL');
  assert.equal(discover('Archive/index-v1.0.html', '<h1>Home</h1>').state, 'HISTORICAL_CONTENT');
  assert.deepEqual(discover('pages/countries/example.html', ''),
    { state: 'NON_PUBLICATION', reasonCodes: ['EMPTY_PLACEHOLDER'] });
  assert.equal(discover('pages/countries/alias.html',
    '<meta http-equiv="refresh" content="0;url=/elsewhere">').state, 'REDIRECT_OR_ALIAS');
});

test('source-unit key is deterministic and does not use dashboard IDs', () => {
  assert.equal(sourceUnitKey('pages/countries/singapore.html'),
    'gpir:intake:publication:country:singapore:html:legacy-primary');
  assert.throws(() => sourceUnitKey('index.html'));
});

test('repository manifest is deterministic, complete and never invents legacy metadata', () => {
  const first = generateManifest(root);
  assert.deepEqual(first, generateManifest(root));
  assert.equal(first.manifest.summary.HTML_DISCOVERED_TOTAL, first.manifest.discovery.length);
  assert.equal(first.manifest.summary.discovery.MIGRATION_ELIGIBLE, first.manifest.records.length);
  assert.equal(first.manifest.summary.classification.READY +
    first.manifest.summary.classification.REVIEW_REQUIRED +
    first.manifest.summary.classification.BLOCKED_REQUIRED_FIELD +
    first.manifest.summary.classification.IDENTITY_CONFLICT, first.manifest.records.length);
  assert.equal(new Set(first.manifest.records.map(item => item.sourceUnitKey)).size,
    first.manifest.records.length);
  assert.ok(first.manifest.records.every(item =>
    (item.publicationDate === null || item.publicationDateEvidence) &&
    (item.editionLabel === null || item.editionLabelEvidence)));
  assert.ok(first.manifest.records.every(item => item.contentfulEntryState === 'UNCHECKED'));
  assert.ok(first.manifest.records.every(item => item.lineageIdentity === null));
});

test('exception artifact contains only non-ready records and discovery reviews', () => {
  const { manifest, exceptions } = generateManifest(root);
  assert.ok(exceptions.records.every(item => item.readinessClassification !== 'READY'));
  assert.ok(exceptions.discovery.every(item => item.state === 'REVIEW_DISCOVERY'));
  assert.equal(exceptions.records.length,
    manifest.records.length - manifest.summary.classification.READY);
});
