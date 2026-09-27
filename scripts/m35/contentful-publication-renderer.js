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

function renderRichText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.nodeType === 'text') return renderText(node);
  const children = (node.content || []).map(renderRichText).join('');
  const headings = { 'heading-1': 'h2', 'heading-2': 'h2', 'heading-3': 'h3',
    'heading-4': 'h4', 'heading-5': 'h5', 'heading-6': 'h6' };
  if (node.nodeType === 'document') return children;
  if (node.nodeType === 'paragraph') return children ? `<p>${children}</p>` : '';
  if (headings[node.nodeType]) return `<${headings[node.nodeType]}>${children}</${headings[node.nodeType]}>`;
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
  return `<section class="gpir-primary-dashboard" aria-labelledby="gpir-primary-dashboard-title"><h2 id="gpir-primary-dashboard-title">Primary dashboard</h2><figure><a href="${escapeHtml(highResolutionHref)}" class="gpir-dashboard-link" aria-label="View high-resolution dashboard: ${escapeHtml(dashboard.alt)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(dashboard.alt)}"${dimensions} loading="lazy" decoding="async"></a><figcaption><span>Dashboard reference</span> ${escapeHtml(dashboard.reference)}</figcaption></figure></section>`;
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
    return `<section id="${id}" class="gpir-research-module" aria-labelledby="${id}-title"><header><span>Module ${escapeHtml(number)}</span><h2 id="${id}-title">${escapeHtml(module.title || `Module ${index + 1}`)}</h2></header><div class="gpir-research-module-content">${body}</div></section>`;
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
<header class="header"><div class="container header-container"><div class="brand"><a href="/" class="brand-link" aria-label="FINTECHOISIS — Global Payments Intelligence Repository"><img src="/assets/branding/logos/fo-mark.svg" alt="" class="brand-logo"><div class="brand-text"><h1>FINTECHOISIS</h1><div class="brand-repository"><span class="repository-pill">GPIR</span><span class="repository-text">Global Payments Intelligence Repository</span></div></div></a></div><nav class="main-nav" aria-label="Primary navigation"><ul><li><a href="/#home">Home</a></li><li><a href="/#about">GPIR</a></li><li><a href="/#global">Markets</a></li><li><a href="/#research">Research</a></li><li><a href="/#footer">Contact</a></li></ul></nav></div></header>`;
}

function commonFooter() {
  return `<footer id="footer" class="gpir-publication-footer"><div class="container"><strong>FINTECHOISIS | GPIR</strong><p>Independent global payments intelligence.</p><nav aria-label="Footer navigation"><a href="/pages/legal/privacy-policy.html">Privacy</a> · <a href="/pages/legal/terms-of-use.html">Terms</a> · <a href="/pages/legal/copyright-ip-policy.html">Copyright</a></nav></div></footer>`;
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
    : '<section id="gpir-protected-content" class="gpir-auth-required" role="status" data-gpir-auth-state="denied"><h2>Access required</h2><p>This publication requires authorization through the GPIR Supabase access boundary.</p></section>';
  const hasProvenance = publication.provenance.legacySourceUrl || publication.provenance.validationSummary;
  const provenance = hasProvenance
    ? auth.allowed
      ? `<aside class="gpir-publication-provenance"><h2>Source and provenance</h2>${publication.provenance.validationSummary ? `<p>${escapeHtml(publication.provenance.validationSummary)}</p>` : ''}${safeHref(publication.provenance.legacySourceUrl) ? `<p><a href="${escapeHtml(publication.provenance.legacySourceUrl)}">Legacy source reference</a></p>` : ''}</aside>`
      : '<aside class="gpir-publication-provenance"><h2>Source and provenance</h2><p>Governed source provenance is available to authorized readers.</p></aside>'
    : '';

  const assetFallback = !publication.primaryDashboard && publication.internal.asset.state === 'REFERENCE_REQUIRES_RESOLUTION'
    ? '<aside class="gpir-asset-fallback" role="note">Associated visual assets remain under editorial review.</aside>' : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(publication.title)} | GPIR | FINTECHOISIS</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(publication.canonicalUrl)}"><meta property="og:type" content="article"><meta property="og:site_name" content="FINTECHOISIS | GPIR"><meta property="og:title" content="${escapeHtml(publication.title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(publication.canonicalUrl)}"><link rel="icon" href="/assets/favicon/favicon.ico" sizes="any"><link rel="stylesheet" href="/assets/css/variables.css"><link rel="stylesheet" href="/assets/css/typography.css"><link rel="stylesheet" href="/assets/css/layout.css"><link rel="stylesheet" href="/assets/css/components.css"><link rel="stylesheet" href="/assets/css/responsive.css"><link rel="stylesheet" href="/assets/css/header.css"><link rel="stylesheet" href="/assets/css/footer.css"><link rel="stylesheet" href="/assets/css/site-polish.css"><link rel="stylesheet" href="/assets/css/contentful-publication.css"><script type="module" src="/assets/js/gpir-protected-publication.mjs"></script></head><body>${commonHeader()}<main id="chapter-content" class="gpir-publication" data-gpir-auth-authority="supabase" data-gpir-entitlement="gpir-publication" data-gpir-publication-id="${escapeHtml(publication.identity)}" data-gpir-supabase-record-id="${escapeHtml(publication.supabaseRecordId)}" data-gpir-edge-endpoint="${PROTECTED_PUBLICATION_ENDPOINT}" data-gpir-auth-result="${auth.allowed ? 'controlled-validation' : 'required'}"><section class="gpir-publication-hero"><div class="container">${topicContext}<span class="page-tag">${escapeHtml(publication.publicationType)}</span><h1>${escapeHtml(publication.title)}</h1><p>${escapeHtml(description)}</p><dl class="gpir-publication-meta">${publicMetadata}</dl></div></section><div class="container gpir-publication-layout">${protectedContent}${assetFallback}${provenance}</div></main>${commonFooter()}</body></html>`;
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
  renderRichText, renderTopicContext, safeHref,
  PROTECTED_PUBLICATION_ENDPOINT };
