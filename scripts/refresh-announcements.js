#!/usr/bin/env node
/*
 * Deterministic announcement refresh foundation.
 *
 * This command is report-only: it reads the approved trusted-source registry,
 * checks only an explicitly configured refreshEndpoint when one exists, and
 * never mutates announcements.json or creates publication records. The current
 * repository has no configured endpoints or scheduled ingestion workflow, so
 * the normal report is an honest machine-readable NOT_CONFIGURED result.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const trustedSources = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/trusted-sources.json"), "utf8")).registry || [];
const announcements = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/announcements.json"), "utf8")).records || [];

async function inspectSource(source){
    const endpoint = source.refreshEndpoint || null;
    if(!endpoint) return { sourceId: source.id, officialDomains: source.officialDomains, endpoint: null, status: "NOT_CONFIGURED", discovered: [] };
    try{
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
        return { sourceId: source.id, officialDomains: source.officialDomains, endpoint, status: response.ok ? "ENDPOINT_REACHABLE_REVIEW_REQUIRED" : "ENDPOINT_UNAVAILABLE", httpStatus: response.status, discovered: [] };
    } catch(error){
        return { sourceId: source.id, officialDomains: source.officialDomains, endpoint, status: "ENDPOINT_UNAVAILABLE", error: error.message, discovered: [] };
    }
}

Promise.all(trustedSources.map(inspectSource)).then(results => {
    const report = {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        mode: "REPORT_ONLY",
        cadence: "NOT_SCHEDULED",
        sourceCount: trustedSources.length,
        existingAnnouncementCount: announcements.length,
        recordsMutated: 0,
        sources: results
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
