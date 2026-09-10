#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = name => JSON.parse(fs.readFileSync(path.join(root, "assets", "data", name), "utf8"));
const registry = read("trusted-sources.json").registry || [];
const coverage = read("source-health.json");
const rows = coverage.sources || [];
const required = ["sourceId", "organization", "country", "region", "sourceType", "trustTier", "officialDomain", "acquisitionMethod", "activationStatus", "lastSuccessfulFetch", "lastPublicationSeen", "recordsDiscovered", "recordsQualified", "recordsPublished", "healthStatus", "failureReason"];
const errors = [];
const rowById = new Map();

rows.forEach((row, index) => {
    required.forEach(field => {
        if (!(field in row)) errors.push(`sources[${index}] missing ${field}`);
    });
    if (rowById.has(row.sourceId)) errors.push(`duplicate coverage sourceId ${row.sourceId}`);
    rowById.set(row.sourceId, row);
    if (!["GREEN", "AMBER", "RED", "STALE", "UNSUPPORTED"].includes(row.healthStatus)) errors.push(`${row.sourceId}: invalid healthStatus`);
    if (!["ACTIVE", "DEGRADED", "UNSUPPORTED"].includes(row.activationStatus)) errors.push(`${row.sourceId}: invalid activationStatus`);
});
registry.forEach(source => {
    const row = rowById.get(source.id);
    if (!row) errors.push(`${source.id}: missing from coverage report`);
    else if (Boolean(source.active && source.refreshEndpoint) !== (row.activationStatus !== "UNSUPPORTED")) errors.push(`${source.id}: activation mismatch`);
});
if (rows.length !== registry.length) errors.push(`coverage count ${rows.length} does not match registry count ${registry.length}`);
if (coverage.mode !== "SOURCE_COVERAGE_AND_HEALTH_SNAPSHOT") errors.push("coverage mode is not SOURCE_COVERAGE_AND_HEALTH_SNAPSHOT");

if (errors.length) {
    console.error(`M29 source coverage validation failed with ${errors.length} error(s):`);
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
}
console.log(`M29 source coverage validation passed: ${rows.length} registered, ${coverage.counts.active} activated.`);
