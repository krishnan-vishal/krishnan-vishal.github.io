#!/usr/bin/env node

const assert = require("assert");
const {
    canonicalUrl,
    eventFingerprint,
    isPaymentsRelevant
} = require("./propose-intelligence-candidates.js");

const paymentItem = {
    title: "Authority publishes instant payments interoperability requirements",
    summary: "New requirements apply to payment infrastructure.",
    publicationDate: "2026-09-07"
};
const duplicatePaymentItem = {
    title: "Authority publishes instant payments interoperability requirements",
    summary: "Republished through another approved discovery source.",
    publicationDate: "2026-09-07"
};
const unrelatedItem = {
    title: "Authority appoints a new communications director",
    summary: "Corporate announcement.",
    publicationDate: "2026-09-07"
};

assert.strictEqual(isPaymentsRelevant(paymentItem), true, "payment-related material must qualify");
assert.strictEqual(isPaymentsRelevant(unrelatedItem), false, "unrelated authority news must not qualify");
assert.strictEqual(eventFingerprint(paymentItem), eventFingerprint(duplicatePaymentItem), "same title/date must have deterministic event identity");
assert.strictEqual(canonicalUrl("https://example.test/item#section"), "https://example.test/item", "canonical URLs must ignore fragments");

console.log("GPIR intelligence radar contract passed.");

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { extractFeedItems, inspectSources } = require("./refresh-announcements.js");
const { buildCandidate } = require("./propose-intelligence-candidates.js");

async function regressionTests() {
    const feed = '<rss><channel><item><title><![CDATA[Payment <b>interoperability</b> &amp; wallets]]></title><link><![CDATA[https://www.rbi.org.in/fixture]]></link><pubDate>Mon, 07 Sep 2026 18:20:00 GMT</pubDate><description><![CDATA[<p>Cross-border payment infrastructure.</p>]]></description></item></channel></rss>';
    const [item] = extractFeedItems(feed, "application/rss+xml");
    assert.equal(item.title, "Payment interoperability & wallets", "CDATA title must survive markup removal");
    assert.equal(item.summary, "Cross-border payment infrastructure.");
    assert.equal(item.url, "https://www.rbi.org.in/fixture");
    assert.throws(() => extractFeedItems("<html>Access blocked</html>"), /SOURCE_PARSE_FAILED/);
    assert.throws(() => extractFeedItems("{broken", "application/json"), /SOURCE_PARSE_FAILED/);
    for (const title of ["Government securities auction", "Euro foreign exchange reference rates", "Bank earnings rise", "Fintech lending investment outlook", "Insurance stock market outlook"]) {
        assert.equal(isPaymentsRelevant({title, summary:"Settlement date and interest payment details."}), false, title);
    }
    for (const title of ["New cross-border FX infrastructure", "Wallet network acquisition", "AML requirements for remittances", "Payment API security", "Stablecoin settlement", "Open banking payment initiation"]) {
        assert.equal(isPaymentsRelevant({title}), true, title);
    }
    const registry = require("../assets/data/trusted-sources.json").registry;
    const source = registry.find(s => s.id === "rbi-press-releases");
    const candidate = buildCandidate(source, item, "2026-09-08T00:00:00.000Z", null, source.refreshEndpoint);
    assert.throws(() => buildCandidate(source, {...item,title:""}, candidate.retrievedAt, null, source.refreshEndpoint), /CANDIDATE_VALIDATION_FAILED/);
    const secondary = registry.find(s => s.id === "sfa");
    const secondaryCandidate = buildCandidate(secondary, {...item,url:"https://singaporefintech.org/fixture"}, candidate.retrievedAt, null, secondary.refreshEndpoint);
    assert.equal(secondaryCandidate.originalSource, null);
    assert.equal(secondaryCandidate.summary, null);
    assert.equal(secondaryCandidate.validationStatus, "AWAITING_HUMAN_VALIDATION");

    // Exercise the real workflow gate, restoring the byte-identical queue even on failure.
    const queuePath = path.join(__dirname, "../assets/data/intelligence-candidates.json");
    const saved = fs.readFileSync(queuePath);
    const validate = () => spawnSync(process.execPath, [path.join(__dirname,"validate-content.js")], {encoding:"utf8"});
    try {
        fs.writeFileSync(queuePath, JSON.stringify({candidates:[candidate,secondaryCandidate]}));
        let result = validate();
        assert.equal(result.status, 0, result.stdout + result.stderr);
        candidate.title = "";
        fs.writeFileSync(queuePath, JSON.stringify({candidates:[candidate]}));
        result = validate();
        assert.notEqual(result.status, 0, "the original empty-title failure must remain rejected");
        assert.match(result.stderr, /title: expected a non-empty string/);
    } finally { fs.writeFileSync(queuePath, saved); }

    const originalFetch = global.fetch;
    try {
        global.fetch = async url => {
            if(url.includes("unavailable")) throw Error("fixture unavailable");
            return {ok:true,status:200,url:url.includes("redirect")?"https://untrusted.test/feed":url,headers:{get:()=>"application/rss+xml"},text:async()=>feed};
        };
        const sources = ["good","unavailable","redirect"].map(id=>({id,officialDomains:["rbi.org.in"],refreshEndpoint:`https://www.rbi.org.in/${id}`}));
        const reports = await inspectSources(sources);
        assert.deepEqual(reports.map(r=>r.status), ["RETRIEVED_REVIEW_REQUIRED","ENDPOINT_UNAVAILABLE","BLOCKED_REDIRECT_DOMAIN_NOT_TRUSTED"]);
        const [inactive] = await inspectSources([{...sources[0],active:false}]);
        assert.equal(inactive.status,"NOT_CONFIGURED");
    } finally { global.fetch = originalFetch; }
    console.log("M23.1A parser, candidate gate, relevance, provenance and failure-isolation regressions passed.");
}
regressionTests().catch(error => { console.error(error); process.exitCode = 1; });
