#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const lifecycle = require("../assets/js/announcement-lifecycle.js");
const { announcementEntries } = require("../assets/js/content-search.js");
const { eventFingerprint, isPaymentsRelevant, buildCandidate } = require("./propose-intelligence-candidates.js");
const { filterDiscoveredByDate } = require("./refresh-announcements.js");

const root = path.resolve(__dirname, "..");
const datasetPath = path.join(root, "assets", "data", "announcements.json");
const datasetBytes = fs.readFileSync(datasetPath);
const data = JSON.parse(datasetBytes);
const base = { id: "boundary", status: "GPIR_CLASSIFIED", contentStatus: "PUBLISHED", lifecycleStatus: "CURRENT", publicationDate: "2026-09-08", publicationTime: "12:00:00Z" };

assert.equal(lifecycle.isLive(base, new Date("2026-09-09T11:59:59Z")), true, "record must be live before 24 hours");
assert.equal(lifecycle.isLive(base, new Date("2026-09-09T12:00:00Z")), false, "24-hour boundary must archive exactly");
assert.equal(lifecycle.isLive({ ...base, publicationTime: null }, new Date("2026-09-08T13:00:00Z")), false, "date-only data must never invent a live timestamp");
assert.equal(lifecycle.partition([base], new Date("2026-09-10T12:00:00Z")).archive.length, 1, "expired records must be retained in archive");
assert.equal(announcementEntries(data).length, data.records.filter(record => record.status === "GPIR_CLASSIFIED").length, "Search must retain every validated archived record");
assert.equal(lifecycle.query(data.records, "RBI payments September 2026").every(record => record.status === "GPIR_CLASSIFIED"), true, "queries must only return validated records");

assert.equal(isPaymentsRelevant({ title: "Cross-border payment licensing change", summary: "" }), true, "payments relevance must admit relevant items");
assert.equal(isPaymentsRelevant({ title: "Mortgage earnings outlook", summary: "" }), false, "payments relevance must reject unrelated items");
assert.equal(eventFingerprint({ title: "Payments launch!", publicationDate: "2026-09-01" }), eventFingerprint({ title: "Payments launch", publicationDate: "2026-09-01T09:00:00Z" }), "event duplicate fingerprints must normalize punctuation and publication dates");

const candidate = buildCandidate({ id: "rbi", organization: "RBI", officialDomains: ["rbi.org.in"] }, { title: "Payment update", url: "https://rbi.org.in/update", publicationDate: "2026-08-20" }, "2026-09-09T00:00:00Z", { id: "india", isoAlpha2: "IN", region: "South Asia" }, "https://rbi.org.in/feed");
assert.equal(candidate.countryId, "india", "candidate geography must reuse country intelligence metadata");
assert.equal(candidate.sourcePublicationDate, "2026-08-20", "source publication date must be retained without rewriting");
assert.equal(candidate.sourceUrl, "https://rbi.org.in/update", "original source URL must be preserved");

const backfill = filterDiscoveredByDate([{ discovered: [{ publicationDate: "2026-08-14" }, { publicationDate: "2026-08-15" }, { publicationDate: "2026-09-09" }, { publicationDate: "2026-09-10" }] }], "2026-08-15", "2026-09-09");
assert.deepEqual(backfill[0].discovered.map(item => item.publicationDate), ["2026-08-15", "2026-09-09"], "backfill window must be inclusive and bounded");
assert.equal(lifecycle.isLive({ ...base, publicationDate: "2026-08-20" }, new Date("2026-09-09T00:00:00Z")), false, "backfilled records older than 24 hours must go directly to archive");
assert.equal(Buffer.compare(datasetBytes, fs.readFileSync(datasetPath)), 0, "read-only discovery and tests must preserve last-known-good publication data");

console.log("Announcement lifecycle tests passed: relevance, geography, 24-hour boundary, archive retention, URLs, deduplication, publication dates, Search/ASK retrieval, backfill routing and last-known-good protection.");
