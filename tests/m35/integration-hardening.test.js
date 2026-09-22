'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { convertLegacyContent } = require('../../scripts/m35/convert-legacy-content');
const { buildContentfulDraft } = require('../../scripts/m35/build-contentful-draft');
const { INDIA_SOURCE_UNIT_KEY, inspectIdentity, resolveAuthoritatively } =
  require('../../scripts/m35/supabase-identity-adapter');
const { planExistingDraftUpdate, updateExistingDraft } =
  require('../../scripts/m35/update-contentful-existing-draft');
const { runSameSourceConcurrency } = require('../../scripts/m35/identity-concurrency-harness');

const pub = 'VK-GPIR-P-000000000001-8';
const line = 'VK-GPIR-L-000000000001-8';
const uuid = '8ea94d2b-3254-4ddc-a50a-f10444b252f4';
const entryId = '6w4xENtrEzaGm4cb4fbkR5';
const dashboard = 'VK-GPI-APAC-IND-2026-005';
const intakeEvidence = { controlledSourceUnit: true,
  basis: 'Governed India country HTML publication intake',
  legacyLineageConcept: 'GPIR-APAC-IND-C2C' };
function india() { return convertLegacyContent({ sourcePath: 'pages/countries/india.html',
  content: fs.readFileSync('pages/countries/india.html', 'utf8') }); }
function mappedIndia() {
  const record = india();
  record.gpirPublicationId = pub;
  record.identityStatus = 'mapped';
  record.lineage.editionId = line;
  return record;
}

test('Contentful field spelling maps internal dataCutoffDate explicitly', () => {
  const record = india();
  record.publication.dataCutoffDate = '2026-05-31';
  const fields = buildContentfulDraft(record).fields;
  assert.equal(fields.dataCutOffDate, '2026-05-31');
  assert.equal(Object.hasOwn(fields, 'dataCutoffDate'), false);
  assert.equal(buildContentfulDraft(india()).fields.dataCutOffDate, null);
  const schema = require('../../schemas/m35/contentful-draft.schema.json');
  assert.ok(schema.properties.fields.required.includes('dataCutOffDate'));
  assert.equal(Object.hasOwn(schema.properties.fields.properties, 'dataCutoffDate'), false);
});
test('supabaseRecordId means only the matching publication-row UUID', () => {
  const packageValue = { publicationRowId: uuid, gpirPublicationId: pub, editionLineageId: line };
  const draft = buildContentfulDraft(mappedIndia(), { identityPackage: packageValue });
  assert.equal(draft.fields.supabaseRecordId, uuid);
  for (const wrong of [pub, line, dashboard, INDIA_SOURCE_UNIT_KEY, entryId])
    assert.throws(() => buildContentfulDraft(mappedIndia(), { identityPackage:
      { ...packageValue, publicationRowId: wrong } }), /publication-row UUID/);
  assert.throws(() => buildContentfulDraft(mappedIndia(), { identityPackage:
    { ...packageValue, gpirPublicationId: dashboard } }), /publication-row UUID/);
  assert.equal(buildContentfulDraft(mappedIndia()).fields.supabaseRecordId, null);
});
test('authoritative Supabase mode requires explicit approval and injected capability', async () => {
  let calls = 0;
  const options = { sourceUnitKey: INDIA_SOURCE_UNIT_KEY, intakeEvidence,
    registrySnapshot: { checked: true, identity: null },
    capability: { executeResolve: async request => { calls++; assert.equal(request.functionName,
      'public.gpir_identity_resolve'); assert.equal(request.claimedPublicationId, null);
      return { id: uuid, sourceUnitKey: INDIA_SOURCE_UNIT_KEY, gpirPublicationId: pub,
        editionLineageId: line, identityStatus: 'GOVERNED_ASSIGNED',
        assignmentMethod: 'governed-sequence' }; } } };
  await assert.rejects(resolveAuthoritatively(india(), options), /Explicit authoritative mode/);
  assert.equal(calls, 0);
  const result = await resolveAuthoritatively(india(), { ...options,
    mode: 'authoritative-resolve', authorization: { approved: true,
      sourceUnitKey: INDIA_SOURCE_UNIT_KEY, actorProcess: 'M35-TEST' } });
  assert.equal(calls, 1);
  assert.equal(result.normalizedRecord.gpirPublicationId, pub);
  assert.equal(result.normalizedRecord.lineage.editionId, line);
  assert.equal(result.identityPackage.publicationRowId, uuid);
});
test('read-only identity inspection is separate from the resolver capability', async () => {
  let reads = 0;
  const plan = await inspectIdentity(india(), { sourceUnitKey: INDIA_SOURCE_UNIT_KEY,
    intakeEvidence, readCapability: { readIdentity: async key => {
      reads++; assert.equal(key, INDIA_SOURCE_UNIT_KEY); return null;
    } } });
  assert.equal(reads, 1);
  assert.equal(plan.existingIdentityFound, 'NO');
  assert.equal(plan.eligibleForAuthoritativeResolution, true);
});
test('related dashboard cannot become a source-native claim', async () => {
  let calls = 0;
  await assert.rejects(resolveAuthoritatively(india(), {
    mode: 'authoritative-resolve', sourceUnitKey: INDIA_SOURCE_UNIT_KEY, intakeEvidence,
    registrySnapshot: { checked: true, identity: null },
    authorization: { approved: true, sourceUnitKey: INDIA_SOURCE_UNIT_KEY, actorProcess: 'M35-TEST' },
    sourceNativeClaim: { id: dashboard, evidence: { isSamePublication: true,
      uniquenessEstablished: true, citation: 'incorrect' } },
    capability: { executeResolve: async () => { calls++; } }
  }), /related ID/);
  assert.equal(calls, 0);
});
test('source-evidenced publication ID cannot be bypassed with governed allocation', async () => {
  const record = convertLegacyContent({ sourcePath: 'pages/research/example.html',
    content: '<meta name="gpir-publication-id" content="VK-GPI-EX-2026-001"><title>Example</title>' });
  let calls = 0;
  await assert.rejects(resolveAuthoritatively(record, {
    mode: 'authoritative-resolve', sourceUnitKey: 'gpir:intake:publication:research:example:legacy-primary',
    intakeEvidence, registrySnapshot: { checked: true, identity: null },
    authorization: { approved: true,
      sourceUnitKey: 'gpir:intake:publication:research:example:legacy-primary', actorProcess: 'M35-TEST' },
    capability: { executeResolve: async () => { calls++; } }
  }), /matching governed claim review/);
  assert.equal(calls, 0);
});
test('non-authoritative resolver states never create a downstream mapped record', async () => {
  for (const identityStatus of ['PROVISIONAL', 'COLLISION_REVIEW', 'BLOCKED']) {
    const result = await resolveAuthoritatively(india(), {
      mode: 'authoritative-resolve', sourceUnitKey: INDIA_SOURCE_UNIT_KEY, intakeEvidence,
      registrySnapshot: { checked: true, identity: null },
      authorization: { approved: true, sourceUnitKey: INDIA_SOURCE_UNIT_KEY, actorProcess: 'M35-TEST' },
      capability: { executeResolve: async () => ({ sourceUnitKey: INDIA_SOURCE_UNIT_KEY, identityStatus }) }
    });
    assert.equal(result.contentfulIdentityEligible, false);
    assert.equal(result.normalizedRecord, null);
  }
});
test('India golden path retains four separate identifiers, warnings and Draft state', () => {
  const record = mappedIndia();
  const draft = buildContentfulDraft(record, { identityPackage:
    { publicationRowId: uuid, gpirPublicationId: pub, editionLineageId: line } });
  assert.equal(draft.fields.gpirPublicationId, pub);
  assert.equal(draft.fields.editionLineageId, line);
  assert.equal(draft.fields.supabaseRecordId, uuid);
  assert.ok(draft.sourceRecordIdentity.referencedPublicationIds.includes(dashboard));
  assert.equal(new Set([pub, line, uuid, dashboard, entryId]).size, 5);
  assert.equal(draft.fields.validationStatus, 'WARN');
  assert.equal(draft.fields.dataCutOffDate, null);
  assert.equal(draft.fields.dashboardAsset, null);
  assert.equal(draft.technicalState, 'Draft');
  assert.equal(draft.publishEligible, false);
});
function contentfulFixture() {
  let entry = { sys: { id: entryId, version: 25, contentType: { sys: { id: 'gpirPublication' } } },
    fields: { gpirPublicationId: { 'en-US': 'old' }, editionLineageId: { 'en-US': 'old-line' },
      dashboardAsset: { 'en-US': { sys: { id: '1QWh5s8fkW18vLB5m2ZgyR' } } },
      validationStatus: { 'en-US': 'WARN' } } };
  const calls = [];
  return { calls, capability: {
    readEntry: async id => { calls.push('read'); assert.equal(id, entryId); return structuredClone(entry); },
    updateEntry: async request => { calls.push('update'); assert.equal(request.version, 25);
      assert.equal(request.headers['X-Contentful-Version'], '25');
      entry = { ...entry, sys: { ...entry.sys, version: 26 }, fields: structuredClone(request.fields) };
    }
  } };
}
test('Contentful dry-run reads existing Draft and makes no update', async () => {
  const fixture = contentfulFixture();
  const result = await planExistingDraftUpdate({ entryId, capability: fixture.capability,
    desiredFields: { gpirPublicationId: pub }, authorizedFields: ['gpirPublicationId'] });
  assert.deepEqual(fixture.calls, ['read']);
  assert.deepEqual(Object.keys(result.changes), ['gpirPublicationId']);
  assert.equal(result.createEntry, false);
  assert.equal(result.publish, false);
});
test('Contentful update requires explicit mode and current version', async () => {
  const fixture = contentfulFixture();
  const base = { entryId, capability: fixture.capability, desiredFields: { gpirPublicationId: pub },
    authorizedFields: ['gpirPublicationId'], expectedVersion: 25 };
  await assert.rejects(updateExistingDraft(base), /Explicit existing-Draft/);
  await assert.rejects(updateExistingDraft({ ...base, mode: 'existing-draft-update',
    authorization: { approved: true, entryId }, expectedVersion: 24 }), /version conflict/);
  assert.ok(!fixture.calls.includes('update'));
});
test('Contentful controlled update preserves other fields and verifies Draft', async () => {
  const fixture = contentfulFixture();
  const result = await updateExistingDraft({ mode: 'existing-draft-update', entryId,
    authorization: { approved: true, entryId }, expectedVersion: 25,
    capability: fixture.capability,
    desiredFields: { gpirPublicationId: pub, editionLineageId: line },
    authorizedFields: ['gpirPublicationId', 'editionLineageId'] });
  assert.deepEqual(fixture.calls, ['read', 'update', 'read']);
  assert.equal(result.afterVersion, 26);
  assert.deepEqual(result.changedFields, ['gpirPublicationId', 'editionLineageId']);
  assert.equal(result.published, false);
});
test('Contentful adapter refuses published entry and asset mutation', async () => {
  const fixture = contentfulFixture();
  await assert.rejects(planExistingDraftUpdate({ entryId, capability: fixture.capability,
    desiredFields: { dashboardAsset: 'new' }, authorizedFields: ['dashboardAsset'] }), /authorized/);
  const published = { readEntry: async () => ({ sys: { id: entryId, version: 25,
    publishedVersion: 24, contentType: { sys: { id: 'gpirPublication' } } }, fields: {} }) };
  await assert.rejects(planExistingDraftUpdate({ entryId, capability: published }), /unpublished Draft/);
});
test('concurrency harness starts two independent sessions and rejects sequential simulation', async () => {
  const key = 'gpir:intake:publication:runtime-validation:concurrent-001';
  let entered = 0;
  let release;
  const bothEntered = new Promise(resolve => { release = resolve; });
  const row = { id: uuid, gpirPublicationId: pub, editionLineageId: line,
    identityStatus: 'GOVERNED_ASSIGNED' };
  const createSession = async () => ({
    resolve: async () => { entered++; if (entered === 2) release(); await bothEntered; return row; },
    inspect: async () => ({ publicationRows: 1, lineageRows: 1,
      assignmentEvents: 1, duplicatePublicIds: 0 })
  });
  const result = await runSameSourceConcurrency({ environment: 'GPIR-M35-RUNTIME-TEST',
    sourceUnitKey: key, createSession, request: { sourceUnitKey: key, claimedPublicationId: null } });
  assert.equal(entered, 2);
  assert.equal(result.sameAuthoritativeRow, true);
  await assert.rejects(runSameSourceConcurrency({ environment: 'production', sourceUnitKey: key,
    createSession, request: { sourceUnitKey: key } }), /Disposable project/);
});
test('scale-out manifest carries controlled references but no governed IDs', () => {
  const schema = require('../../schemas/m35/scaleout-manifest.schema.json');
  assert.ok(schema.required.includes('sourceUnitKey'));
  assert.ok(schema.required.includes('targetContentfulEntryId'));
  assert.ok(schema.required.includes('relatedObjectIds'));
  assert.equal(Object.hasOwn(schema.properties, 'gpirPublicationId'), false);
  assert.equal(Object.hasOwn(schema.properties, 'editionLineageId'), false);
});
