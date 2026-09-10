#!/usr/bin/env node

const assert = require("assert");
const report = require("../assets/data/wave-a-country-matrix.json");
const sourceRegistry = require("../assets/data/trusted-sources.json").registry;

const statuses = new Set(["ACTIVE_GREEN", "ACTIVE_AMBER", "QUARANTINED_RED", "VERIFIED_UNSUPPORTED", "MISSING_AUTHORITY"]);
const requiredRegions = new Set(["APAC / South Asia / ASEAN / Far East", "Oceania", "Europe / UK", "GCC / MENA", "North America", "LATAM / Caribbean", "Africa", "CIS / Central Asia"]);
assert.equal(report.scope.bisMemberCount, 63);
assert.equal(report.scope.gpirAdditionalJurisdictionCount, 22);
assert.equal(report.matrix.length, 85);
assert.equal(new Set(report.matrix.map(row => row.isoCountryCode)).size, 85, "ISO codes must be unique");
assert.deepEqual(new Set(report.matrix.map(row => row.region)), requiredRegions, "Wave A must use exactly the eight approved regions");
for (const row of report.matrix) {
    for (const key of ["country", "isoCountryCode", "region", "centralBankOrMonetaryAuthority", "officialDomains", "sourceId", "sourceTier", "activationStatus", "healthStatus", "operationalStatus", "latestRealPublicationDetected", "paymentsRelevantRecordDetected", "methodsTested", "domainValidation", "endpointValidation", "parserValidation", "originalAuthorityUrlValidation", "duplicateHandlingValidation", "recommendedFutureAcquisitionMethod", "notes"]) {
        assert(Object.prototype.hasOwnProperty.call(row, key), `${row.country}: missing ${key}`);
    }
    assert(statuses.has(row.operationalStatus), `${row.country}: invalid status`);
    assert(Array.isArray(row.officialDomains) && row.officialDomains.length > 0, `${row.country}: official domain required`);
    assert(Array.isArray(row.methodsTested) && row.methodsTested.length >= 2, `${row.country}: concrete methods required`);
    const source = sourceRegistry.find(candidate => candidate.id === row.sourceId);
    assert(source, `${row.country}: sourceId ${row.sourceId} must resolve to the trusted-source registry`);
    assert.equal(source.tier, 1, `${row.country}: Wave A source must be Tier 1`);
    assert.equal(source.sourceTrustStatus || "VERIFIED_OFFICIAL", "VERIFIED_OFFICIAL", `${row.country}: source must be official`);
    if (row.operationalStatus === "ACTIVE_GREEN") {
        assert(row.lastSuccessfulFetch, `${row.country}: green requires successful fetch evidence`);
        assert(row.latestRealPublicationDetected && /^20\d{2}-\d{2}-\d{2}$/.test(row.latestRealPublicationDetected.publicationDate), `${row.country}: green requires real dated publication evidence`);
    } else {
        assert(row.blockerType, `${row.country}: non-green requires blocker`);
    }
}
const totals = Object.fromEntries([...statuses].map(status => [status, report.matrix.filter(row => row.operationalStatus === status).length]));
assert.deepEqual(report.totals, totals, "reported totals must be derived from the matrix");
assert.equal(report.gapRegister.length, report.matrix.length - totals.ACTIVE_GREEN, "gap register must include every non-green jurisdiction");
assert.equal(report.canonicalPublication.recordsPublished, 0, "Wave A must not claim a publication that did not pass the existing strict gate");
assert.equal(report.coverageMetrics.centralBanksVerified, 85);
assert.equal(report.coverageMetrics.newlyActivatedSources, 0);
assert.equal(report.coverageMetrics.canonicalRecordsPublished, 0);
assert.equal(report.verdict, "VALIDATED WITH DOCUMENTED GAPS");
console.log(`Wave A coverage contract passed: ${report.matrix.length} jurisdictions; ${totals.ACTIVE_GREEN} green; ${report.gapRegister.length} documented gaps.`);
