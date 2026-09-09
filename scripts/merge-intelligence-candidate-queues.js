#!/usr/bin/env node

/*
 * Preserves unresolved proposal candidates when an existing automation branch
 * is refreshed from the latest main tree. Public records always win: a
 * candidate whose URL or event fingerprint is already published is retired
 * from the queue instead of resurfacing or creating a merge conflict.
 */

const fs = require("fs");
const path = require("path");
const { canonicalUrl } = require("./propose-intelligence-candidates.js");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(ROOT, "assets", "data", "intelligence-candidates.json");
const ANNOUNCEMENTS_PATH = path.join(ROOT, "assets", "data", "announcements.json");
const CONTENT_REGISTRY_PATH = path.join(ROOT, "assets", "data", "content-registry.json");

function appendUniqueById(baseRecords, retainedRecords) {
    const merged = new Map(baseRecords.map(record => [record.id, record]));
    retainedRecords.forEach(record => {
        if (record && record.id && !merged.has(record.id)) merged.set(record.id, record);
    });
    return [...merged.values()];
}

function mergeCandidates(baseCandidates, retainedCandidates, published) {
    const publishedUrls = new Set(published.map(record => canonicalUrl(record.sourceUrl || record.source && record.source.url)).filter(Boolean));
    const publishedEvents = new Set(published.map(record => record.eventFingerprint).filter(Boolean));
    const merged = new Map();
    baseCandidates.concat(retainedCandidates).forEach(candidate => {
        const url = canonicalUrl(candidate.sourceUrl);
        if ((url && publishedUrls.has(url)) || (candidate.eventFingerprint && publishedEvents.has(candidate.eventFingerprint))) return;
        const key = candidate.id || `${candidate.sourceOrgId}:${url || candidate.eventFingerprint}`;
        if (!merged.has(key)) merged.set(key, candidate);
    });
    return [...merged.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function main() {
    const retainedPath = process.argv[2];
    const retainedAnnouncementsPath = process.argv[3];
    const retainedRegistryPath = process.argv[4];
    if (!retainedPath) throw new Error("Usage: node scripts/merge-intelligence-candidate-queues.js <retained-queue.json>");
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
    const retained = JSON.parse(fs.readFileSync(retainedPath, "utf8"));
    const announcements = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, "utf8"));
    const retainedAnnouncements = retainedAnnouncementsPath ? JSON.parse(fs.readFileSync(retainedAnnouncementsPath, "utf8")) : { records: [] };
    const combinedRecords = appendUniqueById(announcements.records || [], retainedAnnouncements.records || []);
    const candidates = mergeCandidates(queue.candidates || [], retained.candidates || [], combinedRecords);
    if (retainedAnnouncementsPath) {
        const lastRefreshed = [announcements.lastRefreshed, retainedAnnouncements.lastRefreshed].filter(Boolean).sort().pop() || announcements.lastRefreshed;
        fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify({ ...announcements, schemaVersion: retainedAnnouncements.schemaVersion || announcements.schemaVersion, lastRefreshed, records: combinedRecords }, null, 2) + "\n", "utf8");
    }
    if (retainedRegistryPath) {
        const registry = JSON.parse(fs.readFileSync(CONTENT_REGISTRY_PATH, "utf8"));
        const retainedRegistry = JSON.parse(fs.readFileSync(retainedRegistryPath, "utf8"));
        const records = appendUniqueById(registry.records || [], retainedRegistry.records || []);
        fs.writeFileSync(CONTENT_REGISTRY_PATH, JSON.stringify({ ...registry, records }, null, 2) + "\n", "utf8");
    }
    fs.writeFileSync(QUEUE_PATH, JSON.stringify({ ...queue, candidates }, null, 2) + "\n", "utf8");
    process.stdout.write(JSON.stringify({ retained: candidates.length, publishedDuplicatesRetired: (queue.candidates || []).length + (retained.candidates || []).length - candidates.length }) + "\n");
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { mergeCandidates, appendUniqueById };
