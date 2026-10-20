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
const approvedReleaseManifest = Object.freeze({
  sourceRunId: '39423907702',
  spaceId: 'zym0dk277ju5',
  environment: 'master',
  publications: Object.freeze([
    Object.freeze({
      publicationId: 'VK-GPIR-P-000000000003-4',
      contentfulEntryId: '7FBD5IpsZutLF63MKuOntS',
      canonicalRoute: '/global-legalized-betting-gambling-lottery-wagering-payments-gpir-research-fintechoisis/',
      editorialBodySha256: '16b5a3c21d3e7acbc6b8b7f4e43ce7d851b5bf80d35eadf1d0bfe7bdc730fb14',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    }),
    Object.freeze({
      publicationId: 'VK-GPIR-P-000000000004-2',
      contentfulEntryId: '2DHHp4k0GbZXcYvCFLoCPw',
      canonicalRoute: '/global-cross-border-bill-payments-family-financial-services-gpir-research-fintechoisis/',
      editorialBodySha256: '2da335e3da0cac2e5ea6248183ff075fc0e79360d5f214e8b3d383d61ca871d5',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    }),
    Object.freeze({
      publicationId: 'VK-GPIR-P-000000000008-3',
      contentfulEntryId: '6e0k5jOAGiEjj1iBKcNtVz',
      canonicalRoute: '/global-gaming-payments-industry-gpir-research-fintechoisis/',
      editorialBodySha256: '41441deee7a4916450885acdb4f78ca1b677c3e870c5e30d3de06fa906a6fcf2',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    }),
    Object.freeze({
      publicationId: 'VK-GPIR-P-000000000009-1',
      contentfulEntryId: '2l3AdU2yAK87mANrSwZiej',
      canonicalRoute: '/global-gig-economy-freelancer-creator-payments-industry-gpir-research-fintechoisis/',
      editorialBodySha256: 'ce3858ef84cddede6a8b0662f3a92fbeb6f7eda599980ad9030b8e103149849b',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    }),
    Object.freeze({
      publicationId: 'VK-GPIR-P-000000000011-7',
      contentfulEntryId: '2XfDk3XcUCUtUzSQnx1f8l',
      canonicalRoute: '/global-healthcare-medical-tourism-cross-border-health-payments-gpir-research-fintechoisis/',
      editorialBodySha256: 'a60ea3114f7a038af71ca738af1fe01a8346e71489ef97f70458a74302c311b8',
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1
    })
  ])
});

const env = process.env;
let contentfulRoot = null;

function requireSecureConfiguration() {
  for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID',
    'CONTENTFUL_ENVIRONMENT', 'GPIR_SUPABASE_SECRET_KEY']) {
    if (!env[name]) throw new Error(`Missing approved secure configuration: ${name}`);
  }
  requireContentfulConfiguration();
}

function requireContentfulConfiguration() {
  for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID',
    'CONTENTFUL_ENVIRONMENT']) {
    if (!env[name]?.trim()) throw new Error(`Missing approved secure configuration: ${name}`);
  }
  const spaceId = env.CONTENTFUL_SPACE_ID.trim();
  const environment = env.CONTENTFUL_ENVIRONMENT.trim();
  contentfulRoot = `https://api.contentful.com/spaces/${encodeURIComponent(spaceId)}` +
    `/environments/${encodeURIComponent(environment)}`;
  return { spaceId, environment };
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

function tableCellNode(value, header) {
  return {
    nodeType: header ? 'table-header-cell' : 'table-cell',
    data: {},
    content: [paragraphNode(value)]
  };
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
    const cellPattern = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      cells.push({
        value: plainHtmlText(cellMatch[2]),
        header: cellMatch[1].toLowerCase() === 'th'
      });
    }
    if (!cells.length) throw new Error(`Empty legacy table row in ${sourceBlock}.`);
    rows.push({ cells });
  }
  if (!rows.length) throw new Error(`Legacy table has no rows in ${sourceBlock}.`);
  const width = rows[0].cells.length;
  if (!width || rows.some(row => row.cells.length !== width))
    throw new Error(`Legacy table column mismatch in ${sourceBlock}.`);
  return {
    nodeType: 'table',
    data: { sourceBlock },
    content: rows.map(row => ({
      nodeType: 'table-row',
      data: {},
      content: row.cells.map(cell => tableCellNode(cell.value, cell.header))
    }))
  };
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
    if (response.status === 422 && new URL(url).hostname === 'api.contentful.com')
      throw new Error(formatContentfulValidationError(parsed));
    if (new URL(url).hostname === 'api.contentful.com')
      throw new Error(`api.contentful.com ${method} failed with HTTP ${response.status}.`);
    const message = parsed?.message || parsed?.error || response.statusText || 'request failed';
    throw new Error(`${new URL(url).hostname} ${method} failed with HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

function formatContentfulValidationError(error) {
  const issues = Array.isArray(error?.details?.errors) ? error.details.errors : [];
  const messages = {
    required: 'A required value is missing.',
    type: 'The value has an incompatible content type.',
    in: 'The value is not one of the allowed options.',
    size: 'The value does not meet the configured length constraint.',
    linkContentType: 'The linked entry has an unsupported content type.',
    linkMimetypeGroup: 'The linked asset has an unsupported MIME type.',
    enabledNodeTypes: 'The Rich Text node type is not enabled.',
    enabledMarks: 'The Rich Text mark is not enabled.',
    nodes: 'A Rich Text node violates its configured structure.',
    unique: 'The value is not unique.'
  };
  const sanitizedIssues = issues.map(issue => {
    const pathParts = Array.isArray(issue.path) ? issue.path : [];
    const fieldPath = pathParts.reduce((result, part) => {
      if (typeof part === 'number' && Number.isInteger(part) && part >= 0)
        return `${result}[${part}]`;
      const safePart = typeof part === 'string' &&
        /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(part) ? part : '[redacted]';
      return result ? `${result}.${safePart}` : safePart;
    }, '');
    const validator = typeof issue.name === 'string' &&
      /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(issue.name) ? issue.name : 'validation';
    return {
      fieldPath: fieldPath || 'unknown',
      validator,
      message: messages[validator] || 'Contentful rejected the value for this validation rule.'
    };
  });
  const summary = sanitizedIssues.length
    ? sanitizedIssues
    : [{ fieldPath: 'unknown', validator: 'validation',
      message: 'Contentful rejected the request; no field-level details were returned.' }];
  return `api.contentful.com validation failed with HTTP 422: ${JSON.stringify(summary)}`;
}

function contentfulRequest(method, apiPath, body = null, headers = {}) {
  return requestJson(`${contentfulRoot}${apiPath}`, { method, body, headers: {
    authorization: `Bearer ${env.CONTENTFUL_MANAGEMENT_TOKEN}`,
    accept: 'application/vnd.contentful.management.v1+json',
    ...(body === null ? {} : { 'content-type': 'application/vnd.contentful.management.v1+json' }),
    ...headers
  } });
}

function validateReleasePackage(approved, manifest = approvedReleaseManifest,
  config = { spaceId: manifest.spaceId, environment: manifest.environment }) {
  if (config.spaceId !== manifest.spaceId || config.environment !== manifest.environment)
    throw new Error('Contentful space or environment does not match the approved release manifest.');
  if (!Array.isArray(approved) || approved.length !== manifest.publications.length ||
    approved.length !== 5)
    throw new Error('The approved release must contain exactly five prepared publications.');
  for (let index = 0; index < manifest.publications.length; index += 1) {
    const expected = manifest.publications[index];
    const item = approved[index];
    if (!item || item.publicationId !== expected.publicationId ||
      item.contentfulEntryId !== expected.contentfulEntryId ||
      item.contentfulCanonicalRoute !== expected.canonicalRoute ||
      item.editorialBodySha256 !== expected.editorialBodySha256)
      throw new Error(`Approved release package mismatch at publication ${index + 1}.`);
  }
  return true;
}

function releaseEntryIdentity(entry, expected, label, { verifyBody = false } = {}) {
  if (entry?.sys?.id !== expected.contentfulEntryId ||
    entry?.sys?.contentType?.sys?.id !== 'gpirPublication' ||
    entry?.sys?.space?.sys?.id !== approvedReleaseManifest.spaceId ||
    entry?.sys?.environment?.sys?.id !== approvedReleaseManifest.environment ||
    entry?.sys?.archivedVersion !== undefined)
    throw new Error(`${label} entry identity, content type, environment, or lifecycle state mismatch.`);
  const fields = entry.fields || {};
  if (scalar(fields.gpirPublicationId) !== expected.publicationId ||
    scalar(fields.canonicalUrlCandidate) !== expected.canonicalRoute ||
    fields.dashboardAsset !== undefined)
    throw new Error(`${label} publication identity, canonical route, or dashboard state mismatch.`);
  if (verifyBody) {
    const editorialBody = scalar(fields.editorialBody);
    if (!editorialBody || bodyHash(editorialBody) !== expected.editorialBodySha256)
      throw new Error(`${label} editorial body checksum mismatch.`);
  }
}

function writeReleaseReport(report) {
  const reportPath = path.join(root, 'artifacts/m36/cl03c/contentful-release-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function publishApprovedContentfulEntries(approved, {
  spaceId, environment, request = contentfulRequest, writeReport = writeReleaseReport
} = {}) {
  validateReleasePackage(approved, approvedReleaseManifest, { spaceId, environment });
  const report = {
    schemaVersion: 'M36-CL-03C-CONTENTFUL-RELEASE-1.0',
    sourceSynchronizationRunId: approvedReleaseManifest.sourceRunId,
    status: 'PREFLIGHT_PENDING',
    spaceId,
    environment,
    publications: approvedReleaseManifest.publications.map(item => ({
      publicationId: item.publicationId,
      entryId: item.contentfulEntryId,
      canonicalRoute: item.canonicalRoute,
      editorialBodySha256: item.editorialBodySha256,
      expectedDraftVersion: item.expectedDraftVersion,
      expectedPublishedVersion: item.expectedPublishedVersion,
      status: 'PREFLIGHT_PENDING'
    })),
    blockers: []
  };
  writeReport(report);

  const entries = [];
  try {
    for (let index = 0; index < approvedReleaseManifest.publications.length; index += 1) {
      const expected = approvedReleaseManifest.publications[index];
      const current = await request('GET', `/entries/${encodeURIComponent(expected.contentfulEntryId)}`);
      releaseEntryIdentity(current, expected, expected.publicationId, { verifyBody: true });
      if (current.sys.version !== expected.expectedDraftVersion ||
        current.sys.publishedVersion !== expected.expectedPublishedVersion ||
        current.sys.publishedAt == null)
        throw new Error(`${expected.publicationId} draft or preserved published version mismatch.`);

      const collection = await request('GET',
        `/entries?content_type=gpirPublication&fields.gpirPublicationId=` +
        `${encodeURIComponent(expected.publicationId)}&limit=2`);
      if (collection.total !== 1 || collection.items?.[0]?.sys?.id !== expected.contentfulEntryId)
        throw new Error(`${expected.publicationId} does not resolve to exactly one approved entry.`);
      report.publications[index].status = 'PREFLIGHT_PASS';
      entries.push(expected);
      writeReport(report);
    }
  } catch (error) {
    report.status = 'PREFLIGHT_FAILED_NO_PUBLISH';
    report.blockers.push(error.message);
    writeReport(report);
    throw error;
  }

  report.status = 'PREFLIGHT_PASS';
  writeReport(report);
  for (let index = 0; index < entries.length; index += 1) {
    const expected = entries[index];
    const result = report.publications[index];
    let publishResponse;
    try {
      publishResponse = await request('PUT',
        `/entries/${encodeURIComponent(expected.contentfulEntryId)}/published`, null,
        { 'x-contentful-version': String(expected.expectedDraftVersion) });
    } catch (error) {
      result.status = 'PUBLISH_FAILED_OR_UNKNOWN';
      report.status = 'PUBLISH_STOPPED';
      report.blockers.push(`${expected.publicationId}: ${error.message}`);
      writeReport(report);
      throw error;
    }

    try {
      const currentReadback = await request('GET',
        `/entries/${encodeURIComponent(expected.contentfulEntryId)}`);
      releaseEntryIdentity(currentReadback, expected, `${expected.publicationId} readback`,
        { verifyBody: true });
      if (publishResponse?.sys?.id !== expected.contentfulEntryId ||
        publishResponse.sys.version !== expected.expectedDraftVersion + 1 ||
        publishResponse.sys.publishedVersion !== expected.expectedDraftVersion ||
        currentReadback.sys.publishedVersion !== expected.expectedDraftVersion ||
        currentReadback.sys.version !== expected.expectedDraftVersion + 1 ||
        currentReadback.sys.publishedAt == null)
        throw new Error(`${expected.publicationId} publish response or readback version mismatch.`);
      result.status = 'PUBLISH_READBACK_PASS';
      result.publishedVersion = currentReadback.sys.publishedVersion;
      result.entryVersionAfterPublish = currentReadback.sys.version;
      writeReport(report);
    } catch (error) {
      result.status = 'PUBLISH_ACCEPTED_READBACK_FAILED';
      report.status = 'PUBLISH_STOPPED';
      report.blockers.push(`${expected.publicationId}: ${error.message}`);
      writeReport(report);
      throw error;
    }
  }
  report.status = 'PASS';
  writeReport(report);
  return report;
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

function richTextInventory(document, enabledNodeTypes = [], enabledMarks = []) {
  const nodeCounts = new Map();
  const nodes = [];
  const hyperlinks = [];
  const tableRepresentations = [];
  const findings = [];
  const implicitNodeTypes = new Set([
    'document', 'paragraph', 'text', 'table-row', 'table-cell', 'table-header-cell'
  ]);
  function visit(node, path, parentType = null) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      findings.push({ path, reason: 'Node is not an object.' });
      return;
    }
    const type = node.nodeType;
    nodeCounts.set(type || '(missing)', (nodeCounts.get(type || '(missing)') || 0) + 1);
    nodes.push({
      path,
      nodeType: type || null,
      marks: Array.isArray(node.marks) ? node.marks.map(mark => mark?.type) : []
    });
    if (type === 'hyperlink') hyperlinks.push({
      path,
      hasUri: typeof node.data?.uri === 'string',
      uriKind: typeof node.data?.uri === 'string'
        ? node.data.uri.startsWith('/') ? 'relative' : 'absolute'
        : 'missing'
    });
    if (type === 'table') {
      tableRepresentations.push({
        path,
        nodeType: type,
        sourceBlock: typeof node.data?.sourceBlock === 'string' ? node.data.sourceBlock : null,
        rows: Array.isArray(node.content) ? node.content.length : null,
        maximumColumns: Array.isArray(node.content)
          ? Math.max(0, ...node.content.map(row =>
            Array.isArray(row.content) ? row.content.length : 0))
          : null,
        headerRows: Array.isArray(node.content)
          ? node.content.filter(row => Array.isArray(row.content) &&
            row.content.length > 0 &&
            row.content.every(cell => cell.nodeType === 'table-header-cell')).length
          : null,
        richTextChildren: Array.isArray(node.content)
          ? node.content.reduce((sum, row) => sum + (Array.isArray(row.content)
            ? row.content.reduce((cellSum, cell) =>
              cellSum + (Array.isArray(cell.content) ? cell.content.length : 0), 0)
            : 0), 0)
          : null
      });
    }
    if (typeof type !== 'string')
      findings.push({ path, reason: 'nodeType is missing or not a string.' });
    if (!node.data || typeof node.data !== 'object' || Array.isArray(node.data))
      findings.push({ path, reason: 'data must be an object.' });
    if (type && !implicitNodeTypes.has(type) && !enabledNodeTypes.includes(type))
      findings.push({ path, reason: `Rich Text node type is not enabled: ${type}.` });
    if (type === 'text') {
      if (typeof node.value !== 'string' || !Array.isArray(node.marks))
        findings.push({ path, reason: 'Text nodes require a string value and marks array.' });
      else node.marks.forEach((mark, index) => {
        if (typeof mark?.type !== 'string' || !enabledMarks.includes(mark.type))
          findings.push({ path: `${path}.marks[${index}]`, reason: 'Rich Text mark is invalid or not enabled.' });
      });
      if (!['paragraph', 'hyperlink', 'heading-1', 'heading-2', 'heading-3',
        'heading-4', 'heading-5', 'heading-6'].includes(parentType))
        findings.push({ path, reason: 'Text nodes must be contained by an inline text container.' });
      return;
    }
    if (!Array.isArray(node.content))
      findings.push({ path, reason: 'Non-text nodes require a content array.' });
    else node.content.forEach((child, index) =>
      visit(child, `${path}.content[${index}]`, type));
    if (type === 'hyperlink' && typeof node.data?.uri !== 'string')
      findings.push({ path, reason: 'Hyperlink nodes require data.uri.' });
    if (type === 'document' && parentType !== null)
      findings.push({ path, reason: 'Document nodes may only appear at the root.' });
    if (type === 'paragraph' && !['document', 'table-cell', 'table-header-cell'].includes(parentType))
      findings.push({ path, reason: 'Paragraph is nested in an invalid Rich Text parent.' });
    if (type === 'hyperlink' && parentType !== 'paragraph')
      findings.push({ path, reason: 'Hyperlink nodes must be contained by a paragraph.' });
    if (type === 'table' && parentType !== 'document')
      findings.push({ path, reason: 'Table nodes must be contained by the document.' });
    if (type === 'table-row' && parentType !== 'table')
      findings.push({ path, reason: 'Table rows must be contained by a table.' });
    if (['table-cell', 'table-header-cell'].includes(type) && parentType !== 'table-row')
      findings.push({ path, reason: 'Table cells must be contained by a table row.' });
    if (type === 'table' && (!Array.isArray(node.content) || !node.content.length ||
      typeof node.data?.sourceBlock !== 'string'))
      findings.push({ path, reason: 'Table requires rows and its source reference.' });
    if (type === 'table-row' && (!Array.isArray(node.content) || !node.content.length ||
      node.content.some(cell => !['table-cell', 'table-header-cell'].includes(cell?.nodeType))))
      findings.push({ path, reason: 'Table rows require native table cells.' });
    if (['table-cell', 'table-header-cell'].includes(type) &&
      (!Array.isArray(node.content) || !node.content.length ||
       node.content.some(child => child?.nodeType !== 'paragraph')))
      findings.push({ path, reason: 'Table cells require paragraph content.' });
    if (type === 'paragraph' && Array.isArray(node.content) &&
      node.content.some(child => !['text', 'hyperlink'].includes(child?.nodeType)))
      findings.push({ path, reason: 'Paragraph contains an invalid Rich Text child.' });
  }
  visit(document, 'editorialBody');
  if (document?.nodeType !== 'document')
    findings.push({ path: 'editorialBody.nodeType', reason: 'Rich Text root must be document.' });
  return { nodeCounts, nodes, hyperlinks, tableRepresentations, findings };
}

async function inspectContentfulSchema(approved) {
  const contentType = await contentfulRequest('GET', '/content_types/gpirPublication');
  const editorialField = contentType.fields?.find(field => field.id === 'editorialBody');
  const validations = editorialField?.validations || [];
  const enabledNodeTypes = [...new Set(validations.flatMap(validation =>
    Array.isArray(validation.enabledNodeTypes) ? validation.enabledNodeTypes : []))].sort();
  const enabledMarks = [...new Set(validations.flatMap(validation =>
    Array.isArray(validation.enabledMarks) ? validation.enabledMarks : []))].sort();
  const implicitNodeTypes = new Set([
    'document', 'paragraph', 'text', 'table-row', 'table-cell', 'table-header-cell'
  ]);
  const publications = [];
  for (const publication of approved) {
    const entry = await contentfulRequest('GET',
      `/entries/${encodeURIComponent(publication.contentfulEntryId)}`);
    const { nodeCounts, nodes, hyperlinks, tableRepresentations, findings } =
      richTextInventory(publication.editorialBody, enabledNodeTypes, enabledMarks);
    const unsupportedNodes = nodes.filter(node =>
      !implicitNodeTypes.has(node.nodeType) && !enabledNodeTypes.includes(node.nodeType));
    const unsupportedMarks = nodes.flatMap(node => node.marks.flatMap((markType, index) =>
        enabledMarks.includes(markType) ? [] : [{
          path: `${node.path}.marks[${index}]`,
          markType
        }]));
    const fieldValidationChecks = (contentType.fields || []).flatMap(field => {
      const value = scalar(entry.fields?.[field.id]);
      return (field.validations || []).flatMap(validation => {
        if (validation.size && typeof value === 'string') {
          const length = value.length;
          return [{
            fieldId: field.id,
            rule: 'size',
            length,
            minimum: validation.size.min ?? null,
            maximum: validation.size.max ?? null,
            passes: (validation.size.min == null || length >= validation.size.min) &&
              (validation.size.max == null || length <= validation.size.max)
          }];
        }
        if (Array.isArray(validation.in) && value !== undefined && value !== null) {
          return [{
            fieldId: field.id,
            rule: 'in',
            passes: validation.in.includes(value)
          }];
        }
        return [];
      });
    });
    const requiredFields = (contentType.fields || []).filter(field => field.required).map(field => ({
      id: field.id,
      present: Object.prototype.hasOwnProperty.call(entry.fields || {}, field.id)
    }));
    const missingRequiredFields = requiredFields.filter(field => !field.present);
    const compatibility = unsupportedNodes.length || unsupportedMarks.length ||
      findings.length || missingRequiredFields.length ||
      fieldValidationChecks.some(check => !check.passes) ||
      editorialField?.type !== 'RichText' ||
      entry.sys?.contentType?.sys?.id !== contentType.sys?.id ? 'INCOMPATIBLE' : 'COMPATIBLE';
    publications.push({
      publicationId: publication.publicationId,
      entryContentTypeMatches: entry.sys?.contentType?.sys?.id === contentType.sys?.id,
      requiredFields,
      missingRequiredFields,
      fieldValidationChecks,
      generatedPayload: {
        nodeCounts: Object.fromEntries([...nodeCounts].sort(([a], [b]) => a.localeCompare(b))),
        unsupportedNodes,
        unsupportedMarks,
        hyperlinks,
        tableRepresentations,
        findings
      },
      compatibility
    });
  }
  const schemaSummary = {
    contentType: contentType.sys?.id,
    contentTypeVersion: contentType.sys?.version,
    fields: (contentType.fields || []).map(field => ({
      id: field.id,
      type: field.type,
      required: field.required,
      localized: field.localized,
      validations: field.validations || []
    })),
    editorialBody: editorialField ? {
      type: editorialField.type,
      required: editorialField.required,
      localized: editorialField.localized,
      validations,
      enabledNodeTypes,
      enabledMarks
    } : null
  };
  process.stdout.write(`${JSON.stringify({
    status: 'SCHEMA_INVESTIGATION_COMPLETE',
    contentType: schemaSummary,
    publications,
    compatibility: publications.every(publication =>
      publication.compatibility === 'COMPATIBLE') ? 'COMPATIBLE' : 'INCOMPATIBLE'
  }, null, 2)}\n`);
}

async function loadSupabaseState(approved) {
  const idFilter = `in.(${approved.map(item => item.supabaseRecordId).join(',')})`;
  // CL-03C: bounded read-only RPC. Never grant direct identity-table access.
  const identities = await supabaseRequest('POST', '/rest/v1/rpc/gpir_cl03c_identity_readback',
    { p_ids: approved.map(item => item.supabaseRecordId) });
  exactSet(identities.map(item => item.id), approved.map(item => item.supabaseRecordId), 'Governed Supabase identities');
  for (const item of approved) {
    const identity = identities.find(candidate => candidate.id === item.supabaseRecordId);
    if (identity.gpir_publication_id !== item.publicationId ||
      !['SOURCE_NATIVE', 'GOVERNED_ASSIGNED'].includes(identity.identity_status) || identity.collision_state !== 'none')
      throw new Error(`${item.publicationId} Supabase governed identity is not active and collision-free.`);
  }
  const policiesQuery = new URLSearchParams({
    select: 'supabase_record_id,publication_id,access_class,status,classification_source,review_state',
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
  const selectedModes = ['--local-check', '--schema-inspect', '--publish-approved']
    .filter(mode => process.argv.includes(mode));
  if (selectedModes.length > 1)
    throw new Error('Select only one CL-03C execution mode.');

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
    const tableCount = editorialBody.content.filter(node => node.nodeType === 'table').length;
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

  if (process.argv.includes('--schema-inspect')) {
    requireContentfulConfiguration();
    await inspectContentfulSchema(approved);
    return;
  }

  if (process.argv.includes('--publish-approved')) {
    const config = requireContentfulConfiguration();
    await publishApprovedContentfulEntries(approved, config);
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
  // Fail closed before Contentful PUT: verify the actual API caller can upsert
  // governed policy rows. This RPC must be SECURITY INVOKER and read-only.
  const policyWritePreflight = await supabaseRequest('POST',
    '/rest/v1/rpc/gpir_cl03c_policy_write_preflight', {});
  if (policyWritePreflight !== true)
    throw new Error('CL-03C policy-write permission preflight failed; no Contentful drafts changed.');

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
      policy.review_state !== 'EVIDENCED';
  }).map(item => ({
    supabase_record_id: item.supabaseRecordId,
    publication_id: item.publicationId,
    access_class: 'PUBLIC',
    status: 'ACTIVE',
    classification_source: 'M36_CL03C_OWNER_APPROVAL',
    review_state: 'EVIDENCED'
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
      policy.status !== 'ACTIVE' || policy.review_state !== 'EVIDENCED')
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

module.exports = {
  approvedReleaseManifest,
  buildEditorialBody,
  formatContentfulValidationError,
  publishApprovedContentfulEntries,
  richTextInventory,
  rowsFromTable,
  validateReleasePackage
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
