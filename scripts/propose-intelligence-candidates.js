#!/usr/bin/env node
/*
 * GPIR M21 candidate-intelligence proposal builder.
 *
 * Uses the M18 report-only refresh reader, but writes only the non-public
 * candidate queue when a new, trusted-domain feed item is discovered. It never
 * changes announcements.json, generated pages, sitemap.xml or public content.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { hostAllowed, inspectSources } = require("./refresh-announcements.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "assets", "data");
const SOURCES_PATH = path.join(DATA_DIR, "trusted-sources.json");
const ANNOUNCEMENTS_PATH = path.join(DATA_DIR, "announcements.json");
const CANDIDATES_PATH = path.join(DATA_DIR, "intelligence-candidates.json");
const COUNTRIES_PATH = path.join(DATA_DIR, "country-intelligence.json");

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function canonicalUrl(value) {
    try {
        const url = new URL(value);
        url.hash = "";
        return url.toString();
    } catch {
        return null;
    }
}

function dateOnly(value) {
    if (!value) return null;
    if (/^\d{4}-(?:\d{2}|\d{2}-\d{2})$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function candidateId(sourceId, sourceUrl) {
    const fingerprint = crypto.createHash("sha256").update(`${sourceId}\n${sourceUrl}`).digest("hex").slice(0, 16);
    return `candidate-${sourceId}-${fingerprint}`;
}

function normalizedEventTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

function eventFingerprint(item) {
    const title = normalizedEventTitle(item.title);
    const publicationDate = dateOnly(item.publicationDate) || "undated";
    return crypto.createHash("sha256")
        .update(`${title}\n${publicationDate}`)
        .digest("hex")
        .slice(0, 24);
}

function isPaymentsRelevant(item) {
    const text = `${item.title || ""}\n${item.summary || ""}`;
    const specific = /\b(payments?|remittances?|money (?:movement|transfer)|instant payments?|real-time payments?|rtp|a2a|account-to-account|cards?|wallets?|open banking|payment initiation|cbdcs?|central bank digital currenc(?:y|ies)|stablecoins?|tokeni[sz]ed money|payment orchestration|payment apis?|acquiring|iso ?20022|psp|msb|mto|payment licens(?:e|ing|ure))\b/i;
    const generic = /\b(earnings|stock market|investment outlook|government securit(?:y|ies)|dated securities|reference rates|insurance|mortgage|lending)\b/i;
    if (generic.test(item.title || "") && !specific.test(item.title || "")) return false;
    return specific.test(text) || (/\b(clearing|settlement|interoperability|sanctions?|aml|cft|kyc|kyb|fraud|digital assets?|digital banking|foreign exchange|fx|fintech)\b/i.test(text)
        && /\b(payments?|remittances?|money movement|cross-border|infrastructure|payment networks?)\b/i.test(text));
}

function buildCandidate(source, item, retrievedAt, country, discoveryEndpoint) {
    const sourceUrl = canonicalUrl(item.url);
    const publicationDate = dateOnly(item.publicationDate);
    if (!String(item.title || "").trim() || !sourceUrl || !sourceUrl.startsWith("https://")) {
        throw new Error(`CANDIDATE_VALIDATION_FAILED: ${source.id}: non-empty title and HTTPS item URL required`);
    }
    return {
        id: candidateId(source.id, sourceUrl),
        referenceId: candidateId(source.id, sourceUrl),
        eventFingerprint: eventFingerprint(item),
        lifecycleStatus: "DEVELOPING",
        publicationStatus: "NOT_PUBLISHED",
        status: "PENDING_HUMAN_REVIEW",
        contentStatus: "CONTENT_UNDER_REVIEW",
        sourceOrgId: source.id,
        sourceAuthority: source.organization || source.id,
        discoveredVia: { sourceOrgId: source.id, sourceUrl, discoveryEndpoint },
        sourceRole: source.sourceRole || "PRIMARY",
        originalSource: source.sourceRole === "SECONDARY" ? null : { sourceOrgId: source.id, sourceUrl },
        validationStatus: "AWAITING_HUMAN_VALIDATION",
        countryId: country ? country.id : null,
        countryIsoAlpha2: country ? country.isoAlpha2 : source.isoCountryCode || null,
        region: country ? country.region : source.region || null,
        sourceName: source.organization || source.id,
        sourceUrl,
        discoveryEndpoint,
        title: item.title,
        summary: source.sourceRole === "SECONDARY" ? null : item.summary || null,
        sourcePublicationDate: publicationDate,
        sourcePublicationDateRaw: item.publicationDate || null,
        effectiveDate: null,
        validationDate: null,
        retrievedAt,
        supersedes: null,
        supersededBy: null,
        audit: {
            discoveredAt: retrievedAt,
            sourceDomainCheckedAt: retrievedAt,
            discoveryEndpoint,
            reviewState: "PENDING_HUMAN_REVIEW"
        }
    };
}

async function main() {
    const sources = readJson(SOURCES_PATH).registry || [];
    const published = readJson(ANNOUNCEMENTS_PATH).records || [];
    const queue = readJson(CANDIDATES_PATH);
    const countries = readJson(COUNTRIES_PATH).records || [];
    const existingCandidates = Array.isArray(queue.candidates) ? queue.candidates : [];
    const knownUrls = new Set([
        ...existingCandidates.map(candidate => canonicalUrl(candidate.sourceUrl)),
        ...published.map(record => canonicalUrl(record.source && record.source.url))
    ].filter(Boolean));
    const sourceById = new Map(sources.map(source => [source.id, source]));
    const reports = await inspectSources(sources);
    const additions = [];
    const knownEventFingerprints = new Set(existingCandidates
        .map(candidate => candidate.eventFingerprint)
        .filter(Boolean));
    const counters = { nonRelevant: 0, duplicateUrl: 0, duplicateEvent: 0, queueCapacity: 0 };

    reports.forEach(report => {
        if (report.status !== "RETRIEVED_REVIEW_REQUIRED") return;
        const source = sourceById.get(report.sourceId);
        const country = source ? countries.find(record => record.name === source.country) : null;
        if (!source) return;

        (report.discovered || []).forEach(item => {
            const sourceUrl = canonicalUrl(item.url);
            if (!sourceUrl || !hostAllowed(sourceUrl, source.officialDomains || [])) return;
            if (!isPaymentsRelevant(item)) {
                counters.nonRelevant += 1;
                return;
            }
            if (knownUrls.has(sourceUrl)) {
                counters.duplicateUrl += 1;
                return;
            }
            const fingerprint = eventFingerprint(item);
            if (knownEventFingerprints.has(fingerprint)) {
                counters.duplicateEvent += 1;
                return;
            }
            // Stop admitting new records, never truncate retained intelligence.
            if (existingCandidates.length + additions.length >= 5000) {
                counters.queueCapacity += 1;
                return;
            }
            knownUrls.add(sourceUrl);
            knownEventFingerprints.add(fingerprint);
            additions.push(buildCandidate(
                source,
                item,
                report.retrievedAt,
                country,
                report.finalUrl || report.endpoint
            ));
        });
    });

    if (additions.length) {
        const candidates = existingCandidates.concat(additions).sort((left, right) => left.id.localeCompare(right.id));
        const nextQueue = {
            ...queue,
            candidates
        };
        fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(nextQueue, null, 2) + "\n", "utf8");
    }

    const report = {
        mode: "CANDIDATE_PROPOSAL_ONLY",
        recordsMutated: 0,
        publicPublicationMutationAllowed: false,
        proposalCandidatesAdded: additions.length,
        existingCandidateCount: existingCandidates.length,
        skipped: counters,
        discoveryTarget: "<=24 hours where source availability and endpoint reliability permit; not universal real-time coverage",
        sourceReports: reports.map(result => ({
            sourceId: result.sourceId,
            status: result.status === "RETRIEVED_REVIEW_REQUIRED" && !(result.discovered || []).some(isPaymentsRelevant)
                ? "NO_RELEVANT_ITEMS" : result.status,
            discoveredCount: (result.discovered || []).length,
            finalUrl: result.finalUrl || null
        }))
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { canonicalUrl, eventFingerprint, isPaymentsRelevant, buildCandidate };
