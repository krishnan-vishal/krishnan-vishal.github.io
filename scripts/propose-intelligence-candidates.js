#!/usr/bin/env node
/*
 * GPIR M21 candidate-intelligence proposal builder.
 *
 * Uses the M18 report-only refresh reader, but writes only the non-public
 * candidate queue when a new, trusted-domain feed item is discovered. It never
 * changes announcements.json, generated pages, sitemap.xml or public content.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { hostAllowed, inspectSources } = require("./refresh-announcements.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "assets", "data");
const SOURCES_PATH = path.join(DATA_DIR, "trusted-sources.json");
const ANNOUNCEMENTS_PATH = path.join(DATA_DIR, "announcements.json");
const CANDIDATES_PATH = path.join(DATA_DIR, "intelligence-candidates.json");
const COUNTRIES_PATH = path.join(DATA_DIR, "country-intelligence.json");

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomically(filePath, value, io = fs) {
    const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        io.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + "\n", "utf8");
        io.renameSync(temporaryPath, filePath);
    } catch (error) {
        try {
            if (io.existsSync(temporaryPath)) io.rmSync(temporaryPath, { force: true });
        } catch {
            // The original target is still authoritative; cleanup is best effort.
        }
        throw error;
    }
}

function persistSourceHealthSnapshot(filePath, buildSnapshot, io = fs) {
    try {
        writeJsonAtomically(filePath, buildSnapshot(), io);
        return { status: "UPDATED", lastKnownGoodRetained: true, error: null };
    } catch (error) {
        return {
            status: "DEGRADED_LAST_KNOWN_GOOD_RETAINED",
            lastKnownGoodRetained: io.existsSync(filePath),
            error: error.message
        };
    }
}

function canonicalUrl(value) {
    try {
        const url = new URL(value);
        url.hash = "";
        return url.toString();
    } catch {
        return null;
    }
}

function dateOnly(value) {
    if (!value) return null;
    if (/^\d{4}-(?:\d{2}|\d{2}-\d{2})$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function canonicalRegion(value) {
    const region = String(value || "Unmapped");
    if (/sepa|europe|united kingdom/i.test(region)) return "Europe";
    if (/middle east|gcc/i.test(region)) return "GCC / Middle East";
    if (/cis|central asia/i.test(region)) return "CIS";
    return region;
}

function candidateId(sourceId, sourceUrl) {
    const fingerprint = crypto.createHash("sha256").update(`${sourceId}\n${sourceUrl}`).digest("hex").slice(0, 16);
    return `candidate-${sourceId}-${fingerprint}`;
}

function normalizedEventTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

function eventFingerprint(item) {
    const title = normalizedEventTitle(item.title);
    const publicationDate = dateOnly(item.publicationDate) || "undated";
    return crypto.createHash("sha256")
        .update(`${title}\n${publicationDate}`)
        .digest("hex")
        .slice(0, 24);
}

function isPaymentsRelevant(item) {
    const text = `${item.title || ""}\n${item.summary || ""}`;
    const specific = /\b(payments?|remittances?|money (?:movement|transfer)|instant payments?|real-time payments?|rtp|a2a|account-to-account|cards?|wallets?|open banking|payment initiation|cbdcs?|central bank digital currenc(?:y|ies)|stablecoins?|tokeni[sz]ed money|payment orchestration|payment apis?|acquiring|iso ?20022|psp|msb|mto|payment licens(?:e|ing|ure)|ativos? virtuais|transfer[eê]ncias?)\b/i;
    const generic = /\b(earnings|stock market|investment outlook|government securit(?:y|ies)|dated securities|reference rates|insurance|mortgage|lending)\b/i;
    if (generic.test(item.title || "") && !specific.test(item.title || "")) return false;
    return specific.test(text) || (/\b(clearing|settlement|interoperability|sanctions?|aml|cft|kyc|kyb|fraud|digital assets?|digital banking|foreign exchange|fx|fintech)\b/i.test(text)
        && /\b(payments?|remittances?|money movement|cross-border|infrastructure|payment networks?)\b/i.test(text));
}

function buildCandidate(source, item, retrievedAt, country, discoveryEndpoint) {
    const sourceUrl = canonicalUrl(item.url);
    const publicationDate = dateOnly(item.publicationDate);
    if (!String(item.title || "").trim() || !sourceUrl || !sourceUrl.startsWith("https://")) {
        throw new Error(`CANDIDATE_VALIDATION_FAILED: ${source.id}: non-empty title and HTTPS item URL required`);
    }
    return {
        id: candidateId(source.id, sourceUrl),
        referenceId: candidateId(source.id, sourceUrl),
        eventFingerprint: eventFingerprint(item),
        lifecycleStatus: "DEVELOPING",
        publicationStatus: "NOT_PUBLISHED",
        status: "PENDING_HUMAN_REVIEW",
        contentStatus: "CONTENT_UNDER_REVIEW",
        sourceOrgId: source.id,
        sourceAuthority: source.organization || source.id,
        discoveredVia: { sourceOrgId: source.id, sourceUrl, discoveryEndpoint },
        sourceRole: source.sourceRole || "PRIMARY",
        originalSource: source.sourceRole === "SECONDARY" ? null : { sourceOrgId: source.id, sourceUrl },
        validationStatus: "AWAITING_HUMAN_VALIDATION",
        countryId: country ? country.id : null,
        countryIsoAlpha2: country ? country.isoAlpha2 : source.isoCountryCode || null,
        region: country ? country.region : source.region || null,
        sourceName: source.organization || source.id,
        sourceUrl,
        discoveryEndpoint,
        title: item.title,
        summary: source.sourceRole === "SECONDARY" ? null : item.summary || null,
        sourcePublicationDate: publicationDate,
        sourcePublicationDateRaw: item.publicationDate || null,
        effectiveDate: null,
        validationDate: null,
        retrievedAt,
        supersedes: null,
        supersededBy: null,
        audit: {
            discoveredAt: retrievedAt,
            sourceDomainCheckedAt: retrievedAt,
            discoveryEndpoint,
            reviewState: "PENDING_HUMAN_REVIEW"
        }
    };
}

function healthStateFor(report) {
    if (!report.endpoint) return "UNSUPPORTED";
    if (["BLOCKED_DOMAIN_NOT_TRUSTED", "BLOCKED_REDIRECT_DOMAIN_NOT_TRUSTED", "SOURCE_PARSE_FAILED"].includes(report.status)) return "RED";
    if (report.status === "ENDPOINT_UNAVAILABLE") return "AMBER";
    if (report.status === "RETRIEVED_REVIEW_REQUIRED" && !(report.discovered || []).length) return "STALE";
    if (report.status === "RETRIEVED_REVIEW_REQUIRED") return "GREEN";
    return "UNSUPPORTED";
}

function unsupportedFailureReason(source, report = {}) {
    if (report.failureReason) return report.failureReason;
    if (source.active === true && source.refreshEndpoint) return null;
    if (source.sourceTrustStatus !== "VERIFIED_OFFICIAL") return "NON_AUTHORITATIVE_DISCOVERY_SOURCE";
    if (!source.discoveryPage) return "NO_APPROVED_DISCOVERY_PAGE";
    if (!hostAllowed(source.discoveryPage, source.officialDomains || [])) return "DISCOVERY_PAGE_OUTSIDE_APPROVED_DOMAIN";
    return "NO_SAFE_DETERMINISTIC_ACQUISITION_METHOD";
}

function tallyBy(records, field) {
    return Object.fromEntries([...records.reduce((map, record) => {
        const value = String(record[field] || "UNCLASSIFIED");
        map.set(value, (map.get(value) || 0) + 1);
        return map;
    }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function buildSourceHealthSnapshot(sources, reports, candidates, additions, previous = {}, published = []) {
    const previousById = new Map((previous.sources || []).map(source => [source.sourceId, source]));
    const reportById = new Map(reports.map(report => [report.sourceId, report]));
    const candidateTimes = candidates.concat(additions).reduce((map, candidate) => {
        const timestamp = candidate.retrievedAt || candidate.audit && candidate.audit.discoveredAt;
        if (candidate.sourceOrgId && timestamp && (!map.get(candidate.sourceOrgId) || timestamp > map.get(candidate.sourceOrgId))) map.set(candidate.sourceOrgId, timestamp);
        return map;
    }, new Map());
    const acceptedCounts = candidates.concat(additions).reduce((map, candidate) => map.set(candidate.sourceOrgId, (map.get(candidate.sourceOrgId) || 0) + 1), new Map());
    const publishedCounts = published.reduce((map, record) => {
        const sourceId = record.sourceOrgId || record.sourceId;
        if (sourceId) map.set(sourceId, (map.get(sourceId) || 0) + 1);
        return map;
    }, new Map());
    const sourceRows = sources.map(source => {
        const report = reportById.get(source.id) || {};
        const prior = previousById.get(source.id) || {};
        const state = healthStateFor(report);
        const publicationDates = (report.discovered || []).map(item => dateOnly(item.publicationDate)).filter(Boolean).sort();
        const acquisitionMethod = source.acquisitionMethod || ({ RSS: "RSS", ATOM: "ATOM", JSON: "OFFICIAL_API", HTML: "OFFICIAL_HTML_INDEX" })[source.refreshEndpointType] || "MANUAL_EXCEPTION";
        return {
            sourceId: source.id,
            organization: source.organization,
            sourceName: source.organization,
            region: canonicalRegion(source.region),
            country: source.country || "UNCLASSIFIED",
            sourceType: source.sourceType || "UNCLASSIFIED",
            trustTier: `T${source.tier || "UNCLASSIFIED"}`,
            officialDomain: (source.officialDomains || [])[0] || null,
            endpoint: source.refreshEndpoint || null,
            endpointType: source.refreshEndpointType || null,
            acquisitionMethod,
            active: source.active === true,
            activationStatus: source.active === true && source.refreshEndpoint ? (state === "GREEN" || state === "STALE" ? "ACTIVE" : "DEGRADED") : "UNSUPPORTED",
            healthState: state,
            healthStatus: state,
            fetchStatus: report.status || "NOT_CONFIGURED",
            parserStatus: report.parserStatus || "NOT_RUN",
            lastSuccessfulFetch: report.lastSuccessfulFetch || prior.lastSuccessfulFetch || source.lastSuccessfulRetrieval || null,
            lastPublicationSeen: publicationDates.pop() || prior.lastPublicationSeen || null,
            lastCandidateDetected: candidateTimes.get(source.id) || prior.lastCandidateDetected || null,
            recordsDiscovered: (report.discovered || []).length,
            recordsQualified: acceptedCounts.get(source.id) || 0,
            recordsAccepted: acceptedCounts.get(source.id) || 0,
            recordsPublished: publishedCounts.get(source.id) || 0,
            failureReason: unsupportedFailureReason(source, report)
        };
    });
    const countState = state => sourceRows.filter(source => source.healthState === state).length;
    return {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        mode: "SOURCE_COVERAGE_AND_HEALTH_SNAPSHOT",
        counts: {
            registered: sourceRows.length,
            active: sourceRows.filter(source => source.active && source.endpoint).length,
            healthy: countState("GREEN"),
            degraded: countState("AMBER"),
            failed: countState("RED"),
            stale: countState("STALE"),
            unsupported: countState("UNSUPPORTED")
        },
        byRegion: tallyBy(sourceRows, "region"),
        byCountry: tallyBy(sourceRows, "country"),
        bySourceType: tallyBy(sourceRows, "sourceType"),
        sources: sourceRows
    };
}

async function main() {
    const argv = process.argv.slice(2);
    const reportOnly = argv.includes("--report-only");
    const argumentDate = name => {
        const argument = argv.find(value => value.startsWith(`--${name}=`));
        return argument ? dateOnly(argument.slice(name.length + 3)) : null;
    };
    const from = argumentDate("from");
    const to = argumentDate("to");
    const healthOutputArg = argv.find(value => value.startsWith("--health-output="));
    const sources = readJson(SOURCES_PATH).registry || [];
    const published = readJson(ANNOUNCEMENTS_PATH).records || [];
    const queue = readJson(CANDIDATES_PATH);
    const countries = readJson(COUNTRIES_PATH).records || [];
    const existingCandidates = Array.isArray(queue.candidates) ? queue.candidates : [];
    const knownUrls = new Set([
        ...existingCandidates.map(candidate => canonicalUrl(candidate.sourceUrl)),
        ...published.map(record => canonicalUrl(record.source && record.source.url))
    ].filter(Boolean));
    const sourceById = new Map(sources.map(source => [source.id, source]));
    const reports = await inspectSources(sources);
    const additions = [];
    const knownEventFingerprints = new Set(existingCandidates
        .map(candidate => candidate.eventFingerprint)
        .filter(Boolean));
    const counters = { nonRelevant: 0, duplicateUrl: 0, duplicateEvent: 0, invalidSourceUrl: 0, queueCapacity: 0 };
    const regionNames = ["APAC", "South Asia", "GCC / Middle East", "Africa", "LATAM", "Europe", "CIS", "North America", "Oceania"];
    const regionStats = new Map(regionNames.map(region => [region, { region, sourcesEvaluated: 0, machineReadableSources: 0, activatedSources: 0, sourcesYieldingCandidates: 0, recordsDiscovered: 0, recordsAccepted: 0, recordsRejected: 0, duplicatesSuppressed: 0 }]));
    const statsFor = source => {
        const region = canonicalRegion(source && source.region);
        if(!regionStats.has(region)) regionStats.set(region, { region, sourcesEvaluated: 0, machineReadableSources: 0, activatedSources: 0, sourcesYieldingCandidates: 0, recordsDiscovered: 0, recordsAccepted: 0, recordsRejected: 0, duplicatesSuppressed: 0 });
        return regionStats.get(region);
    };

    sources.forEach(source => {
        const stats = statsFor(source);
        stats.sourcesEvaluated += 1;
        if(source.refreshEndpoint) stats.machineReadableSources += 1;
        if(source.refreshEndpoint && source.active === true) stats.activatedSources += 1;
    });

    reports.forEach(report => {
        if (report.status !== "RETRIEVED_REVIEW_REQUIRED") return;
        const source = sourceById.get(report.sourceId);
        const country = source ? countries.find(record => record.name === source.country) : null;
        if (!source) return;

        const stats = statsFor(source);

        const inWindow = (report.discovered || []).filter(item => {
            const date = dateOnly(item.publicationDate);
            return date && (!from || date >= from) && (!to || date <= to);
        });
        stats.recordsDiscovered += inWindow.length;
        const acceptedBefore = additions.length;
        inWindow.forEach(item => {
            const sourceUrl = canonicalUrl(item.url);
            if (!sourceUrl || !hostAllowed(sourceUrl, source.officialDomains || [])) {
                counters.invalidSourceUrl += 1;
                stats.recordsRejected += 1;
                return;
            }
            if (!isPaymentsRelevant(item)) {
                counters.nonRelevant += 1;
                stats.recordsRejected += 1;
                return;
            }
            if (knownUrls.has(sourceUrl)) {
                counters.duplicateUrl += 1;
                stats.recordsRejected += 1;
                stats.duplicatesSuppressed += 1;
                return;
            }
            const fingerprint = eventFingerprint(item);
            if (knownEventFingerprints.has(fingerprint)) {
                counters.duplicateEvent += 1;
                stats.recordsRejected += 1;
                stats.duplicatesSuppressed += 1;
                return;
            }
            // Stop admitting new records, never truncate retained intelligence.
            if (existingCandidates.length + additions.length >= 5000) {
                counters.queueCapacity += 1;
                stats.recordsRejected += 1;
                return;
            }
            knownUrls.add(sourceUrl);
            knownEventFingerprints.add(fingerprint);
            additions.push(buildCandidate(
                source,
                item,
                report.retrievedAt,
                country,
                report.finalUrl || report.endpoint
            ));
        });
        const accepted = additions.length - acceptedBefore;
        stats.recordsAccepted += accepted;
        if(accepted) stats.sourcesYieldingCandidates += 1;
    });

    if (additions.length && !reportOnly) {
        const candidates = existingCandidates.concat(additions).sort((left, right) => left.id.localeCompare(right.id));
        const nextQueue = {
            ...queue,
            candidates
        };
        writeJsonAtomically(CANDIDATES_PATH, nextQueue);
    }

    const report = {
        mode: reportOnly ? "CANDIDATE_BACKFILL_REPORT_ONLY" : "CANDIDATE_PROPOSAL_ONLY",
        recordsMutated: 0,
        publicPublicationMutationAllowed: false,
        proposalCandidatesAdded: additions.length,
        discoveryOutcome: additions.length
            ? `${additions.length} new record${additions.length === 1 ? "" : "s"} proposed; existing published corpus retained`
            : "0 new records; existing published corpus retained",
        backfillWindow: { from, to },
        recordsDiscovered: reports.reduce((count, result) => count + (result.discovered || []).filter(item => {
            const date = dateOnly(item.publicationDate);
            return date && (!from || date >= from) && (!to || date <= to);
        }).length, 0),
        recordsRejected: Object.values(counters).reduce((sum, count) => sum + count, 0),
        backfilledCandidates: additions.filter(candidate => candidate.sourcePublicationDate && to && candidate.sourcePublicationDate < to).length,
        sourcesEvaluated: reports.length,
        configuredSources: reports.filter(result => !["NOT_CONFIGURED", "SOURCE_UNSUPPORTED"].includes(result.status)).length,
        sourcesUsed: [...new Set(additions.map(candidate => candidate.sourceOrgId))].sort(),
        coverageByRegion: [...regionStats.values()],
        existingCandidateCount: existingCandidates.length,
        skipped: counters,
        discoveryTarget: "<=24 hours where source availability and endpoint reliability permit; not universal real-time coverage",
        sourceReports: reports.map(result => ({
            sourceId: result.sourceId,
            region: canonicalRegion(result.region),
            country: result.country,
            sourceType: result.sourceType,
            endpoint: result.endpoint,
            endpointType: result.endpointType,
            machineReadableStatus: result.machineReadableStatus,
            active: result.active,
            status: result.status === "RETRIEVED_REVIEW_REQUIRED" && !(result.discovered || []).some(isPaymentsRelevant)
                ? "NO_RELEVANT_ITEMS" : result.status,
            parserStatus: result.parserStatus,
            failureReason: result.failureReason,
            lastSuccessfulFetch: result.lastSuccessfulFetch,
            lastCandidateProduced: result.lastCandidateProduced,
            discoveredCount: (result.discovered || []).length,
            finalUrl: result.finalUrl || null
        }))
    };
    if (healthOutputArg) {
        const requestedPath = path.resolve(ROOT, healthOutputArg.slice("--health-output=".length));
        const allowedPath = path.join(DATA_DIR, "source-health.json");
        if (requestedPath !== allowedPath) throw new Error("Source-health output must be assets/data/source-health.json");
        report.sourceHealthUpdate = persistSourceHealthSnapshot(allowedPath, () => {
            const previous = fs.existsSync(allowedPath) ? readJson(allowedPath) : {};
            return buildSourceHealthSnapshot(sources, reports, existingCandidates, additions, previous, published);
        });
    }
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { canonicalUrl, eventFingerprint, isPaymentsRelevant, buildCandidate, dateOnly, canonicalRegion, healthStateFor, unsupportedFailureReason, buildSourceHealthSnapshot, writeJsonAtomically, persistSourceHealthSnapshot };
