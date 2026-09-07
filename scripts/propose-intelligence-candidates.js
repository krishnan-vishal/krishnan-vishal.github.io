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

const PAYMENT_RELEVANCE = /\b(payment|payments|payment system|payment service|payment rail|payment infrastructure|remittance|money movement|money transfer|instant payment|real-time payment|rtp|a2a|account-to-account|clearing|settlement|card|wallet|open banking|open finance|cbdc|central bank digital currency|digital currency|stablecoin|tokeni[sz]ed money|financial crime|anti-money laundering|money laundering|aml|cft|kyc|kyb|sanction|fraud|financial market infrastructure|fintech|cross-border|foreign exchange|\bfx\b)\b/i;

function normalizedEventTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
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
    return PAYMENT_RELEVANCE.test(`${item.title || ""}\n${item.summary || ""}`);
}

function buildCandidate(source, item, retrievedAt, country, discoveryEndpoint) {
    const sourceUrl = canonicalUrl(item.url);
    const publicationDate = dateOnly(item.publicationDate);
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
        countryId: country ? country.id : null,
        countryIsoAlpha2: country ? country.isoAlpha2 : null,
        region: country ? country.region : null,
        sourceName: source.organization || source.id,
        sourceUrl,
        discoveryEndpoint,
        title: item.title,
        summary: item.summary || null,
        sourcePublicationDate: publicationDate,
        sourcePublicationDateRaw: item.publicationDate || null,
        effectiveDate: null,
        validationDate: null,
        retrievedAt,
        supersedes: null,
        supersededBy: null,
        audit: {
            discoveredAt: retrievedAt,
            sourceValidatedAt: retrievedAt,
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
    const counters = { nonRelevant: 0, duplicateUrl: 0, duplicateEvent: 0 };

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
            status: result.status,
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

module.exports = { canonicalUrl, eventFingerprint, isPaymentsRelevant };
