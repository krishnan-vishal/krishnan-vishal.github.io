#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const lifecycle = require("../assets/js/announcement-lifecycle.js");
const { publish } = require("./publish-intelligence-candidates.js");
const { extractFeedItems } = require("./refresh-announcements.js");
const {
    buildSourceHealthSnapshot,
    persistSourceHealthSnapshot
} = require("./propose-intelligence-candidates.js");

const ROOT = path.resolve(__dirname, "..");
const ANNOUNCEMENTS_PATH = path.join(ROOT, "assets", "data", "announcements.json");
const REGISTRY_PATH = path.join(ROOT, "assets", "data", "content-registry.json");
const ARCHIVE_PATH = path.join(ROOT, "pages", "intelligence", "index.html");
const TICKER_PATH = path.join(ROOT, "assets", "js", "announcements.js");

function digest(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function check(condition, message) {
    assert.ok(condition, message);
}

const immutablePaths = [ANNOUNCEMENTS_PATH, REGISTRY_PATH, ARCHIVE_PATH, TICKER_PATH];
const before = new Map(immutablePaths.map(filePath => [filePath, digest(filePath)]));
const publishedCorpus = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, "utf8")).records || [];
const source = {
    id: "p1-test-central-bank",
    organization: "P1 Test Central Bank",
    officialDomains: ["centralbank.example"],
    country: "Exampleland",
    region: "APAC",
    tier: 1,
    sourceRole: "PRIMARY",
    sourceType: "Central Bank / Regulator",
    active: true,
    sourceTrustStatus: "VERIFIED_OFFICIAL",
    refreshEndpoint: "https://centralbank.example/feed.xml",
    refreshEndpointType: "RSS"
};
const candidate = {
    id: "candidate-p1-payment-notice",
    referenceId: "candidate-p1-payment-notice",
    title: "Central bank publishes instant payment security notice",
    summary: "Official notice concerning instant payment security.",
    sourceOrgId: source.id,
    sourceUrl: "https://centralbank.example/notices/payment-security",
    discoveryEndpoint: source.refreshEndpoint,
    sourcePublicationDate: "2026-09-10",
    sourcePublicationDateRaw: "2026-09-10T01:00:00.000Z",
    retrievedAt: "2026-09-10T02:00:00.000Z",
    region: "APAC",
    status: "PENDING_HUMAN_REVIEW",
    publicationStatus: "NOT_PUBLISHED"
};

// A. A healthy source can produce one deterministic publication proposal.
const healthyReport = [{
    sourceId: source.id,
    endpoint: source.refreshEndpoint,
    status: "RETRIEVED_REVIEW_REQUIRED",
    parserStatus: "PARSED",
    retrievedAt: candidate.retrievedAt,
    discovered: [candidate]
}];
const healthySnapshot = buildSourceHealthSnapshot([source], healthyReport, [], [candidate]);
const healthyResult = publish({
    sources: [source],
    candidates: [candidate],
    announcements: [],
    contentRegistry: [],
    sourceHealth: healthySnapshot.sources,
    now: new Date("2026-09-10T02:00:00.000Z")
});
check(healthySnapshot.counts.healthy === 1, "A: healthy source must be GREEN");
check(healthyResult.promotedIds.length === 1, "A: healthy qualifying candidate must clear the deterministic gate");

// B. Total endpoint unavailability is degraded input, not a system-integrity failure.
const unavailableReports = [source, { ...source, id: "p1-second-source" }].map(item => ({
    sourceId: item.id,
    endpoint: item.refreshEndpoint,
    status: "ENDPOINT_UNAVAILABLE",
    parserStatus: "NOT_RUN",
    failureReason: "temporary timeout",
    discovered: []
}));
const unavailableSnapshot = buildSourceHealthSnapshot(
    [source, { ...source, id: "p1-second-source" }],
    unavailableReports,
    [],
    []
);
const unavailableResult = publish({
    sources: [source],
    candidates: [candidate],
    announcements: publishedCorpus,
    contentRegistry: [],
    sourceHealth: unavailableSnapshot.sources,
    now: new Date("2026-09-10T02:00:00.000Z")
});
check(unavailableSnapshot.counts.degraded === 2, "B: unavailable endpoints must be AMBER and isolated");
check(unavailableResult.promotedIds.length === 0, "B: degraded sources must be skipped");
check(JSON.stringify(unavailableResult.announcements) === JSON.stringify(publishedCorpus), "B: published corpus must remain unchanged");

// C. A parser exception is represented as one RED source while healthy sources continue.
let parserError;
try {
    extractFeedItems("not a valid feed", "application/xml");
} catch (error) {
    parserError = error;
}
check(parserError && parserError.message.startsWith("SOURCE_PARSE_FAILED:"), "C: malformed source payload must throw a classified parser error");
const parserSnapshot = buildSourceHealthSnapshot([source, { ...source, id: "p1-parser-source" }], [
    healthyReport[0],
    {
        sourceId: "p1-parser-source",
        endpoint: source.refreshEndpoint,
        status: "SOURCE_PARSE_FAILED",
        parserStatus: "FAILED",
        failureReason: parserError.message,
        discovered: []
    }
], [], [candidate]);
check(parserSnapshot.counts.healthy === 1 && parserSnapshot.counts.failed === 1, "C: parser failure must be RED without terminating healthy-source processing");

// D. Zero candidates is a successful no-op that retains every published record.
const zeroResult = publish({
    sources: [source],
    candidates: [],
    announcements: publishedCorpus,
    contentRegistry: [],
    sourceHealth: healthySnapshot.sources,
    now: new Date("2026-09-10T02:00:00.000Z")
});
check(zeroResult.promotedIds.length === 0, "D: zero qualifying records must publish zero records");
check(JSON.stringify(zeroResult.announcements) === JSON.stringify(publishedCorpus), "D: zero qualifying records must retain the published corpus");

// E. Source-health generation failure is non-fatal and retains its exact LKG bytes.
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gpir-p1-recovery-"));
try {
    const healthPath = path.join(temporaryRoot, "source-health.json");
    const lastKnownGood = '{"health":"last-known-good"}\n';
    fs.writeFileSync(healthPath, lastKnownGood, "utf8");
    const updated = persistSourceHealthSnapshot(healthPath, () => ({ health: "current" }));
    check(updated.status === "UPDATED", "E: healthy source-health generation must promote its complete snapshot");
    fs.writeFileSync(healthPath, lastKnownGood, "utf8");
    const degraded = persistSourceHealthSnapshot(healthPath, () => {
        throw new Error("simulated source-health generation failure");
    });
    check(degraded.status === "DEGRADED_LAST_KNOWN_GOOD_RETAINED", "E: source-health failure must degrade instead of throwing");
    check(fs.readFileSync(healthPath, "utf8") === lastKnownGood, "E: prior source-health snapshot bytes must remain intact");
} finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

const ticker = fs.readFileSync(TICKER_PATH, "utf8");
check(ticker.includes("showingLive ? currentLiveRecords : publishedRecords()"), "ticker must fall back from LIVE to retained published intelligence");
check(ticker.includes("ARCHIVED · HISTORICAL INTELLIGENCE"), "ticker detail must label fallback records as archived/historical");
check(lifecycle.partition(publishedCorpus, new Date("2100-01-01T00:00:00.000Z")).archive.length === publishedCorpus.filter(lifecycle.isPublished).length, "archive must retain all expired published intelligence");

immutablePaths.forEach(filePath => {
    check(digest(filePath) === before.get(filePath), `${path.relative(ROOT, filePath)} changed during recovery simulations`);
});

console.log("P1 continuous-intelligence recovery simulations passed: A healthy, B all unavailable, C parser throw, D zero qualifying, E degraded source-health; published corpus retained.");
