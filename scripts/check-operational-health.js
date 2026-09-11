#!/usr/bin/env node

/*
 * GPIR M32-B1 preservation-first operational observer.
 *
 * This script reads repository, GitHub and deployed-site state. It never runs
 * a producer, writes repository content, calls a mutating API, creates a PR or
 * repairs production. Its only writes are the caller-selected runtime manifest
 * and summary paths (normally $RUNNER_TEMP in GitHub Actions).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG_PATH = path.join(__dirname, "operational-health-config.json");
const STATUS_PRIORITY = Object.freeze({
    HEALTHY: 0,
    PENDING_REVIEW: 1,
    DEGRADED: 2,
    STALE: 3,
    FAILED: 4
});
const COMPONENT_ORDER = [
    "FX_DATA",
    "FX_HISTORY",
    "FX_WEEKLY",
    "CONTINUOUS_INTELLIGENCE",
    "SOURCE_HEALTH",
    "ANNOUNCEMENTS",
    "SECURITY_INTEGRITY",
    "PAGES_DEPLOYMENT",
    "LIVE_SITE",
    "CRITICAL_JSON",
    "PENDING_REVIEW"
];

function parseArgs(argv) {
    const values = {};
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (!value.startsWith("--")) continue;
        const [rawName, inlineValue] = value.slice(2).split("=", 2);
        values[rawName] = inlineValue !== undefined ? inlineValue : argv[index + 1];
        if (inlineValue === undefined) index += 1;
    }
    return values;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value) {
    const date = validDate(value);
    return date ? date.toISOString() : null;
}

function ageMinutes(now, value) {
    const date = validDate(value);
    if (!date) return null;
    return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function makeComponent(id, status, options = {}) {
    if (!Object.hasOwn(STATUS_PRIORITY, status)) throw new Error(`Unsupported health status: ${status}`);
    return {
        id,
        status,
        observedAt: iso(options.observedAt),
        ageMinutes: options.ageMinutes === undefined ? null : options.ageMinutes,
        maxAgeMinutes: options.maxAgeMinutes === undefined ? null : options.maxAgeMinutes,
        lastSuccessAt: iso(options.lastSuccessAt),
        reason: options.reason || "Within expected operating state.",
        source: options.source || null,
        pendingReview: options.pendingReview === true,
        pendingSince: iso(options.pendingSince),
        publicTimestamp: iso(options.publicTimestamp),
        proposalTimestamp: iso(options.proposalTimestamp)
    };
}

function worstStatus(statuses) {
    return statuses.reduce((worst, status) => STATUS_PRIORITY[status] > STATUS_PRIORITY[worst] ? status : worst, "HEALTHY");
}

function combineComponents(id, parts, healthyReason) {
    const status = worstStatus(parts.map(part => part.status));
    const material = parts.filter(part => part.status === status && status !== "HEALTHY");
    const basis = material[0] || parts[0];
    return makeComponent(id, status, {
        observedAt: basis.observedAt,
        ageMinutes: basis.ageMinutes,
        maxAgeMinutes: basis.maxAgeMinutes,
        lastSuccessAt: newestTimestamp(parts.map(part => part.lastSuccessAt)),
        reason: material.length ? material.map(part => part.reason).join(" ") : healthyReason,
        source: parts.map(part => part.source).filter(Boolean).join("; "),
        pendingReview: parts.some(part => part.pendingReview),
        pendingSince: oldestTimestamp(parts.map(part => part.pendingSince)),
        publicTimestamp: basis.publicTimestamp,
        proposalTimestamp: basis.proposalTimestamp
    });
}

function newestTimestamp(values) {
    return values.map(validDate).filter(Boolean).sort((left, right) => right - left)[0] || null;
}

function oldestTimestamp(values) {
    return values.map(validDate).filter(Boolean).sort((left, right) => left - right)[0] || null;
}

function numericRate(record) {
    return [record.mid, record.last, record.spot, record.bid, record.ask].some(Number.isFinite);
}

function fxThreshold(current, fxConfig) {
    const usable = Array.isArray(current && current.pairs)
        ? current.pairs.filter(record => record && record.validationStatus === "VALIDATED" && numericRate(record))
        : [];
    const providerType = current && current.dataStatus === "PROVIDER_UNAVAILABLE_SERVED_LAST_KNOWN_GOOD"
        ? "fallback"
        : (usable[0] && usable[0].providerType) || "fallback";
    const thresholds = fxConfig && fxConfig.staleAfterMinutesByProviderType || {};
    return Number(thresholds[providerType]) || Number(thresholds.fallback) || null;
}

function evaluateFxData(input) {
    const { current, fxConfig, now, source } = input;
    if (!current || !Array.isArray(current.pairs)) {
        return makeComponent("FX_DATA", "FAILED", { reason: "FX current snapshot is unavailable or malformed.", source });
    }
    const usable = current.pairs.filter(record => record && record.validationStatus === "VALIDATED" && numericRate(record));
    const observedAt = oldestTimestamp(usable.map(record => record.providerRetrievedAt || record.timestamp || record.gpirRetrievedAt))
        || validDate(current.generatedAt);
    const maxAgeMinutes = fxThreshold(current, fxConfig);
    const age = ageMinutes(now, observedAt);
    const quarantinedCount = current.pairs.filter(record => record && record.validationStatus === "QUARANTINED").length;
    if (!usable.length) {
        return makeComponent("FX_DATA", "FAILED", {
            observedAt: current.generatedAt,
            ageMinutes: age,
            maxAgeMinutes,
            reason: "No usable validated FX observation remains.",
            source
        });
    }
    if (maxAgeMinutes !== null && age !== null && age > maxAgeMinutes) {
        return makeComponent("FX_DATA", "STALE", {
            observedAt,
            ageMinutes: age,
            maxAgeMinutes,
            lastSuccessAt: current.generatedAt,
            reason: `Validated FX observations exceed the configured ${maxAgeMinutes}-minute ${usable[0].providerType || "fallback"} threshold.`,
            source
        });
    }
    if (current.dataStatus === "PROVIDER_UNAVAILABLE_SERVED_LAST_KNOWN_GOOD" || usable.some(record => record.dataStatus === "STALE")) {
        return makeComponent("FX_DATA", "DEGRADED", {
            observedAt,
            ageMinutes: age,
            maxAgeMinutes,
            lastSuccessAt: current.generatedAt,
            reason: "Provider acquisition failed; usable last-known-good FX is preserved and explicitly marked stale.",
            source
        });
    }
    if (quarantinedCount) {
        return makeComponent("FX_DATA", "DEGRADED", {
            observedAt,
            ageMinutes: age,
            maxAgeMinutes,
            lastSuccessAt: current.generatedAt,
            reason: `${quarantinedCount} FX observation(s) are quarantined while validated observations remain available.`,
            source
        });
    }
    return makeComponent("FX_DATA", "HEALTHY", {
        observedAt,
        ageMinutes: age,
        maxAgeMinutes,
        lastSuccessAt: current.generatedAt,
        reason: `${usable.length} validated FX observation(s); provider ${current.providerUsed || "not recorded"}.`,
        source
    });
}

function evaluateFxHistory(input) {
    const { expectedDates = [], history = [], source } = input;
    const byDate = new Map(history.map(item => [item.date, item]));
    const missing = expectedDates.filter(date => !byDate.has(date));
    const malformed = history.filter(item => !item.data || item.error || item.data.publicationDate !== item.date);
    if (malformed.length) {
        return makeComponent("FX_HISTORY", "FAILED", {
            observedAt: newestTimestamp(history.map(item => item.data && item.data.generatedAt || item.date)),
            reason: `${malformed.length} historical snapshot(s) are malformed or conflict with their immutable date path.`,
            source
        });
    }
    if (missing.length) {
        return makeComponent("FX_HISTORY", "DEGRADED", {
            observedAt: newestTimestamp(history.map(item => item.data && item.data.generatedAt || item.date)),
            reason: `Current FX references ${missing.length} missing historical snapshot(s): ${missing.join(", ")}. No backfill was attempted.`,
            source
        });
    }
    return makeComponent("FX_HISTORY", "HEALTHY", {
        observedAt: newestTimestamp(history.map(item => item.data && item.data.generatedAt || item.date)),
        reason: `${history.length} immutable historical snapshot(s) are internally continuous with current history references.`,
        source
    });
}

function evaluateFxWeekly(input) {
    const { weekly, current, fxConfig, now, source } = input;
    if (!weekly || !Array.isArray(weekly.summaries)) {
        return makeComponent("FX_WEEKLY", "FAILED", { reason: "FX weekly summary is unavailable or malformed.", source });
    }
    const maxAgeMinutes = fxThreshold(current, fxConfig);
    const age = ageMinutes(now, weekly.generatedAt);
    if (maxAgeMinutes !== null && age !== null && age > maxAgeMinutes) {
        return makeComponent("FX_WEEKLY", "STALE", {
            observedAt: weekly.generatedAt,
            ageMinutes: age,
            maxAgeMinutes,
            reason: "FX weekly accumulation is older than the applicable FX freshness threshold.",
            source
        });
    }
    const partial = weekly.summaries.filter(summary => summary.dataCompleteness && summary.dataCompleteness !== "COMPLETE");
    if (partial.length) {
        return makeComponent("FX_WEEKLY", "DEGRADED", {
            observedAt: weekly.generatedAt,
            ageMinutes: age,
            maxAgeMinutes,
            lastSuccessAt: weekly.generatedAt,
            reason: `${partial.length} of ${weekly.summaries.length} weekly series are still accumulating observations.`,
            source
        });
    }
    return makeComponent("FX_WEEKLY", "HEALTHY", {
        observedAt: weekly.generatedAt,
        ageMinutes: age,
        maxAgeMinutes,
        lastSuccessAt: weekly.generatedAt,
        reason: `${weekly.summaries.length} weekly series are available.`,
        source
    });
}

function evaluateWorkflow(id, run, now, maxAgeMinutes, graceMinutes, source) {
    if (!run) return makeComponent(id, "FAILED", { reason: "No workflow run metadata is available.", source });
    const observedAt = run.run_started_at || run.created_at;
    const age = ageMinutes(now, observedAt);
    if (run.conclusion === "action_required") {
        return makeComponent(id, "PENDING_REVIEW", {
            observedAt,
            ageMinutes: age,
            reason: "Workflow execution requires intended human approval.",
            source: run.html_url || source,
            pendingReview: true,
            pendingSince: observedAt
        });
    }
    if (["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status)) {
        const prolonged = age !== null && age > graceMinutes;
        return makeComponent(id, prolonged ? "STALE" : "HEALTHY", {
            observedAt,
            ageMinutes: age,
            maxAgeMinutes: graceMinutes,
            reason: prolonged ? `Workflow has remained ${run.status} beyond its grace period.` : `Workflow is ${run.status}.`,
            source: run.html_url || source
        });
    }
    if (run.conclusion !== "success") {
        return makeComponent(id, "FAILED", {
            observedAt,
            ageMinutes: age,
            reason: `Latest workflow conclusion is ${run.conclusion || run.status || "unknown"}.`,
            source: run.html_url || source
        });
    }
    if (maxAgeMinutes !== null && age !== null && age > maxAgeMinutes) {
        return makeComponent(id, "STALE", {
            observedAt,
            ageMinutes: age,
            maxAgeMinutes,
            lastSuccessAt: run.updated_at || observedAt,
            reason: `Latest successful run is older than ${maxAgeMinutes} minutes.`,
            source: run.html_url || source
        });
    }
    return makeComponent(id, "HEALTHY", {
        observedAt,
        ageMinutes: age,
        maxAgeMinutes,
        lastSuccessAt: run.updated_at || observedAt,
        reason: "Latest workflow run completed successfully.",
        source: run.html_url || source
    });
}

function evaluateSourceHealth(input) {
    const { data, now, maxAgeMinutes, pendingReviewMaxAgeMinutes, pending, source } = input;
    if (!data || !Array.isArray(data.sources) || !data.counts) {
        return makeComponent("SOURCE_HEALTH", "FAILED", { reason: "Source-health snapshot is unavailable or malformed.", source });
    }
    const age = ageMinutes(now, data.generatedAt);
    const healthy = Number(data.counts.healthy) || 0;
    const degraded = (Number(data.counts.degraded) || 0) + (Number(data.counts.failed) || 0) + (Number(data.counts.stale) || 0);
    if (degraded) {
        return makeComponent("SOURCE_HEALTH", "DEGRADED", {
            observedAt: data.generatedAt,
            ageMinutes: age,
            maxAgeMinutes,
            lastSuccessAt: data.generatedAt,
            reason: `Aggregated active-source state: ${healthy} healthy, ${degraded} degraded/failed/stale; existing intelligence remains preserved.`,
            source
        });
    }
    if (pending && pending.isNewer) {
        const pendingAge = ageMinutes(now, pending.pendingSince || pending.proposalTimestamp);
        if (pendingAge !== null && pendingAge <= pendingReviewMaxAgeMinutes) {
            return makeComponent("SOURCE_HEALTH", "PENDING_REVIEW", {
                observedAt: data.generatedAt,
                ageMinutes: age,
                maxAgeMinutes,
                lastSuccessAt: data.generatedAt,
                reason: `A newer source-health snapshot awaits review (${pending.publicTimestamp} → ${pending.proposalTimestamp}).`,
                source,
                pendingReview: true,
                pendingSince: pending.pendingSince || pending.proposalTimestamp,
                publicTimestamp: pending.publicTimestamp,
                proposalTimestamp: pending.proposalTimestamp
            });
        }
    }
    if (age !== null && age > maxAgeMinutes) {
        return makeComponent("SOURCE_HEALTH", "STALE", {
            observedAt: data.generatedAt,
            ageMinutes: age,
            maxAgeMinutes,
            lastSuccessAt: data.generatedAt,
            reason: "Public source-health snapshot exceeds its conservative review-aware freshness threshold.",
            source
        });
    }
    return makeComponent("SOURCE_HEALTH", "HEALTHY", {
        observedAt: data.generatedAt,
        ageMinutes: age,
        maxAgeMinutes,
        lastSuccessAt: data.generatedAt,
        reason: `Aggregated source state reports ${healthy} healthy source(s).`,
        source
    });
}

function evaluateAnnouncements(input) {
    const { data, pending, source } = input;
    if (!data || !Array.isArray(data.records) || !data.records.length) {
        return makeComponent("ANNOUNCEMENTS", "FAILED", { reason: "Published announcement corpus is unavailable, malformed or empty.", source });
    }
    if (pending && pending.announcementIsNewer) {
        return makeComponent("ANNOUNCEMENTS", "PENDING_REVIEW", {
            observedAt: data.lastRefreshed,
            lastSuccessAt: data.lastRefreshed,
            reason: `A newer automation proposal awaits human review; zero new records is not treated as unhealthy.`,
            source,
            pendingReview: true,
            pendingSince: pending.pendingSince || pending.announcementProposalTimestamp,
            publicTimestamp: pending.announcementPublicTimestamp,
            proposalTimestamp: pending.announcementProposalTimestamp
        });
    }
    return makeComponent("ANNOUNCEMENTS", "HEALTHY", {
        observedAt: data.lastRefreshed,
        lastSuccessAt: data.lastRefreshed,
        reason: `${data.records.length} retained announcement record(s) parse successfully; zero LIVE records is allowed.`,
        source
    });
}

function evaluatePages(input) {
    const { run, deployment, main, now, lagMinutes, source } = input;
    const runHealth = evaluateWorkflow("PAGES_DEPLOYMENT", run, now, null, lagMinutes, source);
    if (runHealth.status === "FAILED" || runHealth.status === "PENDING_REVIEW") return runHealth;
    if (!deployment || deployment.state !== "success") {
        return makeComponent("PAGES_DEPLOYMENT", "FAILED", {
            observedAt: deployment && (deployment.updatedAt || deployment.createdAt),
            reason: `Latest Pages deployment state is ${deployment && deployment.state || "unavailable"}.`,
            source: deployment && deployment.logUrl || source
        });
    }
    const lagAge = ageMinutes(now, main && main.committedAt);
    if (!main || !main.sha || !deployment.sha) {
        return makeComponent("PAGES_DEPLOYMENT", "FAILED", { reason: "Main/deployment SHA reconciliation evidence is incomplete.", source });
    }
    if (main.sha !== deployment.sha) {
        return makeComponent("PAGES_DEPLOYMENT", lagAge !== null && lagAge > lagMinutes ? "STALE" : "DEGRADED", {
            observedAt: deployment.updatedAt || deployment.createdAt,
            ageMinutes: lagAge,
            maxAgeMinutes: lagMinutes,
            lastSuccessAt: deployment.updatedAt,
            reason: `Deployment SHA ${deployment.sha.slice(0, 12)} does not match main ${main.sha.slice(0, 12)}.`,
            source: deployment.logUrl || source
        });
    }
    return makeComponent("PAGES_DEPLOYMENT", "HEALTHY", {
        observedAt: deployment.updatedAt || deployment.createdAt,
        ageMinutes: ageMinutes(now, deployment.updatedAt || deployment.createdAt),
        lastSuccessAt: deployment.updatedAt,
        reason: `Latest successful deployment matches main at ${main.sha.slice(0, 12)}.`,
        source: deployment.logUrl || source
    });
}

function evaluateLiveSite(responses, source) {
    const entries = Object.entries(responses || {});
    const home = responses && responses.home;
    if (!home || !home.ok) {
        return makeComponent("LIVE_SITE", "FAILED", { reason: `Homepage HTTP probe failed${home ? ` (${home.status})` : ""}.`, source });
    }
    const failed = entries.filter(([, response]) => !response || !response.ok);
    const sitemap = responses.sitemap;
    const sitemapMalformed = sitemap && sitemap.ok && !/<urlset\b/i.test(String(sitemap.text || ""));
    if (failed.length || sitemapMalformed) {
        return makeComponent("LIVE_SITE", "DEGRADED", {
            observedAt: home.observedAt,
            lastSuccessAt: home.observedAt,
            reason: `${failed.length} critical asset HTTP probe(s) failed${sitemapMalformed ? "; sitemap marker is missing" : ""}.`,
            source
        });
    }
    return makeComponent("LIVE_SITE", "HEALTHY", {
        observedAt: home.observedAt,
        lastSuccessAt: home.observedAt,
        reason: `${entries.length} production HTTP probe(s) succeeded with required sitemap marker.`,
        source
    });
}

function jsonShapeValid(key, value) {
    if (key === "fxCurrent") return value && Array.isArray(value.pairs);
    if (key === "fxWeekly") return value && Array.isArray(value.summaries);
    if (key === "announcements") return value && Array.isArray(value.records);
    if (key === "sourceHealth") return value && Array.isArray(value.sources) && value.counts;
    return true;
}

function evaluateCriticalJson(responses, source) {
    const keys = ["fxCurrent", "fxWeekly", "announcements", "sourceHealth"];
    const failed = keys.filter(key => {
        const response = responses && responses[key];
        return !response || !response.ok || response.parseError || !jsonShapeValid(key, response.json);
    });
    if (failed.length) {
        return makeComponent("CRITICAL_JSON", "FAILED", {
            reason: `Critical JSON unavailable, malformed or structurally invalid: ${failed.join(", ")}.`,
            source
        });
    }
    return makeComponent("CRITICAL_JSON", "HEALTHY", {
        observedAt: newestTimestamp(keys.map(key => responses[key].observedAt)),
        lastSuccessAt: newestTimestamp(keys.map(key => responses[key].observedAt)),
        reason: "All four critical public JSON assets parse and contain their minimum structural markers.",
        source
    });
}

function evaluatePendingReview(proposals, now, maxAgeMinutes, source) {
    const active = (proposals || []).filter(proposal => proposal.open && (proposal.isNewer || proposal.actionRequired));
    if (!active.length) return makeComponent("PENDING_REVIEW", "HEALTHY", { reason: "No newer automation output is awaiting review.", source });
    const failed = active.find(proposal => ["failure", "cancelled", "timed_out"].includes(proposal.checkConclusion));
    if (failed) {
        return makeComponent("PENDING_REVIEW", "FAILED", {
            observedAt: failed.proposalTimestamp,
            reason: `${failed.branch} has a failed review check and is not a validated pending proposal.`,
            source: failed.url || source
        });
    }
    const pendingSince = oldestTimestamp(active.map(proposal => proposal.pendingSince || proposal.proposalTimestamp));
    const age = ageMinutes(now, pendingSince);
    const details = active.map(proposal => {
        const times = proposal.publicTimestamp && proposal.proposalTimestamp
            ? ` public ${proposal.publicTimestamp}, proposal ${proposal.proposalTimestamp}`
            : "";
        return `${proposal.branch}${times}`;
    }).join("; ");
    return makeComponent("PENDING_REVIEW", age !== null && age > maxAgeMinutes ? "STALE" : "PENDING_REVIEW", {
        observedAt: newestTimestamp(active.map(proposal => proposal.proposalTimestamp)),
        ageMinutes: age,
        maxAgeMinutes,
        reason: `${active.length} automation proposal(s) await human governance: ${details}.`,
        source: active[0].url || source,
        pendingReview: true,
        pendingSince,
        publicTimestamp: active[0].publicTimestamp,
        proposalTimestamp: active[0].proposalTimestamp
    });
}

function findRun(runs, name) {
    return (runs || []).filter(run => run.name === name).sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))[0] || null;
}

function proposalState(proposals, branch) {
    return (proposals || []).find(proposal => proposal.branch === branch) || null;
}

function evaluateSnapshot(observations, config) {
    const now = validDate(observations.checkedAt) || new Date();
    const thresholds = config.thresholds;
    const intelligencePending = proposalState(observations.proposals, config.proposalBranches.intelligence);
    const fxData = evaluateFxData({ current: observations.publicData.fxCurrent, fxConfig: observations.fxConfig, now, source: observations.sources.fxCurrent });
    const fxWorkflow = evaluateWorkflow("FX_DATA", findRun(observations.workflowRuns, config.workflowNames.fxData), now, thresholds.fxWorkflowMaxAgeMinutes, thresholds.workflowInProgressGraceMinutes, observations.sources.actions);
    const components = [
        combineComponents("FX_DATA", [fxData, fxWorkflow], "FX observations and the latest FX workflow run are within their configured thresholds."),
        evaluateFxHistory({ expectedDates: observations.publicData.fxCurrent && observations.publicData.fxCurrent.historyDates || [], history: observations.history, source: observations.sources.fxHistory }),
        evaluateFxWeekly({ weekly: observations.publicData.fxWeekly, current: observations.publicData.fxCurrent, fxConfig: observations.fxConfig, now, source: observations.sources.fxWeekly }),
        evaluateWorkflow("CONTINUOUS_INTELLIGENCE", findRun(observations.workflowRuns, config.workflowNames.continuousIntelligence), now, thresholds.continuousWorkflowMaxAgeMinutes, thresholds.workflowInProgressGraceMinutes, observations.sources.actions),
        evaluateSourceHealth({ data: observations.publicData.sourceHealth, now, maxAgeMinutes: thresholds.sourceHealthMaxAgeMinutes, pendingReviewMaxAgeMinutes: thresholds.pendingReviewMaxAgeMinutes, pending: intelligencePending, source: observations.sources.sourceHealth }),
        evaluateAnnouncements({ data: observations.publicData.announcements, pending: intelligencePending, source: observations.sources.announcements }),
        evaluateWorkflow("SECURITY_INTEGRITY", findRun(observations.workflowRuns, config.workflowNames.securityIntegrity), now, null, thresholds.workflowInProgressGraceMinutes, observations.sources.actions),
        evaluatePages({ run: findRun(observations.workflowRuns, config.workflowNames.pagesDeployment), deployment: observations.deployment, main: observations.main, now, lagMinutes: thresholds.deploymentLagMinutes, source: observations.sources.deployments }),
        evaluateLiveSite(observations.responses, config.siteOrigin),
        evaluateCriticalJson(observations.responses, config.siteOrigin),
        evaluatePendingReview(observations.proposals, now, thresholds.pendingReviewMaxAgeMinutes, observations.sources.pullRequests)
    ];
    const ordered = COMPONENT_ORDER.map(id => components.find(component => component.id === id));
    return {
        checkedAt: now.toISOString(),
        overallStatus: worstStatus(ordered.map(component => component.status)),
        mainSha: observations.main && observations.main.sha || null,
        deploymentSha: observations.deployment && observations.deployment.sha || null,
        components: ordered
    };
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        method: "GET",
        headers: options.headers || {},
        signal: AbortSignal.timeout(options.timeoutMs || 15000)
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, headers: response.headers };
}

function githubHeaders(token) {
    const headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "FINTECHOISIS-GPIR-Health-Watch/1.0",
        "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function githubJson(apiBase, repository, endpoint, token, timeoutMs) {
    const response = await request(`${apiBase}/repos/${repository}${endpoint}`, { headers: githubHeaders(token), timeoutMs });
    if (!response.ok) throw new Error(`GitHub API ${endpoint} returned HTTP ${response.status}`);
    return JSON.parse(response.text);
}

async function publicProbe(config, requestImpl = request) {
    const responses = {};
    await Promise.all(Object.entries(config.publicAssets).map(async ([key, relativePath]) => {
        const url = new URL(relativePath, config.siteOrigin).href;
        try {
            const response = await requestImpl(url, { timeoutMs: config.thresholds.liveRequestTimeoutMs });
            const observedAt = new Date().toISOString();
            const result = { ...response, observedAt };
            if (["fxCurrent", "fxWeekly", "announcements", "sourceHealth"].includes(key) && response.ok) {
                try {
                    result.json = JSON.parse(response.text);
                } catch (error) {
                    result.parseError = error.message;
                }
            }
            responses[key] = result;
        } catch (error) {
            responses[key] = { ok: false, status: null, text: "", error: error.message, observedAt: new Date().toISOString() };
        }
    }));
    return responses;
}

function loadHistory(root, current) {
    const historyRoot = path.join(root, "assets", "data", "fx", "history");
    if (!fs.existsSync(historyRoot)) return [];
    const records = [];
    const visit = directory => {
        fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) return visit(entryPath);
            if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) return;
            const date = entry.name.slice(0, 10);
            try {
                records.push({ date, path: path.relative(root, entryPath).replace(/\\/g, "/"), data: readJson(entryPath) });
            } catch (error) {
                records.push({ date, path: path.relative(root, entryPath).replace(/\\/g, "/"), data: null, error: error.message });
            }
        });
    };
    visit(historyRoot);
    const expected = new Set(current && current.historyDates || []);
    return records.filter(record => expected.has(record.date) || !expected.size).sort((left, right) => left.date.localeCompare(right.date));
}

function timestampForProposal(branch, data) {
    if (branch.includes("fx")) return data && data.generatedAt || null;
    return data && (data.generatedAt || data.lastRefreshed) || null;
}

async function proposalFile(apiBase, repository, branch, filePath, token, timeoutMs) {
    try {
        const item = await githubJson(apiBase, repository, `/contents/${filePath}?ref=${encodeURIComponent(branch)}`, token, timeoutMs);
        return JSON.parse(Buffer.from(item.content, "base64").toString("utf8"));
    } catch {
        return null;
    }
}

async function collectGithub(config, publicData, environment = process.env) {
    const repository = environment.GITHUB_REPOSITORY;
    const token = environment.GH_TOKEN || environment.GITHUB_TOKEN;
    const apiBase = environment.GITHUB_API_URL || "https://api.github.com";
    const timeoutMs = config.thresholds.liveRequestTimeoutMs;
    if (!repository) throw new Error("GITHUB_REPOSITORY is required for read-only GitHub health inspection.");
    const [runsData, pullRequests, mainCommit, deployments] = await Promise.all([
        githubJson(apiBase, repository, "/actions/runs?per_page=100", token, timeoutMs),
        githubJson(apiBase, repository, "/pulls?state=open&per_page=100", token, timeoutMs),
        githubJson(apiBase, repository, `/commits/${encodeURIComponent(config.mainBranch)}`, token, timeoutMs),
        githubJson(apiBase, repository, "/deployments?environment=github-pages&per_page=20", token, timeoutMs)
    ]);
    let latestDeployment = null;
    let successfulDeployment = null;
    for (const candidate of deployments) {
        const statuses = await githubJson(apiBase, repository, `/deployments/${candidate.id}/statuses?per_page=10`, token, timeoutMs);
        const latest = statuses[0];
        const record = {
            sha: candidate.sha,
            state: latest && latest.state || "unknown",
            createdAt: candidate.created_at,
            updatedAt: latest && latest.updated_at || candidate.updated_at,
            logUrl: latest && latest.log_url || null
        };
        if (!latestDeployment || String(record.createdAt) > String(latestDeployment.createdAt)) latestDeployment = record;
        if (record.state === "success" && (!successfulDeployment || String(record.createdAt) > String(successfulDeployment.createdAt))) successfulDeployment = record;
    }
    const openAutomation = pullRequests.filter(pr => Object.values(config.proposalBranches).includes(pr.head && pr.head.ref));
    const proposals = [];
    for (const pr of openAutomation) {
        const branch = pr.head.ref;
        const isFx = branch === config.proposalBranches.fx;
        const proposalPath = isFx ? "assets/data/fx/current.json" : "assets/data/source-health.json";
        const publicValue = isFx ? publicData.fxCurrent : publicData.sourceHealth;
        const proposalValue = await proposalFile(apiBase, repository, branch, proposalPath, token, timeoutMs);
        const announcementProposal = isFx ? null : await proposalFile(apiBase, repository, branch, "assets/data/announcements.json", token, timeoutMs);
        const branchRuns = runsData.workflow_runs.filter(run => run.head_branch === branch).sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
        const checkRun = branchRuns.find(run => run.name === config.workflowNames.securityIntegrity) || branchRuns[0];
        const publicTimestamp = timestampForProposal(branch, publicValue);
        const proposalTimestamp = timestampForProposal(branch, proposalValue);
        const announcementPublicTimestamp = publicData.announcements && publicData.announcements.lastRefreshed || null;
        const announcementProposalTimestamp = announcementProposal && announcementProposal.lastRefreshed || null;
        proposals.push({
            branch,
            open: true,
            url: pr.html_url,
            publicTimestamp,
            proposalTimestamp,
            isNewer: Boolean(validDate(proposalTimestamp) && (!validDate(publicTimestamp) || validDate(proposalTimestamp) > validDate(publicTimestamp))),
            announcementPublicTimestamp,
            announcementProposalTimestamp,
            announcementIsNewer: Boolean(validDate(announcementProposalTimestamp) && (!validDate(announcementPublicTimestamp) || validDate(announcementProposalTimestamp) > validDate(announcementPublicTimestamp))),
            pendingSince: pr.created_at,
            actionRequired: checkRun && checkRun.conclusion === "action_required",
            checkConclusion: checkRun && checkRun.conclusion || null
        });
    }
    return {
        workflowRuns: runsData.workflow_runs,
        proposals,
        main: { sha: mainCommit.sha, committedAt: mainCommit.commit && mainCommit.commit.committer && mainCommit.commit.committer.date },
        deployment: successfulDeployment || latestDeployment
    };
}

function buildSummary(manifest) {
    const labels = {
        FX_DATA: "FX DATA",
        FX_HISTORY: "FX HISTORY",
        FX_WEEKLY: "FX WEEKLY",
        CONTINUOUS_INTELLIGENCE: "INTELLIGENCE",
        SOURCE_HEALTH: "SOURCE HEALTH",
        ANNOUNCEMENTS: "ANNOUNCEMENTS",
        SECURITY_INTEGRITY: "SECURITY",
        PAGES_DEPLOYMENT: "PAGES",
        LIVE_SITE: "LIVE SITE",
        CRITICAL_JSON: "CRITICAL JSON",
        PENDING_REVIEW: "PENDING REVIEW"
    };
    const lines = [
        "## GPIR OPERATIONAL HEALTH",
        "",
        `Checked: ${manifest.checkedAt}`,
        "",
        `Overall: **${manifest.overallStatus}**`,
        "",
        "| Component | Status |",
        "|---|---|",
        ...manifest.components.map(component => `| ${labels[component.id]} | ${component.status} |`),
        ""
    ];
    const nonHealthy = manifest.components.filter(component => component.status !== "HEALTHY");
    if (nonHealthy.length) {
        lines.push("### Non-healthy reasons", "");
        nonHealthy.forEach(component => lines.push(`- ${labels[component.id]}: ${component.reason}`));
        lines.push("");
    }
    lines.push("No production changes performed.", "");
    return lines.join("\n");
}

async function collectObservations(config, dependencies = {}) {
    const probe = dependencies.publicProbe || publicProbe;
    const github = dependencies.collectGithub || collectGithub;
    const responses = await probe(config);
    const publicData = {
        fxCurrent: responses.fxCurrent && responses.fxCurrent.json || null,
        fxWeekly: responses.fxWeekly && responses.fxWeekly.json || null,
        announcements: responses.announcements && responses.announcements.json || null,
        sourceHealth: responses.sourceHealth && responses.sourceHealth.json || null
    };
    const githubState = await github(config, publicData);
    const fxConfig = readJson(path.join(ROOT, "assets", "data", "fx", "fx-config.json"));
    return {
        checkedAt: new Date().toISOString(),
        responses,
        publicData,
        fxConfig,
        history: loadHistory(ROOT, publicData.fxCurrent),
        ...githubState,
        sources: {
            fxCurrent: new URL(config.publicAssets.fxCurrent, config.siteOrigin).href,
            fxWeekly: new URL(config.publicAssets.fxWeekly, config.siteOrigin).href,
            fxHistory: "repository:assets/data/fx/history",
            sourceHealth: new URL(config.publicAssets.sourceHealth, config.siteOrigin).href,
            announcements: new URL(config.publicAssets.announcements, config.siteOrigin).href,
            actions: `https://github.com/${process.env.GITHUB_REPOSITORY || "repository"}/actions`,
            deployments: `https://github.com/${process.env.GITHUB_REPOSITORY || "repository"}/deployments`,
            pullRequests: `https://github.com/${process.env.GITHUB_REPOSITORY || "repository"}/pulls`
        }
    };
}

function writeRuntimeFile(filePath, content) {
    if (!filePath) return;
    const resolvedPath = path.resolve(filePath);
    const relativeToRepository = path.relative(ROOT, resolvedPath);
    if (relativeToRepository === "" || (!relativeToRepository.startsWith("..") && !path.isAbsolute(relativeToRepository))) {
        throw new Error("Runtime health outputs must be written outside the repository checkout.");
    }
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, content, "utf8");
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
    const args = parseArgs(argv);
    const config = readJson(path.resolve(args.config || DEFAULT_CONFIG_PATH));
    const observations = await (dependencies.collectObservations || collectObservations)(config, dependencies);
    const manifest = evaluateSnapshot(observations, config);
    const summary = buildSummary(manifest);
    writeRuntimeFile(args.output, JSON.stringify(manifest, null, 2) + "\n");
    writeRuntimeFile(args.summary, summary);
    if (!args.output) process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
    return manifest;
}

if (require.main === module) {
    main().catch(error => {
        console.error(`GPIR Health Watch failed safely: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    COMPONENT_ORDER,
    STATUS_PRIORITY,
    ageMinutes,
    buildSummary,
    combineComponents,
    collectObservations,
    evaluateAnnouncements,
    evaluateCriticalJson,
    evaluateFxData,
    evaluateFxHistory,
    evaluateFxWeekly,
    evaluateLiveSite,
    evaluatePages,
    evaluatePendingReview,
    evaluateSnapshot,
    evaluateSourceHealth,
    evaluateWorkflow,
    main,
    worstStatus
};
