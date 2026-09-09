#!/usr/bin/env node
/* Deterministically completes the public announcement record contract. */
const fs = require("fs");
const path = require("path");
const lifecycle = require("../assets/js/announcement-lifecycle.js");

const ROOT = path.resolve(__dirname, "..");
const ANNOUNCEMENTS_PATH = path.join(ROOT, "assets", "data", "announcements.json");
const SOURCES_PATH = path.join(ROOT, "assets", "data", "trusted-sources.json");

function normalizeRecord(record, sourceRegistry, asOf){
    const registrySource = sourceRegistry.find(source => source.id === record.sourceOrgId);
    const published = lifecycle.isPublished(record);
    const live = published && lifecycle.isLive(record, asOf);
    const sourceType = registrySource ? registrySource.sourceType || null : null;
    const tags = Array.from(new Set([
        record.category, record.subCategory, record.eventType, record.country, record.region
    ].filter(Boolean)));
    const keywords = Array.from(new Set([
        ...tags, record.organisation, record.source && record.source.name
    ].filter(Boolean)));
    return {
        ...record,
        headline: record.headline || record.title,
        subcategory: record.subcategory || record.subCategory || null,
        publicationTime: record.publicationTime || null,
        sourceName: record.sourceName || (record.source && record.source.name) || null,
        sourceUrl: record.sourceUrl || (record.source && record.source.url) || null,
        sourceType,
        retrievedAt: record.retrievedAt || record.retrievedDate || null,
        validatedAt: record.validatedAt || (record.audit && record.audit.sourceVerifiedDate) || null,
        validationStatus: record.validationStatus || (published ? "VALIDATED" : "AWAITING_VALIDATION"),
        displayLifecycleStatus: live ? "LIVE" : published ? "ARCHIVED" : "NOT_PUBLISHED",
        gpirSection: record.gpirSection || (record.gpirMapping && record.gpirMapping.header) || null,
        gpirSubsection: record.gpirSubsection || (record.gpirMapping && record.gpirMapping.subHeader) || null,
        tags,
        keywords,
        sourceAuthorityLevel: record.sourceAuthorityLevel || (record.source && record.source.tier) || null,
        supersedes: record.supersedes || null,
        supersededBy: record.supersededBy || null
    };
}

function normalizeDataset(dataset, sources, asOf){
    return {
        ...dataset,
        schemaVersion: "3.0",
        liveDisplayWindowHours: 24,
        records: (dataset.records || []).map(record => normalizeRecord(record, sources, asOf))
    };
}

function main(){
    const write = process.argv.includes("--write");
    const asOfArg = process.argv.find(arg => arg.startsWith("--as-of="));
    if(!asOfArg) throw new Error("--as-of=<ISO timestamp> is required; lifecycle normalization must never depend on an unrecorded wall clock");
    const asOf = new Date(asOfArg.slice("--as-of=".length));
    if(Number.isNaN(asOf.getTime())) throw new Error("--as-of must be a valid ISO timestamp");
    const dataset = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, "utf8"));
    const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8")).registry || [];
    const normalized = normalizeDataset(dataset, sources, asOf);
    if(write) fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(normalized, null, 2) + "\n", "utf8");
    const partitioned = lifecycle.partition(normalized.records, asOf);
    process.stdout.write(JSON.stringify({ mode: write ? "WRITE" : "REPORT_ONLY", asOf: asOf.toISOString(), recordCount: normalized.records.length, live24hCount: partitioned.live.length, archiveCount: partitioned.archive.length, developingCount: partitioned.developing.length }, null, 2) + "\n");
}

if(require.main === module) main();
module.exports = { normalizeRecord, normalizeDataset };
