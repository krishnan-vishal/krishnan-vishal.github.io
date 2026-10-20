'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const locale = 'en-US';
const supabaseUrl = 'https://qlnvhfapctcpzqyuhhth.supabase.co';
const mappingsPath = path.join(root, 'artifacts/m36/cl03-scaleout/content-module-mappings.json');
const reconciliationPath = path.join(root, 'artifacts/m36/cl03a-five/content-reconciliation-report.json');
const canonicalRoutesPath = path.join(root, 'artifacts/m36/cl03c/contentful-canonical-route-readback.json');
const reportPath = path.join(root, 'artifacts/m36/cl03c/contentful-synchronization-report.json');
const disclaimer = 'This publication is provided for research and informational purposes only. It does not constitute financial, legal, regulatory or investment advice. Refer to the linked methodology, sources and full disclaimer for applicable qualifications.';
const disclaimerRoute = '/pages/legal/disclaimer.html';
const expectedPublicationIds = Object.freeze([
  'VK-GPIR-P-000000000003-4',
  'VK-GPIR-P-000000000004-2',
  'VK-GPIR-P-000000000008-3',
  'VK-GPIR-P-000000000009-1',
  'VK-GPIR-P-000000000011-7'
]);

const env = process.env;
let contentfulRoot = null;

function requireSecureConfiguration() {
  for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID',
    'CONTENTFUL_ENVIRONMENT', 'GPIR_SUPABASE_SECRET_KEY']) {
    if (!env[name]) throw new Error(`Missing approved secure configuration: ${name}`);
  }
  contentfulRoot = `https://api.contentful.com/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
    `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function bodyHash(value) {
  return sha256(Buffer.from(stableJson(value)));
}

function scalar(field) {
  return field && typeof field === 'object' && !Array.isArray(field) ? field[locale] : field;
}

function textNode(value, marks = []) {
  return { nodeType: 'text', value, marks, data: {} };
}

function headingNode(level, value) {
  return { nodeType: `heading-${level}`, data: {}, content: [textNode(value)] };
}

function paragraphNode(content) {
  return { nodeType: 'paragraph', data: {}, content: Array.isArray(content) ? content : [textNode(content)] };
}

function decodeEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', rarr: '→', larr: '←', rsquo: '’', lsquo: '‘',
    rdquo: '”', ldquo: '“', copy: '©', plusmn: '±'
  };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code) : whole;
    }
    return Object.prototype.hasOwnProperty.call(named, entity.toLowerCase())
      ? named[entity.toLowerCase()] : whole;
  });
}

function plainHtmlText(value) {
  const withoutBreaks = String(value || '').replace(/<br\s*\/?\s*>/gi, '\n');
  if (/<[^>]+>/.test(withoutBreaks)) throw new Error('Unexpected nested legacy markup.');
  return decodeEntities(withoutBreaks).replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function inlineNodes(value) {
  const html = String(value || '').replace(/<\/?strong\b[^>]*>/gi, '');
  const text = plainHtmlText(html);
  if (!text) throw new Error('Legacy paragraph resolved to empty text.');
  return [textNode(text)];
}

function rowsFromTable(tableHtml, sourceBlock) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(tableHtml))) {
    const cells = [];
    const types = [];
    const cellPattern = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      types.push(cellMatch[1].toLowerCase());
      cells.push(plainHtmlText(cellMatch[2]));
    }
    if (!cells.length) throw new Error(`Empty legacy table row in ${sourceBlock}.`);
    rows.push({ header: types.every(type => type === 'th'), cells });
  }
  if (!rows.length) throw new Error(`Legacy table has no rows in ${sourceBlock}.`);
  const width = rows[0].cells.length;
  if (!width || rows.some(row => row.cells.length !== width))
    throw new Error(`Legacy table column mismatch in ${sourceBlock}.`);
  return { nodeType: 'gpir-table', data: { rows, sourceBlock }, content: [] };
}

function richNodesFromSection(sectionHtml, sourceBlock) {
  const nodes = [];
  let tableIndex = 0;
  const blocks = /<p\b[^>]*>([\s\S]*?)<\/p>|<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  while ((match = blocks.exec(sectionHtml))) {
    if (match[1] !== undefined) nodes.push(paragraphNode(inlineNodes(match[1])));
    else {
      tableIndex += 1;
      nodes.push(rowsFromTable(match[0], `${sourceBlock}:table:${tableIndex}`));
    }
  }
  const remainder = sectionHtml.replace(blocks, '')
    .replace(/<\/?(?:div|thead|tbody)\b[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (remainder) throw new Error(`Unsupported legacy section markup in ${sourceBlock}.`);
  if (!nodes.length) throw new Error(`Mapped legacy section is empty in ${sourceBlock}.`);
  return nodes;
}

function extractMappedSection(sourceHtml, module, publicationId) {
  const id = module.source.selector.replace(/^#/, '');
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sourceHtml.match(new RegExp(`<section\\s+id=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/section>`, 'i'));
  if (!match) throw new Error(`${publicationId} source section missing: ${module.source.selector}`);
  const heading = match[1].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
  if (!heading || plainHtmlText(heading[1]).replace(/[–—]/g, '-') !== module.title.replace(/[–—]/g, '-'))
    throw new Error(`${publicationId} source heading mismatch: ${module.source.selector}`);
  return richNodesFromSection(match[1].replace(heading[0], ''),
    `${publicationId}:${module.source.selector}`);
}

function sourceMethodology(sourceHtml, publicationId) {
  const match = sourceHtml.match(/<section\s+class=["']chapter-sources-section["'][^>]*>[\s\S]*?<div\s+class=["']chapter-sources["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/section>/i);
  if (!match) throw new Error(`${publicationId} source methodology section missing.`);
  const paragraph = match[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!paragraph) throw new Error(`${publicationId} source methodology paragraph missing.`);
  return inlineNodes(paragraph[1]);
}

function buildEditorialBody(mapping, sourceHtml, publicationId) {
  const content = [];
  for (const module of mapping.modules) {
    content.push(headingNode(1, module.title));
    content.push(...extractMappedSection(sourceHtml, module, publicationId));
  }
  content.push(headingNode(1, 'Sources, Methodology & Disclaimer'));
  content.push(headingNode(3, 'Sources & Methodology'));
  content.push(paragraphNode(sourceMethodology(sourceHtml, publicationId)));
  content.push(headingNode(3, 'Disclaimer'));
  content.push(paragraphNode(disclaimer));
  content.push(paragraphNode([{ nodeType: 'hyperlink', data: { uri: disclaimerRoute },
    content: [textNode('Read the full GPIR disclaimer')] }]));
  return { nodeType: 'document', data: {}, content };
}

async function requestJson(url, { method = 'GET', headers = {}, body = null } = {}) {
  const response = await fetch(url, { method, headers: { accept: 'application/json', ...headers },
    body: body === null ? undefined : JSON.stringify(body) });
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  if (!response.ok) {
    const message = parsed?.message || parsed?.error || response.statusText || 'request failed';
    throw new Error(`${new URL(url).hostname} ${method} failed with HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

function contentfulRequest(method, apiPath, body = null, headers = {}) {
  return requestJson(`${contentfulRoot}${apiPath}`, { method, body, headers: {
    authorization: `Bearer ${env.CONTENTFUL_MANAGEMENT_TOKEN}`,
    accept: 'application/vnd.contentful.management.v1+json',
    ...(body === null ? {} : { 'content-type': 'application/vnd.contentful.management.v1+json' }),
    ...headers
  } });
}

function supabaseRequest(method, apiPath, body = null, headers = {}) {
  const secret = env.GPIR_SUPABASE_SECRET_KEY.trim();
  const requestHeaders = {
    authorization: `Bearer ${secret}`,
    ...(body === null ? {} : { 'content-type': 'application/json' })
  };
  requestHeaders['apikey'] = secret;
  Object.assign(requestHeaders, headers);
  return requestJson(`${supabaseUrl}${apiPath}`, { method, body, headers: requestHeaders });
}

function exactSet(actual, expected, label) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`${label} exact set mismatch.`);
}

function validateEntry(entry, approved, expectedBody) {
  if (entry?.sys?.id !== approved.contentfulEntryId || entry?.sys?.contentType?.sys?.id !== 'gpirPublication')
    throw new Error(`${approved.publicationId} Contentful entry identity mismatch.`);
  if (entry.sys.archivedVersion !== undefined)
    throw new Error(`${approved.publicationId} is archived.`);
  const pairs = [
    ['gpirPublicationId', approved.publicationId],
    ['editionLineageId', approved.lineageId],
    ['supabaseRecordId', approved.supabaseRecordId],
    ['canonicalUrlCandidate', approved.contentfulCanonicalRoute]
  ];
  for (const [field, expected] of pairs) {
    if (scalar(entry.fields?.[field]) !== expected)
      throw new Error(`${approved.publicationId} governed field mismatch: ${field}.`);
  }
  if (entry.fields.dashboardAsset !== undefined)
    throw new Error(`${approved.publicationId} no longer has dashboard NONE state.`);
  if (!Number.isInteger(entry.sys.publishedVersion))
    throw new Error(`${approved.publicationId} has no published version to preserve.`);
  const exactBody = bodyHash(scalar(entry.fields.editorialBody)) === bodyHash(expectedBody);
  const publishedCurrent = entry.sys.version === entry.sys.publishedVersion + 1;
  if (!exactBody && !publishedCurrent)
    throw new Error(`${approved.publicationId} has an unrelated unpublished revision; mandatory release control blocked overwrite.`);
  return { exactBody, publishedCurrent };
}

async function loadSupabaseState(approved) {
  const idFilter = `in.(${approved.map(item => item.supabaseRecordId).join(',')})`;
  const identitiesQuery = new URLSearchParams({ select: 'id,gpir_publication_id,identity_status,collision_state',
    id: idFilter });
  const identities = await supabaseRequest('GET', `/rest/v1/gpir_identity_publications?${identitiesQuery}`);
  exactSet(identities.map(item => item.id), approved.map(item => item.supabaseRecordId), 'Governed Supabase identities');
  for (const item of approved) {
    const identity = identities.find(candidate => candidate.id === item.supabaseRecordId);
    if (identity.gpir_publication_id !== item.publicationId ||
      !['SOURCE_NATIVE', 'GOVERNED_ASSIGNED'].includes(identity.identity_status) || identity.collision_state !== 'none')
      throw new Error(`${item.publicationId} Supabase governed identity is not active and collision-free.`);
  }
  const policiesQuery = new URLSearchParams({
    select: 'supabase_record_id,publication_id,access_class,status,classification_source,review_state,premium_plan_id',
    supabase_record_id: idFilter
  });
  const policies = await supabaseRequest('GET', `/rest/v1/gpir_publication_access_policies?${policiesQuery}`);
  for (const policy of policies) {
    const item = approved.find(candidate => candidate.supabaseRecordId === policy.supabase_record_id);
    if (!item || item.publicationId !== policy.publication_id)
      throw new Error('Existing publication access policy has a governed identity mismatch.');
  }
  return { identities, policies };
}

async function main() {
  const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
  const reconciliation = JSON.parse(fs.readFileSync(reconciliationPath, 'utf8'));
  const canonicalRoutes = JSON.parse(fs.readFileSync(canonicalRoutesPath, 'utf8'));
  if (reconciliation.status !== 'OWNER_PREVIEWS_RECONCILED_AWAITING_APPROVAL' ||
    reconciliation.unresolvedSections?.length !== 0)
    throw new Error('CL-03B approved reconciliation baseline is not complete.');
  if (canonicalRoutes.status !== 'PASS_READ_ONLY_CONTENTFUL_ROUTE_READBACK' ||
    canonicalRoutes.readOnly !== true || canonicalRoutes.source?.method !== 'GET' ||
    canonicalRoutes.source?.locale !== locale)
    throw new Error('CL-03C Contentful canonical-route readback evidence is not valid.');
  exactSet(Object.keys(mappings.publications), expectedPublicationIds, 'CL-03 migration manifest');
  exactSet(reconciliation.publications.map(item => item.publicationId), expectedPublicationIds,
    'CL-03B reconciliation report');
  exactSet(canonicalRoutes.publications.map(item => item.publicationId), expectedPublicationIds,
    'CL-03C Contentful canonical-route readback');
  const canonicalRouteByPublicationId = new Map(canonicalRoutes.publications.map(item =>
    [item.publicationId, item]));

  const approved = reconciliation.publications.map(item => {
    const mapping = mappings.publications[item.publicationId];
    const routeReadback = canonicalRouteByPublicationId.get(item.publicationId);
    if (!mapping || mapping.contentfulEntryId !== item.contentfulEntryId ||
      mapping.modules.length !== item.moduleCount || item.contentAssessment?.blockers?.length)
      throw new Error(`${item.publicationId} CL-03B mapping or completion mismatch.`);
    if (!routeReadback || routeReadback.contentfulEntryId !== item.contentfulEntryId ||
      typeof routeReadback.canonicalUrlCandidate !== 'string' ||
      !/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(routeReadback.canonicalUrlCandidate))
      throw new Error(`${item.publicationId} Contentful canonical-route readback mismatch.`);
    const sourcePath = path.join(root, mapping.sourcePath);
    const source = fs.readFileSync(sourcePath);
    if (sha256(source) !== item.contentReconciliation.sourceSha256)
      throw new Error(`${item.publicationId} legacy source changed after CL-03B approval.`);
    const sourceHtml = source.toString('utf8');
    if (!new RegExp(`<a\\s+href=["'][^"']*${disclaimerRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(sourceHtml))
      throw new Error(`${item.publicationId} canonical disclaimer reference is absent.`);
    const editorialBody = buildEditorialBody(mapping, sourceHtml, item.publicationId);
    const moduleHeadingCount = editorialBody.content.filter(node => node.nodeType === 'heading-1').length;
    const tableCount = editorialBody.content.filter(node => node.nodeType === 'gpir-table').length;
    if (moduleHeadingCount !== item.moduleCount + 1 || tableCount !== item.contentAssessment.sourceTableCount)
      throw new Error(`${item.publicationId} generated reconciliation shape mismatch.`);
    return { ...item, contentfulCanonicalRoute: routeReadback.canonicalUrlCandidate, mapping,
      editorialBody, editorialBodySha256: bodyHash(editorialBody),
      researchModuleCount: item.moduleCount, governanceModuleCount: 1, tableCount };
  });

  if (process.argv.includes('--local-check')) {
    process.stdout.write(`${JSON.stringify({ status: 'LOCAL_PREPARATION_PASS', publications: approved.map(item => ({
      publicationId: item.publicationId, entryId: item.contentfulEntryId,
      researchModules: item.researchModuleCount, governanceModules: item.governanceModuleCount,
      sourceTables: item.tableCount, canonicalRoute: item.contentfulCanonicalRoute,
      editorialBodySha256: item.editorialBodySha256
    })) }, null, 2)}\n`);
    return;
  }

  requireSecureConfiguration();
  const preflightEntries = [];
  for (const item of approved) {
    const entry = await contentfulRequest('GET', `/entries/${encodeURIComponent(item.contentfulEntryId)}`);
    const state = validateEntry(entry, item, item.editorialBody);
    preflightEntries.push({ item, entry, state, publishedVersionBefore: entry.sys.publishedVersion,
      versionBefore: entry.sys.version });
  }
  const initialSupabaseState = await loadSupabaseState(approved);

  const synchronized = [];
  for (const preflight of preflightEntries) {
    const { item } = preflight;
    let operation = 'EXISTING_APPROVED_DRAFT_REUSED';
    let writes = 0;
    if (!preflight.state.exactBody) {
      const fields = { ...preflight.entry.fields, editorialBody: { [locale]: item.editorialBody } };
      await contentfulRequest('PUT', `/entries/${encodeURIComponent(item.contentfulEntryId)}`,
        { fields }, { 'x-contentful-version': String(preflight.entry.sys.version) });
      operation = 'RECONCILED_UNPUBLISHED_REVISION_SAVED';
      writes = 1;
    }
    const readback = await contentfulRequest('GET', `/entries/${encodeURIComponent(item.contentfulEntryId)}`);
    const readbackState = validateEntry(readback, item, item.editorialBody);
    if (!readbackState.exactBody || readback.sys.publishedVersion !== preflight.publishedVersionBefore ||
      readback.sys.version <= readback.sys.publishedVersion)
      throw new Error(`${item.publicationId} Contentful draft readback failed.`);
    synchronized.push({ item, operation, writes, versionBefore: preflight.versionBefore,
      versionAfter: readback.sys.version, publishedVersion: readback.sys.publishedVersion });
  }

  const policiesToWrite = approved.filter(item => {
    const policy = initialSupabaseState.policies.find(candidate =>
      candidate.supabase_record_id === item.supabaseRecordId);
    return !policy || policy.access_class !== 'PUBLIC' || policy.status !== 'ACTIVE' ||
      policy.review_state !== 'EVIDENCED' || policy.premium_plan_id !== null;
  }).map(item => ({
    supabase_record_id: item.supabaseRecordId,
    publication_id: item.publicationId,
    access_class: 'PUBLIC',
    status: 'ACTIVE',
    classification_source: 'M36_CL03C_OWNER_APPROVAL',
    review_state: 'EVIDENCED',
    premium_plan_id: null
  }));
  if (policiesToWrite.length) {
    await supabaseRequest('POST',
      '/rest/v1/gpir_publication_access_policies?on_conflict=supabase_record_id', policiesToWrite,
      { prefer: 'resolution=merge-duplicates,return=minimal' });
  }
  const finalState = await loadSupabaseState(approved);
  for (const item of approved) {
    const policy = finalState.policies.find(candidate => candidate.supabase_record_id === item.supabaseRecordId);
    if (!policy || policy.publication_id !== item.publicationId || policy.access_class !== 'PUBLIC' ||
      policy.status !== 'ACTIVE' || policy.review_state !== 'EVIDENCED' || policy.premium_plan_id !== null)
      throw new Error(`${item.publicationId} PUBLIC classification readback failed.`);
  }

  const result = {
    schemaVersion: 'M36-CL-03C-1.0',
    milestone: 'M36-CL-03C',
    status: 'PASS',
    completedAt: new Date().toISOString(),
    mode: 'CONTENTFUL_UNPUBLISHED_REVISIONS_AND_GOVERNED_PUBLIC_CLASSIFICATION',
    publications: synchronized.map(sync => ({
      publicationId: sync.item.publicationId,
      lineageId: sync.item.lineageId,
      supabaseRecordId: sync.item.supabaseRecordId,
      contentfulEntryId: sync.item.contentfulEntryId,
      title: sync.item.title,
      canonicalRoute: sync.item.contentfulCanonicalRoute,
      dashboardStatus: 'NONE_PRESERVED',
      governedIdentity: 'PRESERVED',
      contentSynchronization: 'PASS',
      operation: sync.operation,
      researchModules: `${sync.item.researchModuleCount}/${sync.item.researchModuleCount}`,
      governanceModulesAdded: sync.item.governanceModuleCount,
      sourceTables: `${sync.item.tableCount}/${sync.item.tableCount}`,
      visibleDisclaimer: 'PASS',
      canonicalDisclaimerLink: disclaimerRoute,
      accessClassification: 'PUBLIC',
      accessPolicyStatus: 'ACTIVE_EVIDENCED',
      contentful: {
        versionBefore: sync.versionBefore,
        versionAfter: sync.versionAfter,
        publishedVersionPreserved: sync.publishedVersion,
        updatedRevisionState: 'UNPUBLISHED_REVISION',
        editorialBodySha256: sync.item.editorialBodySha256
      }
    })),
    totals: {
      publications: synchronized.length,
      researchModules: approved.reduce((sum, item) => sum + item.researchModuleCount, 0),
      governanceModulesAdded: approved.length,
      sourceTables: approved.reduce((sum, item) => sum + item.tableCount, 0),
      contentfulEntryWrites: synchronized.reduce((sum, item) => sum + item.writes, 0),
      contentfulPublishes: 0,
      contentfulUnpublishes: 0,
      supabasePolicyRowsWritten: policiesToWrite.length,
      newContentfulEntries: 0,
      identityChanges: 0,
      canonicalRouteChanges: 0,
      dashboardChanges: 0,
      deployments: 0
    },
    blockers: [],
    nextGate: 'OWNER_AUTHORIZATION_TO_PUBLISH_THE_FIVE_EXISTING_CONTENTFUL_DRAFT_REVISIONS_THEN_RUN_THE_EXISTING_PRODUCTION_RELEASE_WORKFLOW'
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status: result.status,
    publications: result.publications.map(item => ({ publicationId: item.publicationId,
      operation: item.operation, contentful: item.contentful, accessClassification: item.accessClassification,
      visibleDisclaimer: item.visibleDisclaimer })), totals: result.totals, reportPath }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
