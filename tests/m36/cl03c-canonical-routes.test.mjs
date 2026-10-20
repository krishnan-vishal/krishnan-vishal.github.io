import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mappings = JSON.parse(fs.readFileSync(
  path.join(root, 'artifacts/m36/cl03-scaleout/content-module-mappings.json'), 'utf8'));
const reconciliation = JSON.parse(fs.readFileSync(
  path.join(root, 'artifacts/m36/cl03a-five/content-reconciliation-report.json'), 'utf8'));
const routes = JSON.parse(fs.readFileSync(
  path.join(root, 'artifacts/m36/cl03c/contentful-canonical-route-readback.json'), 'utf8'));

const expected = [
  {
    publicationId: 'VK-GPIR-P-000000000003-4',
    contentfulEntryId: '7FBD5IpsZutLF63MKuOntS',
    canonicalUrlCandidate: '/global-legalized-betting-gambling-lottery-wagering-payments-gpir-research-fintechoisis/',
    sourcePath: 'pages/chapters/betting-payments.html',
    sourceSha256: 'f500c456acf4b534f42224a5c1ad5669f7ae395b3eda837b3b412b5c3741fac0'
  },
  {
    publicationId: 'VK-GPIR-P-000000000004-2',
    contentfulEntryId: '2DHHp4k0GbZXcYvCFLoCPw',
    canonicalUrlCandidate: '/global-cross-border-bill-payments-family-financial-services-gpir-research-fintechoisis/',
    sourcePath: 'pages/chapters/bill-payments.html',
    sourceSha256: '95ed52658abbf1a7202083ba091d905ac8ed1ca58432dfada2fb6486222ec849'
  },
  {
    publicationId: 'VK-GPIR-P-000000000008-3',
    contentfulEntryId: '6e0k5jOAGiEjj1iBKcNtVz',
    canonicalUrlCandidate: '/global-gaming-payments-industry-gpir-research-fintechoisis/',
    sourcePath: 'pages/chapters/gaming-payments.html',
    sourceSha256: '5c48cf420cb7a81e2fe4f76b1c6dcf1ba9f4e1283c2d7619104e40bb266d71d3'
  },
  {
    publicationId: 'VK-GPIR-P-000000000009-1',
    contentfulEntryId: '2l3AdU2yAK87mANrSwZiej',
    canonicalUrlCandidate: '/global-gig-economy-freelancer-creator-payments-industry-gpir-research-fintechoisis/',
    sourcePath: 'pages/chapters/gig-economy-creator-payments.html',
    sourceSha256: 'd03c3bccfbd705010cfabea7463e4c5b2e3f2ed87bf97bc3c1551a9d248d1e5b'
  },
  {
    publicationId: 'VK-GPIR-P-000000000011-7',
    contentfulEntryId: '2XfDk3XcUCUtUzSQnx1f8l',
    canonicalUrlCandidate: '/global-healthcare-medical-tourism-cross-border-health-payments-gpir-research-fintechoisis/',
    sourcePath: 'pages/chapters/healthcare-payments.html',
    sourceSha256: '2d255fa7ac2544d17dd6024f3eecbc6d20d0704f8806c52349ab5c8de4bff7f9'
  }
];

test('CL-03C canonical routes match read-only Contentful evidence and preserve approved sources', () => {
  assert.equal(routes.status, 'PASS_READ_ONLY_CONTENTFUL_ROUTE_READBACK');
  assert.equal(routes.readOnly, true);
  assert.equal(routes.source.method, 'GET');
  assert.equal(routes.source.locale, 'en-US');
  assert.equal(routes.publications.length, expected.length);

  for (const expectedRecord of expected) {
    const route = routes.publications.find(item => item.publicationId === expectedRecord.publicationId);
    const publication = reconciliation.publications.find(
      item => item.publicationId === expectedRecord.publicationId);
    const mapping = mappings.publications[expectedRecord.publicationId];
    assert.ok(route, `${expectedRecord.publicationId} route readback is missing`);
    assert.equal(route.contentfulEntryId, expectedRecord.contentfulEntryId);
    assert.equal(route.canonicalUrlCandidate, expectedRecord.canonicalUrlCandidate);
    assert.equal(publication.contentfulEntryId, expectedRecord.contentfulEntryId);
    assert.equal(mapping.contentfulEntryId, expectedRecord.contentfulEntryId);
    assert.equal(mapping.sourcePath, expectedRecord.sourcePath);
    assert.equal(publication.contentReconciliation.sourceSha256, expectedRecord.sourceSha256);
    assert.equal(crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(root, expectedRecord.sourcePath)))
      .digest('hex'), expectedRecord.sourceSha256);
    assert.notEqual(route.canonicalUrlCandidate, publication.existingCanonicalRoute);
  }
});
