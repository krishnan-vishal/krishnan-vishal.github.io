import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compileBatch, deterministicTitle, modulesFromParagraphs, parseDocumentXml,
  richTextFromParagraphs, slugify, sourceExecutiveSummary } =
  require('../../scripts/m36/content-factory-batch');

const fixtureXml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Source title</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>1. First module</w:t></w:r></w:p>
<w:p><w:r><w:t>Exact source text &amp; evidence.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Section A</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>2. Second module</w:t></w:r></w:p>
</w:body></w:document>`;

test('deterministic DOCX XML extraction preserves authored text and variable module count', () => {
  const paragraphs = parseDocumentXml(fixtureXml);
  assert.equal(paragraphs[2].text, 'Exact source text & evidence.');
  const modules = modulesFromParagraphs(paragraphs);
  assert.equal(modules.length, 2);
  assert.deepEqual(modules.map(item => item.title), ['1. First module', '2. Second module']);
  assert.equal(modules[0].sectionCount, 1);
});

test('title selection uses explicit core metadata before source paragraph evidence', () => {
  const paragraphs = parseDocumentXml(fixtureXml);
  assert.equal(deterministicTitle(paragraphs,
    '<cp:coreProperties xmlns:dc="x"><dc:title>Governed title</dc:title></cp:coreProperties>').value,
  'Governed title');
  assert.equal(deterministicTitle(paragraphs, '').value, 'Source title');
});

test('route candidates are deterministic and do not activate routes', () => {
  assert.equal(slugify('Global & Cross-Border Payments — Report'),
    'global-and-cross-border-payments-report');
});

test('source rich text and executive summary preserve authored text', () => {
  const paragraphs = parseDocumentXml(fixtureXml.replace('1. First module', '1. Executive Summary'));
  const body = richTextFromParagraphs(paragraphs);
  assert.equal(sourceExecutiveSummary(paragraphs), 'Exact source text & evidence.');
  assert.equal(body.content[1].nodeType, 'heading-1');
  assert.equal(body.content[2].content[0].value, 'Exact source text & evidence.');
});

test('governance stops candidates lacking source approval, authoritative duplicate check, assets and access', () => {
  const sourcePath = path.join(process.cwd(), 'Privacy Policy 13-Aug-2026 .docx');
  const input = { schemaVersion: 'M36-C1-1.0', batchId: 'fixture', batchLimit: 5,
    candidates: [{ candidateKey: 'fixture', sourcePath, sourceApproval: null,
      sourceApprovalEvidence: null, dashboardPath: null, dashboardRelationship: 'UNKNOWN',
      accessClass: null, accessApprovalEvidence: null, existingHtmlPath: null,
      legacyRelationship: null }] };
  const manifest = compileBatch(input, { contentfulSnapshot: { records: [] },
    supabaseCheck: 'UNAVAILABLE_NO_READ_CAPABILITY' });
  assert.equal(manifest.counts.eligible, 0);
  assert.deepEqual(manifest.candidates[0].reviewReasons,
    ['REVIEW_REQUIRED_SOURCE', 'REVIEW_REQUIRED_DUPLICATE',
      'REVIEW_REQUIRED_ASSET', 'REVIEW_REQUIRED_ACCESS']);
  assert.equal(manifest.candidates[0].identity.allocated, false);
  assert.equal(manifest.candidates[0].contentful.writePerformed, false);
  assert.equal(manifest.idempotency.hashesMatch, true);
});

test('batch limit is enforced', () => {
  assert.throws(() => compileBatch({ schemaVersion: 'M36-C1-1.0', batchId: 'x',
    batchLimit: 1, candidates: [{}, {}] }), /bounded batch limit/);
});

test('eligible package preserves approved access and exposes only public-safe discovery fields', () => {
  const sourcePath = path.join(process.cwd(), 'Privacy Policy 13-Aug-2026 .docx');
  const { extractDocx } = require('../../scripts/m36/content-factory-batch');
  const hash = extractDocx(sourcePath).sourceSha256;
  const input = { schemaVersion: 'M36-C1-1.0', batchId: 'eligible-fixture', batchLimit: 1,
    candidates: [{ candidateKey: 'eligible', sourceUnitKey: 'gpir:intake:publication:research:eligible:v1:docx',
      sourcePath, sourceApproval: 'OWNER_APPROVED',
      sourceApprovalEvidence: 'fixture approval', dashboardPath: null,
      dashboardRelationship: 'NONE', accessClass: 'PUBLIC',
      accessApprovalEvidence: 'fixture owner decision', existingHtmlPath: null,
      legacyRelationship: null }] };
  const manifest = compileBatch(input, { contentfulSnapshot: { records: [] },
    supabaseCheck: 'AUTHORITATIVE_READ_PASS', supabaseSnapshot: { candidates: { eligible: {
      sourceUnitKey: 'gpir:intake:publication:research:eligible:v1:docx', sourceSha256: hash,
      outcome: 'NEW_PUBLICATION_CONFIRMED' } } } });
  assert.equal(manifest.counts.eligible, 1);
  assert.equal(manifest.candidates[0].accessClass, 'PUBLIC');
  assert.equal(manifest.publicDiscoveryMetadata[0].accessClass, 'PUBLIC');
  assert.equal(manifest.publicDiscoveryMetadata[0].publicationStatus, null);
  assert.equal('body' in manifest.publicDiscoveryMetadata[0], false);
});

test('owner-excluded candidates are not re-extracted or placed in the active review queue', () => {
  const input = { schemaVersion: 'M36-C1-1.0', batchId: 'excluded-fixture', batchLimit: 1,
    candidates: [{ candidateKey: 'excluded', includeInBatch: false,
      ownerDecision: 'HOLD_EXCLUDE_FROM_BATCH', evidencedTitle: 'Prior title',
      evidencedModuleCount: 7, sourcePath: 'missing.docx', sourceApproval: null,
      sourceApprovalEvidence: null, dashboardPath: null, dashboardRelationship: 'UNKNOWN',
      accessClass: null, accessApprovalEvidence: null, existingHtmlPath: null,
      legacyRelationship: null }] };
  const manifest = compileBatch(input);
  assert.equal(manifest.counts.activeCandidates, 0);
  assert.equal(manifest.counts.excluded, 1);
  assert.equal(manifest.ownerReviewQueue.length, 0);
  assert.equal(manifest.candidates[0].source.deterministicExtraction,
    'NOT_RERUN_OWNER_EXCLUDED');
});

test('authoritative new-publication evidence clears duplicate review without allocating early', () => {
  const sourcePath = path.join(process.cwd(), 'Privacy Policy 13-Aug-2026 .docx');
  const { extractDocx } = require('../../scripts/m36/content-factory-batch');
  const hash = extractDocx(sourcePath).sourceSha256;
  const input = { schemaVersion: 'M36-C1-1.0', batchId: 'new-fixture', batchLimit: 1,
    candidates: [{ candidateKey: 'new', includeInBatch: true, ownerDecision: 'OWNER_APPROVED',
      sourceUnitKey: 'gpir:intake:publication:research:new:v1:docx', sourcePath,
      sourceApproval: 'OWNER_APPROVED', sourceApprovalEvidence: 'owner decision',
      dashboardPath: null, dashboardRelationship: 'UNKNOWN', accessClass: null,
      accessApprovalEvidence: null, existingHtmlPath: null, legacyRelationship: null }] };
  const manifest = compileBatch(input, { contentfulSnapshot: { records: [] },
    supabaseCheck: 'AUTHORITATIVE_READ_PASS', supabaseSnapshot: { candidates: { new: {
      sourceUnitKey: 'gpir:intake:publication:research:new:v1:docx', sourceSha256: hash,
      outcome: 'NEW_PUBLICATION_CONFIRMED' } } } });
  assert.equal(manifest.candidates[0].reviewReasons.includes('REVIEW_REQUIRED_DUPLICATE'), false);
  assert.equal(manifest.candidates[0].identity.allocated, false);
  assert.deepEqual(manifest.candidates[0].reviewReasons,
    ['REVIEW_REQUIRED_ASSET', 'REVIEW_REQUIRED_ACCESS']);
});

test('repository input remains bounded to five candidates', () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(),
    'artifacts/m36/c1/candidate-inventory-input.json'), 'utf8'));
  assert.equal(input.candidates.length, 5);
  assert.equal(input.governance.publishAuthorized, false);
  assert.equal(input.governance.routeActivationAuthorized, false);
  const active = input.candidates.filter(item => item.includeInBatch);
  assert.equal(active.length, 2);
  assert.ok(active.every(item => item.accessClass === 'PUBLIC'));
  assert.ok(active.every(item => item.dashboardRelationship === 'NONE'));
});

test('allocated identity and draft readback populate the governed batch without extra asset requirements', () => {
  const sourcePath = path.join(process.cwd(), 'Privacy Policy 13-Aug-2026 .docx');
  const { extractDocx } = require('../../scripts/m36/content-factory-batch');
  const hash = extractDocx(sourcePath).sourceSha256;
  const input = { schemaVersion: 'M36-C1-1.0', batchId: 'allocated-fixture', batchLimit: 1,
    candidates: [{ candidateKey: 'allocated', includeInBatch: true, ownerDecision: 'OWNER_APPROVED',
      sourceUnitKey: 'unit', sourcePath, sourceApproval: 'OWNER_APPROVED',
      sourceApprovalEvidence: 'owner', dashboardPath: null, dashboardRelationship: 'NONE',
      accessClass: 'PUBLIC', accessApprovalEvidence: 'owner', existingHtmlPath: null,
      legacyRelationship: null }] };
  const supabaseSnapshot = { candidates: { allocated: { sourceUnitKey: 'unit', sourceSha256: hash,
    outcome: 'NEW_PUBLICATION_ALLOCATED', identityAllocationPerformed: true,
    publicationId: 'VK-GPIR-P-000000000099-9', lineageId: 'VK-GPIR-L-000000000099-9',
    supabaseRecordId: 'fixture-uuid' } } };
  const draftSnapshot = { secondPass: { writes: 0 }, candidates: { allocated: {
    entryId: 'draft-id', firstPassWritePerformed: true, readback: { state: 'PASS' } } } };
  const manifest = compileBatch(input, { contentfulSnapshot: { records: [] },
    supabaseSnapshot, draftSnapshot, supabaseCheck: 'AUTHORITATIVE_READ_PASS' });
  assert.equal(manifest.candidates[0].identity.allocated, true);
  assert.equal(manifest.candidates[0].contentful.draftId, 'draft-id');
  assert.equal(manifest.candidates[0].dashboard.relationship, 'NONE');
  assert.deepEqual(manifest.candidates[0].reviewReasons, []);
});
