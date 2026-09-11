#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const health = require("./check-operational-health.js");
const config = require("./operational-health-config.json");

const NOW = "2026-09-11T12:00:00.000Z";
const minutesAgo = minutes => new Date(Date.parse(NOW) - minutes * 60000).toISOString();

function listFilesRecursively(directory) {
    const files = [];
    fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listFilesRecursively(entryPath));
        else files.push(entryPath);
    });
    return files;
}

function fxCurrent(overrides = {}) {
    return {
        generatedAt: minutesAgo(20),
        publicationDate: "2026-09-11",
        dataStatus: "OK",
        providerUsed: "reference-open-er-api",
        historyDates: ["2026-09-09", "2026-09-10"],
        pairs: [{
            pair: "USD/INR",
            mid: 88.1,
            timestamp: minutesAgo(30),
            providerRetrievedAt: minutesAgo(30),
            providerType: "reference",
            dataStatus: "REFERENCE",
            validationStatus: "VALIDATED"
        }],
        ...overrides
    };
}

function successfulRun(name, minutes = 30) {
    return {
        name,
        status: "completed",
        conclusion: "success",
        created_at: minutesAgo(minutes),
        updated_at: minutesAgo(minutes - 1),
        html_url: `https://example.test/actions/${encodeURIComponent(name)}`
    };
}

function response(json) {
    return { ok: true, status: 200, text: JSON.stringify(json), json, observedAt: NOW };
}

function healthyFixture() {
    const current = fxCurrent();
    const weekly = { generatedAt: minutesAgo(20), summaries: [{ pair: "USD/INR", dataCompleteness: "COMPLETE", observedDays: 7 }] };
    const announcements = { lastRefreshed: minutesAgo(60), records: [{ id: "record-1", status: "GPIR_CLASSIFIED" }] };
    const sourceHealth = { generatedAt: minutesAgo(60), counts: { healthy: 40, degraded: 0, failed: 0, stale: 0 }, sources: [{ sourceId: "source-1" }] };
    return {
        checkedAt: NOW,
        fxConfig: { staleAfterMinutesByProviderType: { live: 60, reference: 1440, fallback: 4320 } },
        publicData: { fxCurrent: current, fxWeekly: weekly, announcements, sourceHealth },
        history: [
            { date: "2026-09-09", data: { publicationDate: "2026-09-09", generatedAt: "2026-09-09T10:00:00Z" } },
            { date: "2026-09-10", data: { publicationDate: "2026-09-10", generatedAt: "2026-09-10T10:00:00Z" } }
        ],
        workflowRuns: [
            successfulRun(config.workflowNames.continuousIntelligence, 60),
            successfulRun(config.workflowNames.fxData, 30),
            successfulRun(config.workflowNames.securityIntegrity, 20),
            successfulRun(config.workflowNames.pagesDeployment, 10)
        ],
        main: { sha: "a".repeat(40), committedAt: minutesAgo(15) },
        deployment: { sha: "a".repeat(40), state: "success", createdAt: minutesAgo(10), updatedAt: minutesAgo(8), logUrl: "https://example.test/deploy" },
        proposals: [],
        responses: {
            home: { ok: true, status: 200, text: "<html></html>", observedAt: NOW },
            fxCurrent: response(current),
            fxWeekly: response(weekly),
            announcements: response(announcements),
            sourceHealth: response(sourceHealth),
            sitemap: { ok: true, status: 200, text: "<urlset></urlset>", observedAt: NOW }
        },
        sources: {
            fxCurrent: "fixture:fx-current",
            fxWeekly: "fixture:fx-weekly",
            fxHistory: "fixture:history",
            sourceHealth: "fixture:source-health",
            announcements: "fixture:announcements",
            actions: "fixture:actions",
            deployments: "fixture:deployments",
            pullRequests: "fixture:pull-requests"
        }
    };
}

function component(manifest, id) {
    return manifest.components.find(item => item.id === id);
}

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

test("all healthy", () => {
    const result = health.evaluateSnapshot(healthyFixture(), config);
    assert.equal(result.overallStatus, "HEALTHY");
    assert.deepEqual(result.components.map(item => item.id), health.COMPONENT_ORDER);
});

test("FX provider outage with valid LKG is degraded", () => {
    const fixture = healthyFixture();
    fixture.publicData.fxCurrent = fxCurrent({
        dataStatus: "PROVIDER_UNAVAILABLE_SERVED_LAST_KNOWN_GOOD",
        pairs: [{ ...fxCurrent().pairs[0], providerType: "fallback", dataStatus: "STALE" }]
    });
    fixture.responses.fxCurrent = response(fixture.publicData.fxCurrent);
    assert.equal(component(health.evaluateSnapshot(fixture, config), "FX_DATA").status, "DEGRADED");
});

test("FX beyond configured threshold is stale", () => {
    const fixture = healthyFixture();
    fixture.publicData.fxCurrent = fxCurrent({ pairs: [{ ...fxCurrent().pairs[0], timestamp: minutesAgo(1500), providerRetrievedAt: minutesAgo(1500) }] });
    fixture.responses.fxCurrent = response(fixture.publicData.fxCurrent);
    assert.equal(component(health.evaluateSnapshot(fixture, config), "FX_DATA").status, "STALE");
});

test("no usable FX LKG is failed", () => {
    const fixture = healthyFixture();
    fixture.publicData.fxCurrent = fxCurrent({ pairs: [{ pair: "USD/INR", mid: null, validationStatus: "QUARANTINED" }] });
    fixture.responses.fxCurrent = response(fixture.publicData.fxCurrent);
    assert.equal(component(health.evaluateSnapshot(fixture, config), "FX_DATA").status, "FAILED");
});

test("partial source degradation is aggregated", () => {
    const fixture = healthyFixture();
    fixture.publicData.sourceHealth.counts = { healthy: 40, degraded: 3, failed: 0, stale: 0 };
    fixture.responses.sourceHealth = response(fixture.publicData.sourceHealth);
    const result = component(health.evaluateSnapshot(fixture, config), "SOURCE_HEALTH");
    assert.equal(result.status, "DEGRADED");
    assert.match(result.reason, /40 healthy, 3 degraded/);
});

test("workflow failure is failed", () => {
    const fixture = healthyFixture();
    fixture.workflowRuns[0] = { ...fixture.workflowRuns[0], conclusion: "failure" };
    assert.equal(component(health.evaluateSnapshot(fixture, config), "CONTINUOUS_INTELLIGENCE").status, "FAILED");
});

test("FX workflow failure is reflected by FX data health", () => {
    const fixture = healthyFixture();
    fixture.workflowRuns[1] = { ...fixture.workflowRuns[1], conclusion: "failure" };
    assert.equal(component(health.evaluateSnapshot(fixture, config), "FX_DATA").status, "FAILED");
});

test("action_required is pending review", () => {
    const fixture = healthyFixture();
    fixture.workflowRuns[2] = { ...fixture.workflowRuns[2], conclusion: "action_required" };
    assert.equal(component(health.evaluateSnapshot(fixture, config), "SECURITY_INTEGRITY").status, "PENDING_REVIEW");
});

test("newer valid automation PR is pending review", () => {
    const fixture = healthyFixture();
    fixture.proposals.push({
        branch: config.proposalBranches.intelligence,
        open: true,
        isNewer: true,
        publicTimestamp: minutesAgo(180),
        proposalTimestamp: minutesAgo(30),
        announcementPublicTimestamp: minutesAgo(180),
        announcementProposalTimestamp: minutesAgo(30),
        announcementIsNewer: true,
        pendingSince: minutesAgo(35),
        checkConclusion: "success",
        url: "https://example.test/pr/1"
    });
    const result = health.evaluateSnapshot(fixture, config);
    assert.equal(component(result, "PENDING_REVIEW").status, "PENDING_REVIEW");
    assert.equal(component(result, "SOURCE_HEALTH").status, "PENDING_REVIEW");
    assert.equal(component(result, "ANNOUNCEMENTS").status, "PENDING_REVIEW");
});

test("Pages deployment failure is failed", () => {
    const fixture = healthyFixture();
    fixture.deployment.state = "failure";
    assert.equal(component(health.evaluateSnapshot(fixture, config), "PAGES_DEPLOYMENT").status, "FAILED");
});

test("malformed critical JSON is failed", () => {
    const fixture = healthyFixture();
    fixture.responses.announcements = { ok: true, status: 200, parseError: "bad JSON", observedAt: NOW };
    assert.equal(component(health.evaluateSnapshot(fixture, config), "CRITICAL_JSON").status, "FAILED");
});

test("HTTP failure is detected", () => {
    const fixture = healthyFixture();
    fixture.responses.home = { ok: false, status: 503, text: "", observedAt: NOW };
    assert.equal(component(health.evaluateSnapshot(fixture, config), "LIVE_SITE").status, "FAILED");
});

test("deployment SHA lag beyond grace is stale", () => {
    const fixture = healthyFixture();
    fixture.main = { sha: "b".repeat(40), committedAt: minutesAgo(90) };
    assert.equal(component(health.evaluateSnapshot(fixture, config), "PAGES_DEPLOYMENT").status, "STALE");
});

test("historical continuity gap is detected without backfill", () => {
    const fixture = healthyFixture();
    fixture.history = fixture.history.slice(0, 1);
    const result = component(health.evaluateSnapshot(fixture, config), "FX_HISTORY");
    assert.equal(result.status, "DEGRADED");
    assert.match(result.reason, /2026-09-10/);
});

test("monitor failure cannot mutate production", async () => {
    const repositoryRoot = path.join(__dirname, "..");
    const repositoryFiles = [
        ...listFilesRecursively(path.join(repositoryRoot, "assets", "data")),
        path.join(repositoryRoot, ".github", "workflows", "fx-market-data.yml"),
        path.join(repositoryRoot, ".github", "workflows", "continuous-intelligence.yml"),
        path.join(repositoryRoot, ".github", "workflows", "security-integrity.yml"),
        path.join(repositoryRoot, "index.html"),
        path.join(repositoryRoot, "sitemap.xml"),
        path.join(repositoryRoot, "CNAME")
    ];
    const before = repositoryFiles.map(file => fs.readFileSync(file));
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gpir-health-test-"));
    const output = path.join(temporaryRoot, "system-health.json");
    await assert.rejects(
        health.main(["--output", output], { collectObservations: async () => { throw new Error("fixture monitor failure"); } }),
        /fixture monitor failure/
    );
    assert.equal(fs.existsSync(output), false);
    repositoryFiles.forEach((file, index) => assert.equal(Buffer.compare(before[index], fs.readFileSync(file)), 0));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "operational-health.yml"), "utf8");
    assert.doesNotMatch(workflow, /contents:\s*write|pull-requests:\s*write|issues:\s*write/);
    assert.doesNotMatch(workflow, /generate-fx-snapshot|generate-intelligence-pages|git\s+(push|commit)|gh\s+pr/);
    const observer = fs.readFileSync(path.join(__dirname, "check-operational-health.js"), "utf8");
    assert.doesNotMatch(observer, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    assert.doesNotMatch(observer, /require\(["']child_process["']\)|execSync\(|spawnSync\(/);
    await assert.rejects(
        health.main(["--output", path.join(__dirname, "forbidden-system-health.json")], { collectObservations: async () => healthyFixture() }),
        /outside the repository checkout/
    );
    assert.equal(fs.existsSync(path.join(__dirname, "forbidden-system-health.json")), false);
});

(async () => {
    for (const entry of tests) {
        await entry.fn();
        console.log(`PASS ${entry.name}`);
    }
    console.log(`GPIR operational health tests passed: ${tests.length} scenarios.`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
