#!/usr/bin/env node

/*
 * M29 controlled activation of already-registered official discovery pages.
 * No URL is discovered or invented here: the only HTML targets considered are
 * existing trusted-sources.json discoveryPage values on approved domains.
 */

const fs = require("fs");
const path = require("path");
const { hostAllowed, inspectSources } = require("./refresh-announcements.js");

const ROOT = path.resolve(__dirname, "..");
const SOURCES_PATH = path.join(ROOT, "assets", "data", "trusted-sources.json");

function activationCandidate(source) {
    return Boolean(
        source && !source.refreshEndpoint && source.discoveryPage &&
        source.sourceTrustStatus === "VERIFIED_OFFICIAL" &&
        hostAllowed(source.discoveryPage, source.officialDomains || [])
    );
}

function activatedSource(source, report, now) {
    return {
        ...source,
        refreshEndpoint: source.discoveryPage,
        refreshEndpointType: "HTML",
        refreshScope: "Configured official public announcements/releases index",
        endpointVerifiedDate: now.slice(0, 10),
        parserProfile: "OFFICIAL_HTML_LINKS",
        acquisitionMethod: "OFFICIAL_HTML_INDEX",
        active: true,
        discoveryStatus: "ACTIVE_OFFICIAL_HTML_INDEX",
        discoveryNote: "Approved official public index fetched and parsed deterministically; item publication still requires the canonical GPIR validation gate.",
        lastSuccessfulRetrieval: report.retrievedAt,
        lastAttemptedRetrieval: now,
        retrievalPriority: source.retrievalPriority || "HIGH",
        targetDiscoveryHours: source.targetDiscoveryHours || 24,
        healthStatus: "HEALTHY"
    };
}

function normalizeActivatedMetadata(source) {
    if (source.refreshEndpointType !== "HTML" || source.parserProfile !== "OFFICIAL_HTML_LINKS") return source;
    return {
        ...source,
        retrievalPriority: source.retrievalPriority || "HIGH",
        targetDiscoveryHours: source.targetDiscoveryHours || 24,
        healthStatus: ["UNOBSERVED", "HEALTHY", "DELAYED", "FAILING", "INACTIVE"].includes(source.healthStatus) ? source.healthStatus : "HEALTHY"
    };
}

async function activate(sources, now = new Date().toISOString()) {
    const candidates = sources.filter(activationCandidate);
    const probes = candidates.map(source => ({
        ...source,
        refreshEndpoint: source.discoveryPage,
        refreshEndpointType: "HTML",
        parserProfile: "OFFICIAL_HTML_LINKS",
        active: true
    }));
    const reports = await inspectSources(probes);
    const reportById = new Map(reports.map(report => [report.sourceId, report]));
    const activatedIds = new Set(reports
        .filter(report => report.status === "RETRIEVED_REVIEW_REQUIRED" && report.parserStatus === "PARSED" && (report.discovered || []).some(item => hostAllowed(item.url, report.officialDomains || [])))
        .map(report => report.sourceId));
    return {
        sources: sources.map(source => normalizeActivatedMetadata(activatedIds.has(source.id) ? activatedSource(source, reportById.get(source.id), now) : source)),
        reports,
        activatedIds: [...activatedIds],
        eligibleCount: candidates.length,
        rejected: reports.filter(report => !activatedIds.has(report.sourceId)).map(report => ({
            sourceId: report.sourceId,
            status: report.status === "RETRIEVED_REVIEW_REQUIRED" ? "NO_DETERMINISTIC_ITEMS" : report.status,
            failureReason: report.failureReason || null,
            recordsDiscovered: (report.discovered || []).length
        }))
    };
}

async function main() {
    const apply = process.argv.includes("--apply");
    const normalizeOnly = process.argv.includes("--normalize-existing");
    const data = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
    if (normalizeOnly) {
        const sources = (data.registry || []).map(normalizeActivatedMetadata);
        if (apply) fs.writeFileSync(SOURCES_PATH, JSON.stringify({ ...data, registry: sources }, null, 2) + "\n", "utf8");
        process.stdout.write(JSON.stringify({ mode: apply ? "METADATA_NORMALIZED" : "REPORT_ONLY", normalizedSources: sources.filter(source => source.refreshEndpointType === "HTML").length }, null, 2) + "\n");
        return;
    }
    const result = await activate(data.registry || []);
    if (apply) {
        fs.writeFileSync(SOURCES_PATH, JSON.stringify({ ...data, registry: result.sources }, null, 2) + "\n", "utf8");
    }
    process.stdout.write(JSON.stringify({
        mode: apply ? "CONTROLLED_ACTIVATION" : "REPORT_ONLY",
        registeredSources: (data.registry || []).length,
        alreadyActive: (data.registry || []).filter(source => source.active && source.refreshEndpoint).length,
        eligibleOfficialDiscoveryPages: result.eligibleCount,
        newlyActivated: result.activatedIds.length,
        activatedSourceIds: result.activatedIds,
        rejected: result.rejected
    }, null, 2) + "\n");
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { activationCandidate, activatedSource, normalizeActivatedMetadata, activate };
