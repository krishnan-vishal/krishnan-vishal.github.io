'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { contentfulDeliveryConfig, publicBuildMetadata } =
  require('../../scripts/m35/contentful-delivery-config');
const { buildArtifact, entriesUrl, fetchContentfulPublications, parseArgs } =
  require('../../scripts/m35/fetch-contentful-publications');

const base = {
  CONTENTFUL_SPACE_ID: 'space-id',
  CONTENTFUL_ENVIRONMENT: 'master',
  CONTENTFUL_DELIVERY_TOKEN: 'delivery-secret',
  CONTENTFUL_PREVIEW_TOKEN: 'preview-secret',
  CONTENTFUL_MANAGEMENT_TOKEN: 'management-secret'
};

test('production delivery uses only the read-only Delivery API contract', () => {
  const config = contentfulDeliveryConfig(base, 'delivery');
  assert.equal(config.host, 'cdn.contentful.com');
  assert.equal(config.tokenName, 'CONTENTFUL_DELIVERY_TOKEN');
  assert.equal(config.token, base.CONTENTFUL_DELIVERY_TOKEN);
  assert.match(entriesUrl(config), /content_type=gpirPublication/);
});

test('controlled Draft validation uses the separate Preview API contract', () => {
  const config = contentfulDeliveryConfig(base, 'preview');
  assert.equal(config.host, 'preview.contentful.com');
  assert.equal(config.tokenName, 'CONTENTFUL_PREVIEW_TOKEN');
  assert.equal(config.token, base.CONTENTFUL_PREVIEW_TOKEN);
});

test('missing credentials fail closed without echoing token values', () => {
  assert.throws(() => contentfulDeliveryConfig({
    CONTENTFUL_SPACE_ID: 'space-id', CONTENTFUL_ENVIRONMENT: 'master'
  }), error => error.message === 'Missing required Contentful configuration: CONTENTFUL_DELIVERY_TOKEN');
});

test('the Management API token cannot be reused for delivery', () => {
  assert.throws(() => contentfulDeliveryConfig({ ...base,
    CONTENTFUL_DELIVERY_TOKEN: base.CONTENTFUL_MANAGEMENT_TOKEN
  }), /Management API token cannot be used/);
});

test('public build metadata and generated artifacts contain no credentials', () => {
  const config = contentfulDeliveryConfig(base, 'preview');
  const artifact = buildArtifact(config, [{
    sys: { id: 'entry-b', contentType: { sys: { id: 'gpirPublication' } } },
    fields: { gpirPublicationId: 'VK-GPIR-P-000000000002-6', publicationTitle: 'B' }
  }, {
    sys: { id: 'entry-a', contentType: { sys: { id: 'gpirPublication' } } },
    fields: { gpirPublicationId: 'VK-GPIR-P-000000000001-8', publicationTitle: 'A' }
  }]);
  assert.deepEqual(publicBuildMetadata(config), artifact.source);
  assert.deepEqual(artifact.records.map(record => record.entryId), ['entry-a', 'entry-b']);
  const encoded = JSON.stringify(artifact);
  for (const secret of [base.CONTENTFUL_DELIVERY_TOKEN, base.CONTENTFUL_PREVIEW_TOKEN,
    base.CONTENTFUL_MANAGEMENT_TOKEN]) assert.equal(encoded.includes(secret), false);
  assert.equal(Object.hasOwn(artifact, 'generatedAt'), false);
});

test('Contentful failure produces no partial collection', async () => {
  const config = contentfulDeliveryConfig(base, 'delivery');
  await assert.rejects(fetchContentfulPublications(config, async () => ({ ok: false, status: 503 })),
    /status 503/);
});

test('CLI contract keeps production and preview modes explicit', () => {
  assert.deepEqual(parseArgs(['--mode=preview', '--output=.generated/test.json', '--expected=32']), {
    mode: 'preview', output: '.generated/test.json', expected: 32
  });
});

