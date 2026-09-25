'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { adaptEstate, adaptPublication } = require('../../scripts/m35/contentful-publication-adapter');
const { authorizePublication, controlledValidationAuthorization } = require('../../scripts/m35/contentful-auth-boundary');
const { renderPublicationPage, renderRichText } = require('../../scripts/m35/contentful-publication-renderer');
const { buildPublicationSite } = require('../../scripts/m35/render-contentful-publications');
const { fileFor, within } = require('../../scripts/m35/serve-contentful-staging');

function record(overrides = {}) {
  return {
    entryId: overrides.entryId || 'entry-1',
    fields: {
      gpirPublicationId: overrides.identity || 'VK-GPIR-P-000000000001-8',
      editionLineageId: overrides.lineage || 'VK-GPIR-L-000000000001-0',
      supabaseRecordId: overrides.supabaseRecordId || '11111111-1111-4111-8111-111111111111',
      publicationTitle: overrides.title || 'Representative publication',
      publicationType: overrides.publicationType || 'Research Chapter',
      canonicalUrlCandidate: overrides.route || '/representative-publication/',
      executiveSummary: overrides.summary || 'Evidence-backed summary.',
      editorialBody: overrides.body || { nodeType: 'document', content: [{ nodeType: 'paragraph', content: [{ nodeType: 'text', value: 'Evidence-backed body.', marks: [] }] }] },
      sourceValidationSummary: 'Reviewed source references.',
      ...overrides.fields
    }
  };
}

test('Contentful record maps to a stable view model and preserves governed identities', () => {
  const publication = adaptPublication(record());
  assert.equal(publication.identity, 'VK-GPIR-P-000000000001-8');
  assert.equal(publication.lineage, 'VK-GPIR-L-000000000001-0');
  assert.equal(publication.auth.authority, 'supabase');
  assert.equal(publication.canonicalUrl, 'https://fintechoisis.com/representative-publication/');
});

test('missing optional metadata remains null and is not fabricated', () => {
  const publication = adaptPublication(record());
  for (const value of [publication.publicationDate, publication.editionLabel,
    publication.market, publication.region, publication.publicationStatus]) assert.equal(value, null);
});

test('canonical route mapping normalizes a trailing slash and resolves deterministically', () => {
  const estate = adaptEstate([record({ route: '/example' })]);
  assert.equal(estate.publications[0].route, '/example/');
  assert.equal(estate.resolve('/example').identity, estate.publications[0].identity);
  assert.equal(estate.resolve('/missing/'), null);
});

test('duplicate canonical routes are rejected', () => {
  assert.throws(() => adaptEstate([record(), record({ entryId: 'entry-2', identity: 'VK-GPIR-P-000000000002-6' })]), /Duplicate governed canonical route/);
});

test('unsafe canonical paths are rejected', () => {
  assert.throws(() => adaptPublication(record({ route: 'https://example.com/page' })), /Invalid governed canonical path/);
  assert.throws(() => adaptPublication(record({ route: '/../escape/' })), /Invalid governed canonical path/);
});

test('publication families use the same renderer without family branching', () => {
  for (const publicationType of ['Country Intelligence', 'Research Chapter', 'Regional Directory', 'Research Publication']) {
    const publication = adaptPublication(record({ publicationType }));
    const html = renderPublicationPage(publication, { authorization: controlledValidationAuthorization(publication) });
    assert.match(html, new RegExp(publicationType));
    assert.match(html, /class="gpir-publication-body"/);
  }
});

test('renderer escapes authored text and filters unsafe hyperlinks', () => {
  const body = { nodeType: 'document', content: [{ nodeType: 'paragraph', content: [
    { nodeType: 'text', value: '<script>alert(1)</script>', marks: [{ type: 'bold' }] }
  ] }, { nodeType: 'hyperlink', data: { uri: 'javascript:alert(1)' }, content: [{ nodeType: 'text', value: 'unsafe', marks: [] }] }] };
  const html = renderRichText(body);
  assert.doesNotMatch(html, /<script>|javascript:/);
  assert.match(html, /&lt;script&gt;/);
});

test('unresolved assets render a deterministic safe fallback', () => {
  const publication = adaptPublication(record({ fields: { dashboardAsset: { sys: { id: 'asset-1' } } } }));
  const html = renderPublicationPage(publication, { authorization: controlledValidationAuthorization(publication) });
  assert.match(html, /Associated visual assets remain under editorial review/);
  assert.doesNotMatch(html, /asset-1/);
});

test('auth boundary fails closed and accepts only the controlled Supabase capability', () => {
  const publication = adaptPublication(record());
  assert.equal(authorizePublication(publication).allowed, false);
  assert.equal(authorizePublication(publication, { authority: 'supabase', decision: 'ALLOW',
    publicationId: publication.identity, supabaseRecordId: publication.supabaseRecordId }).allowed, false);
  const authorization = controlledValidationAuthorization(publication);
  assert.equal(authorizePublication(publication, authorization).allowed, true);
});

test('fail-closed rendering does not emit protected body content', () => {
  const html = renderPublicationPage(adaptPublication(record()));
  assert.match(html, /Supabase access boundary/);
  assert.doesNotMatch(html, /Evidence-backed body/);
});

test('static build creates canonical route output, route manifest and 404', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gpir-k1-test-'));
  try {
    const artifact = { source: { contentType: 'gpirPublication' }, records: [record()] };
    const result = buildPublicationSite(artifact, { output, expected: 1, controlledValidation: true });
    assert.equal(result.manifest.length, 1);
    assert.equal(fs.existsSync(path.join(output, 'representative-publication', 'index.html')), true);
    assert.equal(fs.existsSync(path.join(output, '404.html')), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'routes.json'), 'utf8'));
    assert.equal(manifest.deploymentEligible, false);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

test('frontend modules have no CMA, Preview token or browser credential dependency', () => {
  const sources = [
    'contentful-publication-adapter.js', 'contentful-auth-boundary.js',
    'contentful-publication-renderer.js', 'render-contentful-publications.js',
    'serve-contentful-staging.js'
  ].map(name => fs.readFileSync(path.join(__dirname, '../../scripts/m35', name), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /CONTENTFUL_MANAGEMENT_TOKEN|CONTENTFUL_PREVIEW_TOKEN|Authorization:\s*`Bearer/);
  assert.doesNotMatch(sources, /cdn\.contentful\.com|preview\.contentful\.com/);
});

test('controlled staging resolves generated routes, preserves the homepage overlay and rejects traversal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpir-k1-root-'));
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'gpir-k1-site-'));
  try {
    fs.writeFileSync(path.join(root, 'index.html'), 'homepage');
    fs.mkdirSync(path.join(site, 'example'));
    fs.writeFileSync(path.join(site, 'example', 'index.html'), 'publication');
    assert.equal(fileFor(root, '/'), path.join(root, 'index.html'));
    assert.equal(fileFor(site, '/example/'), path.join(site, 'example', 'index.html'));
    assert.equal(fileFor(site, '/../secret'), null);
    assert.equal(within(site, path.join(site, 'example')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(site, { recursive: true, force: true });
  }
});
