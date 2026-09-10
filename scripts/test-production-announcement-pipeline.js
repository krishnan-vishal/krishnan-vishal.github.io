#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const lifecycle = require("../assets/js/announcement-lifecycle.js");
const {
    sourceEligible,
    strictPaymentRelevance,
    validationFailures,
    buildPublishedRecord,
    publish
} = require("./publish-intelligence-candidates.js");
const { buildSourceHealthSnapshot } = require("./propose-intelligence-candidates.js");
const { mergeCandidates, appendUniqueById } = require("./merge-intelligence-candidate-queues.js");

const ROOT = path.resolve(__dirname, "..");
let checks = 0;
function check(condition, message) {
    assert.ok(condition, message);
    checks += 1;
}

const source = {
    id: "test-central-bank",
    organization: "Test Central Bank",
    officialDomains: ["centralbank.example"],
    country: "Exampleland",
    isoCountryCode: "EX",
    region: "APAC",
    tier: 1,
    sourceRole: "PRIMARY",
    sourceType: "Central Bank / Regulator",
    active: true,
    sourceTrustStatus: "VERIFIED_OFFICIAL",
    refreshEndpoint: "https://centralbank.example/feed.json",
    refreshEndpointType: "JSON"
};
const candidate = {
    id: "candidate-test-payment-notice-2026",
    referenceId: "candidate-test-payment-notice-2026",
    title: "Central bank issues contactless payment card security notice",
    summary: null,
    sourceOrgId: source.id,
    sourceUrl: "https://centralbank.example/notices/payment-security",
    discoveryEndpoint: source.refreshEndpoint,
    sourcePublicationDate: "2026-09-09",
    sourcePublicationDateRaw: "2026-09-09T04:00:00.000Z",
    retrievedAt: "2026-09-09T04:00:00.000Z",
    region: "APAC",
    countryIsoAlpha2: "EX",
    status: "PENDING_HUMAN_REVIEW",
    publicationStatus: "NOT_PUBLISHED"
};
const greenHealth = { sourceId: source.id, healthState: "GREEN" };

check(sourceEligible(source), "approved Tier-1 source must be eligible");
check(!sourceEligible({ ...source, tier: 2 }), "lower-tier source must be excluded");
check(strictPaymentRelevance(candidate), "explicit payment item must pass relevance");
check(!strictPaymentRelevance({ ...candidate, title: "Central bank publishes annual report" }), "ambiguous item must fail relevance");
check(validationFailures(candidate, source, [], greenHealth).length === 0, "valid candidate must clear the gate");
check(validationFailures(candidate, source, [], { ...greenHealth, healthState: "RED" }).includes("SOURCE_NOT_HEALTHY_IN_CURRENT_CYCLE"), "unhealthy source must be quarantined");
check(validationFailures(candidate, source, [{ sourceUrl: candidate.sourceUrl }], greenHealth).includes("DUPLICATE_SOURCE_URL"), "duplicate source URL must be suppressed");
check(validationFailures({ ...candidate, sourceUrl: "https://lookalike.example/item" }, source, [], greenHealth).includes("SOURCE_URL_INVALID"), "unapproved source URL must fail");

const now = new Date("2026-09-09T12:00:00.000Z");
const dateOnlyCandidate = { ...candidate, sourcePublicationDateRaw: "2026-09-09" };
const dateOnlyRecord = buildPublishedRecord(dateOnlyCandidate, source, now);
check(dateOnlyRecord.recordId === dateOnlyRecord.id && dateOnlyRecord.candidateReferenceId === candidate.id, "canonical identity and provenance must be retained");
check(dateOnlyRecord.summary.includes(candidate.title), "summary must be source-derived");
check(dateOnlyRecord.publicationTime === null && dateOnlyRecord.liveUntil === null, "date-only evidence must not invent a live time");
check(dateOnlyRecord.displayLifecycleStatus === "ARCHIVED" && Boolean(dateOnlyRecord.archivedAt), "date-only record must enter permanent archive");
check(validationFailures(dateOnlyCandidate, source, [], greenHealth).includes("PUBLICATION_TIMESTAMP_INVALID"), "date-only candidate must remain in the exception queue rather than auto-publish");
check(dateOnlyRecord.source.url === candidate.sourceUrl && dateOnlyRecord.sourceUrl === candidate.sourceUrl, "original source link must be preserved");
check(dateOnlyRecord.supersedes === null && dateOnlyRecord.supersededBy === null, "lineage fields must be explicit");

const timedCandidate = { ...candidate, id: "candidate-test-live", referenceId: "candidate-test-live", sourceUrl: "https://centralbank.example/notices/live", sourcePublicationDateRaw: "2026-09-09T04:00:00.000Z" };
const liveRecord = buildPublishedRecord(timedCandidate, source, new Date("2026-09-09T05:00:00.000Z"));
check(liveRecord.displayLifecycleStatus === "LIVE" && liveRecord.liveUntil === "2026-09-10T04:00:00.000Z", "exact timestamps must create a 24-hour live window");
const expiredRecord = buildPublishedRecord(timedCandidate, source, new Date("2026-09-11T05:00:00.000Z"));
check(expiredRecord.displayLifecycleStatus === "ARCHIVED" && expiredRecord.archivedAt === expiredRecord.liveUntil, "expired live item must retire without deletion");
check(lifecycle.partition([liveRecord], new Date("2026-09-09T05:00:00.000Z")).live.length === 1, "lifecycle reader must classify live record consistently");

const result = publish({ sources: [source], candidates: [candidate], announcements: [], contentRegistry: [], sourceHealth: [greenHealth], now, limit: 1 });
check(result.promotedIds.length === 1 && result.announcements.length === 1 && result.candidates.length === 0, "valid candidate must promote exactly once");
const repeat = publish({ sources: [source], candidates: [candidate], announcements: result.announcements, contentRegistry: result.contentRegistry, sourceHealth: [greenHealth], now, limit: 1 });
check(repeat.promotedIds.length === 0 && repeat.announcements.length === 1, "repeat run must be idempotent");
const reconciled = mergeCandidates([candidate], [candidate, timedCandidate], result.announcements);
check(reconciled.length === 1 && reconciled[0].id === timedCandidate.id, "branch refresh must retain unresolved candidates and retire published duplicates");
check(appendUniqueById([{ id: "main", value: "reviewed" }], [{ id: "main", value: "proposal" }, { id: "proposal" }]).map(record => record.id).join(",") === "main,proposal", "branch refresh must preserve unique proposed records while main wins shared identities");

const health = buildSourceHealthSnapshot([source, { ...source, id: "isolated-failure", organization: "Failed Source" }], [
    { sourceId: source.id, endpoint: source.refreshEndpoint, status: "RETRIEVED_REVIEW_REQUIRED", discovered: [candidate], parserStatus: "PARSED" },
    { sourceId: "isolated-failure", endpoint: source.refreshEndpoint, status: "ENDPOINT_UNAVAILABLE", discovered: [], parserStatus: "NOT_RUN", failureReason: "timeout" }
], [], [candidate]);
check(health.counts.healthy === 1 && health.counts.degraded === 1 && health.sources.length === 2, "one source failure must remain isolated in the health snapshot");

const archivePath = path.join(ROOT, "pages", "intelligence", "index.html");
const archive = fs.readFileSync(archivePath, "utf8");
check(archive.includes("data-live") && archive.includes("data-period-nav") && archive.includes("data-archive"), "reader must expose live/month-year/archive sections");
check(!/data-(?:live|archive)><\/div>/.test(archive), "reader sections must have server-rendered fallback content");
check(archive.includes("No newly validated announcements in the latest 24 hours.") || archive.includes("announcement-dashboard-card"), "empty live state must be truthful and useful");
check(archive.includes("assets/data/source-health.json"), "reader must link the operational source-health snapshot");

const ticker = fs.readFileSync(path.join(ROOT, "assets", "js", "announcements.js"), "utf8");
check(ticker.includes('class="ticker-sequence"') && ticker.includes("cloneNode(true)") && !ticker.includes("sequenceHTML + sequenceHTML"), "ticker must clone one canonical sequence for continuous motion");
const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "continuous-intelligence.yml"), "utf8");
check(workflow.includes("publish-intelligence-candidates.js") && workflow.includes("automation/intelligence-candidates"), "automation must publish only through its controlled branch");

console.log(`Production announcement pipeline validation passed: ${checks} checks.`);
