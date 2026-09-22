'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft } = require('../../scripts/m35/build-contentful-draft');
const { InMemoryIdentityRegistry, resolveIdentity, contentfulIdentityEligible,
  checkDigit, governedId, validGovernedId } = require('../../scripts/m35/identity-authority');

function registry() {
  return new InMemoryIdentityRegistry({ now: () => '2026-09-22T00:00:00.000Z' });
}
function record(sourcePath = 'pages/research/example.html', title = 'Example') {
  return convertLegacyContent({ sourcePath, content: `<title>${title}</title><p>Editorial content.</p>` });
}
function assign(adapter, key = 'fixture:one', source = record(), extra = {}) {
  return resolveIdentity(source, { sourceUnitKey: key, ...extra }, adapter);
}

test('first governed assignment uses separate publication and lineage namespaces', () => {
  const result = assign(registry());
  assert.equal(result.identity.identityStatus, 'GOVERNED_ASSIGNED');
  assert.equal(result.identity.gpirPublicationId, governedId('P', 1));
  assert.equal(result.identity.editionLineageId, governedId('L', 1));
  assert.equal(result.identity.assignmentMethod, 'governed-sequence');
  assert.equal(result.identity.assignmentTimestamp, '2026-09-22T00:00:00.000Z');
});

test('repeat assignment returns identical identity and does not consume sequence', () => {
  const adapter = registry();
  const first = assign(adapter);
  assert.deepEqual(assign(adapter), first);
  assert.equal(adapter.nextPublication, 2);
  assert.equal(adapter.nextLineage, 2);
});

test('second publication receives a different ID', () => {
  const adapter = registry();
  const first = assign(adapter);
  const second = assign(adapter, 'fixture:two');
  assert.notEqual(first.identity.gpirPublicationId, second.identity.gpirPublicationId);
});

test('later edition reuses lineage only through explicit predecessor link', () => {
  const adapter = registry();
  const first = assign(adapter);
  const later = assign(adapter, 'fixture:later', record('pages/research/later.html'),
    { lineageSourceUnitKey: 'fixture:one' });
  assert.equal(later.identity.editionLineageId, first.identity.editionLineageId);
  assert.notEqual(later.identity.gpirPublicationId, first.identity.gpirPublicationId);
  assert.equal(later.identity.previousPublicationId, first.identity.gpirPublicationId);
});

test('unrelated publication receives a distinct lineage', () => {
  const adapter = registry();
  const first = assign(adapter);
  const other = assign(adapter, 'fixture:other');
  assert.notEqual(first.identity.editionLineageId, other.identity.editionLineageId);
});

test('dashboard reference remains typed relatedObjectId and is not promoted', () => {
  const adapter = registry();
  const source = record('pages/countries/example.html');
  source.referencedPublicationIds = ['VK-GPI-APAC-EX-2026-005'];
  const result = assign(adapter, 'fixture:country', source);
  assert.notEqual(result.identity.gpirPublicationId, 'VK-GPI-APAC-EX-2026-005');
  assert.deepEqual(result.identity.relatedObjectIds, [{ type: 'dashboard-reference',
    value: 'VK-GPI-APAC-EX-2026-005', evidence: 'Source Reference ID' }]);
});

test('proved and unique source-native publication ID is retained', () => {
  const result = assign(registry(), 'fixture:native', record(), {
    claimedPublicationId: 'VK-GPI-APAC-EX-2026-001',
    sourceNativeEvidence: { isSamePublication: true, uniquenessEstablished: true,
      citation: 'Publication header identifies this exact edition' }
  });
  assert.equal(result.identity.identityStatus, 'SOURCE_NATIVE');
  assert.equal(result.identity.gpirPublicationId, 'VK-GPI-APAC-EX-2026-001');
  assert.deepEqual(result.identity.sourceNativeIds, ['VK-GPI-APAC-EX-2026-001']);
});

test('ambiguous source-native claim stays provisional without consuming sequence', () => {
  const adapter = registry();
  const result = assign(adapter, 'fixture:ambiguous', record(), {
    claimedPublicationId: 'VK-GPI-APAC-EX-2026-001',
    sourceNativeEvidence: { isSamePublication: false, uniquenessEstablished: false,
      citation: 'Reference only' }
  });
  assert.equal(result.identity.identityStatus, 'PROVISIONAL');
  assert.equal(result.identity.gpirPublicationId, null);
  assert.equal(adapter.nextPublication, 1);
});

test('duplicate claimed publication ID enters collision review', () => {
  const adapter = registry();
  const claim = { claimedPublicationId: 'VK-GPI-APAC-EX-2026-001',
    sourceNativeEvidence: { isSamePublication: true, uniquenessEstablished: true, citation: 'Header' } };
  assign(adapter, 'fixture:a', record(), claim);
  const collision = assign(adapter, 'fixture:b', record(), claim);
  assert.equal(collision.identity.identityStatus, 'COLLISION_REVIEW');
  assert.equal(collision.identity.collisionState, 'review');
  assert.equal(collision.identity.gpirPublicationId, null);
});

test('conflicting publication claim for one sourceUnitKey enters collision review', () => {
  const adapter = registry();
  assign(adapter);
  const collision = assign(adapter, 'fixture:one', record('pages/chapters/other.html'));
  assert.equal(collision.identity.identityStatus, 'COLLISION_REVIEW');
});

test('path, title and content-hash changes do not reallocate identity', () => {
  const adapter = registry();
  const first = assign(adapter);
  const changed = assign(adapter, 'fixture:one', record('pages/research/new-path.html', 'New title'));
  assert.equal(changed.identity.gpirPublicationId, first.identity.gpirPublicationId);
  assert.equal(changed.identity.editionLineageId, first.identity.editionLineageId);
  assert.notEqual(changed.normalizedRecord.provenance.sourceHash, first.normalizedRecord.provenance.sourceHash);
});

test('check digit is reproducible and detects single-digit transcription changes', () => {
  const digits = '000000123456';
  assert.equal(checkDigit(digits), checkDigit(digits));
  const id = governedId('P', 123456);
  assert.ok(validGovernedId(id));
  assert.equal(validGovernedId(id.replace('123456', '123457')), false);
});

test('malformed governed check digit is rejected as source-native evidence', () => {
  const id = governedId('P', 7);
  const malformed = `${id.slice(0, -1)}${(Number(id.at(-1)) + 1) % 10}`;
  assert.equal(validGovernedId(malformed), false);
  const result = assign(registry(), 'fixture:bad', record(), {
    claimedPublicationId: malformed,
    sourceNativeEvidence: { isSamePublication: true, uniquenessEstablished: true, citation: 'Header' }
  });
  assert.equal(result.identity.identityStatus, 'PROVISIONAL');
});

test('Contentful eligibility is limited to durable states and never fixture identity', () => {
  const governed = assign(registry());
  assert.equal(contentfulIdentityEligible(governed.identity), false);
  assert.equal(contentfulIdentityEligible({ ...governed.identity, testIdentityOnly: false }), true);
  assert.equal(contentfulIdentityEligible(governed.identity, { testIdentityOnly: true }), false);
  assert.equal(governed.contentfulEligible, false);
  for (const identityStatus of ['PROVISIONAL', 'COLLISION_REVIEW', 'BLOCKED'])
    assert.equal(contentfulIdentityEligible({ ...governed.identity, identityStatus }), false);
});

test('unresolved sourceUnitKey cannot allocate a governed ID', () => {
  const adapter = registry();
  const result = resolveIdentity(record(), {}, adapter);
  assert.equal(result.identity.identityStatus, 'PROVISIONAL');
  assert.equal(result.identity.gpirPublicationId, null);
  assert.equal(adapter.nextPublication, 1);
});

test('only explicit fixture sourceUnitKeys are accepted by local adapter', () => {
  const result = assign(registry(), 'production:key');
  assert.equal(result.identity.identityStatus, 'BLOCKED');
  assert.equal(result.identity.gpirPublicationId, null);
});

test('governed IDs contain twelve padded sequence digits', () => {
  assert.match(governedId('P', 1), /^VK-GPIR-P-000000000001-\d$/);
  assert.match(governedId('L', 200000), /^VK-GPIR-L-000000200000-\d$/);
});

test('registry idempotency holds across repeated resolver calls', () => {
  const adapter = registry();
  const first = assign(adapter);
  for (let index = 0; index < 5; index++)
    assert.deepEqual(assign(adapter).identity, first.identity);
});

test('fixture identity travels normalized record without becoming a Contentful ID', () => {
  const result = assign(registry());
  assert.equal(result.normalizedRecord.gpirPublicationId, result.identity.gpirPublicationId);
  assert.equal(result.normalizedRecord.lineage.editionId, result.identity.editionLineageId);
  assert.equal(result.normalizedRecord.identityStatus, 'provisional');
  assert.equal(buildContentfulDraft(result.normalizedRecord).fields.gpirPublicationId, null);
  assert.equal(result.TEST_IDENTITY_ONLY, true);
  assert.equal(result.NOT_FOR_CONTENTFUL_WRITE, true);
  assert.equal(result.NOT_FOR_SUPABASE_PERSISTENCE, true);
});

test('identity envelope has the required schema fields', () => {
  const schema = require('../../schemas/m35/identity-record.schema.json');
  const result = assign(registry());
  for (const key of schema.required) assert.ok(key in result);
  for (const key of schema.properties.identity.required) assert.ok(key in result.identity);
  assert.equal(schema.properties.contentfulEligible.const, false);
  assert.equal(schema.properties.identity.properties.identityStatus.enum.length, 5);
});

test('five approved pilots use fixture keys and remain ineligible for live writes', () => {
  const adapter = registry();
  const pages = ['pages/countries/india.html', 'pages/countries/singapore.html',
    'pages/regions/apac.html', 'pages/research/global-payments-landscape.html',
    'pages/chapters/corridor-factbook.html'];
  const results = pages.map((sourcePath, index) => {
    const source = convertLegacyContent({ sourcePath, content: fs.readFileSync(sourcePath, 'utf8') });
    return resolveIdentity(source, { sourceUnitKey: `fixture:pilot-${index + 1}` }, adapter);
  });
  assert.equal(results.length, 5);
  assert.equal(new Set(results.map(result => result.identity.gpirPublicationId)).size, 5);
  assert.ok(results.every(result => result.TEST_IDENTITY_ONLY && result.NOT_FOR_CONTENTFUL_WRITE &&
    result.NOT_FOR_SUPABASE_PERSISTENCE && !result.contentfulEligible));
  assert.deepEqual(results.map(result => result.identity.relatedObjectIds.length), [1, 1, 0, 0, 0]);
});
