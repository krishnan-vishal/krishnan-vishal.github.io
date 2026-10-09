import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const { productionHtml, targets } = require('../../scripts/m36/cl04-controlled-release.js');

test('CL-04 release scope is exactly the two authorized identities and routes', () => {
  assert.deepEqual(targets.map(item => item.publicationId), [
    'VK-GPIR-P-000000000034-9', 'VK-GPIR-P-000000000035-6'
  ]);
  assert.deepEqual(targets.map(item => item.entryId), [
    '53bt9kTDAIHVvCCGne4HwL', '5XUjNDKIxcoyHFM3x0meh3'
  ]);
  assert.deepEqual(targets.map(item => item.route), [
    '/global-and-cross-border-payments-market-intelligence-report/',
    '/cross-border-payments/'
  ]);
});

test('public production conversion removes preview and registered-reader gate markers', () => {
  const input = '<head><meta name="robots" content="noindex,nofollow"><meta name="gpir-preview" content="owner-review-only"></head><body class="gpir-publication-page"><div class="gpir-owner-preview-banner">OWNER REVIEW PREVIEW · PRESENTATION NORMALIZATION · UNPUBLISHED</div><main>Public body</main></body>';
  const output = productionHtml(input);
  assert.match(output, /Public body/);
  assert.doesNotMatch(output, /noindex|owner-review-only|OWNER REVIEW|UNPUBLISHED|Registered reader access/i);
});

test('approved artifacts retain exact module counts and authored checksums', () => {
  const report = JSON.parse(fs.readFileSync(path.join(root,
    'artifacts/m36/cl03a/presentation-normalization-report.json'), 'utf8'));
  for (const target of targets) {
    const publication = report.publications.find(item => item.publicationId === target.publicationId);
    assert.equal(publication.renderedModules, target.modules);
    assert.equal(publication.authoredContentChecksumAfter, target.sourceSha256);
    assert.equal(publication.access, 'PUBLIC');
    assert.equal(publication.dashboard, 'NONE');
  }
});

test('owner-approved presentation tokens and table containment remain locked', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/contentful-publication.css'), 'utf8');
  assert.match(css, /--gpir-size-primary:\s*1rem/);
  assert.match(css, /--gpir-size-secondary:\s*\.875rem/);
  assert.match(css, /--gpir-size-body:\s*\.75rem/);
  assert.match(css, /gpir-publication-table-region--wide[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /gpir-research-module-nav[\s\S]*max-height:\s*48px/);
});
