#!/usr/bin/env node

const assert = require("assert");
const { activationCandidate, activatedSource, activate } = require("./activate-source-network.js");
const { buildSourceHealthSnapshot } = require("./propose-intelligence-candidates.js");
const { dateFromHtmlContext, extractOfficialHtmlItems } = require("./refresh-announcements.js");

const official = {
    id: "official", organization: "Official Authority", country: "Testland", region: "APAC",
    sourceType: "Central Bank / Regulator", tier: 1, sourceTrustStatus: "VERIFIED_OFFICIAL",
    officialDomains: ["authority.test"], discoveryPage: "https://authority.test/releases"
};
assert.equal(activationCandidate(official), true);
assert.equal(activationCandidate({...official, discoveryPage:"https://untrusted.test/releases"}), false);
assert.equal(activationCandidate({...official, sourceTrustStatus:"DISCOVERY_ONLY"}), false);

const promoted = activatedSource(official, {retrievedAt:"2026-09-09T00:00:00.000Z"}, "2026-09-09T01:00:00.000Z");
assert.equal(promoted.refreshEndpoint, official.discoveryPage);
assert.equal(promoted.refreshEndpointType, "HTML");
assert.equal(promoted.parserProfile, "OFFICIAL_HTML_LINKS");
assert.equal(dateFromHtmlContext('<time datetime="2026-09-08T10:00:00Z">8 September</time>'), "2026-09-08");
assert.equal(dateFromHtmlContext('<p class="date">8/21/2026</p>'), "8/21/2026");
assert.equal(dateFromHtmlContext('<span>21.08.2026</span>'), "21.08.2026");
const adjacentItems = extractOfficialHtmlItems(
    '<a href="/news/first"><span>First instant payment notice</span><time>8/21/2026</time></a>' +
    '<a href="/news/second"><span>Second instant payment notice</span><time>8/17/2026</time></a>',
    "https://authority.test/releases"
);
assert.deepEqual(adjacentItems.map(item => item.publicationDate), ["8/21/2026", "8/17/2026"]);
assert.deepEqual(adjacentItems.map(item => item.title), ["First instant payment notice", "Second instant payment notice"]);

async function run() {
    const savedFetch = global.fetch;
    try {
        global.fetch = async url => {
            if (url.includes("broken")) throw new Error("fixture unavailable");
            return {
                ok: true, status: 200, url,
                headers: {get: () => "text/html"},
                text: async () => '<article><time>9 September 2026</time><a href="/news/payment-notice">Official payment notice</a></article>'
            };
        };
        const broken = {...official, id:"broken", officialDomains:["broken.test"], discoveryPage:"https://broken.test/releases"};
        const result = await activate([official, broken], "2026-09-09T01:00:00.000Z");
        assert.deepEqual(result.activatedIds, ["official"], "one failed source must not block another source activation");
        assert.equal(result.rejected[0].sourceId, "broken");
        const report = result.reports.find(item => item.sourceId === "official");
        const snapshot = buildSourceHealthSnapshot(result.sources, result.reports, [], [], {}, []);
        assert.equal(report.parserStatus, "PARSED");
        assert.equal(snapshot.sources.length, 2);
        ["organization", "officialDomain", "acquisitionMethod", "activationStatus", "lastPublicationSeen", "recordsQualified", "recordsPublished", "healthStatus"].forEach(field => assert(field in snapshot.sources[0], field));
    } finally {
        global.fetch = savedFetch;
    }
    console.log("M29 official HTML activation, isolation and coverage contracts passed.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
