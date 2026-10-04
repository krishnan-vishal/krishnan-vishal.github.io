import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { modulesFromRichText as browserModules } from '../../assets/js/gpir-protected-publication.mjs';
import { normalizedPayload } from '../../supabase/functions/gpir-protected-publication/handler.mjs';

const require = createRequire(import.meta.url);
const { adaptPublication } = require('../../scripts/m35/contentful-publication-adapter');
const { controlledValidationAuthorization } = require('../../scripts/m35/contentful-auth-boundary');
const { renderPublicationPage } = require('../../scripts/m35/contentful-publication-renderer');
const { normalizeResearchModules } = require('../../scripts/m35/research-publication-model');

const ownerAlt = 'GPIR Stablecoins Global Money Movements Intelligence dashboard covering cross-border payments, remittances, trade, treasury and financial inclusion, with C2C corridors, stablecoin networks, FX and off-ramping, regulation, AML and 2026–2035 outlook.';

function text(value) { return { nodeType: 'text', value, marks: [], data: {} }; }
function moduleBody(count = 3) {
  const content = [];
  for (let index = 1; index <= count; index++) {
    content.push({ nodeType: 'heading-2', data: {}, content: [text(`${String(index).padStart(2, '0')} — Title ${index}`)] });
    content.push({ nodeType: 'paragraph', data: {}, content: [text(`Exact module text ${index}.`)] });
  }
  return { nodeType: 'document', data: {}, content };
}
function record({ count = 3, dashboard = true, historicalEditions = [], identity, presentation = {} } = {}) {
  return { entryId: 'fixture-entry', fields: {
    gpirPublicationId: identity || 'VK-GPIR-P-000000000033-1',
    editionLineageId: 'VK-GPIR-L-000000000033-1',
    supabaseRecordId: '09d86c5b-e508-4dab-8908-a40328842070',
    publicationTitle: 'Stablecoins — Cross-Border Money Movement — C2C',
    publicationType: 'Research Publication',
    canonicalUrlCandidate: '/stablecoins-cross-border-money-movement-c2c/',
    useCasePaymentCategory: 'C2C', executiveSummary: 'Protected executive intelligence.',
    editorialBody: moduleBody(count), sourceValidationSummary: 'Governed source package.'
  }, presentation: { accessClass: 'AUTHENTICATED',
    publicDescription: 'A current GPIR research publication for registered readers.',
    topicContext: ['Technology', 'Stablecoins & CBDCs', 'Stablecoins', 'Cross-Border Money Movement', 'C2C'],
    primaryDashboard: dashboard ? { reference: 'VK-GPIR-STBL-C2C-2026-001',
      role: 'PRIMARY_PUBLICATION_DASHBOARD', src: '/fixture/dashboard.jpg',
      highResolutionHref: '/fixture/dashboard.jpg', alt: ownerAlt, width: 1536, height: 1024 } : null,
    historicalEditions, ...presentation } };
}

test('generic module normalization preserves order and exact text for variable counts', () => {
  for (const count of [1, 3, 12]) {
    const modules = normalizeResearchModules(null, moduleBody(count));
    assert.equal(modules.length, count);
    assert.deepEqual(modules.map(item => item.moduleNumber),
      Array.from({ length: count }, (_, index) => String(index + 1).padStart(2, '0')));
    assert.equal(modules[count - 1].sections[0].body.content[0].content[0].value,
      `Exact module text ${count}.`);
  }
});

test('explicit generic modules tolerate optional metadata and preserve authored content', () => {
  const modules = normalizeResearchModules([{ moduleNumber: 'A', title: null,
    sections: [{ text: 'Unchanged authored text.' }] }]);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].sections[0].text, 'Unchanged authored text.');
  assert.equal(modules[0].provenance, null);
});

test('browser and server normalizers agree on module ordering', () => {
  assert.deepEqual(browserModules(moduleBody(4)).map(item => [item.moduleNumber, item.title]),
    normalizeResearchModules(null, moduleBody(4)).map(item => [item.moduleNumber, item.title]));
});

test('browser hydration uses the same visual intelligence structure as server rendering', () => {
  const source = fs.readFileSync(path.join(process.cwd(),
    'assets/js/gpir-protected-publication.mjs'), 'utf8');
  assert.match(source, /gpir-dashboard-heading/);
  assert.match(source, /Open high-resolution view/);
  assert.match(source, /Executive intelligence/);
  assert.match(source, /navNumber/);
  assert.doesNotMatch(source, /Executive summary/);
});

test('authorized renderer emits module navigation, responsive dashboard and exact owner alt', () => {
  const publication = adaptPublication(record({ count: 10 }));
  const html = renderPublicationPage(publication,
    { authorization: controlledValidationAuthorization(publication) });
  assert.equal(publication.researchModules.length, 10);
  assert.match(html, /aria-label="Research modules"/);
  assert.match(html, /research-module-01/);
  assert.match(html, /research-module-10/);
  assert.match(html, new RegExp(ownerAlt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /loading="lazy"/);
  assert.match(html, /width="1536" height="1024"/);
  assert.match(html, /class="gpir-dashboard-link"/);
  assert.match(html, /class="gpir-dashboard-open">Open high-resolution view/);
  assert.match(html, /<body class="gpir-publication-page">/);
});

test('missing dashboard is tolerated without empty dashboard markup', () => {
  const publication = adaptPublication(record({ dashboard: false }));
  const html = renderPublicationPage(publication,
    { authorization: controlledValidationAuthorization(publication) });
  assert.doesNotMatch(html, /gpir-primary-dashboard/);
});

test('historical editions are absent unless governed records exist', () => {
  const empty = adaptPublication(record());
  assert.doesNotMatch(renderPublicationPage(empty,
    { authorization: controlledValidationAuthorization(empty) }), /Historical editions/);
  const governed = adaptPublication(record({ historicalEditions: [{ title: '2025 edition',
    route: '/edition-2025/', publicationId: 'VK-GPIR-P-000000000010-9' }] }));
  assert.match(renderPublicationPage(governed,
    { authorization: controlledValidationAuthorization(governed) }), /Historical editions/);
});

test('topic breadcrumb is public metadata and does not imply shared lineage', () => {
  const html = renderPublicationPage(adaptPublication(record()));
  assert.match(html, /aria-label="Topic context"/);
  assert.match(html, /Cross-Border Money Movement/);
  assert.doesNotMatch(html, /VK-GPIR-L-000000000018-2/);
});

test('AUTHENTICATED static shell exposes SEO metadata but no protected body or dashboard', () => {
  const html = renderPublicationPage(adaptPublication(record({ count: 10 })));
  assert.match(html, /A current GPIR research publication for registered readers\./);
  assert.match(html, /rel="canonical" href="https:\/\/fintechoisis.com\/stablecoins-cross-border-money-movement-c2c\/"/);
  assert.match(html, /VK-GPIR-P-000000000033-1/);
  assert.match(html, /VK-GPIR-L-000000000033-1/);
  assert.match(html, /Registered reader access/);
  assert.match(html, /About this research/);
  assert.match(html, /10 intelligence modules/);
  assert.match(html, /Visual intelligence is available with registered-reader access/);
  assert.match(html, /This GPIR publication includes governed source provenance and publication lineage/);
  assert.match(html, /href="\/#global">Markets/);
  assert.doesNotMatch(html, /Supabase|RPC|authorization boundary|Edge Function|Contentful access|Associated visual assets remain under editorial review/);
  assert.doesNotMatch(html, /Governed source package/);
  assert.doesNotMatch(html, /Protected executive intelligence/);
  assert.doesNotMatch(html, /Exact module text/);
  assert.doesNotMatch(html, /VK-GPIR-STBL-C2C-2026-001/);
  assert.doesNotMatch(html, new RegExp(ownerAlt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('PUBLIC publication is B3E-compatible without the registered-reader gate', () => {
  const publication = adaptPublication(record({ count: 2,
    presentation: { accessClass: 'PUBLIC' } }));
  const html = renderPublicationPage(publication,
    { authorization: controlledValidationAuthorization(publication) });
  assert.match(html, /Exact module text 1\./);
  assert.match(html, /Exact module text 2\./);
  assert.doesNotMatch(html, /Registered reader access|gpir-reader-access|Create free GPIR account/);
});

test('identity mismatch and missing policy remain denied', () => {
  const publication = adaptPublication(record());
  const mismatch = controlledValidationAuthorization(adaptPublication(record({
    identity: 'VK-GPIR-P-000000000034-9' })));
  for (const authorization of [undefined, mismatch]) {
    const html = renderPublicationPage(publication, { authorization });
    assert.match(html, /This GPIR intelligence publication is available to registered readers/);
    assert.match(html, /data-gpir-auth-state="denied"/);
    assert.doesNotMatch(html, /Exact module text/);
  }
});

test('existing publication body fallback remains compatible', () => {
  const existing = record({ dashboard: false, presentation: { topicContext: [] } });
  existing.fields.editorialBody = { nodeType: 'document', data: {}, content: [
    { nodeType: 'paragraph', data: {}, content: [text('Existing governed body.')] }
  ] };
  const publication = adaptPublication(existing);
  assert.equal(publication.researchModules.length, 0);
  assert.match(renderPublicationPage(publication,
    { authorization: controlledValidationAuthorization(publication) }), /Existing governed body/);
});

test('authorized Edge payload resolves governed dashboard asset only with alt text', () => {
  const entry = { fields: { gpirPublicationId: 'VK-GPIR-P-000000000033-1',
    supabaseRecordId: '09d86c5b-e508-4dab-8908-a40328842070',
    publicationTitle: 'Title', publicationType: 'Research Publication', executiveSummary: 'Summary',
    editorialBody: moduleBody(1), dashboardAsset: { sys: { id: 'asset-1' } },
    sourceValidationSummary: 'Source' } };
  const asset = { sys: { id: 'asset-1' }, fields: {
    title: 'VK-GPIR-STBL-C2C-2026-001', description: ownerAlt,
    file: { url: '//images.ctfassets.net/dashboard.jpg', fileName: 'dashboard.jpg',
      details: { image: { width: 1536, height: 1024 } } }
  } };
  const payload = normalizedPayload(entry, 'VK-GPIR-P-000000000033-1',
    '09d86c5b-e508-4dab-8908-a40328842070', { includes: { Asset: [asset] } });
  assert.equal(payload.primaryDashboard.alt, ownerAlt);
  assert.equal(payload.primaryDashboard.src, 'https://images.ctfassets.net/dashboard.jpg');
  assert.equal(normalizedPayload({ fields: { ...entry.fields, dashboardAsset: null } },
    'VK-GPIR-P-000000000033-1', '09d86c5b-e508-4dab-8908-a40328842070').primaryDashboard, null);
});

test('responsive and keyboard-focus CSS includes narrow viewport safeguards', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'assets/css/contentful-publication.css'), 'utf8');
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(css, /focus-visible/);
  assert.match(css, /max-width:\s*480px/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /var\(--hero-light-bg/);
  assert.match(css, /--gpir-font-headline:'Calibri Light', Calibri, Arial, sans-serif/);
  assert.match(css, /--gpir-font-body:Arial, Helvetica, sans-serif/);
  assert.match(css, /grid-template-columns:auto minmax\(0, 1fr\)/);
  assert.match(css, /position:sticky/);
  assert.match(css, /max-height:48px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.gpir-discovery-navigation a:focus-visible|\.gpir-publication a:focus-visible/);
});

test('B3B umbrella identity and lineage remain unchanged', () => {
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(),
    'artifacts/m36/b3b/stablecoins-proposed-identity.json'), 'utf8'));
  assert.equal(identity.relationshipToUmbrella.umbrellaPublicationId, 'VK-GPIR-P-000000000018-2');
  assert.equal(identity.relationshipToUmbrella.umbrellaLineageId, 'VK-GPIR-L-000000000018-2');
  assert.equal(identity.relationshipToUmbrella.sameLineage, false);
});

test('local asset payload is ready without creating a Contentful asset', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(process.cwd(),
    'artifacts/m36/b3c/stablecoins-contentful-asset-payload.json'), 'utf8'));
  assert.equal(payload.created, false);
  assert.equal(payload.fields.description['en-US'], ownerAlt);
  assert.equal(payload.governance.sha256,
    'A908E87B0204580825772748EC11E09AF0E04DAC6F2B9436675799D407432CCB');
});
