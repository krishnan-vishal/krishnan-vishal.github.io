'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const manifest = require('../../artifacts/m39/fx-contentful-batch.json');
const presentation = require('../../scripts/m35/publication-presentation-manifest.json');
const { buildManifest } = require('../../scripts/m39/build-fx-contentful-batch.cjs');
const { desiredFieldsMatch, isCurrentlyPublished, localizeFields, validateManifest } =
  require('../../scripts/m39/fx-contentful-batch-preflight.cjs');

test('build output is the exact approved 25-pair governed manifest', () => {
  assert.deepEqual(buildManifest(), manifest);
  assert.equal(validateManifest().entries.length, 25);
  assert.equal(new Set(manifest.entries.map(entry => entry.publicationIdentity)).size, 25);
  assert.equal(new Set(manifest.entries.map(entry => entry.editionLineageId)).size, 25);
  assert.equal(new Set(manifest.entries.map(entry => entry.supabaseRecordId)).size, 25);
  assert.equal(new Set(manifest.entries.map(entry => entry.contentfulEntryId)).size, 25);
  assert.equal(new Set(manifest.entries.map(entry => entry.canonicalRoute)).size, 25);
  for (const entry of manifest.entries)
    assert.equal(presentation[entry.publicationIdentity]?.accessClass, 'PUBLIC');
});

test('all seven limited-coverage pairs disclose exactly two dated observations', () => {
  const limited = manifest.entries.filter(entry => entry.datedObservationCount === 2);
  assert.deepEqual(limited.map(entry => entry.pair),
    ['AED/INR', 'USD/AED', 'USD/SAR', 'USD/QAR', 'USD/KWD', 'USD/BHD', 'USD/OMR']);
  for (const entry of limited) {
    assert.match(entry.fields.executiveSummary, /only two dated/i);
    assert.match(entry.fields.executiveSummary, /cannot support a historical trend inference/i);
  }
});

test('Contentful localization and current publication detection are deterministic', () => {
  const fields = localizeFields({ title: 'Example', omitted: null, body: { nodeType: 'document' } });
  assert.deepEqual(fields, {
    title: { 'en-US': 'Example' },
    body: { 'en-US': { nodeType: 'document' } }
  });
  assert.equal(desiredFieldsMatch(fields, fields), true);
  assert.equal(desiredFieldsMatch({ ...fields, title: { 'en-US': 'Different' } }, fields), false);
  assert.equal(isCurrentlyPublished({ sys: { version: 4, publishedVersion: 3 } }), true);
  assert.equal(isCurrentlyPublished({ sys: { version: 5, publishedVersion: 3 } }), false);
});
