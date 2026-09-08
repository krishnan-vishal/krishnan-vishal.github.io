#!/usr/bin/env node
/*
 * GPIR M24 Source Health Report
 * ------------------------------
 * A dev-time (not runtime) read-only report over assets/data/trusted-
 * sources.json. It answers, for the M24 "source health / failure
 * isolation" requirement, four questions without contacting the
 * network or mutating anything:
 *
 *   1. How many sources are configured, and how many of those are
 *      active with a machine-readable endpoint vs. known-but-
 *      unsupported (manual discovery only)?
 *   2. How is coverage distributed across region and discovery role
 *      (PRIMARY validation-capable authority vs. SECONDARY discovery
 *      radar)?
 *   3. Which active sources have never had a successful retrieval
 *      recorded (healthStatus/lastSuccessfulRetrieval), so an operator
 *      can see degraded/unobserved coverage at a glance?
 *   4. Does the registry itself stay internally consistent (unique
 *      ids, every active source carrying the required refresh fields)?
 *
 * This does not fetch any endpoint — scripts/refresh-announcements.js
 * and scripts/propose-intelligence-candidates.js already own live
 * retrieval and its per-source failure isolation. Exit code is always
 * 0; this is advisory, matching scripts/gpir-perf-audit.js.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCES_PATH = path.join(ROOT, "assets", "data", "trusted-sources.json");

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
    const registry = readJson(SOURCES_PATH).registry || [];

    const configured = registry.filter(s => s.refreshEndpoint);
    const active = configured.filter(s => s.active === true);
    const inactiveConfigured = configured.filter(s => s.active === false);
    const knownUnsupported = registry.filter(s => !s.refreshEndpoint && s.discoveryStatus === "SOURCE_UNSUPPORTED");
    const minimalOnly = registry.filter(s => !s.refreshEndpoint && s.discoveryStatus !== "SOURCE_UNSUPPORTED");

    const byRegion = new Map();
    registry.forEach(source => {
        const region = source.region || "UNCLASSIFIED";
        if (!byRegion.has(region)) byRegion.set(region, { total: 0, active: 0, unsupported: 0 });
        const bucket = byRegion.get(region);
        bucket.total += 1;
        if (source.active === true) bucket.active += 1;
        if (source.discoveryStatus === "SOURCE_UNSUPPORTED") bucket.unsupported += 1;
    });

    const primaryValidation = registry.filter(s => (s.sourceRole || "PRIMARY") === "PRIMARY");
    const secondaryDiscovery = registry.filter(s => s.sourceRole === "SECONDARY");

    const neverObserved = active.filter(s => !s.lastSuccessfulRetrieval);
    const degraded = active.filter(s => ["DELAYED", "FAILING", "INACTIVE"].includes(s.healthStatus));

    const ids = new Set();
    const duplicateIds = [];
    registry.forEach(s => {
        if (ids.has(s.id)) duplicateIds.push(s.id);
        ids.add(s.id);
    });

    const report = {
        generatedAt: new Date().toISOString(),
        mode: "REPORT_ONLY",
        registryTotal: registry.length,
        activeMachineReadable: active.length,
        inactiveConfiguredEndpoints: inactiveConfigured.length,
        knownUnsupportedManualOnly: knownUnsupported.length,
        minimalReferenceOnly: minimalOnly.length,
        discoveryRoleSplit: {
            PRIMARY_validationCapable: primaryValidation.length,
            SECONDARY_discoveryOnly: secondaryDiscovery.length
        },
        byRegion: Object.fromEntries([...byRegion.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
        activeNeverObserved: neverObserved.map(s => s.id),
        activeDegradedOrFailing: degraded.map(s => ({ id: s.id, healthStatus: s.healthStatus })),
        registryIntegrity: {
            duplicateIds,
            consistent: duplicateIds.length === 0
        },
        note: "This report is read-only and static; it does not fetch any endpoint. " +
            "Live retrieval outcomes are recorded by scripts/refresh-announcements.js and " +
            "scripts/propose-intelligence-candidates.js at run time, and a single source's " +
            "failure there does not affect any other source (see inspectSources())."
    };

    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (require.main === module) {
    main();
}

module.exports = { main };
