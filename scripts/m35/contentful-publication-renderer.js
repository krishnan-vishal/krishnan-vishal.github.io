'use strict';

const { authorizePublication, resolveProviderAuthorization } = require('./contentful-auth-boundary');
const PROTECTED_PUBLICATION_ENDPOINT =
  'https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-protected-publication';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function safeHref(value) {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (href.startsWith('/') || /^https:\/\//i.test(href)) return href;
  return null;
}

function renderText(node) {
  let text = escapeHtml(node?.value || '');
  for (const mark of node?.marks || []) {
    if (mark.type === 'bold') text = `<strong>${text}</strong>`;
    else if (mark.type === 'italic') text = `<em>${text}</em>`;
    else if (mark.type === 'underline') text = `<u>${text}</u>`;
    else if (mark.type === 'code') text = `<code>${text}</code>`;
  }
  return text;
}

function tocTree(entries) {
  const root = [];
  const stack = [{ level: 0, children: root }];
  for (const raw of entries || []) {
    const level = Math.max(1, Math.min(9, Number(raw?.level) || 1));
    while (stack.length > 1 && stack.at(-1).level >= level) stack.pop();
    const node = { level, label: String(raw?.label || ''),
      pageReference: raw?.pageReference == null ? null : String(raw.pageReference), children: [] };
    stack.at(-1).children.push(node);
    stack.push(node);
  }
  return root;
}

function renderTocNodes(nodes) {
  if (!nodes.length) return '';
  return `<ol>${nodes.map(node => `<li class="gpir-toc-level-${node.level}"><div><span class="gpir-toc-label">${escapeHtml(node.label)}</span>${node.pageReference ? `<span class="gpir-toc-page" aria-label="Source document page ${escapeHtml(node.pageReference)}">${escapeHtml(node.pageReference)}</span>` : ''}</div>${renderTocNodes(node.children)}</li>`).join('')}</ol>`;
}

function renderPublicationToc(node) {
  const entries = Array.isArray(node?.data?.entries) ? node.data.entries : [];
  return entries.length ? `<nav class="gpir-publication-toc" aria-label="Publication table of contents"><h3>Contents</h3>${renderTocNodes(tocTree(entries))}</nav>` : '';
}

function tablePresentation(rows) {
  const normalized = (rows || []).map(row => Array.isArray(row?.cells)
    ? row.cells.map(cell => String(cell ?? '').trim()) : []);
  const columnCount = normalized.reduce((maximum, cells) => Math.max(maximum, cells.length), 0);
  const rowCount = normalized.length;
  if (!columnCount) return { layout: 'compact', columnCount: 0, columnWidths: [], minimumWidthRem: 0 };
  const columnLengths = Array.from({ length: columnCount }, (_, columnIndex) =>
    normalized.map(cells => (cells[columnIndex] || '').length));
  const semanticWeights = columnLengths.map(lengths => {
    const populated = lengths.filter(Boolean);
    if (!populated.length) return 1;
    const average = populated.reduce((total, length) => total + length, 0) / populated.length;
    const peak = Math.max(...populated);
    return Math.sqrt(Math.max(4, (average * .7) + (Math.min(peak, 120) * .3)));
  });
  const readabilityScore = columnLengths.reduce((total, lengths) =>
    total + Math.min(36, Math.max(8, ...lengths)), 0);
  const wide = readabilityScore >= 110 ||
    (columnCount >= 5 && readabilityScore >= 72) || columnCount >= 8;
  const compact = columnCount === 1 && rowCount <= 12 && readabilityScore < 36;
  const layout = wide ? 'wide' : compact ? 'compact' : 'full';
  const weightTotal = semanticWeights.reduce((total, weight) => total + weight, 0);
  let columnWidths = semanticWeights.map(weight => (weight / weightTotal) * 100);
  if (columnCount === 2 && layout === 'full') {
    columnWidths = [Math.max(20, Math.min(65, columnWidths[0])), 0];
    columnWidths[1] = 100 - columnWidths[0];
  } else if (columnCount === 3 && layout === 'full') {
    columnWidths = columnWidths.map(width => Math.max(16, width));
    const adjustedTotal = columnWidths.reduce((total, width) => total + width, 0);
    columnWidths = columnWidths.map(width => (width / adjustedTotal) * 100);
  }
  return { layout, columnCount,
    columnWidths: columnWidths.map(width => Number(width.toFixed(2))),
    minimumWidthRem: wide ? Math.max(52, Math.min(88, columnCount * 8 +
      (readabilityScore >= 140 ? 8 : 0))) : 0 };
}

function renderPublicationTable(node) {
  const rows = Array.isArray(node?.data?.rows) ? node.data.rows : [];
  if (!rows.length) return '';
  const presentation = tablePresentation(rows);
  const body = rows.map(row => `<tr>${(row.cells || []).map(cell => {
    const tag = row.header ? 'th' : 'td';
    const scope = row.header ? ' scope="col"' : '';
    return `<${tag}${scope}>${escapeHtml(cell).replace(/\r?\n/g, '<br>')}</${tag}>`;
  }).join('')}</tr>`).join('');
  const sourceBlock = node?.data?.sourceBlock ? ` data-gpir-source-block="${escapeHtml(node.data.sourceBlock)}"` : '';
  const columns = presentation.layout === 'full'
    ? `<colgroup>${presentation.columnWidths.map(width => `<col style="width:${width}%">`).join('')}</colgroup>` : '';
  const minimumWidth = presentation.minimumWidthRem
    ? ` style="--gpir-table-min-width:${presentation.minimumWidthRem}rem"` : '';
  return `<div class="gpir-publication-table-region gpir-publication-table-region--${presentation.layout}" role="region" aria-label="Research table" tabindex="0" data-gpir-table-layout="${presentation.layout}" data-gpir-column-count="${presentation.columnCount}"${minimumWidth}${sourceBlock}><table>${columns}${body}</table></div>`;
}

function renderQuantitativeVisual(node) {
  const data = node?.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length || data.unit !== 'percent') return '';
  const rows = items.map(item => {
    const lower = Math.max(0, Math.min(100, Number(item.lower)));
    const upper = Math.max(lower, Math.min(100, Number(item.upper)));
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return '';
    const range = upper - lower;
    return `<li class="gpir-quantitative-row" data-lower="${lower}" data-upper="${upper}"><span class="gpir-quantitative-category">${escapeHtml(item.category)}</span><span class="gpir-quantitative-track" aria-hidden="true"><span class="gpir-quantitative-baseline" style="width:${lower}%"></span>${range ? `<span class="gpir-quantitative-range" style="left:${lower}%;width:${range}%"></span>` : ''}</span></li>`;
  }).join('');
  if (!rows) return '';
  const exactRows = items.map(item => `<tr><th scope="row">${escapeHtml(item.category)}</th><td>${escapeHtml(item.authoredValue)}</td></tr>`).join('');
  const title = data.title || data.measureLabel || 'Quantitative comparison';
  const sourceBlock = data.sourceBlock ? ` data-gpir-source-block="${escapeHtml(data.sourceBlock)}"` : '';
  return `<figure class="gpir-quantitative-visual gpir-share-intelligence" aria-label="${escapeHtml(title)}"${sourceBlock}><figcaption>${escapeHtml(title)}</figcaption><div class="gpir-visual-exact-layout"><div class="gpir-share-intelligence__visual" aria-hidden="true"><ol>${rows}</ol></div><div class="gpir-exact-data" role="region" aria-label="Exact governed values" tabindex="0"><table><thead><tr><th>${escapeHtml(data.categoryLabel || 'Category')}</th><th>${escapeHtml(data.measureLabel || 'Value')}</th></tr></thead><tbody>${exactRows}</tbody></table></div></div></figure>`;
}

function renderRegionalSnapshot(node) {
  const data = node?.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return '';
  const visualRows = items.map(item => `<li class="gpir-quantitative-row" data-lower="${item.lower}" data-upper="${item.upper}"><span class="gpir-quantitative-category">${escapeHtml(item.category)}</span><span class="gpir-quantitative-track" aria-hidden="true"><span class="gpir-quantitative-baseline" style="width:${item.upper}%"></span></span><span class="gpir-quantitative-value">${escapeHtml(item.share)}</span></li>`).join('');
  const exactRows = items.map(item => `<tr><th scope="row">${escapeHtml(item.category)}</th><td>${escapeHtml(item.annualVolume)}</td><td>${escapeHtml(item.share)}</td></tr>`).join('');
  const columns = data.columns || ['Region', 'Annual Volume', 'Global Share'];
  const sourceBlock = data.sourceBlock ? ` data-gpir-source-block="${escapeHtml(data.sourceBlock)}"` : '';
  return `<figure class="gpir-regional-snapshot" aria-label="Regional Snapshot"${sourceBlock}><figcaption>${escapeHtml(data.title || 'Regional Snapshot')}</figcaption><div class="gpir-visual-exact-layout"><div class="gpir-exact-data" role="region" aria-label="Exact regional values" tabindex="0"><table><thead><tr>${columns.map(label => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${exactRows}</tbody></table></div><div class="gpir-regional-snapshot__visual"><ol>${visualRows}</ol></div></div></figure>`;
}

function renderMarketGrid(node) {
  const data = node?.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return '';
  const cards = items.map(item => {
    const route = governedInternalRoute(item.drillDown);
    const label = `<span class="gpir-market-name">${escapeHtml(item.name)}</span>${item.countryCode ? `<span class="gpir-market-code" aria-label="Country code ${escapeHtml(item.countryCode)}">${escapeHtml(item.countryCode)}</span>` : ''}`;
    return `<li>${route ? `<a href="${escapeHtml(route)}">${label}</a>` : `<span>${label}</span>`}</li>`;
  }).join('');
  const sourceBlock = data.sourceBlock ? ` data-gpir-source-block="${escapeHtml(data.sourceBlock)}"` : '';
  return `<section class="gpir-market-grid" aria-label="${escapeHtml(data.direction || 'Market')} markets"${sourceBlock}><ul>${cards}</ul></section>`;
}

function renderEmptyStructuredData(node) {
  const data = node?.data || {};
  const sourceBlock = data.sourceBlock ? ` data-gpir-source-block="${escapeHtml(data.sourceBlock)}"` : '';
  return `<p class="gpir-empty-structured-data"${sourceBlock}>${escapeHtml(data.message || 'No structured data supplied in this source section.')}</p>`;
}

function renderTierMatrix(node) {
  const data = node?.data || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const columns = Array.isArray(data.columns) ? data.columns : [];
  if (!rows.length || columns.length !== 4) return '';
  const body = rows.map((row, index) => `<tr class="gpir-tier-${index + 1}">${row.map((cell, cellIndex) => `<${cellIndex === 0 ? 'th scope="row"' : 'td'} data-label="${escapeHtml(columns[cellIndex])}">${escapeHtml(cell)}</${cellIndex === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('');
  const sourceBlock = data.sourceBlock ? ` data-gpir-source-block="${escapeHtml(data.sourceBlock)}"` : '';
  return `<div class="gpir-tier-matrix" role="region" aria-label="${escapeHtml(data.title || 'Strategic tier matrix')}" tabindex="0"${sourceBlock}><table><thead><tr>${columns.map(label => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function governedInternalRoute(drillDown) {
  const route = drillDown?.status === 'ACTIVE' ? String(drillDown.route || '') : '';
  return /^\/(?!\/)[A-Za-z0-9][A-Za-z0-9/_-]*\/?(?:#[A-Za-z0-9_-]+)?$/.test(route) ? route : null;
}

function renderHeading(node, tag, children) {
  const route = governedInternalRoute(node?.data?.drillDown);
  const eligible = node?.data?.drillDown?.eligible === true;
  const metadata = eligible ? ' data-gpir-drill-down-eligible="true"' : '';
  return `<${tag}${metadata}>${route ? `<a href="${escapeHtml(route)}">${children}</a>` : children}</${tag}>`;
}

function renderRichText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.nodeType === 'text') return renderText(node);
  const children = (node.content || []).map(renderRichText).join('');
  const headings = { 'heading-1': 'h2', 'heading-2': 'h2', 'heading-3': 'h3',
    'heading-4': 'h4', 'heading-5': 'h5', 'heading-6': 'h6' };
  if (node.nodeType === 'document') return children;
  if (node.nodeType === 'gpir-toc') return renderPublicationToc(node);
  if (node.nodeType === 'gpir-table') return renderPublicationTable(node);
  if (node.nodeType === 'gpir-quantitative-visual') return renderQuantitativeVisual(node);
  if (node.nodeType === 'gpir-regional-snapshot') return renderRegionalSnapshot(node);
  if (node.nodeType === 'gpir-market-grid') return renderMarketGrid(node);
  if (node.nodeType === 'gpir-empty-structured-data') return renderEmptyStructuredData(node);
  if (node.nodeType === 'gpir-tier-matrix') return renderTierMatrix(node);
  if (node.nodeType === 'paragraph') return children ? `<p>${children}</p>` : '';
  if (headings[node.nodeType]) return renderHeading(node, headings[node.nodeType], children);
  if (node.nodeType === 'unordered-list') return `<ul>${children}</ul>`;
  if (node.nodeType === 'ordered-list') return `<ol>${children}</ol>`;
  if (node.nodeType === 'list-item') return `<li>${children}</li>`;
  if (node.nodeType === 'blockquote') return `<blockquote>${children}</blockquote>`;
  if (node.nodeType === 'hr') return '<hr>';
  if (node.nodeType === 'hyperlink') {
    const href = safeHref(node.data?.uri);
    return href ? `<a href="${escapeHtml(href)}">${children}</a>` : children;
  }
  if (['embedded-asset-block', 'embedded-entry-block'].includes(node.nodeType))
    return '<aside class="gpir-asset-fallback" role="note">Referenced editorial media is under review.</aside>';
  return children;
}

function metadataRows(publication) {
  return [
    ['Publication ID', publication.identity],
    ['Lineage ID', publication.lineage],
    ['Publication type', publication.publicationType],
    ['Market', publication.market],
    ['Region', publication.region],
    ['Direction', publication.directionScope],
    ['Payment category', publication.useCasePaymentCategory],
    ['Publication status', publication.publicationStatus],
    ['Publication date', publication.publicationDate],
    ['Edition', publication.editionLabel]
  ].filter(([, value]) => value).map(([label, value]) =>
    `<div class="gpir-publication-meta-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}

function renderTopicContext(items) {
  if (!Array.isArray(items) || !items.length) return '';
  const content = items.map((item, index) => {
    const label = escapeHtml(item.label);
    const href = safeHref(item.href);
    const value = href ? `<a href="${escapeHtml(href)}">${label}</a>` : `<span>${label}</span>`;
    return `<li${index === items.length - 1 ? ' aria-current="page"' : ''}>${value}</li>`;
  }).join('');
  return `<nav class="gpir-topic-context" aria-label="Topic context"><ol>${content}</ol></nav>`;
}

function renderPrimaryDashboard(dashboard) {
  if (!dashboard) return '';
  const src = safeHref(dashboard.src);
  const highResolutionHref = safeHref(dashboard.highResolutionHref || dashboard.src);
  if (!src || !highResolutionHref || !dashboard.alt) return '';
  const dimensions = dashboard.width && dashboard.height
    ? ` width="${dashboard.width}" height="${dashboard.height}"` : '';
  return `<section class="gpir-primary-dashboard" aria-labelledby="gpir-primary-dashboard-title"><header class="gpir-dashboard-heading"><div><span>Visual intelligence</span><h2 id="gpir-primary-dashboard-title">Primary dashboard</h2></div><a href="${escapeHtml(highResolutionHref)}" class="gpir-dashboard-open">Open high-resolution view</a></header><figure><a href="${escapeHtml(highResolutionHref)}" class="gpir-dashboard-link" aria-label="View high-resolution dashboard: ${escapeHtml(dashboard.alt)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(dashboard.alt)}"${dimensions} loading="lazy" decoding="async"></a><figcaption><span>Dashboard reference</span> ${escapeHtml(dashboard.reference)}</figcaption></figure></section>`;
}

function renderResearchModules(modules) {
  if (!Array.isArray(modules) || !modules.length) return '';
  const navigation = modules.map((module, index) => {
    const id = `research-module-${escapeHtml(module.moduleNumber || String(index + 1))}`;
    return `<li><a href="#${id}"><span>${escapeHtml(module.moduleNumber || String(index + 1))}</span>${escapeHtml(module.title || `Module ${index + 1}`)}</a></li>`;
  }).join('');
  const sections = modules.map((module, index) => {
    const number = module.moduleNumber || String(index + 1);
    const id = `research-module-${escapeHtml(number)}`;
    const body = (module.sections || []).map(section => {
      const heading = section.title ? `<h3>${escapeHtml(section.title)}</h3>` : '';
      const content = section.body ? renderRichText(section.body)
        : section.text !== null && section.text !== undefined
          ? `<p>${escapeHtml(section.text).replace(/\r?\n/g, '<br>')}</p>` : '';
      return `${heading}${content}`;
    }).join('');
    const modifier = /disclaimer/i.test(module.title || '') ? ' gpir-research-module--disclaimer' : '';
    const drillDown = module.drillDown || { eligible: true, status: 'UNRESOLVED' };
    const route = governedInternalRoute(drillDown);
    const drillDownMetadata = drillDown.eligible === true ? ' data-gpir-drill-down-eligible="true"' : '';
    const heading = route ? `<a href="${escapeHtml(route)}">${escapeHtml(module.title || `Module ${index + 1}`)}</a>` : escapeHtml(module.title || `Module ${index + 1}`);
    const sourceSha256 = module.provenance?.sourceSha256
      ? ` data-gpir-source-sha256="${escapeHtml(module.provenance.sourceSha256)}"` : '';
    return `<section id="${id}" class="gpir-research-module${modifier}" aria-labelledby="${id}-title" data-gpir-module-id="${id}"${sourceSha256}><header><span>Module ${escapeHtml(number)}</span><h2 id="${id}-title"${drillDownMetadata}>${heading}</h2></header><div class="gpir-research-module-content">${body}</div></section>`;
  }).join('');
  return `<div class="gpir-research-modules"><nav class="gpir-research-module-nav" aria-label="Research modules"><h2>Research modules</h2><ol>${navigation}</ol></nav>${sections}</div>`;
}

function renderHistoricalEditions(editions) {
  if (!Array.isArray(editions) || !editions.length) return '';
  const items = editions.map(item => {
    const href = safeHref(item.route);
    const title = escapeHtml(item.title);
    return `<li>${href ? `<a href="${escapeHtml(href)}">${title}</a>` : title}${item.publicationId ? ` <span>${escapeHtml(item.publicationId)}</span>` : ''}</li>`;
  }).join('');
  return `<section class="gpir-historical-editions"><h2>Historical editions</h2><ul>${items}</ul></section>`;
}

function commonHeader() {
  return `<a href="#chapter-content" class="skip-link">Skip to main content</a>
<header class="header"><div class="container header-container"><div class="brand"><a href="/" class="brand-link" aria-label="FINTECHOISIS — Global Payments Intelligence Repository"><img src="/assets/branding/logos/fo-mark.svg" alt="" class="brand-logo"><div class="brand-text"><h1>FINTECHOISIS</h1><div class="brand-repository"><span class="repository-pill">GPIR</span><span class="repository-text">Global Payments Intelligence Repository</span></div></div></a></div><nav class="main-nav" aria-label="Primary navigation"><ul><li><a href="/#home">Home</a></li><li><a href="/#about">GPIR</a></li><li><a href="/#global">Markets</a></li><li><a href="/#research">Research</a></li><li><a href="/#footer">Contact</a></li></ul></nav><div class="gpir-reader-header" data-gpir-reader-actions aria-label="Reader account"></div></div></header>`;
}

function commonFooter() {
  return `<footer id="footer" class="gpir-publication-footer"><div class="container"><strong>FINTECHOISIS | GPIR</strong><p>Independent global payments intelligence.</p><nav aria-label="Footer navigation"><a href="/pages/legal/privacy-policy.html">Privacy</a> · <a href="/pages/legal/terms-of-use.html">Terms</a> · <a href="/pages/legal/copyright-ip-policy.html">Copyright</a></nav></div></footer>`;
}

function renderReaderDiscovery(publication) {
  if (publication.accessClass !== 'AUTHENTICATED') {
    return '<section id="gpir-protected-content" class="gpir-auth-required" role="status" data-gpir-auth-state="denied"><h2>Publication unavailable</h2><p>This publication is not currently available.</p></section>';
  }
  const scope = publication.topicContext?.slice(-2).map(item => item.label).filter(Boolean) || [];
  const modules = publication.researchModules?.length || 0;
  const visual = publication.internal.asset.state === 'RESOLVED' || Boolean(publication.primaryDashboard);
  return `<section id="gpir-protected-content" class="gpir-auth-required gpir-reader-access" role="status" data-gpir-auth-state="denied"><span class="gpir-reader-kicker">Registered reader access</span><h2>This GPIR intelligence publication is available to registered readers.</h2><p>Sign in or create a free GPIR reader account to access the complete research publication and associated visual intelligence.</p><nav class="gpir-reader-entry-actions" aria-label="Reader access"><a class="gpir-reader-action" href="/reader/sign-in/?returnTo=${encodeURIComponent(publication.route)}">Sign in</a><a class="gpir-reader-action gpir-reader-action--primary" href="/reader/create-account/?returnTo=${encodeURIComponent(publication.route)}">Create free GPIR account</a></nav><section class="gpir-public-discovery" aria-labelledby="gpir-discovery-title"><h3 id="gpir-discovery-title">About this research</h3>${scope.length ? `<p>${scope.map(escapeHtml).join(' · ')}</p>` : ''}<p>Current research publication${modules ? ` · ${modules} intelligence modules` : ''}</p>${visual ? '<p>Visual intelligence is available with registered-reader access.</p>' : ''}</section><aside class="gpir-reader-governance"><h3>Research governance</h3><p>This GPIR publication includes governed source provenance and publication lineage. Detailed research sources are available with reader access.</p></aside><nav class="gpir-discovery-navigation" aria-label="Continue exploring GPIR"><h3>Continue exploring GPIR</h3><a href="/">Home</a><a href="/#about">GPIR</a><a href="/#global">Markets</a><a href="/#research">Research</a></nav></section>`;
}

function renderPublicationPage(publication, options = {}) {
  const auth = authorizePublication(publication, options.authorization);
  const description = publication.publicDescription ||
    (publication.accessClass === 'AUTHENTICATED'
      ? `${publication.title} — governed GPIR research publication. Authentication required.`
      : publication.summary || `${publication.title} — GPIR publication.`);
  const publicMetadata = metadataRows(publication);
  const topicContext = renderTopicContext(publication.topicContext);
  const researchBody = publication.researchModules?.length
    ? renderResearchModules(publication.researchModules)
    : `<article class="gpir-publication-body">${renderRichText(publication.body)}</article>`;
  const protectedContent = auth.allowed
    ? `<div id="gpir-protected-content" data-gpir-auth-state="allowed"><section class="gpir-publication-summary"><h2>Executive intelligence</h2><p>${escapeHtml(publication.summary)}</p></section>${renderPrimaryDashboard(publication.primaryDashboard)}${researchBody}${renderHistoricalEditions(publication.historicalEditions)}</div>`
    : renderReaderDiscovery(publication);
  const hasProvenance = publication.provenance.legacySourceUrl || publication.provenance.validationSummary;
  const provenance = hasProvenance
    ? auth.allowed
      ? `<aside class="gpir-publication-provenance"><h2>Source and provenance</h2>${publication.provenance.validationSummary ? `<p>${escapeHtml(publication.provenance.validationSummary)}</p>` : ''}${safeHref(publication.provenance.legacySourceUrl) ? `<p><a href="${escapeHtml(publication.provenance.legacySourceUrl)}">Legacy source reference</a></p>` : ''}</aside>`
      : ''
    : '';


  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(publication.title)} | GPIR | FINTECHOISIS</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(publication.canonicalUrl)}"><meta property="og:type" content="article"><meta property="og:site_name" content="FINTECHOISIS | GPIR"><meta property="og:title" content="${escapeHtml(publication.title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(publication.canonicalUrl)}"><link rel="icon" href="/assets/favicon/favicon.ico" sizes="any"><link rel="stylesheet" href="/assets/css/variables.css"><link rel="stylesheet" href="/assets/css/typography.css"><link rel="stylesheet" href="/assets/css/layout.css"><link rel="stylesheet" href="/assets/css/components.css"><link rel="stylesheet" href="/assets/css/responsive.css"><link rel="stylesheet" href="/assets/css/header.css"><link rel="stylesheet" href="/assets/css/footer.css"><link rel="stylesheet" href="/assets/css/site-polish.css"><link rel="stylesheet" href="/assets/css/contentful-publication.css"><script src="/assets/js/gpir-supabase-public-config.js"></script><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.min.js"></script><script src="/scripts/m34/supabase-browser-client.js"></script><script src="/scripts/m34/publication-authorization-provider.js"></script><script src="/assets/js/gpir-reader-auth.js"></script><script type="module" src="/assets/js/gpir-protected-publication.mjs"></script></head><body class="gpir-publication-page">${commonHeader()}<main id="chapter-content" class="gpir-publication" data-gpir-auth-authority="supabase" data-gpir-entitlement="gpir-publication" data-gpir-publication-id="${escapeHtml(publication.identity)}" data-gpir-supabase-record-id="${escapeHtml(publication.supabaseRecordId)}" data-gpir-edge-endpoint="${PROTECTED_PUBLICATION_ENDPOINT}" data-gpir-auth-result="${auth.allowed ? 'controlled-validation' : 'required'}"><section class="gpir-publication-hero"><div class="container">${topicContext}<span class="page-tag">${escapeHtml(publication.publicationType)}</span><h1>${escapeHtml(publication.title)}</h1><p>${escapeHtml(description)}</p><dl class="gpir-publication-meta">${publicMetadata}</dl></div></section><div class="container gpir-publication-layout">${protectedContent}${provenance}</div></main>${commonFooter()}</body></html>`;
}

async function renderPublicationPageWithProvider(publication, provider) {
  const authorization = await resolveProviderAuthorization(publication, provider);
  return renderPublicationPage(publication, { authorization });
}

function renderNotFoundPage() {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>404 | GPIR | FINTECHOISIS</title><link rel="stylesheet" href="/assets/css/variables.css"><link rel="stylesheet" href="/assets/css/contentful-publication.css"></head><body><main class="gpir-not-found"><h1>404</h1><h2>Publication not found</h2><p>The requested GPIR publication route is not available.</p><a href="/">Return home</a></main></body></html>';
}

module.exports = { escapeHtml, renderNotFoundPage, renderPublicationPage,
  renderPublicationPageWithProvider, renderPrimaryDashboard, renderResearchModules,
  renderRichText, renderTopicContext, safeHref, tablePresentation,
  PROTECTED_PUBLICATION_ENDPOINT };
