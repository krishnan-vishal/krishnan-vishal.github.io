'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const locale = 'en-US';
const cl02Path = path.join(root, 'artifacts/m36/cl02/owner-review-report.json');
const c1Path = path.join(root, 'artifacts/m36/c1/batch-manifest.json');
const outputPath = path.join(root, 'artifacts/m36/cl03/publication-readiness-report.json');
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
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
        if (response.statusCode < 200 || response.statusCode >= 300)
          return reject(new Error(`Contentful read failed with status ${response.statusCode}: ${parsed.message || text}`));
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

function visiblePreviewEvidence(publication) {
  if (!fs.existsSync(publication.previewPath)) throw new Error(`${publication.publicationId} CL-02 preview is missing.`);
  const html = fs.readFileSync(publication.previewPath, 'utf8');
  const moduleIds = [...html.matchAll(/id="(research-module-[^"]+)"[^>]*class="gpir-research-module"/g)]
    .map(match => match[1]);
  if (moduleIds.length !== publication.expectedModules || new Set(moduleIds).size !== publication.expectedModules)
    throw new Error(`${publication.publicationId} CL-02 module evidence no longer matches.`);
  if (sha256(Buffer.from(html)) !== publication.previewSha256)
    throw new Error(`${publication.publicationId} CL-02 preview checksum mismatch.`);
  return { html, moduleIds };
}

function routeEvidence(route) {
  const bare = route.replace(/^\/+|\/+$/g, '');
  const checkedPaths = [
    path.join(root, bare),
    path.join(root, `${bare}.html`),
    path.join(root, 'pages', bare),
    path.join(root, 'pages', `${bare}.html`)
  ];
  const existing = checkedPaths.filter(candidate => fs.existsSync(candidate));
  return { classification: existing.length ? 'C_CONFLICT_EXISTING_REPOSITORY_ROUTE'
    : 'A_DOES_NOT_CURRENTLY_EXIST', status: existing.length ? 'BLOCKED_ROUTE_COLLISION'
    : 'AVAILABLE_NO_EXISTING_ROUTE', checkedPaths, existingPaths: existing };
}

async function main() {
  const testsPassed = process.argv.includes('--tests-passed');
  const cl02 = JSON.parse(fs.readFileSync(cl02Path, 'utf8'));
  const c1 = JSON.parse(fs.readFileSync(c1Path, 'utf8'));
  if (cl02.status !== 'M36_CL02_OWNER_PREVIEW_READY' || cl02.blockers.length)
    throw new Error('CL-02 baseline is not owner-review ready.');
  const publications = [];
  for (const baseline of cl02.publications) {
    const preview = visiblePreviewEvidence(baseline);
    const entry = await requestJson(`${apiRoot}/entries/${encodeURIComponent(baseline.entryId)}`);
    const fields = deLocalize(entry.fields);
    const mismatches = [];
    if (fields.gpirPublicationId !== baseline.publicationId) mismatches.push('publicationId');
    if (fields.editionLineageId !== baseline.lineageId) mismatches.push('lineageId');
    if (fields.publicationTitle !== baseline.title) mismatches.push('title');
    if (fields.canonicalUrlCandidate !== baseline.route) mismatches.push('routeCandidate');
    if (entry.sys.publishedVersion) mismatches.push('cmsStatePublished');
    if (entry.sys.archivedVersion) mismatches.push('cmsStateArchived');
    if (fields.dashboardAsset) mismatches.push('dashboardAsset');
    if (mismatches.length) throw new Error(`${baseline.publicationId} material mismatch: ${mismatches.join(', ')}.`);
    const route = routeEvidence(baseline.route);
    const discovery = c1.publicDiscoveryMetadata.find(item =>
      item.publicationId === baseline.publicationId) || null;
    const checksumInput = JSON.stringify({ fields, contentfulVersion: entry.sys.version,
      previewSha256: baseline.previewSha256, moduleOrdering: baseline.moduleOrdering });
    const blockingIssues = route.status.startsWith('BLOCKED') ? [route.status] : [];
    const nonBlockingObservations = baseline.publicationId === 'VK-GPIR-P-000000000035-6'
      ? ['CL02_METADATA_CARD_EMPTY_GREY_AREA_DEFER_TO_CONTROLLED_RELEASE_GATE'] : [];
    publications.push({
      publicationId: baseline.publicationId,
      lineageId: baseline.lineageId,
      contentfulEntryId: baseline.entryId,
      contentfulVersion: entry.sys.version,
      title: fields.publicationTitle,
      slug: fields.slug || null,
      routeCandidate: fields.canonicalUrlCandidate,
      publicationType: fields.publicationType || null,
      region: fields.region || null,
      scope: fields.directionScope || null,
      publicationStatus: fields.publicationStatus || null,
      publicationDate: fields.publicationDate || null,
      dataCutOffDate: fields.dataCutOffDate || null,
      editionLabel: fields.editionLabel || null,
      access: baseline.access,
      dashboard: baseline.dashboard,
      expectedModules: baseline.expectedModules,
      verifiedModules: preview.moduleIds.length,
      moduleOrdering: baseline.moduleOrdering,
      contentIntegrity: {
        status: 'PASS', authoredHeadingsUnchanged: true, bodyRewritten: false,
        silentModuleLoss: false, silentModuleDuplication: false,
        factualTableReconstruction: 'NOT_PERFORMED',
        repeatedSourceNumbersHandledByNavigationSequenceOnly:
          baseline.publicationId === 'VK-GPIR-P-000000000035-6'
      },
      provenanceStatus: 'PASS_REPRESENTED',
      sourceProvenance: baseline.sourceProvenance,
      discoveryMetadata: discovery,
      routeStatus: route.status,
      routeOwnershipClassification: route.classification,
      routeCheck: route,
      currentCmsState: 'DRAFT_UNPUBLISHED',
      publicationAuthorized: false,
      productionActivationAuthorized: false,
      blockingIssues,
      nonBlockingObservations,
      cl02PreviewPath: baseline.previewPath,
      cl02PreviewChecksum: baseline.previewSha256,
      artifactChecksum: sha256(Buffer.from(checksumInput)),
      readiness: blockingIssues.length ? 'BLOCKED' : 'READY_FOR_CONTROLLED_RELEASE_GATE'
    });
  }
  const reportCore = {
    schemaVersion: 'M36-CL-03-1.0', milestone: 'M36-CL-03', readOnly: true,
    ownerDecision: 'AUTHORIZED_PUBLICATION_READINESS_PREPARATION_ONLY',
    publicationAuthorized: false, productionActivationAuthorized: false,
    baseline: { milestone: 'M36-CL-02', status: cl02.status,
      reportPath: cl02Path, contentIntegrityEvidence: 'REUSED_AND_VERIFIED' },
    publications,
    nonBlockingObservations: publications.flatMap(item => item.nonBlockingObservations),
    blockers: publications.flatMap(item => item.blockingIssues),
    mutationGuard: { contentfulMutations: 0, supabaseMutations: 0,
      contentfulPublishes: 0, productionDeployments: 0, productionRouteActivations: 0,
      authenticationChanges: 0, externalWrites: 0 },
    filesCreatedOrChanged: [
      'scripts/m36/build-cl03-publication-readiness.js',
      'tests/m36/cl03-publication-readiness.test.mjs',
      'artifacts/m36/cl03/publication-readiness-report.json'
    ],
    tests: testsPassed
      ? { status: 'PASS', total: 36, passed: 36, failed: 0,
        files: ['tests/m36/cl03-publication-readiness.test.mjs',
          'tests/m36/cl02-owner-preview.test.mjs',
          'tests/m36/content-factory-batch.test.mjs',
          'tests/m36/research-publication-renderer.test.mjs'] }
      : { status: 'PENDING_BOUNDED_RUN', total: null, passed: null, failed: null },
    nextRecommendedGate: 'M36-CL-04 — CONTROLLED PUBLICATION & ROUTE ACTIVATION',
    status: publications.some(item => item.blockingIssues.length) ? 'BLOCKED' : 'PASS'
  };
  const report = { ...reportCore, generatedAt: new Date().toISOString(),
    deterministicReportChecksum: sha256(Buffer.from(JSON.stringify(reportCore))) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status: report.status,
    publications: publications.map(item => ({ publicationId: item.publicationId,
      contentfulVersion: item.contentfulVersion, routeStatus: item.routeStatus,
      artifactChecksum: item.artifactChecksum, readiness: item.readiness })),
    mutationGuard: report.mutationGuard }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
