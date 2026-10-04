import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDocumentBlocks, parseDocumentXml, presentationBlocks, quantitativeVisualFromTable,
  regionalSnapshotFromTable, richTextFromBlocks, tierMatrixFromTable } =
  require('../../scripts/m36/content-factory-batch');
const { escapeHtml, renderResearchModules, renderRichText, tablePresentation } =
  require('../../scripts/m35/contentful-publication-renderer');
const root = process.cwd();
const reportPath = path.join(root, 'artifacts/m36/cl03a/presentation-normalization-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const fieldXml = `<w:document xmlns:w="x"><w:body>
<w:p><w:pPr><w:pStyle w:val="TOC2"/></w:pPr><w:hyperlink w:anchor="_Toc1">
<w:r><w:t>1.2 Market Size (2021–2025)</w:t></w:r><w:r><w:tab/></w:r>
<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>
<w:p><w:r><w:t>Chapter 1</w:t></w:r></w:p>
<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>Year</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>2021</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

test('PAGEREF result is classified separately without broad trailing-digit removal', () => {
  const paragraphs = parseDocumentXml(fieldXml);
  assert.equal(paragraphs[0].text, '1.2 Market Size (2021–2025)');
  assert.equal(paragraphs[0].pageReference, '1');
  assert.equal(paragraphs[0].tocLevel, 2);
  assert.equal(paragraphs[1].text, 'Chapter 1');
  assert.equal(paragraphs[1].pageReference, null);
});

test('genuine Word table and header structure survive conversion', () => {
  const blocks = parseDocumentBlocks(fieldXml);
  const table = blocks.find(item => item.type === 'table');
  assert.ok(table);
  assert.deepEqual(table.rows, [
    { header: true, cells: ['Year'] }, { header: false, cells: ['2021'] }
  ]);
  const rich = richTextFromBlocks(blocks);
  assert.ok(rich.content.some(item => item.nodeType === 'gpir-table'));
  assert.ok(rich.content.some(item => item.nodeType === 'gpir-toc'));
});

test('both normalized previews preserve identities, modules and authored source checksums', () => {
  assert.deepEqual(report.publications.map(item => item.renderedModules), [6, 38]);
  assert.deepEqual(report.publications.map(item => item.expectedModules), [6, 38]);
  for (const publication of report.publications) {
    assert.equal(publication.authoredContentChecksumBefore,
      publication.authoredContentChecksumAfter);
    assert.equal(publication.access, 'PUBLIC');
    assert.equal(publication.dashboard, 'NONE');
    assert.equal(publication.currentCmsState, 'DRAFT_UNPUBLISHED');
  }
});

test('TOC hierarchy and page references render semantically without concatenated trailing values', () => {
  const publication = report.publications.find(item => item.expectedModules === 38);
  const html = fs.readFileSync(publication.previewPath, 'utf8');
  assert.match(html, /class="gpir-publication-toc"/);
  assert.match(html, /class="gpir-toc-page" aria-label="Source document page 1">1<\/span>/);
  assert.match(html, />1\.2 Market Size \(2021–2025\)<\/span>/);
  assert.doesNotMatch(html, />1\.2 Market Size \(2021–2025\)1<\/span>/);
  assert.match(html, />Chapter 1</);
});

test('shared typography, metadata and contained-table protocol is reusable', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/contentful-publication.css'), 'utf8');
  for (const token of ['--gpir-type-title', '--gpir-type-module', '--gpir-type-h2',
    '--gpir-type-h3', '--gpir-type-h4', '--gpir-type-body', '--gpir-type-small',
    '--gpir-leading-body'])
    assert.match(css, new RegExp(token));
  for (const selector of ['gpir-publication-source', 'gpir-publication-footnote',
    'gpir-publication-reference', 'gpir-publication-provenance'])
    assert.match(css, new RegExp(selector));
  assert.match(css, /grid-template-columns:repeat\(auto-fit/);
  assert.match(css, /\.gpir-publication-table-region\s*\{[\s\S]*?overflow-x:clip/);
  assert.match(css, /\.gpir-publication-table-region--wide\s*\{[\s\S]*?overflow-x:auto/);
  assert.match(css, /\.gpir-publication-table-region:focus-visible/);
});

test('canonical 16/14/12 typography and governed font stacks are centralized', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/contentful-publication.css'), 'utf8');
  assert.match(css, /--gpir-font-headline:'Calibri Light', Calibri, Arial, sans-serif/);
  assert.match(css, /--gpir-font-body:Arial, Helvetica, sans-serif/);
  assert.match(css, /--gpir-size-primary:1rem/);
  assert.match(css, /--gpir-size-secondary:\.875rem/);
  assert.match(css, /--gpir-size-body:\.75rem/);
  assert.doesNotMatch(css, /--gpir-type-(?:title|module|h2|h3|h4|body):clamp\(/);
  assert.match(css, /\.gpir-publication-hero h1[\s\S]*font-family:var\(--gpir-font-headline\)/);
  assert.match(css, /\.gpir-publication \{[\s\S]*font-family:var\(--gpir-font-body\)/);
});

test('quantitative visualization is provenance-driven and preserves both range bounds', () => {
  const governed = [
    { header: true, cells: ['Region', 'Share of Global Cross-Border Volume'] },
    { header: false, cells: ['North America', '32–35%'] },
    { header: false, cells: ['Africa', '2–3%'] }
  ];
  const visual = quantitativeVisualFromTable(governed);
  assert.deepEqual(visual.items.map(item => [item.category, item.lower, item.upper, item.authoredValue]),
    [['North America', 32, 35, '32–35%'], ['Africa', 2, 3, '2–3%']]);
  const html = renderRichText({ nodeType: 'gpir-quantitative-visual', data: visual, content: [] });
  assert.match(html, /data-lower="32" data-upper="35"/);
  assert.match(html, />32–35%</);
  assert.match(html, /Exact governed values/);
  assert.doesNotMatch(html, /pie|donut|heat-?map|midpoint/i);
  assert.equal(quantitativeVisualFromTable([
    { header: true, cells: ['Region', 'Description'] },
    { header: false, cells: ['North America', 'Largest'] },
    { header: false, cells: ['Africa', 'Growing'] }
  ]), null);
});

test('regional snapshot visual and exact table share one governed object', () => {
  const rows = [
    { header: true, cells: ['Region', 'Annual Volume', 'Global Share'] },
    { header: false, cells: ['North America', '$63.2T', '33.3%'] },
    { header: false, cells: ['Africa', '$3.5T', '1.8%'] }
  ];
  const snapshot = regionalSnapshotFromTable(rows);
  assert.deepEqual(snapshot.items[0], { category: 'North America', annualVolume: '$63.2T',
    share: '33.3%', lower: 33.3, upper: 33.3 });
  const html = renderRichText({ nodeType: 'gpir-regional-snapshot',
    data: { ...snapshot, sourceBlock: 'word-table:9' }, content: [] });
  assert.ok((html.match(/North America/g) || []).length >= 2);
  assert.ok((html.match(/33\.3%/g) || []).length >= 2);
  assert.match(html, /data-gpir-source-block="word-table:9"/);
});

test('market lists become compact governed grids and empty data never becomes zero', () => {
  const populated = presentationBlocks([
    { type: 'paragraph', style: 'Heading2', text: 'Leading Outward Payment Markets' },
    { type: 'paragraph', style: null, text: 'Governed introduction.' },
    { type: 'paragraph', style: 'ListParagraph', text: 'United States' },
    { type: 'paragraph', style: 'ListParagraph', text: 'China' }
  ]);
  assert.equal(populated.at(-1).type, 'market-grid');
  assert.deepEqual(populated.at(-1).items, [
    { name: 'United States', countryCode: 'US' }, { name: 'China', countryCode: 'CN' }
  ]);
  const empty = richTextFromBlocks([
    { type: 'paragraph', style: 'Heading2', text: 'Leading Inward Payment Markets' }
  ]);
  const html = renderRichText(empty);
  assert.match(html, /No structured data supplied in this source section/);
  assert.doesNotMatch(html, />0(?:\.0+)?%?</);
  assert.doesNotMatch(html, /gpir-market-grid/);
});

test('strategic tier matrix preserves qualitative authored cells without numeric scoring', () => {
  const rows = [
    { header: true, cells: ['Tier', 'Strategic Focus', 'Representative Countries', 'Strategic Priority'] },
    { header: false, cells: ['Tier 1', 'Global Liquidity & Treasury Hubs',
      'USA, UK, Singapore', 'Highest priority for liquidity'] },
    { header: false, cells: ['Tier 2', 'High-Volume Trade Economies',
      'China, Japan, France', 'Large B2B and treasury flows'] }
  ];
  const matrix = tierMatrixFromTable(rows);
  assert.deepEqual(matrix.rows, rows.slice(1).map(row => row.cells));
  const html = renderRichText({ nodeType: 'gpir-tier-matrix', data: matrix, content: [] });
  for (const cell of rows.flatMap(row => row.cells)) assert.ok(html.includes(escapeHtml(cell)));
  assert.doesNotMatch(html, /score|width:\s*\d+%/i);
});

test('semantic table widths fill ordinary research layouts without section-specific rules', () => {
  const corridorRows = [
    { header: true, cells: ['Corridor Type', 'Dominant Rail 2035–2040'] },
    { header: false, cells: ['GCC → South Asia', 'Wallet + RTP'] },
    { header: false, cells: ['Global B2B', 'RTP + Tokenized Deposits'] },
    { header: false, cells: ['Treasury', 'Stablecoins + Tokenized Deposits'] }
  ];
  const presentation = tablePresentation(corridorRows);
  assert.equal(presentation.layout, 'full');
  assert.equal(presentation.columnCount, 2);
  assert.equal(Math.round(presentation.columnWidths.reduce((sum, value) => sum + value, 0)), 100);
  const html = renderRichText({ nodeType: 'gpir-table',
    data: { rows: corridorRows, sourceBlock: 'word-table:25' }, content: [] });
  assert.match(html, /gpir-publication-table-region--full/);
  assert.match(html, /data-gpir-table-layout="full"/);
  assert.match(html, /<colgroup><col style="width:[\d.]+%"><col style="width:[\d.]+%"><\/colgroup>/);
  assert.doesNotMatch(html, /31\.10|Future Payment Rail Preferences/);

  const ordinaryThreeColumn = tablePresentation([
    { header: true, cells: ['Region', 'System', 'Status'] },
    { header: false, cells: ['ASEAN', 'PayNow', 'Live'] }
  ]);
  assert.equal(ordinaryThreeColumn.layout, 'full');
});

test('genuinely wide tables alone retain contained overflow and readable wrapping', () => {
  const wideRows = [
    { header: true, cells: ['Region', 'Country', 'System', 'Operator', 'Launch', 'Coverage', 'Settlement', 'Notes'] },
    { header: false, cells: ['Asia-Pacific', 'Singapore', 'PayNow', 'Association of Banks',
      '2017', 'Retail and institutional', 'Real time', 'Interoperable cross-border rail with governed detail'] }
  ];
  const presentation = tablePresentation(wideRows);
  assert.equal(presentation.layout, 'wide');
  assert.ok(presentation.minimumWidthRem >= 64);
  const html = renderRichText({ nodeType: 'gpir-table', data: { rows: wideRows }, content: [] });
  assert.match(html, /gpir-publication-table-region--wide/);
  assert.match(html, /--gpir-table-min-width:\d+rem/);

  const fiveColumnResearchTable = tablePresentation([
    { header: true, cells: ['Country', 'Outward', 'Inward', 'Volume', 'Primary Characteristics'] },
    { header: false, cells: ['United States', 'Yes', 'Yes', '55–65',
      'Treasury, trade, investment and correspondent banking hub'] }
  ]);
  assert.equal(fiveColumnResearchTable.layout, 'wide');

  const css = fs.readFileSync(path.join(root, 'assets/css/contentful-publication.css'), 'utf8');
  assert.match(css, /\.gpir-publication-table-region\s*\{[\s\S]*?overflow-x:clip/);
  assert.match(css, /\.gpir-publication-table-region--wide\s*\{[\s\S]*?overflow-x:auto/);
  assert.match(css, /\.gpir-publication-table-region--wide table[\s\S]*?min-width:var\(--gpir-table-min-width/);
  assert.match(css, /overflow-wrap:break-word/);
  assert.match(css, /\.gpir-publication-table-region table[\s\S]*?display:table/);
  assert.match(css, /table-layout:fixed/);
});

test('compact sticky navigator and content alignment protocol remain shared and contained', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/contentful-publication.css'), 'utf8');
  assert.match(css, /\.gpir-research-module-nav[\s\S]*position:sticky[\s\S]*max-height:48px/);
  assert.match(css, /\.gpir-research-module-nav ol[\s\S]*display:flex[\s\S]*overflow-x:auto/);
  assert.match(css, /\.gpir-research-module[\s\S]*scroll-margin-top:133px/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.gpir-research-module-nav[\s\S]*top:69px/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.gpir-research-module[\s\S]*scroll-margin-top:129px/);
  assert.match(css, /\.gpir-visual-exact-layout[\s\S]*grid-template-columns/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.gpir-visual-exact-layout[\s\S]*grid-template-columns:1fr/);
});

test('research drill-down links require an active governed internal destination', () => {
  const html = renderResearchModules([
    { moduleNumber: '01', title: 'Resolved', drillDown: { eligible: true, status: 'ACTIVE', route: '/research/resolved/' }, sections: [] },
    { moduleNumber: '02', title: 'Future', drillDown: { eligible: true, status: 'UNRESOLVED', route: '/research/future/' }, sections: [] },
    { moduleNumber: '03', title: 'External', drillDown: { eligible: true, status: 'ACTIVE', route: 'https://example.com/' }, sections: [] }
  ]);
  assert.match(html, /href="\/research\/resolved\/">Resolved<\/a>/);
  assert.doesNotMatch(html, /href="\/research\/future\//);
  assert.doesNotMatch(html, /href="https:\/\/example\.com/);
  assert.equal((html.match(/data-gpir-drill-down-eligible="true"/g) || []).length, 3);
});

test('mutation guard and release authorization remain closed', () => {
  assert.deepEqual(Object.values(report.mutationGuard), [0, 0, 0, 0, 0, 0, 0]);
  assert.ok(report.filesChanged.every(file => !/auth|reader/i.test(file)));
  assert.equal(report.milestone, 'M36-CL-03A.3');
  assert.equal(report.priorMilestone, 'M36-CL-03A.2');
  assert.equal(report.next, 'OWNER FINAL VISUAL REVIEW');
  assert.equal(report.status, 'PASS');
  assert.equal(report.tests.failed, 0);
});
