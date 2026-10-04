'use strict';

function plainText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.nodeType === 'text') return String(node.value || '');
  return (node.content || []).map(plainText).join('');
}

function documentFrom(nodes) {
  return Object.freeze({ nodeType: 'document', data: Object.freeze({}),
    content: Object.freeze(nodes) });
}

function normalizeSection(section) {
  if (typeof section === 'string') return Object.freeze({ title: null, text: section, body: null });
  if (!section || typeof section !== 'object') return null;
  const title = typeof section.title === 'string' && section.title.trim() ? section.title.trim() : null;
  const text = typeof section.text === 'string' ? section.text : null;
  const body = section.body?.nodeType === 'document' ? section.body : null;
  if (text === null && body === null) return null;
  return Object.freeze({ title, text, body });
}

function normalizeDrillDown(value) {
  if (!value || typeof value !== 'object') return null;
  const eligible = value.eligible === true;
  const status = value.status === 'ACTIVE' ? 'ACTIVE' : 'UNRESOLVED';
  const route = status === 'ACTIVE' && typeof value.route === 'string' ? value.route.trim() : null;
  return Object.freeze({ eligible, status, route });
}

function normalizeExplicitModules(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.map((module, index) => {
    if (!module || typeof module !== 'object') return null;
    const moduleNumber = typeof module.moduleNumber === 'string' && module.moduleNumber.trim()
      ? module.moduleNumber.trim() : String(index + 1).padStart(2, '0');
    const title = typeof module.title === 'string' && module.title.trim() ? module.title.trim() : null;
    const sections = (module.sections || []).map(normalizeSection).filter(Boolean);
    if (!title && !sections.length) return null;
    return Object.freeze({ moduleNumber, title, sections: Object.freeze(sections),
      drillDown: normalizeDrillDown(module.drillDown),
      provenance: module.provenance && typeof module.provenance === 'object'
        ? Object.freeze({ ...module.provenance }) : null });
  }).filter(Boolean);
}

function modulesFromRichText(body) {
  if (!body || body.nodeType !== 'document' || !Array.isArray(body.content)) return [];
  const modules = [];
  let current = null;
  for (const node of body.content) {
    if (['heading-1', 'heading-2'].includes(node?.nodeType)) {
      const heading = plainText(node).trim();
      if (!heading) continue;
      const match = /^(?:module\s+)?(\d{1,3})(?:\s*[—–:\-.]\s*|\s+)(.+)$/i.exec(heading);
      current = { moduleNumber: match ? match[1].padStart(2, '0') : null,
        title: match ? match[2].trim() : heading, nodes: [] };
      modules.push(current);
    } else if (current) {
      current.nodes.push(node);
    }
  }
  return modules.map((module, index) => Object.freeze({
    moduleNumber: module.moduleNumber || String(index + 1).padStart(2, '0'),
    title: module.title,
    sections: Object.freeze(module.nodes.length ? [Object.freeze({ title: null, text: null,
      body: documentFrom(module.nodes) })] : []),
    provenance: null,
    drillDown: null
  }));
}

function normalizeResearchModules(value, fallbackBody = null) {
  const explicit = normalizeExplicitModules(value);
  return Object.freeze(explicit.length ? explicit : modulesFromRichText(fallbackBody));
}

function normalizeDashboard(value) {
  if (!value || typeof value !== 'object') return null;
  const reference = typeof value.reference === 'string' ? value.reference.trim() : '';
  const role = typeof value.role === 'string' ? value.role.trim() : '';
  const src = typeof value.src === 'string' ? value.src.trim() : '';
  const alt = typeof value.alt === 'string' ? value.alt.trim() : '';
  if (!reference || role !== 'PRIMARY_PUBLICATION_DASHBOARD' || !src || !alt) return null;
  const width = Number.isInteger(value.width) && value.width > 0 ? value.width : null;
  const height = Number.isInteger(value.height) && value.height > 0 ? value.height : null;
  return Object.freeze({ reference, role, src, alt, width, height,
    sha256: typeof value.sha256 === 'string' ? value.sha256 : null,
    highResolutionHref: typeof value.highResolutionHref === 'string'
      ? value.highResolutionHref : src });
}

function normalizeTopicContext(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map(item => {
    if (typeof item === 'string' && item.trim()) return Object.freeze({ label: item.trim(), href: null });
    if (!item || typeof item !== 'object' || typeof item.label !== 'string' || !item.label.trim()) return null;
    return Object.freeze({ label: item.label.trim(),
      href: typeof item.href === 'string' && item.href.trim() ? item.href.trim() : null });
  }).filter(Boolean));
}

function normalizeHistoricalEditions(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.title.trim()) return null;
    return Object.freeze({ title: item.title.trim(), route: typeof item.route === 'string' ? item.route : null,
      publicationId: typeof item.publicationId === 'string' ? item.publicationId : null });
  }).filter(Boolean));
}

function normalizeResearchPresentation(presentation = {}, body = null) {
  return Object.freeze({
    researchModules: normalizeResearchModules(presentation.researchModules, body),
    primaryDashboard: normalizeDashboard(presentation.primaryDashboard),
    topicContext: normalizeTopicContext(presentation.topicContext),
    historicalEditions: normalizeHistoricalEditions(presentation.historicalEditions),
    accessClass: typeof presentation.accessClass === 'string' ? presentation.accessClass : null,
    publicDescription: typeof presentation.publicDescription === 'string'
      ? presentation.publicDescription.trim() || null : null
  });
}

module.exports = { modulesFromRichText, normalizeDashboard, normalizeHistoricalEditions,
  normalizeDrillDown, normalizeResearchModules, normalizeResearchPresentation, normalizeTopicContext,
  plainText };
