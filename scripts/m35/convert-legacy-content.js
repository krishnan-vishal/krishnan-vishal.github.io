'use strict';

const { createHash } = require('node:crypto');

const SCHEMA_VERSION = '1.0.0';
const ID_PATTERN = /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function decode(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/gi, entity => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
  })[entity.toLowerCase()] || entity);
}

function plain(html) {
  return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function matches(html, pattern) {
  return [...html.matchAll(pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`))]
    .map(match => match[1]);
}

function pagePublicationDate(content, metadata) {
  if (typeof metadata.publicationDate === 'string' && metadata.publicationDate.trim())
    return metadata.publicationDate.trim();
  // A page-level publication-date meta tag is scoped to this document. Dates in
  // the body may describe dashboards, citations, or other related objects.
  for (const [tag] of content.matchAll(/<meta\b[^>]*>/gi)) {
    const name = /\b(?:name|property)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!['publication-date', 'article:published_time'].includes(name?.toLowerCase())) continue;
    const value = /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1];
    if (value?.trim()) return value.trim();
  }
  return null;
}

function pagePublicationStatus(content) {
  const values = [];
  for (const [tag] of content.matchAll(/<meta\b[^>]*>/gi)) {
    const name = /\bname=["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() !== 'gpir-publication-status') continue;
    const value = /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1]?.trim();
    values.push(value || '');
  }
  if (!values.length) return { value: null, evidence: null, conflict: false };
  if (values.length !== 1 || !['CURRENT', 'HISTORICAL'].includes(values[0]))
    return { value: null, evidence: null, conflict: values.length > 1 };
  return { value: values[0], evidence: {
    evidenceType: 'EXPLICIT_PAGE_METADATA',
    evidenceLocation: 'meta[name="gpir-publication-status"]',
    mappingRule: 'M35_EXPLICIT_CANONICAL_PUBLICATION_STATUS'
  }, conflict: false };
}

function familyFor(path) {
  if (/^pages\/countries\//.test(path)) return 'country';
  if (/^pages\/regions\//.test(path)) return 'regional-directory';
  if (/^pages\/research\//.test(path)) return 'research-publication';
  if (/^pages\/chapters\//.test(path)) return 'research-chapter';
  return 'other';
}

function contentArea(html, family) {
  const start = family === 'research-publication'
    ? html.search(/<section\b[^>]*class=["'][^"']*page-content/i)
    : html.search(/<div\b[^>]*class=["'][^"']*chapter-content/i);
  if (start < 0) return html;
  const rest = html.slice(start);
  const end = rest.search(/<footer\b/i);
  return end < 0 ? rest : rest.slice(0, end);
}

function element(html, tag, marker) {
  const openings = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  for (const opening of html.matchAll(openings)) {
    if (!marker.test(opening[0])) continue;
    const tokens = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tokens.lastIndex = opening.index;
    let depth = 0;
    for (const token of html.matchAll(tokens)) {
      if (token.index < opening.index) continue;
      depth += /^<\//.test(token[0]) ? -1 : 1;
      if (depth === 0) return { start: opening.index, end: token.index + token[0].length,
        html: html.slice(opening.index, token.index + token[0].length) };
    }
  }
  return null;
}

function withoutElements(html, tag, marker) {
  let result = html;
  let found;
  while ((found = element(result, tag, marker)))
    result = result.slice(0, found.start) + result.slice(found.end);
  return result;
}

function narrativeArea(body, family) {
  let result = withoutElements(body, 'aside', /<aside\b/i);
  result = withoutElements(result, 'nav', /<nav\b/i);
  if (family === 'regional-directory') {
    result = withoutElements(result, 'div', /class=["'][^"']*directory-grid/i);
    result = withoutElements(result, 'p', /class=["'][^"']*directory-empty-state/i);
    result = withoutElements(result, 'div', /class=["'][^"']*directory-search/i);
  }
  if (family === 'research-publication') {
    result = withoutElements(result, 'section', /class=["'][^"']*related-reading/i);
    result = withoutElements(result, 'section', /class=["'][^"']*chapter-navigation/i);
  }
  return result;
}

function reviewState(text, heading, context) {
  if (/Data Under Development|pending (?:data|verification)|incomplete/i.test(text))
    return { dataNature: 'incomplete', reviewRequired: true, reviewReason: 'Explicit incomplete source data' };
  if (/forecast|projection|203[0-9]|2040|future growth|future rail/i.test(`${heading} ${text}`))
    return { dataNature: 'forecast', reviewRequired: true, reviewReason: 'Explicit future or forecast evidence' };
  if (/CY20\d{2}|(?:observed|actual|historical)\b/i.test(`${context} ${text}`))
    return { dataNature: 'observed', reviewRequired: false, reviewReason: null };
  return { dataNature: 'unknown', reviewRequired: true, reviewReason: 'Observed status is not established by source evidence' };
}

function convertLegacyContent(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const sourcePath = typeof input.sourcePath === 'string' ? input.sourcePath.trim() : '';
  const content = typeof input.content === 'string' ? input.content : '';
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata : {};
  if (!sourcePath) errors.push({ code: 'SOURCE_PATH_REQUIRED', message: 'A source path is required.' });
  if (!content.trim()) errors.push({ code: 'SOURCE_CONTENT_REQUIRED', message: 'Nonempty source content is required.' });

  const sourceHash = createHash('sha256').update(content, 'utf8').digest('hex');
  const family = familyFor(sourcePath);
  const body = contentArea(content, family);
  const referencedPublicationIds = unique(matches(body,
    /Reference ID\s*(?:<[^>]+>)*\s*(VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+)/gi));
  const evidencedId = matches(content, /<meta\b[^>]*name=["']gpir-publication-id["'][^>]*content=["'](VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+)["']/i)[0]
    || matches(body, /<h1\b[^>]*>\s*(VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+)\s*<\/h1>/i)[0];
  const suppliedId = typeof metadata.gpirPublicationId === 'string' ? metadata.gpirPublicationId.trim() : '';
  if (suppliedId && !ID_PATTERN.test(suppliedId)) errors.push({ code: 'INVALID_IDENTITY', message: 'GPIR publication ID has an invalid format.' });
  if (suppliedId && evidencedId && suppliedId !== evidencedId)
    warnings.push({ code: 'IDENTITY_CONFLICT', message: 'Supplied identity differs from source evidence; review required.' });
  const gpirPublicationId = suppliedId || evidencedId || `VK-GPIR-SRC-${sourceHash.slice(0, 24).toUpperCase()}`;
  const identityStatus = suppliedId ? 'mapped' : evidencedId ? 'verified' : 'provisional';
  if (!suppliedId && !evidencedId)
    warnings.push({ code: 'IDENTITY_DERIVED', message: 'No page GPIR ID found; provisional content-hash identity requires review.' });

  const title = metadata.title || plain(matches(body, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)[0] ||
    matches(content, /<title\b[^>]*>([\s\S]*?)<\/title>/i)[0] || '');
  if (!title) warnings.push({ code: 'TITLE_MISSING', message: 'Publication title was not found.' });
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl
    : matches(content, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)[0] || null;
  const slug = typeof metadata.slug === 'string' && metadata.slug.trim()
    ? metadata.slug.trim() : title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const canonicalUrlCandidate = typeof metadata.canonicalUrlCandidate === 'string'
    ? metadata.canonicalUrlCandidate : slug ? `/${slug}/` : null;

  const narrativeHtml = narrativeArea(body, family);
  const heroNarrative = family === 'regional-directory'
    ? matches(content, /<p\b[^>]*class=["'][^"']*chapter-hero-intro[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)[0] : null;
  const editorialNarrative = unique([heroNarrative ? plain(heroNarrative) : null,
    ...matches(narrativeHtml, /<(?:p|h2|h3)\b[^>]*>([\s\S]*?)<\/(?:p|h2|h3)>/gi)
    .map(plain).filter(Boolean)]);
  const tableCandidates = [...body.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map((match, index) => {
      const html = match[1];
      const prefix = body.slice(0, match.index);
      const heading = plain([...prefix.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].at(-1)?.[1] || '');
      const rows = matches(html, /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)
        .map(row => matches(row, /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi).map(plain));
      const header = rows[0]?.join(' ') || '';
      const rowReview = rows.map((row, rowIndex) => rowIndex === 0 && rows.length > 1
        ? { dataNature: 'unknown', reviewRequired: false, reviewReason: null }
        : reviewState(row.join(' '), heading, header));
      const dataStates = rows.length > 1 ? rowReview.slice(1) : rowReview;
      const dataNature = dataStates.some(state => state.dataNature === 'forecast') ? 'forecast'
        : dataStates.some(state => state.dataNature === 'incomplete') ? 'incomplete'
          : dataStates.length && dataStates.every(state => state.dataNature === 'observed') ? 'observed' : 'unknown';
      return { index, text: plain(html), rows, rowReview, dataNature,
        reviewRequired: !dataStates.length || dataStates.some(state => state.reviewRequired),
        reviewReason: dataStates.find(state => state.reviewRequired)?.reviewReason
          || (!dataStates.length ? 'Table contains no data rows' : null) };
    });
  const directoryCandidates = family === 'regional-directory'
    ? [...body.matchAll(/<(a|span)\b[^>]*class=["'][^"']*directory-tile[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)]
      .map(match => ({ kind: 'market-status', market: plain(matches(match[2], /<h3\b[^>]*>([\s\S]*?)<\/h3>/i)[0] || ''),
        status: /country-status--active/.test(match[2]) ? 'Active' : 'Coming Soon',
        href: matches(match[0], /\bhref=["']([^"']+)["']/i)[0] || null,
        dataNature: 'unknown', reviewRequired: true, reviewReason: 'Directory publication status requires validation' }))
    : [];
  const structuredIntelligence = [
    ...tableCandidates.map(table => ({ kind: 'table', ...table })),
    ...directoryCandidates,
    ...(Array.isArray(metadata.structuredIntelligence) ? metadata.structuredIntelligence.map(candidate => ({
      ...candidate, kind: candidate.kind || 'supplied', dataNature: candidate.dataNature || 'unknown',
      reviewRequired: candidate.reviewRequired !== false,
      reviewReason: candidate.reviewReason || 'Supplied candidate requires review'
    })) : [])
  ];
  const assetReferences = unique([
    ...matches(body, /<(?:img|source|video|audio)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi),
    ...matches(body, /<a\b[^>]*?\bhref\s*=\s*["']([^"']+\.(?:png|jpe?g|webp|svg|gif|pdf))["']/gi)
  ]);
  const missingAssets = Array.isArray(input.missingAssets) ? input.missingAssets : [];
  const assetStatus = assetReferences.map(reference => ({ reference,
    status: missingAssets.includes(reference) ? 'missing' : 'unverified' }));
  for (const asset of assetStatus.filter(item => item.status === 'missing'))
    warnings.push({ code: 'ASSET_MISSING', message: `Referenced asset is absent: ${asset.reference}` });
  const countrySourceSection = element(body, 'section', /id=["']sources["']/i)?.html || '';
  const bibliography = element(body, 'section', /class=["'][^"']*references-section/i)?.html || '';
  const sourceReferences = unique([
    ...(Array.isArray(metadata.sourceReferences) ? metadata.sourceReferences : []),
    ...matches(body, /<a\b[^>]*?\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi),
    ...matches(countrySourceSection, /<li\b[^>]*>([\s\S]*?)<\/li>/gi).map(plain),
    ...matches(bibliography, /<li\b[^>]*>([\s\S]*?)<\/li>/gi).map(plain),
    ...matches(bibliography, /<p\b[^>]*>([\s\S]*?)<\/p>/gi).map(plain),
    ...matches(body, /<div\b[^>]*class=["'][^"']*data-source-line[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi).map(plain),
    ...matches(body, /<p\b[^>]*>([\s\S]*?)<\/p>/gi).map(plain)
      .filter(text => /^(?:Primary:|Secondary:|Source:)/i.test(text) && text.length < 600)
  ]);
  const sourceNotes = unique(matches(body, /<(?:p|li|div)\b[^>]*>([\s\S]*?)<\/(?:p|li|div)>/gi)
    .map(plain).filter(text => /(?:Pending Verification|Data Under Development|Source:|Primary:|Secondary:|References & Bibliography)/i.test(text) && text.length < 1200));
  if (/Pending Verification|pending formal sourcing/i.test(body))
    warnings.push({ code: 'SOURCE_VERIFICATION_PENDING', message: 'Source marks editorial facts as pending verification.' });
  if (/Data Under Development/i.test(body))
    warnings.push({ code: 'DATA_UNDER_DEVELOPMENT', message: 'Source contains incomplete data fields.' });
  if (family === 'research-chapter' && /forecast|future growth|2040/i.test(body))
    warnings.push({ code: 'FORECAST_REVIEW', message: 'Forecast candidates require manual source review.' });
  if (structuredIntelligence.some(candidate => candidate.reviewRequired && candidate.dataNature === 'unknown'))
    warnings.push({ code: 'STRUCTURED_REVIEW_REQUIRED', message: 'Some structured candidates lack observed-data evidence.' });
  const version = metadata.version || matches(content, /\b(Version\s+\d+(?:\.\d+)*)\b/i)[0] || null;
  const publicationStatus = pagePublicationStatus(content);
  const statusEvidence = publicationStatus.evidence || {
    evidenceType: 'LEGACY_NO_LIFECYCLE_EVIDENCE',
    evidenceLocation: null,
    mappingRule: 'LEGACY_LIFECYCLE_NOT_EVIDENCED'
  };
  if (publicationStatus.conflict)
    warnings.push({ code: 'PUBLICATION_STATUS_CONFLICT',
      message: 'Conflicting page-level publication status metadata; status remains unresolved.' });
  const editionLabel = typeof metadata.editionLabel === 'string' && metadata.editionLabel.trim()
    ? metadata.editionLabel.trim() : null;
  const lineage = {
    editionId: metadata.editionId || null,
    editionLabel,
    version,
    previousEditionId: metadata.previousEditionId || null,
    state: metadata.historical === true || publicationStatus.value === 'HISTORICAL'
      ? 'historical' : 'current'
  };
  const market = family === 'country' ? sourcePath.split('/').pop().replace(/\.html$/i, '') : null;
  const region = metadata.region || (family === 'regional-directory' && /(?:^|\/)apac\.html$/i.test(sourcePath) ? 'APAC' : null);
  const inboundEvidence = family === 'country' && /\bInbound C2C remittances\b/i.test(body);
  const outboundEvidence = family === 'country' && /\bOutbound C2C remittances\b/i.test(body);
  const directionScope = metadata.directionScope || (inboundEvidence && outboundEvidence ? 'Both'
    : inboundEvidence ? 'Inbound' : outboundEvidence ? 'Outbound' : null);
  const useCase = metadata.useCase || (family === 'country' && /\bC2C\b/i.test(body) ? 'C2C' : null);
  if (family === 'country' && !directionScope)
    warnings.push({ code: 'SCOPE_UNRESOLVED', message: 'Inbound/outbound scope lacks explicit evidence.' });
  if (family === 'country' && !useCase)
    warnings.push({ code: 'USE_CASE_UNRESOLVED', message: 'Payment category lacks explicit evidence.' });
  const publicationDate = pagePublicationDate(content, metadata);
  const dataCutoffDate = metadata.dataCutoffDate || decode(matches(body,
    /\bdata period\s+(CY\d{4}\s*\/\s*CY\d{4}\s+YTD\s*\([^<)]+\))/i)[0] || '') || null;
  const summarySection = matches(body,
    /<section\b[^>]*id=["'](?:snapshot|exec-summary)["'][^>]*>([\s\S]*?)<\/section>/i)[0];
  const heroSummary = matches(content, /<p\b[^>]*class=["'][^"']*chapter-hero-intro[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)[0];
  const researchSummary = matches(content, /<section\b[^>]*class=["'][^"']*executive-summary[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)[0];
  const executiveSummary = summarySection
    ? plain(matches(summarySection, /<p\b[^>]*>([\s\S]*?)<\/p>/i)[0] || '') || null
    : plain(heroSummary || matches(researchSummary || '', /<p\b[^>]*>([\s\S]*?)<\/p>/i)[0] || '') || editorialNarrative[0] || null;
  const targets = unique([
    /<[^>]+>/.test(content) ? 'A' : null,
    editorialNarrative.length ? 'B' : null,
    structuredIntelligence.length ? 'C' : null,
    assetReferences.length ? 'D' : null,
    Object.values(lineage).some(value => value && value !== 'current') ? 'E' : null,
    warnings.length || errors.length ? 'F' : null
  ]);
  const validationStatus = errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS';
  return {
    schemaVersion: SCHEMA_VERSION,
    gpirPublicationId,
    identityStatus,
    referencedPublicationIds,
    family,
    provenance: { sourcePath, sourceUrl, sourceHash, sourceReferences },
    canonicalUrlCandidate,
    publication: { title, slug, type: metadata.type || family,
      status: publicationStatus.value,
      statusEvidence,
      region, countryMarket: metadata.countryMarket || market,
      directionScope: family === 'country' ? directionScope : metadata.directionScope || (family === 'regional-directory' ? 'regional' : 'global'),
      useCase,
      publicationDate, dataCutoffDate },
    editorialNarrative,
    executiveSummary,
    structuredIntelligence,
    tableCandidates,
    assetReferences,
    assetStatus,
    sourceNotes,
    lineage,
    targets,
    migrationStatus: 'extracted',
    validationStatus,
    exceptions: { warnings, errors }
  };
}

module.exports = { convertLegacyContent };
