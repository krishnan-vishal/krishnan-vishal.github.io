import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const reportPath = path.join(root, 'artifacts/m36/cl03/publication-readiness-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const expected = [
  { publicationId: 'VK-GPIR-P-000000000034-9', lineageId: 'VK-GPIR-L-000000000034-9',
    contentfulEntryId: '53bt9kTDAIHVvCCGne4HwL', modules: 6,
    route: '/global-and-cross-border-payments-market-intelligence-report/' },
  { publicationId: 'VK-GPIR-P-000000000035-6', lineageId: 'VK-GPIR-L-000000000035-6',
    contentfulEntryId: '5XUjNDKIxcoyHFM3x0meh3', modules: 38,
    route: '/cross-border-payments/' }
];

test('CL-03 preserves both governed identity and Contentful associations', () => {
  assert.equal(report.publications.length, 2);
  for (const item of expected) {
    const actual = report.publications.find(value => value.publicationId === item.publicationId);
    assert.ok(actual);
    assert.equal(actual.lineageId, item.lineageId);
    assert.equal(actual.contentfulEntryId, item.contentfulEntryId);
    assert.equal(actual.currentCmsState, 'DRAFT_UNPUBLISHED');
  }
});

test('module counts, routes and classifications remain exact', () => {
  for (const item of expected) {
    const actual = report.publications.find(value => value.publicationId === item.publicationId);
    assert.equal(actual.expectedModules, item.modules);
    assert.equal(actual.verifiedModules, item.modules);
    assert.equal(actual.moduleOrdering.length, item.modules);
    assert.equal(new Set(actual.moduleOrdering.map(value => value.number)).size, item.modules);
    assert.equal(actual.routeCandidate, item.route);
    assert.equal(actual.routeStatus, 'AVAILABLE_NO_EXISTING_ROUTE');
    assert.equal(actual.access, 'PUBLIC');
    assert.equal(actual.dashboard, 'NONE');
    assert.equal(actual.contentIntegrity.silentModuleLoss, false);
    assert.equal(actual.contentIntegrity.silentModuleDuplication, false);
    assert.equal(actual.contentIntegrity.factualTableReconstruction, 'NOT_PERFORMED');
  }
});

test('authorization and mutation guard remain closed', () => {
  assert.equal(report.readOnly, true);
  assert.equal(report.publicationAuthorized, false);
  assert.equal(report.productionActivationAuthorized, false);
  assert.ok(report.publications.every(item => item.publicationAuthorized === false));
  assert.ok(report.publications.every(item => item.productionActivationAuthorized === false));
  assert.deepEqual(Object.values(report.mutationGuard), [0, 0, 0, 0, 0, 0, 0]);
});

test('reviewed artifacts and deterministic checksums are frozen', () => {
  for (const publication of report.publications) {
    assert.match(publication.artifactChecksum, /^[A-F0-9]{64}$/);
    const bytes = fs.readFileSync(publication.cl02PreviewPath);
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
    assert.equal(checksum, publication.cl02PreviewChecksum);
  }
  assert.match(report.deterministicReportChecksum, /^[A-F0-9]{64}$/);
  const { generatedAt, deterministicReportChecksum, ...core } = report;
  const recomputed = crypto.createHash('sha256').update(JSON.stringify(core))
    .digest('hex').toUpperCase();
  assert.equal(recomputed, deterministicReportChecksum);
  assert.equal(report.tests.status, 'PASS');
  assert.equal(report.tests.passed, 36);
});

test('CL-03 scope contains no authentication or production-route changes', () => {
  assert.ok(report.filesCreatedOrChanged.every(file =>
    file.startsWith('artifacts/m36/cl03/') || file.startsWith('scripts/m36/') ||
    file.startsWith('tests/m36/')));
  assert.ok(report.filesCreatedOrChanged.every(file =>
    !/auth|reader|route\/|index\.html/i.test(file)));
  assert.equal(report.mutationGuard.authenticationChanges, 0);
  assert.equal(report.mutationGuard.productionRouteActivations, 0);
  assert.equal(report.mutationGuard.contentfulMutations, 0);
  assert.equal(report.mutationGuard.supabaseMutations, 0);
});
