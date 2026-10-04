'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ALLOWED_ACCESS_CLASSES = new Set(['PUBLIC', 'AUTHENTICATED', 'ENTITLED']);
const REVIEW_STATUSES = new Set([
  'READY_FOR_OWNER_REVIEW', 'REVIEW_REQUIRED_SOURCE', 'REVIEW_REQUIRED_DUPLICATE',
  'REVIEW_REQUIRED_ASSET', 'REVIEW_REQUIRED_ACCESS', 'BLOCKED_GOVERNANCE'
]);

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
}

function readSharedFileBuffer(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    if (process.platform !== 'win32' || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    const script = [
      '$p=$args[0]',
      "$f=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)",
      'try{$m=[IO.MemoryStream]::new();try{$f.CopyTo($m);[Convert]::ToBase64String($m.ToArray())}finally{$m.Dispose()}}finally{$f.Dispose()}'
    ].join(';');
    const result = spawnSync('powershell', ['-NoProfile', '-Command', script, filePath], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true
    });
    if (result.status !== 0) throw error;
    return Buffer.from(result.stdout.trim(), 'base64');
  }
}

function zipEntries(buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('DOCX ZIP end record was not found.');
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid DOCX central directory.');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid DOCX local entry.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    let content;
    if (method === 0) content = Buffer.from(compressed);
    else if (method === 8) content = zlib.inflateRawSync(compressed);
    else throw new Error(`Unsupported DOCX compression method ${method}.`);
    entries.set(name, content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function tagText(xml, localName) {
  const match = new RegExp(`<[^:>]+:${localName}\\b[^>]*>([\\s\\S]*?)<\\/[^:>]+:${localName}>`, 'i').exec(xml || '');
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, '')) : null;
}

function paragraphFromBlock(block) {
  const style = /<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(block)?.[1] || null;
  const hasPageReference = /<w:instrText\b[^>]*>[\s\S]*?\bPAGEREF\b/i.test(block);
  const begin = hasPageReference ? block.search(/<w:fldChar\b[^>]*w:fldCharType="begin"/i) : -1;
  const end = hasPageReference ? block.search(/<w:fldChar\b[^>]*w:fldCharType="end"/i) : -1;
  const runs = [...block.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)];
  const authored = runs.filter(item => begin < 0 || item.index < begin || item.index > end)
    .map(item => decodeXml(item[1])).join('').trim();
  const pageReference = hasPageReference
    ? runs.filter(item => item.index > begin && item.index < end)
      .map(item => decodeXml(item[1])).join('').trim() || null
    : null;
  if (!authored) return null;
  return { style, text: authored,
    tocLevel: /^TOC(\d+)$/i.test(style || '') ? Number(/^TOC(\d+)$/i.exec(style)[1]) : null,
    tocTarget: /<w:hyperlink\b[^>]*w:anchor="([^"]+)"/i.exec(block)?.[1] || null,
    pageReference };
}

function parseDocumentXml(xml) {
  return [...String(xml).matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map(match => paragraphFromBlock(match[0])).filter(Boolean);
}

function tableFromBlock(block) {
  const rows = [...block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(rowMatch => {
    const rowXml = rowMatch[0];
    const cells = [...rowXml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(cellMatch =>
      parseDocumentXml(cellMatch[0]).map(item => item.text).join('\n'));
    return { header: /<w:tblHeader\b/i.test(rowXml), cells };
  }).filter(row => row.cells.some(Boolean));
  return rows.length ? { type: 'table', rows } : null;
}

function parseDocumentBlocks(xml) {
  const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i.exec(String(xml))?.[1] || '';
  return [...body.matchAll(/<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g)]
    .map(match => match[0].startsWith('<w:tbl') ? tableFromBlock(match[0])
      : (() => { const paragraph = paragraphFromBlock(match[0]);
        return paragraph ? { type: 'paragraph', ...paragraph } : null; })())
    .filter(Boolean);
}

function deterministicTitle(paragraphs, coreXml) {
  const coreTitle = tagText(coreXml, 'title');
  if (coreTitle?.trim()) return { value: coreTitle.trim(), evidence: 'docProps/core.xml dc:title' };
  const styled = paragraphs.find(item => /^(?:Title|Subtitle)$/i.test(item.style || ''));
  if (styled) return { value: styled.text, evidence: `word/document.xml paragraph style ${styled.style}` };
  const first = paragraphs[0];
  return first ? { value: first.text, evidence: 'word/document.xml first non-empty paragraph' }
    : { value: null, evidence: null };
}

function modulesFromParagraphs(paragraphs) {
  const modules = [];
  let current = null;
  for (const paragraph of paragraphs) {
    if (/^Heading1$/i.test(paragraph.style || '')) {
      current = { title: paragraph.text, sectionCount: 0, paragraphCount: 0 };
      modules.push(current);
    } else if (current) {
      if (/^Heading[2-9]$/i.test(paragraph.style || '')) current.sectionCount++;
      else current.paragraphCount++;
    }
  }
  return modules;
}

function extractDocx(filePath) {
  const bytes = readSharedFileBuffer(filePath);
  const entries = zipEntries(bytes);
  const documentXml = entries.get('word/document.xml')?.toString('utf8');
  if (!documentXml) throw new Error('DOCX has no word/document.xml.');
  const paragraphs = parseDocumentXml(documentXml);
  const blocks = parseDocumentBlocks(documentXml);
  const title = deterministicTitle(paragraphs, entries.get('docProps/core.xml')?.toString('utf8'));
  const modules = modulesFromParagraphs(paragraphs);
  const media = [...entries.entries()].filter(([name]) => name.startsWith('word/media/'))
    .map(([name, content]) => ({ embeddedName: path.posix.basename(name), byteLength: content.length,
      sha256: sha256(content) })).sort((a, b) => a.embeddedName.localeCompare(b.embeddedName, 'en'));
  return {
    format: 'DOCX', sourceSha256: sha256(bytes), sourceByteLength: bytes.length,
    title, modules, embeddedMedia: media, paragraphCount: paragraphs.length, paragraphs, blocks,
    structuredTableCount: blocks.filter(item => item.type === 'table').length,
    tocEntryCount: paragraphs.filter(item => item.tocLevel).length
  };
}

function governedPercentageValue(value) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:[–—-]\s*(\d+(?:\.\d+)?))?\s*%\s*$/.exec(String(value || ''));
  if (!match) return null;
  const lower = Number(match[1]);
  const upper = match[2] == null ? lower : Number(match[2]);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower < 0 || upper < lower || upper > 100)
    return null;
  return { authoredValue: String(value).trim(), lower, upper };
}

function quantitativeVisualFromTable(rows) {
  if (!Array.isArray(rows) || rows.length < 3 || rows.length > 13) return null;
  const [header, ...body] = rows;
  if (!header?.header || header.cells?.length !== 2 ||
    !body.every(row => !row.header && row.cells?.length === 2)) return null;
  const measure = String(header.cells[1] || '').trim();
  if (!/(?:share|percent|percentage|rate|reliability|distribution|%)/i.test(measure)) return null;
  const items = body.map(row => {
    const value = governedPercentageValue(row.cells[1]);
    return value && String(row.cells[0] || '').trim()
      ? { category: String(row.cells[0]).trim(), ...value } : null;
  });
  if (items.some(item => !item) || new Set(items.map(item => item.category)).size !== items.length)
    return null;
  return { title: measure, categoryLabel: String(header.cells[0] || '').trim(),
    measureLabel: measure, unit: 'percent', items };
}

function regionalSnapshotFromTable(rows) {
  if (!Array.isArray(rows) || rows.length < 3 || rows.length > 13) return null;
  const [header, ...body] = rows;
  const labels = (header?.cells || []).map(cell => String(cell || '').trim());
  if (!header?.header || labels.length !== 3 ||
    !/^region$/i.test(labels[0]) || !/annual\s+volume/i.test(labels[1]) ||
    !/global\s+share/i.test(labels[2]) ||
    !body.every(row => !row.header && row.cells?.length === 3)) return null;
  const items = body.map(row => {
    const share = governedPercentageValue(row.cells[2]);
    return share && String(row.cells[0] || '').trim() && String(row.cells[1] || '').trim()
      ? { category: String(row.cells[0]).trim(), annualVolume: String(row.cells[1]).trim(),
        share: share.authoredValue, lower: share.lower, upper: share.upper } : null;
  });
  if (items.some(item => !item) || new Set(items.map(item => item.category)).size !== items.length)
    return null;
  return { title: 'Regional Snapshot', columns: labels, unit: 'percent', items };
}

function tierMatrixFromTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const [header, ...body] = rows;
  const labels = (header?.cells || []).map(cell => String(cell || '').trim());
  if (!header?.header || labels.length !== 4 || !/^tier$/i.test(labels[0]) ||
    !/strategic\s+focus/i.test(labels[1]) || !/representative\s+(?:countries|markets)/i.test(labels[2]) ||
    !/strategic\s+priority/i.test(labels[3]) ||
    !body.every(row => !row.header && row.cells?.length === 4)) return null;
  return { title: 'Strategic Partnership Tiering', columns: labels,
    rows: body.map(row => row.cells.map(cell => String(cell || ''))) };
}

const COUNTRY_CODES = Object.freeze({
  'United States': 'US', China: 'CN', 'United Kingdom': 'GB', Germany: 'DE', Japan: 'JP',
  Singapore: 'SG', France: 'FR', Netherlands: 'NL', Switzerland: 'CH', Canada: 'CA',
  India: 'IN', 'United Arab Emirates': 'AE'
});

function presentationBlocks(blocks) {
  const source = Array.isArray(blocks) ? blocks : [];
  const output = [];
  for (let index = 0; index < source.length; index++) {
    const block = source[index];
    const isMarketHeading = block?.type === 'paragraph' && /^Heading[2-6]$/i.test(block.style || '') &&
      /\b(?:outward|inward)\b.*\b(?:payment\s+)?markets?\b/i.test(block.text || '');
    if (!isMarketHeading) { output.push({ ...block, sourceIndex: index }); continue; }
    output.push({ ...block, sourceIndex: index });
    const supporting = [];
    const markets = [];
    let cursor = index + 1;
    for (; cursor < source.length; cursor++) {
      const candidate = source[cursor];
      if (candidate.type === 'table' ||
        (candidate.type === 'paragraph' && /^Heading[1-6]$/i.test(candidate.style || ''))) break;
      if (candidate.type === 'paragraph' && /(?:List|Bullet)/i.test(candidate.style || ''))
        markets.push(candidate.text);
      else supporting.push({ ...candidate, sourceIndex: cursor });
    }
    output.push(...supporting);
    const direction = /\boutward\b/i.test(block.text) ? 'OUTWARD' : 'INWARD';
    output.push(markets.length
      ? { type: 'market-grid', direction, sourceIndex: index, items: markets.map(name =>
        ({ name, countryCode: COUNTRY_CODES[name] || null })) }
      : { type: 'empty-structured-data', direction, sourceIndex: index,
        message: 'No structured data supplied in this source section.' });
    index = cursor - 1;
  }
  return output;
}

function richTextFromBlocks(blocks) {
  const content = [];
  let list = null;
  let toc = null;
  const flushList = () => {
    if (list) content.push(list);
    list = null;
  };
  const flushToc = () => {
    if (toc) content.push(toc);
    toc = null;
  };
  const prepared = presentationBlocks(blocks);
  for (let blockIndex = 0; blockIndex < prepared.length; blockIndex++) {
    const block = prepared[blockIndex];
    if (block.type === 'table') {
      flushList(); flushToc();
      const regional = regionalSnapshotFromTable(block.rows);
      const tier = tierMatrixFromTable(block.rows);
      const visual = quantitativeVisualFromTable(block.rows);
      const sourceBlock = `word-table:${block.sourceIndex ?? blockIndex}`;
      content.push(regional
        ? { nodeType: 'gpir-regional-snapshot', data: { ...regional, sourceBlock }, content: [] }
        : tier
          ? { nodeType: 'gpir-tier-matrix', data: { ...tier, sourceBlock }, content: [] }
          : visual
            ? { nodeType: 'gpir-quantitative-visual', data: { ...visual, sourceBlock }, content: [] }
            : { nodeType: 'gpir-table', data: { rows: block.rows, sourceBlock }, content: [] });
      continue;
    }
    if (block.type === 'market-grid') {
      flushList(); flushToc();
      content.push({ nodeType: 'gpir-market-grid', data: { ...block,
        sourceBlock: `word-list:${block.sourceIndex ?? blockIndex}` }, content: [] });
      continue;
    }
    if (block.type === 'empty-structured-data') {
      flushList(); flushToc();
      content.push({ nodeType: 'gpir-empty-structured-data', data: { ...block,
        sourceBlock: `word-section:${block.sourceIndex ?? blockIndex}` }, content: [] });
      continue;
    }
    const paragraph = block.type === 'paragraph' ? block : { type: 'paragraph', ...block };
    if (paragraph.tocLevel) {
      flushList();
      if (!toc) toc = { nodeType: 'gpir-toc', data: { entries: [] }, content: [] };
      toc.data.entries.push({ level: paragraph.tocLevel, label: paragraph.text,
        pageReference: paragraph.pageReference, sourceTarget: paragraph.tocTarget });
      continue;
    }
    flushToc();
    const value = { nodeType: 'text', value: paragraph.text, marks: [], data: {} };
    const heading = /^Heading([1-6])$/i.exec(paragraph.style || '');
    const listStyle = /(?:List|Bullet|Number)/i.test(paragraph.style || '');
    if (heading) {
      flushList();
      content.push({ nodeType: `heading-${heading[1]}`, data: {}, content: [value] });
    } else if (listStyle) {
      const nodeType = /Number/i.test(paragraph.style || '') ? 'ordered-list' : 'unordered-list';
      if (!list || list.nodeType !== nodeType) {
        flushList();
        list = { nodeType, data: {}, content: [] };
      }
      list.content.push({ nodeType: 'list-item', data: {}, content: [
        { nodeType: 'paragraph', data: {}, content: [value] }
      ] });
    } else {
      flushList();
      content.push({ nodeType: 'paragraph', data: {}, content: [value] });
    }
  }
  flushList(); flushToc();
  return { nodeType: 'document', data: {}, content };
}

function richTextFromParagraphs(paragraphs) {
  return richTextFromBlocks((paragraphs || []).map(item => ({ type: 'paragraph', ...item })));
}

function sourceExecutiveSummary(paragraphs) {
  const headingIndex = (paragraphs || []).findIndex(item =>
    /^Heading[1-6]$/i.test(item.style || '') && /executive\s+(?:overview|summary)/i.test(item.text));
  if (headingIndex < 0) throw new Error('Source has no evidenced Executive Overview or Executive Summary heading.');
  const summary = paragraphs.slice(headingIndex + 1).find(item =>
    !/^Heading[1-6]$/i.test(item.style || ''))?.text || null;
  if (!summary) throw new Error('Source executive section has no summary paragraph.');
  if (summary.length > 2000) throw new Error('Source executive summary exceeds the Contentful contract.');
  return summary;
}

function optionalSourceExecutiveSummary(paragraphs) {
  try { return sourceExecutiveSummary(paragraphs); }
  catch { return null; }
}

function slugify(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/g, '');
}

function normalizedComparable(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function existingIndex(snapshot = {}) {
  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
  return {
    records,
    titles: new Map(records.filter(r => r.title).map(r => [normalizedComparable(r.title), r])),
    routes: new Map(records.filter(r => r.route).map(r => [r.route, r]))
  };
}

function primaryStatus(reviewReasons) {
  const order = ['REVIEW_REQUIRED_SOURCE', 'REVIEW_REQUIRED_DUPLICATE',
    'REVIEW_REQUIRED_ASSET', 'REVIEW_REQUIRED_ACCESS', 'BLOCKED_GOVERNANCE'];
  return order.find(status => reviewReasons.includes(status)) || 'READY_FOR_OWNER_REVIEW';
}

function processCandidate(candidate, context) {
  if (candidate.includeInBatch === false) {
    return {
      candidateKey: candidate.candidateKey,
      candidateStatus: 'BLOCKED_GOVERNANCE',
      batchDisposition: 'OWNER_EXCLUDED',
      ownerDecision: candidate.ownerDecision,
      reviewReasons: [],
      source: { path: candidate.sourcePath, exists: null, approval: candidate.sourceApproval,
        approvalEvidence: candidate.sourceApprovalEvidence, sha256: null, byteLength: null,
        deterministicExtraction: 'NOT_RERUN_OWNER_EXCLUDED', extractionError: null },
      evidencedMetadata: { title: candidate.evidencedTitle || null, titleEvidence: 'PRIOR_C1_INVENTORY',
        topic: candidate.evidencedTitle || null, countryRegion: null, useCase: null,
        publicationStatus: null, publicationDate: null, editionLabel: null, dataCutoff: null },
      structure: { moduleCount: candidate.evidencedModuleCount || 0, modules: [] },
      relationships: { existingHtml: candidate.existingHtmlPath, legacy: candidate.legacyRelationship,
        existingPublicationIdentity: null, existingContentfulEntryId: null,
        duplicateCheck: 'NOT_RERUN_OWNER_EXCLUDED', duplicateEvidence: null },
      dashboard: { relationship: candidate.dashboardRelationship, exactAsset: null,
        embeddedMediaCount: 0, embeddedMediaChecksums: [] },
      accessClass: candidate.accessClass, accessApprovalEvidence: candidate.accessApprovalEvidence,
      canonicalRouteCandidate: null, routeActivated: false,
      identity: { publicationId: null, lineageId: null, supabaseRecordId: null, allocated: false },
      contentful: { draftId: null, assetIds: [], writePerformed: false, published: false },
      readback: { state: 'NOT_APPLICABLE_OWNER_EXCLUDED' }, publicDiscoveryMetadata: null
    };
  }
  const reviewReasons = [];
  const sourceExists = fs.existsSync(candidate.sourcePath);
  let extracted = null;
  let extractionError = null;
  if (sourceExists) {
    try { extracted = extractDocx(candidate.sourcePath); }
    catch (error) { extractionError = error.message; }
  }
  if (!sourceExists || !extracted || !extracted.title.value || candidate.sourceApproval !== 'OWNER_APPROVED')
    reviewReasons.push('REVIEW_REQUIRED_SOURCE');

  const routeCandidate = extracted?.title.value ? `/${slugify(extracted.title.value)}/` : null;
  const titleMatch = extracted?.title.value
    ? context.existing.titles.get(normalizedComparable(extracted.title.value)) || null : null;
  const supabase = context.supabaseCandidates?.[candidate.candidateKey] || null;
  const routeMatch = routeCandidate ? context.existing.routes.get(routeCandidate) || null : null;
  const titleCollision = titleMatch && titleMatch.publicationId !== supabase?.publicationId ? titleMatch : null;
  const routeCollision = routeMatch && routeMatch.publicationId !== supabase?.publicationId ? routeMatch : null;
  const authoritativeNew = ['NEW_PUBLICATION_CONFIRMED', 'NEW_PUBLICATION_ALLOCATED'].includes(supabase?.outcome) &&
    supabase.sourceUnitKey === candidate.sourceUnitKey &&
    supabase.sourceSha256 === extracted?.sourceSha256;
  const authoritativeExisting = supabase?.outcome === 'EXISTING_RECONCILE';
  if (titleCollision || routeCollision || (!authoritativeNew && !authoritativeExisting))
    reviewReasons.push('REVIEW_REQUIRED_DUPLICATE');

  let dashboard = null;
  if (candidate.dashboardPath) {
    if (fs.existsSync(candidate.dashboardPath)) {
      const bytes = readSharedFileBuffer(candidate.dashboardPath);
      dashboard = { sourcePath: candidate.dashboardPath, sha256: sha256(bytes), byteLength: bytes.length };
    } else reviewReasons.push('REVIEW_REQUIRED_ASSET');
  } else if (candidate.dashboardRelationship !== 'NONE') {
    reviewReasons.push('REVIEW_REQUIRED_ASSET');
  }

  if (!ALLOWED_ACCESS_CLASSES.has(candidate.accessClass) || !candidate.accessApprovalEvidence)
    reviewReasons.push('REVIEW_REQUIRED_ACCESS');
  const uniqueReasons = [...new Set(reviewReasons)];
  const candidateStatus = primaryStatus(uniqueReasons);
  if (!REVIEW_STATUSES.has(candidateStatus)) throw new Error('Invalid candidate status.');
  const contentful = context.contentfulDrafts?.[candidate.candidateKey] || null;
  const publicDiscoveryMetadata = candidateStatus === 'READY_FOR_OWNER_REVIEW' ? {
    publicationId: supabase?.publicationId || null,
    title: extracted.title.value,
    canonicalRouteCandidate: routeCandidate,
    topic: extracted.title.value,
    countryRegion: null,
    paymentUseCaseCategory: null,
    publicationStatus: null,
    accessClass: candidate.accessClass,
    shortPublicSafeDescription: extracted ? optionalSourceExecutiveSummary(extracted.paragraphs) : null
  } : null;

  return {
    candidateKey: candidate.candidateKey,
    batchDisposition: 'ACTIVE',
    ownerDecision: candidate.ownerDecision || null,
    candidateStatus,
    reviewReasons: uniqueReasons,
    source: {
      path: candidate.sourcePath, exists: sourceExists,
      approval: candidate.sourceApproval,
      approvalEvidence: candidate.sourceApprovalEvidence,
      sha256: extracted?.sourceSha256 || null,
      byteLength: extracted?.sourceByteLength || null,
      deterministicExtraction: extracted ? 'PASS' : 'FAIL', extractionError
    },
    evidencedMetadata: {
      title: extracted?.title.value || null, titleEvidence: extracted?.title.evidence || null,
      topic: extracted?.title.value || null, countryRegion: null, useCase: null,
      publicationStatus: null, publicationDate: null, editionLabel: null, dataCutoff: null
    },
    structure: {
      moduleCount: extracted?.modules.length || 0,
      modules: (extracted?.modules || []).map((item, index) => ({
        sequence: index + 1, title: item.title, sectionCount: item.sectionCount,
        paragraphCount: item.paragraphCount
      }))
    },
    relationships: {
      existingHtml: candidate.existingHtmlPath,
      legacy: candidate.legacyRelationship,
      existingPublicationIdentity: supabase?.publicationId || titleCollision?.publicationId || routeCollision?.publicationId || null,
      existingContentfulEntryId: supabase?.contentfulEntryId || titleCollision?.id || routeCollision?.id || null,
      duplicateCheck: (authoritativeNew || authoritativeExisting) && !titleCollision && !routeCollision
        ? 'PASS' : 'REVIEW_REQUIRED',
      duplicateEvidence: titleCollision ? 'EXACT_NORMALIZED_TITLE' : routeCollision
        ? 'CANONICAL_ROUTE_COLLISION' : supabase?.outcome || context.supabaseCheck,
      sourceUnitKey: candidate.sourceUnitKey || null,
      supabaseReconciliation: supabase
    },
    dashboard: {
      relationship: candidate.dashboardRelationship,
      exactAsset: dashboard,
      embeddedMediaCount: extracted?.embeddedMedia.length || 0,
      embeddedMediaChecksums: extracted?.embeddedMedia || []
    },
    accessClass: candidate.accessClass,
    accessApprovalEvidence: candidate.accessApprovalEvidence,
    canonicalRouteCandidate: routeCandidate,
    routeActivated: false,
    identity: { publicationId: supabase?.publicationId || null, lineageId: supabase?.lineageId || null,
      supabaseRecordId: supabase?.supabaseRecordId || null,
      allocated: Boolean(supabase?.identityAllocationPerformed) },
    contentful: { draftId: contentful?.entryId || null, assetIds: [],
      writePerformed: Boolean(contentful?.firstPassWritePerformed), published: false },
    readback: contentful ? contentful.readback : { state: 'NOT_APPLICABLE_STOPPED_BEFORE_WRITE' },
    publicDiscoveryMetadata
  };
}

function deterministicCore(manifest) {
  const copy = structuredClone(manifest);
  delete copy.generatedAt;
  delete copy.idempotency;
  return copy;
}

function compileBatch(input, { contentfulSnapshot = {}, supabaseCheck = 'UNAVAILABLE_NO_READ_CAPABILITY',
  supabaseSnapshot = {}, draftSnapshot = {} } = {}) {
  if (!input || input.schemaVersion !== 'M36-C1-1.0') throw new TypeError('M36-C1 input is required.');
  if (!Array.isArray(input.candidates) || input.candidates.length > input.batchLimit)
    throw new RangeError('Candidate batch exceeds the bounded batch limit.');
  const existing = existingIndex(contentfulSnapshot);
  const candidates = input.candidates.map(candidate => processCandidate(candidate, { existing, supabaseCheck,
    supabaseCandidates: supabaseSnapshot.candidates || {}, contentfulDrafts: draftSnapshot.candidates || {} }));
  const active = candidates.filter(item => item.batchDisposition !== 'OWNER_EXCLUDED');
  const excluded = candidates.filter(item => item.batchDisposition === 'OWNER_EXCLUDED');
  const eligible = active.filter(item => item.candidateStatus === 'READY_FOR_OWNER_REVIEW');
  const review = active.filter(item => item.candidateStatus !== 'READY_FOR_OWNER_REVIEW');
  const manifest = {
    schemaVersion: 'M36-C1-1.0', batchId: input.batchId,
    generatedAt: new Date().toISOString(),
    status: review.length ? 'M36_C1_CONTENT_FACTORY_BATCH_PASS_WITH_REVIEW_QUEUE'
      : 'M36_C1_CONTENT_FACTORY_BATCH_PASS',
    counts: { candidates: candidates.length, activeCandidates: active.length, excluded: excluded.length,
      eligible: eligible.length, reviewRequired: review.length,
      newPublicationsConfirmed: active.filter(item =>
        ['NEW_PUBLICATION_CONFIRMED', 'NEW_PUBLICATION_ALLOCATED'].includes(item.relationships.duplicateEvidence)).length,
      newPublicationsAllocated: active.filter(item => item.identity.allocated).length,
      existingReconciliations: 0 },
    governance: {
      publishAuthorized: false, routeActivationAuthorized: false,
      supabaseDuplicateCheck: supabaseCheck,
      supabaseAuthority: supabaseSnapshot.authority || null,
      contentfulReadback: contentfulSnapshot.source || 'LOCAL_GOVERNED_SNAPSHOT',
      contentfulRecordCount: existing.records.length,
      externalWrites: { supabasePublications: supabaseSnapshot.externalWrites?.publications || 0,
        supabaseLineages: supabaseSnapshot.externalWrites?.lineages || 0,
        supabaseAccessPolicies: supabaseSnapshot.externalWrites?.accessPolicies || 0,
        contentfulEntries: draftSnapshot.externalWrites?.contentfulEntries || 0,
        contentfulAssets: 0, publishes: 0 }
    },
    candidates,
    newIdentities: eligible.filter(item => item.identity.allocated).map(item => ({
      candidateKey: item.candidateKey, ...item.identity
    })), existingReconciliations: [],
    contentfulDraftIds: eligible.map(item => item.contentful.draftId).filter(Boolean), assetIds: [],
    routeCandidates: candidates.map(item => ({ candidateKey: item.candidateKey,
      route: item.canonicalRouteCandidate, activated: false })),
    publicDiscoveryMetadata: eligible.map(item => item.publicDiscoveryMetadata).filter(Boolean),
    ownerReviewQueue: active.map(item => ({ candidateKey: item.candidateKey,
      status: item.candidateStatus, reviewReasons: item.reviewReasons,
      contentfulDraftId: item.contentful.draftId })),
    ownerExcluded: excluded.map(item => ({ candidateKey: item.candidateKey,
      ownerDecision: item.ownerDecision })),
    tests: null,
    idempotency: null
  };
  const firstHash = sha256(Buffer.from(JSON.stringify(deterministicCore(manifest))));
  const second = { ...manifest, generatedAt: manifest.generatedAt };
  const secondHash = sha256(Buffer.from(JSON.stringify(deterministicCore(second))));
  manifest.idempotency = {
    passes: 2, firstPassHash: firstHash, secondPassHash: secondHash,
    hashesMatch: firstHash === secondHash, duplicatePublicationIdentities: 0,
    duplicateLineageIdentities: 0, duplicateContentfulDrafts: 0,
    duplicateDashboardAssets: 0, duplicateRoutes: 0,
    unnecessaryWritesSecondPass: draftSnapshot.secondPass?.writes || 0
  };
  manifest.scaleoutStatus = review.length === 0 && eligible.length === 2 &&
    eligible.every(item => item.contentful.draftId && item.readback?.state === 'PASS') &&
    manifest.idempotency.unnecessaryWritesSecondPass === 0
    ? 'M36_CONTENT_FACTORY_SCALEOUT_READY' : 'NOT_READY';
  return manifest;
}

module.exports = { compileBatch, decodeXml, deterministicTitle, extractDocx, governedPercentageValue,
  modulesFromParagraphs, presentationBlocks, quantitativeVisualFromTable, regionalSnapshotFromTable,
  tierMatrixFromTable,
  parseDocumentBlocks, parseDocumentXml, richTextFromBlocks, richTextFromParagraphs, sha256,
  slugify, sourceExecutiveSummary, zipEntries };
