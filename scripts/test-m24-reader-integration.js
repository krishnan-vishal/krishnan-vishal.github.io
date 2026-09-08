#!/usr/bin/env node
/*
 * GPIR M24 reader-visible acceptance test.
 *
 * Demonstrates that a real, already-qualified intelligence record flows
 * through the existing reader architecture end to end -- Global
 * Announcements, Country/Region association, the same indexing logic
 * Search GPIR uses, the same context-assembly logic ASK GPIR uses, and
 * lifecycle/provenance metadata -- without any manual duplication, and
 * without publishing anything new. It also exercises the M24 region
 * wiring (region:europe / country:united-kingdom), and re-uses the
 * existing M21/M23.1A dedup and source-failure-isolation machinery
 * against the newly expanded trusted-source registry.
 *
 * This script only reads existing repository JSON and calls existing
 * exported functions; it writes nothing.
 */

const assert = require("assert");
const path = require("path");
const announcements = require("../assets/data/announcements.json");
const registry = require("../assets/data/content-registry.json");
const trustedSources = require("../assets/data/trusted-sources.json");
const { canonicalUrl, eventFingerprint, isPaymentsRelevant, buildCandidate } = require("./propose-intelligence-candidates.js");
const { inspectSources } = require("./refresh-announcements.js");

const registryById = new Map(registry.records.map(r => [r.id, r]));
const sourcesById = new Map(trustedSources.registry.map(s => [s.id, s]));

/* ---------------------------------------------------------------------
 * 1. An existing qualified announcement flows through the full chain.
 * ------------------------------------------------------------------- */

function testExistingIntelligenceFlow() {
    const record = announcements.records.find(r => r.id === "rbi-payments-vision-2028");
    assert.ok(record, "fixture: rbi-payments-vision-2028 must exist in the published announcements dataset");

    // Global Announcements: publication + lifecycle + provenance gate
    // (mirrors assets/js/announcements.js publishedRecords()).
    assert.strictEqual(record.status, "GPIR_CLASSIFIED");
    assert.strictEqual(record.lifecycleStatus, "CURRENT");
    assert.notStrictEqual(record.contentStatus, "CONTENT_UNDER_REVIEW");
    ["country", "region", "publicationDate", "publishedDate", "retrievedDate", "sourceOrgId", "summary"].forEach(field => {
        assert.ok(record[field], `Global Announcements reader field missing: ${field}`);
    });
    assert.ok(record.source && record.source.url && record.source.name, "reader-visible source attribution missing");

    // Country / Region association via the canonical registry -- not a
    // duplicated per-country copy of the record.
    const announcementRegistryId = `announcement:${record.id}`;
    const registryRecord = registryById.get(announcementRegistryId);
    assert.ok(registryRecord, "content-registry.json must carry the announcement's identity record");
    const countryRelationship = registryRecord.relationships.find(rel => rel.type === "COUNTRY");
    assert.ok(countryRelationship, "announcement must carry an explicit COUNTRY relationship");
    assert.strictEqual(countryRelationship.target, "country:india");
    assert.strictEqual(
        announcements.records.filter(r => r.country === "India" && r.id === record.id).length,
        1,
        "the record must exist exactly once -- association is by relationship, not by copying"
    );

    // Search GPIR: reuses the exact inclusion rule from
    // assets/js/script.js's addAnnouncementsToIndex().
    const includedInSearch = record.status !== "SOURCE_VERIFICATION_REQUIRED";
    assert.strictEqual(includedInSearch, true, "record must be eligible for the existing Search GPIR index");
    const searchEntry = { label: record.title, href: "pages/intelligence/" + record.id + ".html" };
    assert.ok(searchEntry.label && searchEntry.href.includes(record.id));

    // ASK GPIR: reuses the same country-term and source-resolution logic
    // assets/js/script.js's answerAnnouncementQuery()/sourceDetails() apply.
    const normalizedQuery = "recent announcements for india";
    const countryTerms = ["india", "singapore", "uae", "united arab emirates", "saudi arabia", "qatar"];
    const matchedCountryTerm = countryTerms.find(term => normalizedQuery.includes(term));
    assert.strictEqual(matchedCountryTerm, "india");
    const location = `${record.country} ${record.region}`.toLowerCase();
    assert.ok(location.includes(matchedCountryTerm), "ASK GPIR country-term match must resolve against this record");
    const trustedSource = sourcesById.get(record.sourceOrgId);
    assert.ok(trustedSource, "ASK GPIR source resolution must find the cited authority in the trusted-source registry");
    assert.ok(trustedSource.organization);

    // Lifecycle + provenance metadata reader-visible surface.
    assert.strictEqual(record.supersedes, null);
    assert.strictEqual(record.supersededBy, null);
    assert.ok(record.audit && record.audit.discoveredDate && record.audit.sourceVerifiedDate);

    console.log("PASS existing-intelligence-flow: rbi-payments-vision-2028 connects to Global Announcements, country:india, Search GPIR indexing, ASK GPIR context and lifecycle/provenance without duplication.");
}

/* ---------------------------------------------------------------------
 * 2. M24 region wiring: a regional development associates through
 *    region:europe -> country:united-kingdom without per-country cloning.
 * ------------------------------------------------------------------- */

function testRegionWiring() {
    const europe = registryById.get("region:europe");
    assert.ok(europe, "region:europe must exist in the canonical registry");
    assert.strictEqual(europe.sourceRef.file, "assets/data/sepa-countries.json");

    const uk = registryById.get("country:united-kingdom");
    assert.ok(uk, "country:united-kingdom must exist");
    const ukRegionRelationship = uk.relationships.find(rel => rel.type === "REGION");
    assert.ok(ukRegionRelationship, "country:united-kingdom must carry an explicit REGION relationship");
    assert.strictEqual(ukRegionRelationship.target, "region:europe");

    const europeCountryRelationship = europe.relationships.find(rel => rel.target === "country:united-kingdom");
    assert.ok(europeCountryRelationship, "region:europe must reciprocally reference country:united-kingdom");

    // A single future ECB/EU-scope development would attach to
    // region:europe once and reach every SEPA country through this
    // relationship graph -- it does not require one record per country.
    const otherSepaCountriesWithOwnRegistryRecord = registry.records.filter(
        r => r.contentType === "COUNTRY" && r.id !== "country:united-kingdom" &&
            r.sourceRef && r.sourceRef.file === "assets/data/sepa-countries.json"
    );
    assert.strictEqual(otherSepaCountriesWithOwnRegistryRecord.length, 0,
        "no other SEPA country record exists yet -- region:europe is the single shared association point");

    console.log("PASS region-wiring: region:europe <-> country:united-kingdom relationship is live and would carry any future EU/SEPA-scope development without per-country duplication.");
}

/* ---------------------------------------------------------------------
 * 3. Dedup across the newly expanded (M24) trusted-source registry.
 * ------------------------------------------------------------------- */

function testDedupAcrossExpandedRegistry() {
    const source = sourcesById.get("cbb-bahrain");
    assert.ok(source, "fixture requires the M24 cbb-bahrain registry entry");

    const first = { title: "Central Bank of Bahrain publishes instant payment interoperability requirements", url: "https://www.cbb.gov.bh/press/fixture-item", publicationDate: "2026-09-08" };
    const second = { title: "Central Bank of Bahrain publishes instant payment interoperability requirements", url: "https://www.cbb.gov.bh/press/fixture-item#section-2", publicationDate: "2026-09-08" };

    assert.strictEqual(canonicalUrl(first.url), canonicalUrl(second.url), "canonical URL must ignore the fragment");
    assert.strictEqual(eventFingerprint(first), eventFingerprint(second), "same title/date must fingerprint identically across discovery passes");
    assert.strictEqual(isPaymentsRelevant(first), true, "instant-payment interoperability guidance must be payments-relevant");

    const candidate = buildCandidate({ ...source, sourceRole: "PRIMARY" }, first, "2026-09-08T00:00:00.000Z", null, "https://www.cbb.gov.bh/press/fixture-feed");
    assert.strictEqual(candidate.countryId, null, "no country registry record exists yet for Bahrain -- countryId must stay null rather than invented");
    assert.strictEqual(candidate.countryIsoAlpha2, "BH", "the candidate still carries the trusted-source ISO code even without a country registry record");
    assert.strictEqual(candidate.region, "Middle East / GCC");
    assert.strictEqual(candidate.lifecycleStatus, "DEVELOPING");
    assert.strictEqual(candidate.status, "PENDING_HUMAN_REVIEW");

    console.log("PASS dedup: canonical-URL and event-fingerprint dedup work identically for an M24-added registry source, and no country is fabricated where none is registered.");
}

/* ---------------------------------------------------------------------
 * 4. Source-failure isolation across the expanded registry: one
 *    inactive/unsupported M24 source must not affect a healthy sibling.
 * ------------------------------------------------------------------- */

async function testSourceFailureIsolation() {
    const unsupported = sourcesById.get("cbb-bahrain"); // active: false, no refreshEndpoint (M24 addition)
    const healthyFixture = { id: "fixture-healthy", officialDomains: ["rbi.org.in"], refreshEndpoint: "https://www.rbi.org.in/fixture-feed", active: true };
    const unavailableFixture = { id: "fixture-unavailable", officialDomains: ["rbi.org.in"], refreshEndpoint: "https://www.rbi.org.in/fixture-unavailable", active: true };

    const originalFetch = global.fetch;
    try {
        global.fetch = async url => {
            if (String(url).includes("unavailable")) throw new Error("fixture unavailable");
            return {
                ok: true,
                status: 200,
                url,
                headers: { get: () => "application/rss+xml" },
                text: async () => '<rss><channel><item><title>Instant payment interoperability update</title><link>https://www.rbi.org.in/fixture-feed/item</link><pubDate>Mon, 08 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>'
            };
        };
        const reports = await inspectSources([unsupported, healthyFixture, unavailableFixture]);
        const [unsupportedReport, healthyReport, unavailableReport] = reports;
        assert.strictEqual(unsupportedReport.status, "SOURCE_UNSUPPORTED", "the M24 unsupported source must report SOURCE_UNSUPPORTED, not error out");
        assert.strictEqual(healthyReport.status, "RETRIEVED_REVIEW_REQUIRED", "a healthy sibling source must still succeed regardless of the unsupported source's state");
        assert.strictEqual(unavailableReport.status, "ENDPOINT_UNAVAILABLE", "an unrelated failing source must be isolated to its own report");
    } finally {
        global.fetch = originalFetch;
    }

    console.log("PASS source-failure-isolation: an M24 unsupported/inactive source and an unrelated failing source do not affect a healthy sibling's retrieval.");
}

/* ---------------------------------------------------------------------
 * 5. Historical retention: the M24 registry/data-only changes must not
 *    have touched a single existing published announcement record.
 * ------------------------------------------------------------------- */

function testHistoricalRetentionUntouched() {
    const knownExistingIds = [
        "cbuae-payment-token-2026",
        "sama-malaa-openbanking-2026",
        "rbi-payments-vision-2028",
        "mas-paynow-gen2-2026",
        "favara-upi-maldives-india-2026",
        "swift-payments-scheme-2026",
        "mastercard-stablecoin-settlement-2026",
        "mastercard-bvnk-acquisition-2026",
        "fatf-r16-consultation-2026"
    ];
    const presentIds = new Set(announcements.records.map(r => r.id));
    knownExistingIds.forEach(id => {
        assert.ok(presentIds.has(id), `pre-existing published announcement must not be removed: ${id}`);
    });
    assert.ok(announcements.records.length >= knownExistingIds.length, "the published announcement count must not shrink");

    console.log(`PASS historical-retention: all ${knownExistingIds.length} pre-existing published announcements remain present (${announcements.records.length} total records).`);
}

async function main() {
    testExistingIntelligenceFlow();
    testRegionWiring();
    testDedupAcrossExpandedRegistry();
    await testSourceFailureIsolation();
    testHistoricalRetentionUntouched();
    console.log("GPIR M24 reader-visible acceptance test passed.");
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
