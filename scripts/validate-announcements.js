#!/usr/bin/env node
/*
 * M-18 structured announcement and intelligence contract check.
 * This validates repository relationships and publication invariants locally;
 * it does not verify external source facts or perform network ingestion.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const announcements = readJson("assets/data/announcements.json").records || [];
const registry = readJson("assets/data/content-registry.json").records || [];
const pagesDir = path.join(ROOT, "pages", "intelligence");
const errors = [];
const ids = new Set();
const requiredLifecycleFields = ["referenceId", "editionVersion", "publicationDate", "lifecycleStatus", "supersedes", "supersededBy", "publicationYear", "publicationMonth", "refreshCycle", "importance"];
const requiredIntelligenceFields = ["headline", "subcategory", "publicationTime", "sourceName", "sourceUrl", "sourceType", "retrievedAt", "validatedAt", "validationStatus", "displayLifecycleStatus", "gpirSection", "gpirSubsection", "tags", "keywords", "sourceAuthorityLevel"];
const requiredCanonicalFields = ["recordId", "tickerHeadline", "summary", "sourceOrgId", "trustTier", "country", "region", "category", "subCategory", "paymentDomain", "publishedDate", "retrievedAt", "validatedAt", "status", "lifecycleStatus", "publicationStatus", "contentStatus", "validationStatus", "supersedes", "supersededBy", "relatedRecords", "acquisitionMethod", "sourceHealth"];
const datePattern = /^\d{4}-(?:\d{2}|\d{2}-\d{2})$/;
const lifecycleStatuses = new Set(["CURRENT", "DEVELOPING", "HISTORICAL"]);
const publicationStatuses = new Set(["PUBLISHED", "NOT_PUBLISHED", "ARCHIVED"]);
const byRegistryId = new Map(registry.map(record => [record.id, record]));
const classified = announcements.filter(record => record.status === "GPIR_CLASSIFIED");
const registryAnnouncements = registry.filter(record => record.contentType === "ANNOUNCEMENT");
const registryIntelligence = registry.filter(record => record.contentType === "INTELLIGENCE");

function fail(message){ errors.push(message); }
function exists(relativePath){ return fs.existsSync(path.join(ROOT, relativePath)); }
function escapeHtml(value){
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

announcements.forEach(record => {
    if(ids.has(record.id)) fail(`duplicate announcement id: ${record.id}`);
    ids.add(record.id);
    requiredLifecycleFields.forEach(field => {
        if(!(field in record)) fail(`${record.id}: missing lifecycle field ${field}`);
    });
    requiredIntelligenceFields.forEach(field => {
        if(!(field in record)) fail(`${record.id}: missing intelligence field ${field}`);
    });
    if(record.recordId){
        requiredCanonicalFields.forEach(field => {
            if(!(field in record)) fail(`${record.id}: missing canonical production field ${field}`);
        });
        if(record.recordId !== record.id) fail(`${record.id}: recordId alias mismatch`);
        if(!/^T1$/.test(record.trustTier || "")) fail(`${record.id}: automatic production record must retain T1 trust tier`);
        if(!record.summary || record.summary.length < 40) fail(`${record.id}: source-derived summary is missing or too short`);
        if(!Array.isArray(record.relatedRecords)) fail(`${record.id}: relatedRecords must be an array`);
        if(!record.sourceHealth || record.sourceHealth.state !== "GREEN") fail(`${record.id}: published source-health evidence must be GREEN`);
    }
    if(!lifecycleStatuses.has(record.lifecycleStatus)) fail(`${record.id}: invalid lifecycleStatus`);
    if(record.publicationDate !== null && !datePattern.test(record.publicationDate)) fail(`${record.id}: invalid publicationDate`);
    ["effectiveDate", "validationDate"].forEach(field => {
        if(field in record && record[field] !== null && !datePattern.test(record[field])) fail(`${record.id}: invalid ${field}`);
    });
    if("publicationStatus" in record && !publicationStatuses.has(record.publicationStatus)) fail(`${record.id}: invalid publicationStatus`);
    if(record.lifecycleStatus === "DEVELOPING"){
        if(record.status === "GPIR_CLASSIFIED") fail(`${record.id}: DEVELOPING record cannot be GPIR_CLASSIFIED`);
        if(record.contentStatus !== "CONTENT_UNDER_REVIEW") fail(`${record.id}: DEVELOPING record must remain CONTENT_UNDER_REVIEW`);
        if(record.publicationStatus && record.publicationStatus !== "NOT_PUBLISHED") fail(`${record.id}: DEVELOPING record must be NOT_PUBLISHED`);
    }
    if(record.lifecycleStatus === "HISTORICAL"){
        if(record.status !== "GPIR_CLASSIFIED") fail(`${record.id}: HISTORICAL record must retain GPIR_CLASSIFIED evidence`);
        if(record.publicationStatus && record.publicationStatus !== "ARCHIVED") fail(`${record.id}: HISTORICAL record must be ARCHIVED`);
        if(!record.supersededBy) fail(`${record.id}: HISTORICAL record must name its validated successor`);
    }
    if(record.status === "GPIR_CLASSIFIED"){
        if(record.validationStatus !== "VALIDATED") fail(`${record.id}: published record must be VALIDATED`);
        if(!["LIVE", "ARCHIVED"].includes(record.displayLifecycleStatus)) fail(`${record.id}: published record has invalid displayLifecycleStatus`);
        if(!record.publicationDate) fail(`${record.id}: published record has no publication date`);
        if(!record.source || !/^https:\/\//i.test(record.source.url || "")) fail(`${record.id}: published record has no HTTPS source URL`);
        if(record.sourceUrl !== record.source.url) fail(`${record.id}: original source URL alias mismatch`);
        if(!exists(`pages/intelligence/${record.id}.html`)) fail(`${record.id}: missing intelligence page`);
        else {
            const page = fs.readFileSync(path.join(ROOT, "pages/intelligence", `${record.id}.html`), "utf8");
            if(record.source.url && !page.includes(record.source.url)) fail(`${record.id}: original source URL missing from intelligence page`);
            if(record.summary && !page.includes(escapeHtml(record.summary))) fail(`${record.id}: GPIR summary missing from intelligence page`);
            if(record.whyItMatters && !page.includes(escapeHtml(record.whyItMatters))) fail(`${record.id}: Why It Matters content missing from intelligence page`);
        }
    }
    if(record.status !== "GPIR_CLASSIFIED" && record.lifecycleStatus === "HISTORICAL") fail(`${record.id}: unresolved record cannot be historical`);
});

const announcementsById = new Map(announcements.map(record => [record.id, record]));
announcements.forEach(record => {
    if(record.supersedes){
        const predecessor = announcementsById.get(record.supersedes);
        if(!predecessor) fail(`${record.id}: supersedes target does not exist (${record.supersedes})`);
        else if(predecessor.supersededBy !== record.id) fail(`${record.id}: supersedes link is not reciprocal`);
    }
    if(record.supersededBy){
        const successor = announcementsById.get(record.supersededBy);
        if(!successor) fail(`${record.id}: supersededBy target does not exist (${record.supersededBy})`);
        else if(successor.supersedes !== record.id) fail(`${record.id}: supersededBy link is not reciprocal`);
    }
});

classified.forEach(record => {
    const announcement = byRegistryId.get(`announcement:${record.id}`);
    const intelligence = byRegistryId.get(`intelligence:${record.id}`);
    if(!announcement) fail(`${record.id}: missing registry ANNOUNCEMENT record`);
    if(!intelligence) fail(`${record.id}: missing registry INTELLIGENCE record`);
    if(announcement && announcement.sourceRef.value !== record.id) fail(`${record.id}: announcement registry sourceRef mismatch`);
    if(intelligence && intelligence.sourceRef.value !== record.id) fail(`${record.id}: intelligence registry sourceRef mismatch`);
    if(announcement && !announcement.relationships.some(item => item.target === `intelligence:${record.id}`)) fail(`${record.id}: announcement missing intelligence relationship`);
    if(intelligence && !intelligence.relationships.some(item => item.target === `announcement:${record.id}`)) fail(`${record.id}: intelligence missing announcement relationship`);
});

registryAnnouncements.forEach(record => {
    if(!ids.has(record.sourceRef && record.sourceRef.value)) fail(`${record.id}: registry ANNOUNCEMENT does not map to announcements.json`);
});

const contentSearch = fs.readFileSync(path.join(ROOT, "assets/js/content-search.js"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "assets/js/script.js"), "utf8");
const announcementsRuntime = fs.readFileSync(path.join(ROOT, "assets/js/announcements.js"), "utf8");
const pageGenerator = fs.readFileSync(path.join(ROOT, "scripts/generate-intelligence-pages.js"), "utf8");
const refreshFoundation = fs.readFileSync(path.join(ROOT, "scripts/refresh-announcements.js"), "utf8");
const pageFiles = fs.readdirSync(pagesDir).filter(file => file.endsWith(".html") && file !== "index.html");
if(pageFiles.length !== classified.length) fail(`intelligence page count mismatch: ${pageFiles.length} pages for ${classified.length} published records`);
if(!contentSearch.includes("announcementEntries") || !contentSearch.includes("ANNOUNCEMENTS_URL")) fail("search does not load structured announcements");
if(!script.includes("answerAnnouncementQuery") || !/announcements\?/.test(script)) fail("ASK GPIR announcement resolver is missing");
if(!announcementsRuntime.includes("status !== \"GPIR_CLASSIFIED\"") || !announcementsRuntime.includes("GPIRAnnouncementLifecycle") || !announcementsRuntime.includes("contentStatus === \"CONTENT_UNDER_REVIEW\"")) fail("ticker publication filter is incomplete");
if(!pageGenerator.includes("generateArchive") || !exists("pages/intelligence/index.html")) fail("generated announcement archive is missing");
if(!refreshFoundation.includes("REPORT_ONLY") || !refreshFoundation.includes("EVERY_2_HOURS_VIA_EXISTING_WORKFLOW") || !refreshFoundation.includes("recordsMutated: 0")) fail("refresh foundation must remain report-only under the existing two-hour workflow");
const tickerSource = fs.readFileSync(path.join(ROOT, "assets/js/announcements.js"), "utf8");
if(!tickerSource.includes("track.innerHTML = sequenceHTML;")) fail("single-sequence ticker contract is missing");
if(tickerSource.includes("sequenceHTML + sequenceHTML")) fail("ticker must not duplicate its announcement sequence");
const archivePage = fs.readFileSync(path.join(pagesDir, "index.html"), "utf8");
if(!archivePage.includes("data-live") || !archivePage.includes("data-latest") || !archivePage.includes("data-archive")) fail("archive lifecycle sections are incomplete");
if(/data-(?:live|latest|archive)><\/div>/.test(archivePage)) fail("archive must include a server-rendered fallback rather than blank data containers");
if(!archivePage.includes("Publication dataset updated:")) fail("archive dynamic publication timestamp is missing");
if(archivePage.includes("Last validated publication cycle: 14 August 2026")) fail("archive contains the retired hardcoded validation date");
const workflowSource = fs.readFileSync(path.join(ROOT, ".github/workflows/continuous-intelligence.yml"), "utf8");
if(!workflowSource.includes("publish-intelligence-candidates.js") || !workflowSource.includes("generate-intelligence-pages.js")) fail("scheduled workflow is missing the deterministic publication/generation gate");

if(errors.length){
    console.error(`M-18 announcement validation failed with ${errors.length} error(s):`);
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
}

console.log(`M-18 announcement validation passed: ${announcements.length} records, ${classified.length} published, ${registryAnnouncements.length} registry announcements, ${registryIntelligence.length} intelligence records, ${pageFiles.length} pages.`);
