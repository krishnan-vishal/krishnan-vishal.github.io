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

function buildCandidate(source, item, retrievedAt, country) {
    const sourceUrl = canonicalUrl(item.url);
    const publicationDate = dateOnly(item.publicationDate);
    return {
        id: candidateId(source.id, sourceUrl),
        referenceId: candidateId(source.id, sourceUrl),
        lifecycleStatus: "DEVELOPING",
        publicationStatus: "NOT_PUBLISHED",
        status: "PENDING_HUMAN_REVIEW",
        contentStatus: "CONTENT_UNDER_REVIEW",
        sourceOrgId: source.id,
        countryId: country ? country.id : null,
        countryIsoAlpha2: country ? country.isoAlpha2 : null,
        region: country ? country.region : null,
        sourceName: source.organization || source.id,
        sourceUrl,
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

    reports.forEach(report => {
        if (report.status !== "RETRIEVED_REVIEW_REQUIRED") return;
        const source = sourceById.get(report.sourceId);
        const country = source ? countries.find(record => record.name === source.country) : null;
        if (!source) return;

        (report.discovered || []).forEach(item => {
            const sourceUrl = canonicalUrl(item.url);
            if (!sourceUrl || !hostAllowed(sourceUrl, source.officialDomains || [])) return;
            if (knownUrls.has(sourceUrl)) return;
            knownUrls.add(sourceUrl);
            additions.push(buildCandidate(source, item, report.retrievedAt, country));
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
        sourceReports: reports.map(result => ({
            sourceId: result.sourceId,
            status: result.status,
            discoveredCount: (result.discovered || []).length
        }))
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
