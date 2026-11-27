'use strict';
const { adaptPublication } = require('../m35/contentful-publication-adapter');
const renderer = require('../m35/contentful-publication-renderer');
const { buildFxEditorialIndex } = require('../m39/build-fx-editorial-bridge');

function approvedResearchPublication(record, decision) {
    const publication = adaptPublication(record);
    if (!decision || decision.releaseEligible !== true || decision.identity !== publication.identity ||
        decision.supabaseRecordId !== publication.supabaseRecordId || decision.route !== publication.route ||
        decision.accessClass !== publication.accessClass || record.fields.validationStatus !== 'PASS') throw new Error('Research release authority mismatch.');
    return publication;
}
function applyResearchEdition(original, record, decision) {
    const publication = approvedResearchPublication(record, decision);
    const mains = [...original.matchAll(/<main\b[^>]*>[\s\S]*?<\/main\s*>/gi)];
    if (mains.length !== 1 || !mains[0][0].includes(`data-gpir-publication-id="${publication.identity}"`)) throw new Error('Research route requires its existing identity-bound content slot.');
    let main;
    if (decision.accessClass === 'PUBLIC') {
        const body = publication.researchModules?.length ? renderer.renderResearchModules(publication.researchModules) : renderer.renderRichText(publication.body);
        const oldDashboard = mains[0][0].match(/<section\b[^>]*class="[^"]*gpir-primary-dashboard[^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
        const dashboard = publication.primaryDashboard ? renderer.renderPrimaryDashboard(publication.primaryDashboard) : oldDashboard;
        const h = renderer.escapeHtml;
        main = `<main id="chapter-content" class="gpir-publication" data-gpir-publication-id="${h(publication.identity)}"><section class="gpir-publication-hero"><div class="container">${renderer.renderTopicContext(publication.topicContext, publication.title)}<span class="page-tag">${h(publication.publicationType)}</span><h1>${h(publication.title)}</h1><p>${h(publication.summary)}</p></div></section><div class="container gpir-publication-layout">${dashboard}<article class="gpir-publication-body">${body}</article><aside class="gpir-publication-provenance"><h2>Source and provenance</h2><p>${h(publication.provenance.validationSummary)}</p></aside></div></main>`;
    } else {
        // This is the existing production-safe shell. Never use controlled
        // validation capabilities to put restricted editorial text in static HTML.
        main = renderer.renderPublicationPage(publication).match(/<main\b[^>]*>[\s\S]*?<\/main\s*>/i)[0];
        if (!original.includes('/assets/js/gpir-protected-publication.mjs')) throw new Error('Existing protected reader script is required before changing access class.');
    }
    const output = original.replace(mains[0][0], main).replace(/<title>[^<]*<\/title>/i, `<title>${renderer.escapeHtml(publication.title)} | GPIR | FINTECHOISIS</title>`);
    // The complete shell, navigation, ticker scripts, media outside the content
    // slot, ASK links and footer stay byte-for-byte intact around the main slot.
    return { html: output, publication };
}
// First-time publications have no identity-bound HTML slot in the inherited
// snapshot. Generate only after the same Supabase and reviewer checks as edits.
function renderFirstResearchEdition(record, decision) {
    const publication = approvedResearchPublication(record, decision);
    const html = renderer.renderPublicationPage(publication);
    if (!html.includes(`data-gpir-publication-id="${renderer.escapeHtml(publication.identity)}"`) ||
        !html.includes('/assets/js/gpir-protected-publication.mjs')) throw new Error('First research route is missing its governed reader shell.');
    return { html, publication };
}
function mergeResearchRoutes(current, records, decisions) {
    if (!current || current.schemaVersion !== '1.0.0' || !Array.isArray(current.routes) ||
        records.length !== decisions.length) throw new Error('Invalid governed research route inventory.');
    const routes = current.routes.map(row => ({ ...row }));
    records.forEach((record, index) => {
        const publication = approvedResearchPublication(record, decisions[index]);
        const byId = routes.filter(row => row.identity === publication.identity);
        const byPath = routes.filter(row => row.route === publication.route);
        if (byId.length > 1 || byPath.length > 1 ||
            (byId.length && byId[0].route !== publication.route) ||
            (byPath.length && byPath[0].identity !== publication.identity)) {
            throw new Error('Research route or publication identity collision.');
        }
        if (!byId.length) routes.push({
            identity: publication.identity,
            route: publication.route,
            canonicalUrl: publication.canonicalUrl,
            publicationType: publication.publicationType,
            title: publication.title,
            summary: publication.summary,
            categoryPath: publication.topicContext.map(item => item.label),
            accessClass: publication.accessClass,
            previewPercent: 10,
            authAuthority: 'supabase',
            controlledValidation: false,
        });
        else {
            byId[0].publicationType = publication.publicationType;
            byId[0].title = publication.title;
            byId[0].summary = publication.summary;
            byId[0].categoryPath = publication.topicContext.map(item => item.label);
            byId[0].accessClass = publication.accessClass;
            byId[0].previewPercent = 10;
            byId[0].authAuthority = 'supabase';
            byId[0].controlledValidation = false;
        }
    });
    routes.sort((a, b) => a.route.localeCompare(b.route, 'en'));
    return { ...current, recordCount: routes.length, routes };
}
function mergeFxEditorial(current, records) {
    const replacementIds = new Set(records.map(record => record.fields.gpirPublicationId));
    const generated = buildFxEditorialIndex({ source: { mode: 'delivery' }, records });
    return { ...current, records: [...(current.records || []).filter(record => !replacementIds.has(record.publicationId)), ...generated.records]
        .sort((a,b) => a.pair.localeCompare(b.pair) || a.title.localeCompare(b.title)) };
}
module.exports = { applyResearchEdition, renderFirstResearchEdition, mergeResearchRoutes, mergeFxEditorial };
