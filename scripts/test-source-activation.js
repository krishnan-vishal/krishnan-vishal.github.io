#!/usr/bin/env node

const assert = require("assert");
const registry = require("../assets/data/trusted-sources.json").registry;
const { hostAllowed } = require("./refresh-announcements.js");
const { canonicalRegion } = require("./propose-intelligence-candidates.js");
const { buildSourceHealthRecord } = require("./gpir-source-health-report.js");

const activatedIds = ["rba", "boe-uk", "federal-reserve", "bank-of-canada", "bcb-brazil", "sarb-south-africa", "nbk-kazakhstan"];
const activated = activatedIds.map(id => {
    const source = registry.find(item => item.id === id);
    assert(source, `${id} must remain registered`);
    assert.equal(source.active, true, `${id} must be active`);
    assert(source.refreshEndpoint, `${id} must have a machine-readable endpoint`);
    assert(["RSS", "ATOM", "JSON"].includes(source.refreshEndpointType), `${id} endpoint type must be supported`);
    assert.equal(hostAllowed(source.refreshEndpoint, source.officialDomains), true, `${id} endpoint must stay on its approved official domain`);
    assert.equal(source.endpointVerifiedDate, "2026-09-09", `${id} must carry the real endpoint verification date`);
    return source;
});

const regions = new Set(activated.map(source => canonicalRegion(source.region)));
["Oceania", "Europe", "North America", "LATAM", "Africa", "CIS"].forEach(region => assert(regions.has(region), `${region} must gain verified source coverage`));
const health = buildSourceHealthRecord(activated[0]);
["sourceId", "region", "country", "sourceType", "endpoint", "endpointType", "machineReadableStatus", "lastSuccessfulFetch", "lastCandidateProduced", "fetchStatus", "parserStatus", "failureReason", "active"].forEach(field => assert(Object.prototype.hasOwnProperty.call(health, field), `source health must expose ${field}`));

console.log(`Source activation tests passed: ${activated.length} newly activated official endpoints across ${regions.size} canonical regions.`);
