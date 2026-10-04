import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const reportPath = path.join(root, 'artifacts/m36/cl02/owner-review-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

test('CL-02 stays bounded to the two governed unpublished PUBLIC drafts', () => {
  assert.equal(report.publications.length, 2);
  assert.deepEqual(report.publications.map(item => item.publicationId), [
    'VK-GPIR-P-000000000034-9', 'VK-GPIR-P-000000000035-6'
  ]);
  assert.ok(report.publications.every(item => item.access === 'PUBLIC'));
  assert.ok(report.publications.every(item => item.dashboard === 'NONE'));
  assert.ok(report.publications.every(item => item.published === false));
});

test('owner previews represent exactly 6 and 38 uniquely navigable modules', () => {
  assert.deepEqual(report.publications.map(item => item.modulesRendered), [6, 38]);
  for (const publication of report.publications) {
    const html = fs.readFileSync(publication.previewPath, 'utf8');
    const ids = [...html.matchAll(/id="(research-module-[^"]+)"[^>]*class="gpir-research-module"/g)]
      .map(match => match[1]);
    const hrefs = [...html.matchAll(/href="#(research-module-[^"]+)"/g)]
      .map(match => match[1]);
    assert.equal(ids.length, publication.expectedModules);
    assert.equal(new Set(ids).size, publication.expectedModules);
    assert.equal(new Set(hrefs).size, publication.expectedModules);
    assert.deepEqual(hrefs, ids);
  }
});

test('preview output has no reader gate, backend scripts or fabricated optional metadata', () => {
  for (const publication of report.publications) {
    const html = fs.readFileSync(publication.previewPath, 'utf8');
    assert.doesNotMatch(html, /Registered reader access|Create free GPIR account/);
    assert.doesNotMatch(html, /<script\b/i);
    assert.match(html, /OWNER REVIEW PREVIEW · UNPUBLISHED/);
    assert.equal(publication.optionalMetadataEvidenceOnly, true);
    assert.equal(publication.contentIntegrity, 'PASS');
  }
});

test('shared publication CSS retains responsive overflow and keyboard focus safeguards', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/contentful-publication.css'), 'utf8');
  assert.match(css, /@media \(max-width:960px\)/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:44px/);
});
