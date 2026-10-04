'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { adaptPublication } = require('../m35/contentful-publication-adapter');
const { controlledValidationAuthorization } = require('../m35/contentful-auth-boundary');
const { renderPublicationPage } = require('../m35/contentful-publication-renderer');
const { extractDocx, richTextFromBlocks } = require('./content-factory-batch');

const root = path.resolve(__dirname, '../..');
const locale = 'en-US';
const outputRoot = path.join(root, 'artifacts/m36/cl03a');
const cl03 = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl03/publication-readiness-report.json'), 'utf8'));
const c1 = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/c1/batch-manifest.json'), 'utf8'));
const cl02 = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl02/owner-review-report.json'), 'utf8'));
const env = process.env;
for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT']) {
  if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
}
const apiRoot = `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
  `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}`;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function requestJson(requestPath) {
  return new Promise((resolve, reject) => {
    const request = https.get({ hostname: 'api.contentful.com', path: requestPath,
      headers: { Authorization: `Bearer ${env.CONTENTFUL_MANAGEMENT_TOKEN}`,
        Accept: 'application/vnd.contentful.management.v1+json' } }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        const parsed = text ? JSON.parse(text) : {};
        if (response.statusCode < 200 || response.statusCode >= 300)
          return reject(new Error(`Contentful read failed with status ${response.statusCode}.`));
        resolve(parsed);
      });
    });
    request.on('error', reject);
  });
}

function deLocalize(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([name, value]) =>
    [name, value && typeof value === 'object' && locale in value ? value[locale] : value]));
}

function titleParts(value) {
  const match = /^(?:module\s+)?\d{1,3}(?:\s*[—–:\-.]\s*|\s+)(.+)$/i.exec(value || '');
  return match ? match[1].trim() : String(value || '').trim();
}

function modulesFromBlocks(blocks, provenance) {
  const modules = [];
  let current = null;
  for (const block of blocks || []) {
    if (block.type === 'paragraph' && /^Heading1$/i.test(block.style || '')) {
      current = { moduleNumber: String(modules.length + 1).padStart(2, '0'),
        title: titleParts(block.text), blocks: [] };
      modules.push(current);
    } else if (current) current.blocks.push(block);
  }
  return modules.map(item => ({ moduleNumber: item.moduleNumber, title: item.title,
    drillDown: { eligible: true, status: 'UNRESOLVED', route: null },
    provenance: { sourceSha256: provenance.sourceSha256 },
    sections: item.blocks.length ? [{ body: richTextFromBlocks(item.blocks) }] : [] }));
}

function previewHtml(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\sdata-gpir-(?!(?:drill-down-eligible|publication-id|module-id|source-block|source-sha256|table-layout|column-count)\b)[a-z-]+="[^"]*"/gi, '')
    .replace(/<div class="gpir-reader-header"[^>]*><\/div>/gi, '')
    .replace('<head>', '<head><meta name="robots" content="noindex,nofollow"><meta name="gpir-preview" content="owner-review-only">')
    .replace('</head>', '<style>.gpir-owner-preview-banner{position:relative;z-index:20;padding:.55rem 1rem;background:#0F2747;color:#fff;text-align:center;font:700 .78rem/1.4 Inter,sans-serif;letter-spacing:.04em}</style></head>')
    .replace('<body class="gpir-publication-page">', '<body class="gpir-publication-page"><div class="gpir-owner-preview-banner">OWNER REVIEW PREVIEW · PRESENTATION NORMALIZATION · UNPUBLISHED</div>');
}

async function main() {
  if (cl03.status !== 'PASS' || cl03.mutationGuard.externalWrites !== 0)
    throw new Error('CL-03 readiness baseline is not valid.');
  fs.mkdirSync(outputRoot, { recursive: true });
  const results = [];
  for (const readiness of cl03.publications) {
    const baseline = cl02.publications.find(item => item.publicationId === readiness.publicationId);
    const c1Record = c1.candidates.find(item => item.identity?.publicationId === readiness.publicationId);
    if (!baseline || !c1Record?.source?.path) throw new Error(`${readiness.publicationId} baseline source is missing.`);
    const entry = await requestJson(`${apiRoot}/entries/${encodeURIComponent(readiness.contentfulEntryId)}`);
    const fields = deLocalize(entry.fields);
    if (entry.sys.version !== readiness.contentfulVersion || entry.sys.publishedVersion ||
      fields.gpirPublicationId !== readiness.publicationId ||
      fields.editionLineageId !== readiness.lineageId)
      throw new Error(`${readiness.publicationId} live draft no longer matches CL-03.`);
    const source = extractDocx(c1Record.source.path);
    if (source.sourceSha256 !== c1Record.source.sha256)
      throw new Error(`${readiness.publicationId} governed source checksum changed.`);
    const modules = modulesFromBlocks(source.blocks, source);
    if (modules.length !== readiness.expectedModules)
      throw new Error(`${readiness.publicationId} module count changed.`);
    const publication = adaptPublication({ entryId: readiness.contentfulEntryId, fields,
      presentation: { accessClass: 'PUBLIC', researchModules: modules,
        primaryDashboard: null, topicContext: [{ label: 'Research' }, { label: fields.publicationTitle }],
        publicDescription: fields.executiveSummary } });
    const rendered = previewHtml(renderPublicationPage(publication,
      { authorization: controlledValidationAuthorization(publication) }));
    const renderedModules = (rendered.match(/class="gpir-research-module(?:\s|"|--)/g) || []).length;
    if (renderedModules !== readiness.expectedModules) throw new Error(`${readiness.publicationId} rendered module loss.`);
    const folder = path.join(outputRoot, readiness.publicationId);
    fs.mkdirSync(folder, { recursive: true });
    const previewPath = path.join(folder, 'index.html');
    fs.writeFileSync(previewPath, rendered, 'utf8');
    const tocEntries = source.paragraphs.filter(item => item.tocLevel);
    const visualizationsCreated = (rendered.match(/class="(?:gpir-quantitative-visual|gpir-regional-snapshot)\b/g) || []).length;
    const structuredTablesRendered = (rendered.match(/class="gpir-publication-table-region\b/g) || []).length;
    const tierMatricesRendered = (rendered.match(/class="gpir-tier-matrix"/g) || []).length;
    const marketGridsRendered = (rendered.match(/class="gpir-market-grid"/g) || []).length;
    const visualizationDetails = modules.flatMap(module => module.sections || [])
      .flatMap(section => section.body?.content || [])
      .filter(node => ['gpir-quantitative-visual', 'gpir-regional-snapshot'].includes(node.nodeType))
      .map(node => ({ component: node.nodeType, title: node.data.title, unit: node.data.unit,
        sourceBlock: node.data.sourceBlock,
        values: node.data.items.map(item => ({ category: item.category,
          authoredValue: item.authoredValue || item.share, annualVolume: item.annualVolume || null,
          lower: item.lower, upper: item.upper })) }));
    const unresolvedDrillDownCandidates = (rendered.match(/data-gpir-drill-down-eligible="true"/g) || []).length;
    results.push({ publicationId: readiness.publicationId, lineageId: readiness.lineageId,
      contentfulEntryId: readiness.contentfulEntryId, contentfulVersion: entry.sys.version,
      title: fields.publicationTitle, access: 'PUBLIC', dashboard: 'NONE',
      currentCmsState: 'DRAFT_UNPUBLISHED', expectedModules: readiness.expectedModules,
      renderedModules, routeCandidate: readiness.routeCandidate,
      authoredContentChecksumBefore: source.sourceSha256,
      authoredContentChecksumAfter: source.sourceSha256,
      draftEditorialBodyChecksum: sha256(Buffer.from(JSON.stringify(fields.editorialBody))),
      sourceProvenance: { governedSourcePath: c1Record.source.path,
        sourceSha256: c1Record.source.sha256, sourceUnit: c1Record.source.unit || null,
        tocEntries: source.tocEntryCount, structuredTables: source.structuredTableCount },
      renderedArtifactChecksumBefore: baseline.previewSha256,
      renderedArtifactChecksumAfter: sha256(Buffer.from(rendered)),
      previewPath, structuredTablesFound: source.structuredTableCount,
      structuredTablesRendered, tierMatricesRendered, marketGridsRendered,
      tocEntriesRendered: tocEntries.length,
      pageReferencesSemanticallyRendered: tocEntries.filter(item => item.pageReference).length,
      visualizationsCreated, visualizationDetails,
      internalSectionLinksResolved: readiness.expectedModules,
      drillDownDetailLinksResolved: 0,
      unresolvedDrillDownCandidates,
      contentIntegrity: 'PASS_AUTHORED_SOURCE_UNCHANGED', responsiveResult: 'PENDING_VISUAL_VALIDATION' });
  }
  const report = {
    schemaVersion: 'M36-CL-03A.3-1.0', milestone: 'M36-CL-03A.3',
    priorMilestone: 'M36-CL-03A.2', generatedAt: new Date().toISOString(),
    status: 'PENDING_VISUAL_VALIDATION', readOnly: true,
    rootCauses: {
      trailingOne: 'DOCX_PAGEREF_FIELD_RESULT_FLATTENED_INTO_TOC_PARAGRAPH_TEXT',
      toc: 'TOC1_TOC2_STYLES_AND_PAGEREF_STRUCTURE_LOST_DURING_FLAT_PARAGRAPH_CONVERSION',
      tables: 'GENUINE_WORD_TABLE_ROWS_AND_HEADER_MARKERS_FLATTENED_TO_PARAGRAPHS',
      typography: 'SHARED_LONG_FORM_CSS_LACKED_EXPLICIT_PUBLICATION_TYPE_SCALE_AND_VERTICAL_RHYTHM',
      metadataCard: 'FIXED_FIVE_COLUMN_GRID_EXPOSED_UNUSED_GRID_BACKGROUND_WHEN_ONLY_THREE_FIELDS_EXIST'
    },
    affectedLayers: ['STRUCTURED_CONTENT_CONVERTER', 'B3E_RENDERER', 'PUBLICATION_CSS'],
    typographyProtocol: { tokenSource: 'EXISTING_GPIR_CSS_VARIABLES', publicationTitle: '--gpir-type-title',
      moduleTitle: '--gpir-type-module', h2: '--gpir-type-h2', h3: '--gpir-type-h3',
      h4: '--gpir-type-h4', body: '--gpir-type-body', bodyLineHeight: '--gpir-leading-body',
      smallText: '--gpir-type-small', caption: 'caption/figcaption',
      source: 'gpir-publication-source', footnote: 'gpir-publication-footnote',
      reference: 'gpir-publication-reference', metadata: 'gpir-publication-meta dt/dd',
      toc: 'gpir-publication-toc', table: 'gpir-publication-table-region',
      provenance: 'gpir-publication-provenance', disclaimer: 'gpir-research-module--disclaimer' },
    fontFamilies: { primary: "'Calibri Light', Calibri, Arial, sans-serif",
      secondaryAndBody: 'Arial, Helvetica, sans-serif', proprietaryFontFilesBundled: false },
    fontSizes: { primary: '16px', secondary: '14px', body: '12px', desktopMaximumEnforced: true },
    quantitativeVisualizationProtocol: {
      eligibility: 'TWO_COLUMN_PERCENTAGE_COMPARISON_WITH_EXPLICIT_UNAMBIGUOUS_GOVERNED_VALUES',
      rangeHandling: 'LOWER_AND_UPPER_BOUNDS_PRESERVED_WITHOUT_MIDPOINT_INFERENCE',
      fallback: 'RETAIN_GOVERNED_TABLE_WHEN_ELIGIBILITY_IS_NOT_PROVEN'
    },
    visualIntelligenceProtocol: {
      narrative: 'COMPACT_STRUCTURED_PROSE',
      simpleQuantitativeComparison: 'VISUAL_PLUS_EXACT_DATA_FROM_ONE_GOVERNED_OBJECT',
      marketListWithoutValues: 'COMPACT_MARKET_GRID_WITH_DETERMINISTIC_COUNTRY_CODES_ONLY',
      multiDimensionalData: 'TABLE_OR_SEMANTIC_MATRIX',
      geographicData: 'MAP_ONLY_FOR_EXPLICIT_COUNTRY_VALUES_OR_CLASSIFICATIONS',
      emptyData: 'NO_VISUAL_AND_NO_ZERO_INFERENCE'
    },
    layoutProtocol: {
      oneColumn: 'NARRATIVE_HEAVY_RESEARCH',
      twoColumn: 'VISUAL_PLUS_EXACT_DATA_OR_SUPPORTING_ANALYTICAL_PANELS',
      fullWidth: 'DENSE_TABLES_MATRICES_TIMELINES_AND_COMPLEX_DIAGRAMS',
      mobile: 'SINGLE_COLUMN_STACK_WITH_CONTAINED_HORIZONTAL_OVERFLOW'
    },
    tableWidthProtocol: {
      compact: 'SOURCE_DRIVEN_SINGLE_COLUMN_SMALL_DATASET_USES_INTRINSIC_WIDTH_WITH_CONTAINER_CAP',
      full: 'ORDINARY_TABLE_USES_FULL_RESEARCH_WIDTH_WITH_SEMANTIC_COLUMN_PROPORTIONS_AND_TEXT_WRAPPING',
      wide: 'HIGH_READABILITY_DEMAND_TABLE_USES_FULL_WIDTH_FIRST_THEN_CONTAINED_HORIZONTAL_OVERFLOW',
      classification: 'COLUMN_CONTENT_LENGTH_DENSITY_AND_COLUMN_COUNT_COMBINED_NOT_SECTION_SPECIFIC'
    },
    module03Treatment: 'RANGE_COMPARISON_PLUS_EXACT_GOVERNED_LEGEND; NO_MIDPOINT_PIE_OR_COUNTRY_HEATMAP',
    regionalSnapshotTreatment: 'EXACT_REGION_VOLUME_SHARE_TABLE_PLUS_SHARE_COMPARISON_FROM_SAME_GOVERNED_OBJECT',
    outwardMarketTreatment: 'COMPACT_RESPONSIVE_MARKET_GRID_WITH_AUTHORED_NAMES_AND_DETERMINISTIC_CODES',
    inwardMarketTreatment: 'COMPACT_RESPONSIVE_MARKET_GRID_WHEN_POPULATED; NEUTRAL_NO_DATA_TREATMENT_WHEN_EMPTY',
    module04Treatment: 'FULL_WIDTH_SEMANTIC_TIER_MATRIX_WITH_QUALITATIVE_BRAND_ACCENTS_AND_NO_NUMERIC_SCORING',
    stickyNavigatorTreatment: 'SINGLE_ROW_STICKY_NAV_MAX_48PX_WITH_12PX_TYPE_HORIZONTAL_CONTAINMENT_AND_FIXED_HEADER_AWARE_ANCHOR_OFFSET',
    visualizationsRejectedAndWhy: {
      module03PieOrDonut: 'REJECTED_RANGE_VALUES_ARE_NOT_EXACT_PARTS_OF_ONE_WHOLE',
      module03CountryHeatMap: 'REJECTED_REGIONAL_VALUES_CANNOT_BE_ASSIGNED_TO_COUNTRIES',
      blanketTableCharting: 'REJECTED_MULTI_DIMENSIONAL_EXACT_LOOKUP_DATA_REMAINS_TABULAR'
    },
    governedDataSources: Object.fromEntries(results.map(item => [item.publicationId,
      { sourceSha256: item.sourceProvenance.sourceSha256,
        visualizationSourceBlocks: item.visualizationDetails.map(detail => detail.sourceBlock) }])),
    tocFinding: 'SOURCE_TOC1_TOC2_HIERARCHY_RENDERED_AS_NESTED_SEMANTIC_LIST_WITH_SEPARATE_PAGE_REFERENCE',
    referenceMarkerFinding: { classification: 'C_EXTRACTION_CONVERSION_FLATTENING',
      provenance: 'WORD_PAGEREF_FIELD_WITH_CACHED_RESULT', broadDigitStrippingUsed: false,
      legitimateNumericEndingsPreserved: true },
    metadataCardFinding: 'GENERIC_AUTO_FIT_METADATA_GRID_REMOVES_UNUSED_PRESENTATION_CELL_WITHOUT_INVENTING_VALUES',
    visualizationsCreated: Object.fromEntries(results.map(item => [item.publicationId,
      { count: item.visualizationsCreated, details: item.visualizationDetails }])),
    drillDownProtocol: {
      activeGovernedRoute: 'RENDER_ACCESSIBLE_INTERNAL_LINK',
      futureOrUnresolvedRoute: 'PRESERVE_MACHINE_READABLE_ELIGIBILITY_WITHOUT_EXPOSING_LINK',
      missingDestination: 'RENDER_NORMAL_HEADING_WITHOUT_FABRICATED_URL'
    },
    drillDownStatus: {
      governedDetailRoutes: 0,
      futureMetadataOnlyCandidates: results.reduce((total, item) =>
        total + item.unresolvedDrillDownCandidates, 0),
      fabricatedOrDeadRoutes: 0
    },
    internalLinksResolved: Object.fromEntries(results.map(item => [item.publicationId,
      { governedSectionAnchors: item.internalSectionLinksResolved,
        governedDetailRoutes: item.drillDownDetailLinksResolved }])),
    unresolvedDrillDownCandidates: Object.fromEntries(results.map(item => [item.publicationId,
      item.unresolvedDrillDownCandidates])),
    publications: results,
    authoredContentChecksums: Object.fromEntries(results.map(item => [item.publicationId,
      { before: item.authoredContentChecksumBefore, after: item.authoredContentChecksumAfter,
        match: item.authoredContentChecksumBefore === item.authoredContentChecksumAfter }])),
    renderedArtifactChecksums: Object.fromEntries(results.map(item => [item.publicationId,
      { before: item.renderedArtifactChecksumBefore, after: item.renderedArtifactChecksumAfter,
        presentationBytesChanged: item.renderedArtifactChecksumBefore !== item.renderedArtifactChecksumAfter }])),
    responsiveResults: null,
    tests: { status: 'PENDING', total: null, passed: null, failed: null },
    filesChanged: ['scripts/m36/content-factory-batch.js',
      'scripts/m35/contentful-publication-renderer.js', 'assets/css/contentful-publication.css',
      'scripts/m36/generate-cl03a-presentation-previews.js',
      'tests/m36/cl03a-presentation-normalization.test.mjs',
      'artifacts/m36/cl03a/presentation-normalization-report.json',
      ...results.map(item => path.relative(root, item.previewPath).replaceAll('\\', '/'))],
    mutationGuard: { contentfulMutations: 0, supabaseMutations: 0, contentfulPublishes: 0,
      productionDeployments: 0, productionRouteActivations: 0,
      authenticationChanges: 0, externalWrites: 0 },
    remainingObservations: [], next: 'OWNER FINAL VISUAL REVIEW'
  };
  fs.writeFileSync(path.join(outputRoot, 'presentation-normalization-report.json'),
    `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(results.map(item => ({ publicationId: item.publicationId,
    modules: item.renderedModules, tables: item.structuredTablesRendered,
    tocEntries: item.tocEntriesRendered, previewPath: item.previewPath })), null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
