const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSession(session, nowSeconds = Math.floor(Date.now() / 1000)) {
  return session?.user && typeof session.user.id === 'string' && UUID.test(session.user.id) &&
    typeof session.access_token === 'string' && session.access_token.length > 0 &&
    Number.isFinite(session.expires_at) && session.expires_at > nowSeconds;
}

export async function requestProtectedPublication({ supabase, endpoint, publicationId,
  supabaseRecordId, fetchImpl = fetch, nowSeconds } = {}) {
  if (!supabase?.auth || typeof supabase.auth.getSession !== 'function' ||
      typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null;
  let sessionResponse;
  try { sessionResponse = await supabase.auth.getSession(); }
  catch { return null; }
  if (sessionResponse?.error) return null;
  const session = sessionResponse?.data?.session;
  if (!validSession(session, nowSeconds)) return null;
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', cache: 'no-store',
      credentials: 'omit', headers: { authorization: `Bearer ${session.access_token}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ publicationId, supabaseRecordId }) });
  } catch { return null; }
  if (!response.ok) return null;
  let result;
  try { result = await response.json(); }
  catch { return null; }
  if (result?.status !== 'ALLOW' || result.publication?.identity !== publicationId ||
      result.publication?.supabaseRecordId !== supabaseRecordId) return null;
  return result.publication;
}

function appendRichText(document, parent, node) {
  if (!node || typeof node !== 'object') return;
  if (node.nodeType === 'text') { parent.append(document.createTextNode(node.value || '')); return; }
  const tags = { paragraph: 'p', 'heading-1': 'h2', 'heading-2': 'h2', 'heading-3': 'h3',
    'heading-4': 'h4', 'unordered-list': 'ul', 'ordered-list': 'ol', 'list-item': 'li', blockquote: 'blockquote' };
  const element = node.nodeType === 'document' ? parent : document.createElement(tags[node.nodeType] || 'div');
  for (const child of node.content || []) appendRichText(document, element, child);
  if (element !== parent) parent.append(element);
}

function richTextValue(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.nodeType === 'text') return String(node.value || '');
  return (node.content || []).map(richTextValue).join('');
}

export function modulesFromRichText(body) {
  if (!body || body.nodeType !== 'document' || !Array.isArray(body.content)) return [];
  const modules = [];
  let current = null;
  for (const node of body.content) {
    if (['heading-1', 'heading-2'].includes(node?.nodeType)) {
      const heading = richTextValue(node).trim();
      if (!heading) continue;
      const match = /^(?:module\s+)?(\d{1,3})(?:\s*[—–:\-.]\s*|\s+)(.+)$/i.exec(heading);
      current = { moduleNumber: match ? match[1].padStart(2, '0') : null,
        title: match ? match[2].trim() : heading, nodes: [] };
      modules.push(current);
    } else if (current) current.nodes.push(node);
  }
  return modules.map((module, index) => ({
    moduleNumber: module.moduleNumber || String(index + 1).padStart(2, '0'),
    title: module.title,
    sections: module.nodes.length ? [{ title: null, body: {
      nodeType: 'document', data: {}, content: module.nodes } }] : []
  }));
}

function safeMediaUrl(value) {
  return typeof value === 'string' && (value.startsWith('/') || /^https:\/\//i.test(value))
    ? value : null;
}

function appendDashboard(document, fragment, dashboard) {
  const src = safeMediaUrl(dashboard?.src);
  const href = safeMediaUrl(dashboard?.highResolutionHref || dashboard?.src);
  if (!src || !href || !dashboard.alt || dashboard.role !== 'PRIMARY_PUBLICATION_DASHBOARD') return;
  const section = document.createElement('section'); section.className = 'gpir-primary-dashboard';
  const header = document.createElement('header'); header.className = 'gpir-dashboard-heading';
  const headingGroup = document.createElement('div');
  const kicker = document.createElement('span'); kicker.textContent = 'Visual intelligence';
  const heading = document.createElement('h2'); heading.id = 'gpir-primary-dashboard-title';
  heading.textContent = 'Primary dashboard'; section.setAttribute('aria-labelledby', heading.id);
  const open = document.createElement('a'); open.href = href; open.className = 'gpir-dashboard-open';
  open.textContent = 'Open high-resolution view';
  headingGroup.append(kicker, heading); header.append(headingGroup, open);
  const figure = document.createElement('figure');
  const link = document.createElement('a'); link.href = href; link.className = 'gpir-dashboard-link';
  link.setAttribute('aria-label', `View high-resolution dashboard: ${dashboard.alt}`);
  const image = document.createElement('img'); image.src = src; image.alt = dashboard.alt;
  image.loading = 'lazy'; image.decoding = 'async';
  if (dashboard.width && dashboard.height) { image.width = dashboard.width; image.height = dashboard.height; }
  const caption = document.createElement('figcaption');
  const captionLabel = document.createElement('span'); captionLabel.textContent = 'Dashboard reference';
  caption.append(captionLabel, document.createTextNode(` ${dashboard.reference}`));
  link.append(image); figure.append(link, caption); section.append(header, figure); fragment.append(section);
}

function appendModules(document, fragment, modules) {
  if (!modules.length) return false;
  const wrapper = document.createElement('div'); wrapper.className = 'gpir-research-modules';
  const nav = document.createElement('nav'); nav.className = 'gpir-research-module-nav';
  nav.setAttribute('aria-label', 'Research modules');
  const navHeading = document.createElement('h2'); navHeading.textContent = 'Research modules';
  const list = document.createElement('ol');
  for (const [index, module] of modules.entries()) {
    const number = module.moduleNumber || String(index + 1).padStart(2, '0');
    const id = `research-module-${number}`;
    const item = document.createElement('li'); const link = document.createElement('a');
    const navNumber = document.createElement('span'); navNumber.textContent = number;
    link.href = `#${id}`; link.append(navNumber,
      document.createTextNode(module.title || `Module ${index + 1}`));
    item.append(link); list.append(item);
    const section = document.createElement('section'); section.id = id; section.className = 'gpir-research-module';
    const header = document.createElement('header'); const label = document.createElement('span');
    label.textContent = `Module ${number}`; const heading = document.createElement('h2');
    heading.id = `${id}-title`; heading.textContent = module.title || `Module ${index + 1}`;
    section.setAttribute('aria-labelledby', heading.id); header.append(label, heading); section.append(header);
    const content = document.createElement('div'); content.className = 'gpir-research-module-content';
    for (const part of module.sections || []) {
      if (part.title) { const subheading = document.createElement('h3'); subheading.textContent = part.title; content.append(subheading); }
      if (part.body) appendRichText(document, content, part.body);
      else if (typeof part.text === 'string') { const paragraph = document.createElement('p'); paragraph.textContent = part.text; content.append(paragraph); }
    }
    section.append(content); wrapper.append(section);
  }
  nav.append(navHeading, list); wrapper.prepend(nav); fragment.append(wrapper); return true;
}

export function renderProtectedPublication({ document, container, publication }) {
  if (!document || !container || !publication) return false;
  const fragment = document.createDocumentFragment();
  const summary = document.createElement('section');
  summary.className = 'gpir-publication-summary';
  const heading = document.createElement('h2'); heading.textContent = 'Executive intelligence';
  const paragraph = document.createElement('p'); paragraph.textContent = publication.summary || '';
  summary.append(heading, paragraph); fragment.append(summary);
  appendDashboard(document, fragment, publication.primaryDashboard);
  const modules = Array.isArray(publication.researchModules) && publication.researchModules.length
    ? publication.researchModules : modulesFromRichText(publication.body);
  if (!appendModules(document, fragment, modules)) {
    const body = document.createElement('article'); body.className = 'gpir-publication-body';
    appendRichText(document, body, publication.body); fragment.append(body);
  }
  if (Array.isArray(publication.historicalEditions) && publication.historicalEditions.length) {
    const historical = document.createElement('section'); historical.className = 'gpir-historical-editions';
    const historicalHeading = document.createElement('h2'); historicalHeading.textContent = 'Historical editions';
    const historicalList = document.createElement('ul');
    for (const edition of publication.historicalEditions) {
      const item = document.createElement('li'); item.textContent = edition.title || edition.publicationId || '';
      historicalList.append(item);
    }
    historical.append(historicalHeading, historicalList); fragment.append(historical);
  }
  if (publication.provenance?.validationSummary || publication.provenance?.legacySourceUrl) {
    const provenance = document.createElement('aside'); provenance.className = 'gpir-publication-provenance';
    const provenanceHeading = document.createElement('h2'); provenanceHeading.textContent = 'Source and provenance';
    provenance.append(provenanceHeading);
    if (publication.provenance.validationSummary) {
      const validation = document.createElement('p');
      validation.textContent = publication.provenance.validationSummary; provenance.append(validation);
    }
    const legacyUrl = safeMediaUrl(publication.provenance.legacySourceUrl);
    if (legacyUrl) { const paragraph = document.createElement('p'); const link = document.createElement('a');
      link.href = legacyUrl; link.textContent = 'Legacy source reference'; paragraph.append(link); provenance.append(paragraph); }
    fragment.append(provenance);
  }
  container.replaceChildren(fragment);
  container.dataset.gpirAuthState = 'allowed';
  return true;
}

export async function hydrateProtectedPublication({ document = globalThis.document,
  config = globalThis.GPIR_PROTECTED_PUBLICATION_CONFIG } = {}) {
  const main = document?.querySelector?.('[data-gpir-entitlement="gpir-publication"]');
  const container = document?.querySelector?.('#gpir-protected-content');
  if (!main || !container) return false;
  const runtime = config || { supabase: globalThis.GPIR_SUPABASE_CLIENT,
    endpoint: main.dataset.gpirEdgeEndpoint };
  const publication = await requestProtectedPublication({ supabase: runtime.supabase,
    endpoint: runtime.endpoint, publicationId: main.dataset.gpirPublicationId,
    supabaseRecordId: main.dataset.gpirSupabaseRecordId });
  return publication ? renderProtectedPublication({ document, container, publication }) : false;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => { void hydrateProtectedPublication(); });
}

export { validSession };
