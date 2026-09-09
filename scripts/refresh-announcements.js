#!/usr/bin/env node
/*
 * GPIR M18 announcement refresh engine.
 *
 * SAFETY CONTRACT
 * ---------------
 * 1. Trusted-source registry is authoritative.
 * 2. Only explicitly configured refreshEndpoint values are fetched.
 * 3. Endpoint host must belong to the source officialDomains.
 * 4. RSS/Atom/JSON are supported without third-party packages.
 * 5. Retrieval is REPORT_ONLY until records pass GPIR publication validation.
 * 6. Existing announcements are NEVER mutated by this script.
 * 7. A failed refresh NEVER removes or downgrades an existing publication.
 * 8. No arbitrary web discovery or fallback scraping is performed.
 */

const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");

const trustedSources = JSON.parse(
    fs.readFileSync(path.join(ROOT, "assets/data/trusted-sources.json"), "utf8")
).registry || [];

const announcements = JSON.parse(
    fs.readFileSync(path.join(ROOT, "assets/data/announcements.json"), "utf8")
).records || [];

function hostAllowed(endpoint, officialDomains = []) {
    try {
        const hostname = new URL(endpoint).hostname.toLowerCase();

        return officialDomains.some(domain => {
            const clean = String(domain)
                .replace(/^https?:\/\//, "")
                .replace(/^www\./, "")
                .split("/")[0]
                .toLowerCase();

            return hostname === clean || hostname.endsWith("." + clean);
        });
    } catch {
        return false;
    }
}

function extractFeedItems(text, contentType = "") {
    const items = [];

    if (/json/i.test(contentType) || /^\s*[\[{]/.test(text)) {
        try {
            const parsed = JSON.parse(text);
            const records = Array.isArray(parsed)
                ? parsed
                : (parsed.items || parsed.records || parsed.results ||
                    (parsed.result && (parsed.result.records || parsed.result.items)) || []);

            for (const item of records) {
                if (!item || typeof item !== "object") continue;

                const title = item.title || item.headline || item.name;
                const url = item.url || item.link || item.guid;
                const date =
                    item.pubDate ||
                    item.published ||
                    item.publicationDate ||
                    item.date ||
                    item.updated;

                if (title && url) {
                    items.push({
                        title: String(title).trim(),
                        url: String(url).trim(),
                        publicationDate: date ? String(date) : null,
                        summary: String(
                            item.summary || item.description || item.excerpt || ""
                        ).trim()
                    });
                }
            }

            return items;
        } catch (error) {
            throw new Error(`SOURCE_PARSE_FAILED: ${error.message}`);
        }
    }

    if (!/<(?:rss|feed|rdf:RDF)\b/i.test(text)) throw new Error("SOURCE_PARSE_FAILED: expected RSS, Atom or JSON");
    const xmlItems = text.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];

    for (const block of xmlItems) {
        const title =
            (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];

        const linkMatch =
            block.match(/<link[^>]+href=["']([^"']+)["']/i) ||
            block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);

        const pubDate =
            (block.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2];

        const summary =
            (block.match(/<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i) || [])[2];

        if (title && linkMatch) {
            items.push({
                title: feedText(title),
                url: feedText(linkMatch[1] || ""),
                publicationDate: pubDate ? feedText(pubDate) : null,
                summary: summary
                    ? feedText(summary)
                    : ""
            });
        }
    }

    return items;
}

function feedText(value) {
    return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function normalizeDiscoveredItems(source, items, responseUrl) {
    return (items || []).map(item => {
        let url;
        try {
            url = new URL(item.url, responseUrl).href;
        } catch {
            return null;
        }

        if (source.parserProfile === "NBK_DESCRIPTION_TITLE") {
            const timestamp = String(item.title || "").trim();
            if (Number.isNaN(Date.parse(timestamp)) || !String(item.summary || "").trim()) return null;
            return { ...item, title: String(item.summary).trim(), summary: "", publicationDate: timestamp, url };
        }

        return { ...item, url };
    }).filter(Boolean);
}

async function inspectSource(source) {
    const endpoint = source.refreshEndpoint || null;

    if (!endpoint || source.active === false) {
        return {
            sourceId: source.id,
            sourceName: source.name || source.id,
            officialDomains: source.officialDomains || [],
            endpoint: null,
            status: source.discoveryStatus === "SOURCE_UNSUPPORTED" ? "SOURCE_UNSUPPORTED" : "NOT_CONFIGURED",
            discovered: []
        };
    }

    if (!hostAllowed(endpoint, source.officialDomains || [])) {
        return {
            sourceId: source.id,
            sourceName: source.name || source.id,
            officialDomains: source.officialDomains || [],
            endpoint,
            status: "BLOCKED_DOMAIN_NOT_TRUSTED",
            discovered: []
        };
    }

    try {
        const response = await fetch(endpoint, {
            headers: {
                "User-Agent": "FINTECHOISIS-GPIR-Refresh/1.0",
                "Accept": "application/rss+xml, application/atom+xml, application/json, text/xml, text/plain;q=0.8"
            },
            signal: AbortSignal.timeout(15000)
        });

        // fetch follows redirects by default. The final destination is a new
        // untrusted input and must meet the same approved-domain rule as the
        // configured endpoint before its response body is accepted.
        if (!hostAllowed(response.url, source.officialDomains || [])) {
            return {
                sourceId: source.id,
                sourceName: source.name || source.id,
                officialDomains: source.officialDomains || [],
                endpoint,
                finalUrl: response.url,
                status: "BLOCKED_REDIRECT_DOMAIN_NOT_TRUSTED",
                discovered: []
            };
        }

        if (!response.ok) {
            return {
                sourceId: source.id,
                sourceName: source.name || source.id,
                officialDomains: source.officialDomains || [],
                endpoint,
                finalUrl: response.url,
                status: "ENDPOINT_UNAVAILABLE",
                httpStatus: response.status,
                discovered: []
            };
        }

        const contentType = response.headers.get("content-type") || "";
        const body = await response.text();
        const discovered = normalizeDiscoveredItems(source, extractFeedItems(body, contentType), response.url).slice(0, 25);

        return {
            sourceId: source.id,
            sourceName: source.name || source.id,
            officialDomains: source.officialDomains || [],
            endpoint,
            finalUrl: response.url,
            status: "RETRIEVED_REVIEW_REQUIRED",
            httpStatus: response.status,
            contentType,
            retrievedAt: new Date().toISOString(),
            discovered
        };
    } catch (error) {
        return {
            sourceId: source.id,
            sourceName: source.name || source.id,
            officialDomains: source.officialDomains || [],
            endpoint,
            status: error.message.startsWith("SOURCE_PARSE_FAILED:") ? "SOURCE_PARSE_FAILED" : "ENDPOINT_UNAVAILABLE",
            error: error.message,
            discovered: []
        };
    }
}

async function inspectSources(sources = trustedSources) {
    const results = await Promise.all(sources.map(inspectSource));
    return results.map((result, index) => {
        const source = sources[index];
        return {
            ...result,
            region: source.region || "UNCLASSIFIED",
            country: source.country || "UNCLASSIFIED",
            sourceType: source.sourceType || "UNCLASSIFIED",
            endpointType: source.refreshEndpointType || null,
            machineReadableStatus: source.refreshEndpoint ? "CONFIGURED" : "UNAVAILABLE",
            active: source.active === true,
            parserStatus: result.status === "RETRIEVED_REVIEW_REQUIRED" ? "PARSED" : (result.status === "SOURCE_PARSE_FAILED" ? "FAILED" : "NOT_RUN"),
            failureReason: result.error || (result.status === "ENDPOINT_UNAVAILABLE" ? `HTTP_${result.httpStatus || "UNAVAILABLE"}` : null),
            lastSuccessfulFetch: result.retrievedAt || source.lastSuccessfulRetrieval || null,
            lastCandidateProduced: null
        };
    });
}

function dateOnly(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseWindow(argv = process.argv.slice(2)) {
    const read = name => {
        const arg = argv.find(value => value.startsWith(`--${name}=`));
        return arg ? dateOnly(arg.slice(name.length + 3)) : null;
    };
    return { from: read("from"), to: read("to") };
}

function filterDiscoveredByDate(results, from, to) {
    return results.map(result => ({
        ...result,
        discovered: (result.discovered || []).filter(item => {
            const date = dateOnly(item.publicationDate);
            return date && (!from || date >= from) && (!to || date <= to);
        })
    }));
}

async function main() {
    const window = parseWindow();
    const rawResults = await inspectSources();
    const results = filterDiscoveredByDate(rawResults, window.from, window.to);

    const configured = results.filter(
        r => r.machineReadableStatus === "CONFIGURED"
    );

    const retrieved = results.filter(
        r => r.status === "RETRIEVED_REVIEW_REQUIRED"
    );

    const candidatesPath = path.join(ROOT, "assets/data/intelligence-candidates.json");
    const candidates = fs.existsSync(candidatesPath) ? (JSON.parse(fs.readFileSync(candidatesPath, "utf8")).candidates || []) : [];
    const lastCandidateBySource = candidates.reduce((map, candidate) => {
        const sourceId = candidate.sourceOrgId;
        const timestamp = candidate.retrievedAt || (candidate.audit && candidate.audit.discoveredAt);
        if (sourceId && timestamp && (!map.get(sourceId) || timestamp > map.get(sourceId))) map.set(sourceId, timestamp);
        return map;
    }, new Map());
    results.forEach(result => { result.lastCandidateProduced = lastCandidateBySource.get(result.sourceId) || null; });

    const report = {
        schemaVersion: "2.0",
        generatedAt: new Date().toISOString(),
        mode: "REPORT_ONLY",
        cadence: "EVERY_2_HOURS_VIA_EXISTING_WORKFLOW",
        backfillWindow: window,
        sourceCount: trustedSources.length,
        configuredSourceCount: configured.length,
        retrievedSourceCount: retrieved.length,
        existingAnnouncementCount: announcements.length,
        recordsDiscovered: results.reduce((count, result) => count + (result.discovered || []).length, 0),
        recordsMutated: 0,
        publicationMutationAllowed: false,
        safetyRule:
            "Existing validated publications remain untouched unless a later publication-validation workflow explicitly approves replacement.",
        sources: results
    };

    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { hostAllowed, inspectSource, inspectSources, extractFeedItems, normalizeDiscoveredItems, dateOnly, parseWindow, filterDiscoveredByDate };
