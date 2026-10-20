'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  approvedReleaseManifest,
  buildEditorialBody,
  publishApprovedContentfulEntries,
  validateReleasePackage
} = require('../../scripts/m36/synchronize-cl03c-contentful');

const root = path.resolve(__dirname, '../..');
const mappings = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl03-scaleout/content-module-mappings.json'), 'utf8'));
const reconciliation = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl03a-five/content-reconciliation-report.json'), 'utf8'));
const canonicalRoutes = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl03c/contentful-canonical-route-readback.json'), 'utf8'));

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function bodyHash(value) {
  return crypto.createHash('sha256').update(Buffer.from(stableJson(value))).digest('hex');
}

function preparedPublications() {
  return reconciliation.publications.map(publication => {
    const expected = approvedReleaseManifest.publications.find(item =>
      item.publicationId === publication.publicationId);
    const mapping = mappings.publications[publication.publicationId];
    const sourceHtml = fs.readFileSync(path.join(root, mapping.sourcePath), 'utf8');
    const editorialBody = buildEditorialBody(mapping, sourceHtml, publication.publicationId);
    const route = canonicalRoutes.publications.find(item =>
      item.publicationId === publication.publicationId);
    assert.equal(bodyHash(editorialBody), expected.editorialBodySha256);
    return {
      publicationId: publication.publicationId,
      contentfulEntryId: publication.contentfulEntryId,
      contentfulCanonicalRoute: route.canonicalUrlCandidate,
      editorialBody,
      editorialBodySha256: bodyHash(editorialBody)
    };
  });
}

function localized(value) {
  return { 'en-US': value };
}

function entry(item, version, publishedVersion, body) {
  const expected = approvedReleaseManifest.publications.find(candidate =>
    candidate.contentfulEntryId === item.contentfulEntryId);
  return {
    sys: {
      id: expected.contentfulEntryId,
      contentType: { sys: { id: 'gpirPublication' } },
      space: { sys: { id: approvedReleaseManifest.spaceId } },
      environment: { sys: { id: approvedReleaseManifest.environment } },
      version,
      publishedVersion,
      publishedAt: '2026-10-20T12:00:00.000Z'
    },
    fields: {
      gpirPublicationId: localized(expected.publicationId),
      canonicalUrlCandidate: localized(expected.canonicalRoute),
      editorialBody: localized(body)
    }
  };
}

function mockContentfulRequest(publications, { failPublishEntryId = null } = {}) {
  const requests = [];
  const current = new Map();
  for (const item of publications) {
    current.set(item.contentfulEntryId,
      entry(item, 3, 1, item.editorialBody));
  }
  async function request(method, apiPath, body, headers = {}) {
    requests.push({ method, apiPath, headers });
    const match = apiPath.match(/^\/entries\/([^/]+)(\/published)?$/);
    if (method === 'GET' && match) {
      const id = decodeURIComponent(match[1]);
      const item = match[2] ? published.get(id) : current.get(id);
      return structuredClone(item);
    }
    if (method === 'GET' && apiPath.startsWith('/entries?')) {
      const publicationId = decodeURIComponent(
        new URLSearchParams(apiPath.slice(apiPath.indexOf('?') + 1))
          .get('fields.gpirPublicationId'));
      const item = publications.find(candidate => candidate.publicationId === publicationId);
      return { total: item ? 1 : 0, items: item ? [{ sys: { id: item.contentfulEntryId } }] : [] };
    }
    if (method === 'PUT' && match?.[2] === '/published') {
      const id = decodeURIComponent(match[1]);
      if (id === failPublishEntryId) throw new Error('Mocked version conflict.');
      assert.equal(headers['x-contentful-version'], '3');
      const currentEntry = current.get(id);
      currentEntry.sys.version = 4;
      currentEntry.sys.publishedVersion = 3;
      return { sys: { id, version: 4, publishedVersion: 3 } };
    }
    throw new Error(`Unexpected mock request: ${method} ${apiPath}`);
  }
  return { request, requests, current };
}

const contentfulConfig = {
  spaceId: approvedReleaseManifest.spaceId,
  environment: approvedReleaseManifest.environment
};

test('release allowlist is the exact five records in the successful sync artifact', () => {
  assert.deepEqual(approvedReleaseManifest.publications.map(item => ({
    publicationId: item.publicationId,
    contentfulEntryId: item.contentfulEntryId,
    canonicalRoute: item.canonicalRoute,
    editorialBodySha256: item.editorialBodySha256,
    expectedDraftVersion: item.expectedDraftVersion,
    expectedPublishedVersion: item.expectedPublishedVersion
  })), [
    {
      publicationId: 'VK-GPIR-P-000000000003-4',
      contentfulEntryId: '7FBD5IpsZutLF63MKuOntS',
      canonicalRoute: '/global-legalized-betting-gambling-lottery-wagering-payments-gpir-research-fintechoisis/',
      editorialBodySha256: '16b5a3c21d3e7acbc6b8b7f4e43ce7d851b5bf80d35eadf1d0bfe7bdc730fb14',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    },
    {
      publicationId: 'VK-GPIR-P-000000000004-2',
      contentfulEntryId: '2DHHp4k0GbZXcYvCFLoCPw',
      canonicalRoute: '/global-cross-border-bill-payments-family-financial-services-gpir-research-fintechoisis/',
      editorialBodySha256: '2da335e3da0cac2e5ea6248183ff075fc0e79360d5f214e8b3d383d61ca871d5',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    },
    {
      publicationId: 'VK-GPIR-P-000000000008-3',
      contentfulEntryId: '6e0k5jOAGiEjj1iBKcNtVz',
      canonicalRoute: '/global-gaming-payments-industry-gpir-research-fintechoisis/',
      editorialBodySha256: '41441deee7a4916450885acdb4f78ca1b677c3e870c5e30d3de06fa906a6fcf2',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    },
    {
      publicationId: 'VK-GPIR-P-000000000009-1',
      contentfulEntryId: '2l3AdU2yAK87mANrSwZiej',
      canonicalRoute: '/global-gig-economy-freelancer-creator-payments-industry-gpir-research-fintechoisis/',
      editorialBodySha256: 'ce3858ef84cddede6a8b0662f3a92fbeb6f7eda599980ad9030b8e103149849b',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    },
    {
      publicationId: 'VK-GPIR-P-000000000011-7',
      contentfulEntryId: '2XfDk3XcUCUtUzSQnx1f8l',
      canonicalRoute: '/global-healthcare-medical-tourism-cross-border-health-payments-gpir-research-fintechoisis/',
      editorialBodySha256: 'a60ea3114f7a038af71ca738af1fe01a8346e71489ef97f70458a74302c311b8',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    }
  ]);
  assert.equal(approvedReleaseManifest.sourceRunId, '39423907702');
  assert.equal(approvedReleaseManifest.publications.length, 5);
  assert.equal(approvedReleaseManifest.publications.some(item =>
    ['53bt9kTDAIHVvCCGne4HwL', '5XUjNDKIxcoyHFM3x0meh3'].includes(item.contentfulEntryId)), false);
});

test('release package rejects a sixth entry, CL-04 entry, route or checksum mismatch', () => {
  const approved = preparedPublications();
  assert.equal(validateReleasePackage(approved, approvedReleaseManifest, contentfulConfig), true);
  assert.throws(() => validateReleasePackage([...approved, approved[0]],
    approvedReleaseManifest, contentfulConfig), /exactly five/);

  const unrelated = approved.map(item => ({ ...item }));
  for (const unrelatedEntryId of ['53bt9kTDAIHVvCCGne4HwL', '5XUjNDKIxcoyHFM3x0meh3']) {
    const altered = approved.map(item => ({ ...item }));
    altered[0].contentfulEntryId = unrelatedEntryId;
    assert.throws(() => validateReleasePackage(altered,
      approvedReleaseManifest, contentfulConfig), /package mismatch/);
  }

  for (const key of ['contentfulCanonicalRoute', 'editorialBodySha256']) {
    const altered = approved.map(item => ({ ...item }));
    altered[0][key] = 'mismatched';
    assert.throws(() => validateReleasePackage(altered,
      approvedReleaseManifest, contentfulConfig), /package mismatch/);
  }
  assert.throws(() => validateReleasePackage(approved, approvedReleaseManifest,
    { ...contentfulConfig, environment: 'preview' }), /space or environment/);
});

test('publishing preflights all five and immediately verifies exact published readbacks', async () => {
  const approved = preparedPublications();
  const mock = mockContentfulRequest(approved);
  let report;
  report = await publishApprovedContentfulEntries(approved, {
    ...contentfulConfig,
    request: mock.request,
    writeReport: value => { report = structuredClone(value); }
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.publications.length, 5);
  assert.ok(report.publications.every(item =>
    item.status === 'PUBLISH_READBACK_PASS' && item.publishedVersion === 3));
  const publishRequests = mock.requests.filter(item => item.method === 'PUT');
  assert.deepEqual(publishRequests.map(item =>
    decodeURIComponent(item.apiPath.match(/^\/entries\/([^/]+)/)[1])),
  approvedReleaseManifest.publications.map(item => item.contentfulEntryId));
  assert.deepEqual(publishRequests.map(item => item.apiPath.endsWith('/published')), [
    true, true, true, true, true
  ]);
  assert.equal(mock.requests.indexOf(publishRequests[0]), 10);
  for (let index = 0; index < publishRequests.length; index += 1) {
    const publishIndex = mock.requests.indexOf(publishRequests[index]);
    assert.equal(mock.requests[publishIndex + 1].method, 'GET');
    assert.equal(mock.requests[publishIndex + 1].apiPath,
      `/entries/${approvedReleaseManifest.publications[index].contentfulEntryId}`);
  }
});

test('a preflight mismatch stops before any publish request', async () => {
  const approved = preparedPublications();
  const mock = mockContentfulRequest(approved);
  const request = mock.request;
  const guardedRequest = async (method, apiPath, body, headers) => {
    const result = await request(method, apiPath, body, headers);
    if (method === 'GET' && apiPath ===
      `/entries/${approvedReleaseManifest.publications[2].contentfulEntryId}`)
      result.sys.version = 4;
    return result;
  };
  let report;

  await assert.rejects(publishApprovedContentfulEntries(approved, {
    ...contentfulConfig,
    request: guardedRequest,
    writeReport: value => { report = structuredClone(value); }
  }), /draft or preserved published version mismatch/);

  assert.equal(report.status, 'PREFLIGHT_FAILED_NO_PUBLISH');
  assert.equal(mock.requests.some(item => item.method === 'PUT'), false);
});

test('a publish failure stops the sequence and preserves the actual partial state', async () => {
  const approved = preparedPublications();
  const failedEntryId = approvedReleaseManifest.publications[2].contentfulEntryId;
  const mock = mockContentfulRequest(approved, { failPublishEntryId: failedEntryId });
  let report;

  await assert.rejects(publishApprovedContentfulEntries(approved, {
    ...contentfulConfig,
    request: mock.request,
    writeReport: value => { report = structuredClone(value); }
  }), /Mocked version conflict/);

  assert.equal(report.status, 'PUBLISH_STOPPED');
  assert.deepEqual(report.publications.map(item => item.status), [
    'PUBLISH_READBACK_PASS',
    'PUBLISH_READBACK_PASS',
    'PUBLISH_FAILED_OR_UNKNOWN',
    'PREFLIGHT_PASS',
    'PREFLIGHT_PASS'
  ]);
  assert.equal(mock.requests.filter(item => item.method === 'PUT').length, 3);
  assert.equal(mock.current.get(failedEntryId).sys.publishedVersion, 1);
});
