#!/usr/bin/env node

/*
 * Deterministic GPIR candidate-to-publication gate.
 *
 * Only official Tier-1 sources can cross this gate automatically. Discovery
 * and association/media sources remain in the review queue. Publication is
 * still committed to an automation branch and reviewed through a pull request;
 * this script never writes to main or contacts a publishing service.
 */

const fs = require("fs");
const path = require("path");
const {
    canonicalUrl,
    eventFingerprint,
    isPaymentsRelevant,
    dateOnly,
    unsupportedFailureReason
} = require("./propose-intelligence-candidates.js");
const { hostAllowed } = require("./refresh-announcements.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "assets", "data");
const SOURCES_PATH = path.join(DATA_DIR, "trusted-sources.json");
const CANDIDATES_PATH = path.join(DATA_DIR, "intelligence-candidates.json");
const ANNOUNCEMENTS_PATH = path.join(DATA_DIR, "announcements.json");
const CONTENT_REGISTRY_PATH = path.join(DATA_DIR, "content-registry.json");
const SOURCE_HEALTH_PATH = path.join(DATA_DIR, "source-health.json");
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function exactPublicationInstant(candidate) {
    const raw = String(candidate.sourcePublicationDateRaw || "");
    if (!/(?:T|\s)\d{1,2}:\d{2}/.test(raw)) return null;
    // A clock value without an explicit offset is not an exact instant and
    // would parse differently across runner time zones.
    if (!/(?:Z|UTC|GMT|[+-]\d{2}:?\d{2})\s*$/i.test(raw)) return null;
    const instant = new Date(raw);
    return Number.isNaN(instant.getTime()) ? null : instant;
}

function strictPaymentRelevance(candidate) {
    const title = String(candidate.title || "");
    const explicit = /\b(payments?|payment cards?|contactless|remittances?|money transfer|instant payments?|real-time payments?|rtp|a2a|account-to-account|wallets?|open banking|payment initiation|cbdcs?|central bank digital currenc(?:y|ies)|stablecoins?|tokeni[sz]ed money|clearing|settlement|payment licens(?:e|ing|ure)|psp|msb|mto|iso ?20022|ativos? virtuais|transfer[eê]ncias?)\b/i;
    return explicit.test(title) && isPaymentsRelevant(candidate);
}

function taxonomyFor(candidate) {
    const text = `${candidate.title || ""} ${candidate.summary || ""}`;
    if (/phishing|fraud|scam|aml|cft|sanctions|kyc|kyb/i.test(text)) {
        return { category: "AML / CFT", subCategory: "Financial Crime / Consumer Protection", paymentDomain: "Payment Security" };
    }
    if (/card|contactless|wallet/i.test(text)) {
        return { category: "Payments", subCategory: "Cards / Wallets", paymentDomain: "Cards and Wallets" };
    }
    if (/cross-border|remittance|money transfer/i.test(text)) {
        return { category: "Cross-Border Payments", subCategory: "Remittances / Money Transfer", paymentDomain: "Cross-Border Payments" };
    }
    if (/open banking|payment initiation|a2a|account-to-account/i.test(text)) {
        return { category: "Open Banking", subCategory: "A2A / Payment Initiation", paymentDomain: "Open Banking" };
    }
    if (/cbdc|stablecoin|digital asset|tokeni[sz]ed money|ativos? virtuais/i.test(text)) {
        return { category: "Regulatory", subCategory: "Digital Assets / CBDC", paymentDomain: "Digital Money" };
    }
    if (/instant payment|real-time payment|\brtp\b|clearing|settlement|iso ?20022/i.test(text)) {
        return { category: "Payment Infrastructure", subCategory: "Clearing / Settlement", paymentDomain: "Payment Infrastructure" };
    }
    return { category: "Regulatory", subCategory: "Payment Services", paymentDomain: "Payments Regulation" };
}

function sourceEligible(source) {
    return Boolean(source && source.tier === 1 && (source.sourceRole || "PRIMARY") === "PRIMARY" &&
        source.active === true && source.refreshEndpoint &&
        source.sourceTrustStatus === "VERIFIED_OFFICIAL" &&
        hostAllowed(source.refreshEndpoint, source.officialDomains || []));
}

function deterministicSummary(rawSummary, title, source, taxonomy) {
    const cleaned = String(rawSummary || "")
        .replace(/&#160;|&nbsp;/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const firstSentence = (cleaned.match(/^.*?[.!?](?:\s|$)/) || [cleaned])[0].trim();
    const bounded = firstSentence.length > 360 ? `${firstSentence.slice(0, 357).replace(/\s+\S*$/, "")}…` : firstSentence;
    const factual = bounded || `${source.organization} published an official notice: ${String(title).replace(/[.!?]+$/, "")}.`;
    return `${factual} GPIR classifies the notice under ${taxonomy.subCategory} within ${taxonomy.paymentDomain}.`;
}

function validationFailures(candidate, source, published, sourceHealth) {
    const failures = [];
    const sourceUrl = canonicalUrl(candidate.sourceUrl);
    if (!sourceEligible(source)) failures.push("SOURCE_NOT_ELIGIBLE_FOR_AUTOMATIC_PUBLICATION");
    if (!sourceHealth || (sourceHealth.healthState || sourceHealth.state) !== "GREEN") failures.push("SOURCE_NOT_HEALTHY_IN_CURRENT_CYCLE");
    if (!sourceUrl || !sourceUrl.startsWith("https://") || !hostAllowed(sourceUrl, source && source.officialDomains || [])) failures.push("SOURCE_URL_INVALID");
    if (!dateOnly(candidate.sourcePublicationDate || candidate.sourcePublicationDateRaw)) failures.push("PUBLICATION_DATE_INVALID");
    if (!strictPaymentRelevance(candidate)) failures.push("PAYMENT_RELEVANCE_NOT_HIGH_CONFIDENCE");
    if (!String(candidate.title || "").trim()) failures.push("TITLE_MISSING");
    if (candidate.status !== "PENDING_HUMAN_REVIEW" || candidate.publicationStatus !== "NOT_PUBLISHED") failures.push("CANDIDATE_STATE_INVALID");
    const knownUrls = new Set(published.map(record => canonicalUrl(record.sourceUrl || record.source && record.source.url)).filter(Boolean));
    if (knownUrls.has(sourceUrl)) failures.push("DUPLICATE_SOURCE_URL");
    const fingerprint = candidate.eventFingerprint || eventFingerprint({ title: candidate.title, publicationDate: candidate.sourcePublicationDate });
    if (published.some(record => record.eventFingerprint && record.eventFingerprint === fingerprint)) failures.push("DUPLICATE_EVENT");
    return [...new Set(failures)];
}

function buildPublishedRecord(candidate, source, now = new Date()) {
    const publicationDate = dateOnly(candidate.sourcePublicationDate || candidate.sourcePublicationDateRaw);
    const instant = exactPublicationInstant(candidate);
    const liveUntil = instant ? new Date(instant.getTime() + LIVE_WINDOW_MS) : null;
    const isLive = Boolean(liveUntil && now >= instant && now < liveUntil);
    const taxonomy = taxonomyFor(candidate);
    const recordId = candidate.id.replace(/^candidate-/, "");
    const timestamp = now.toISOString();
    const title = String(candidate.title).trim();
    const summary = deterministicSummary(candidate.summary, title, source, taxonomy);
    const countryCode = String(candidate.countryIsoAlpha2 || source.isoCountryCode || "").toLowerCase() || null;
    const acquisitionMethod = ({ RSS: "RSS", ATOM: "ATOM", JSON: "OFFICIAL_API", HTML: "OFFICIAL_HTML_INDEX" })[source.refreshEndpointType] || source.refreshEndpointType || "MANUAL_EXCEPTION";

    return {
        id: recordId,
        recordId,
        sourceId: source.id,
        sourceOrganization: source.organization,
        sourceURL: canonicalUrl(candidate.sourceUrl),
        sourcePublicationURL: canonicalUrl(candidate.sourceUrl),
        sourceTrustTier: `T${source.tier}`,
        referenceId: recordId,
        candidateReferenceId: candidate.referenceId || candidate.id,
        eventFingerprint: candidate.eventFingerprint || eventFingerprint({ title, publicationDate }),
        editionVersion: null,
        title,
        tickerHeadline: title,
        headline: title,
        summary,
        whyItMatters: `This official notice is relevant to GPIR's ${taxonomy.paymentDomain} coverage and is classified under ${taxonomy.subCategory}.`,
        sourceOrgId: source.id,
        sourceName: source.organization,
        sourceUrl: canonicalUrl(candidate.sourceUrl),
        sourceType: source.sourceType,
        trustTier: `T${source.tier}`,
        country: source.country || "Global",
        countryCode,
        region: candidate.region || source.region || "Global",
        category: taxonomy.category,
        subCategory: taxonomy.subCategory,
        subcategory: taxonomy.subCategory,
        paymentDomain: taxonomy.paymentDomain,
        eventType: taxonomy.category,
        publicationDate,
        publishedDate: publicationDate,
        sourcePublicationDate: publicationDate,
        publicationTime: instant ? instant.toISOString().slice(11, 19) + "Z" : null,
        sourcePublicationTime: instant ? instant.toISOString().slice(11, 19) + "Z" : null,
        discoveredAt: candidate.retrievedAt,
        retrievedAt: candidate.retrievedAt,
        retrievedDate: dateOnly(candidate.retrievedAt),
        validatedAt: timestamp,
        publishedAt: timestamp,
        validationDate: timestamp.slice(0, 10),
        effectiveDate: candidate.effectiveDate || null,
        deadlineDate: candidate.deadlineDate || null,
        confidence: "HIGH",
        status: "GPIR_CLASSIFIED",
        lifecycleStatus: "CURRENT",
        publicationStatus: "PUBLISHED",
        contentStatus: "CONTENT_VERIFIED",
        validationStatus: "VALIDATED",
        displayLifecycleStatus: isLive ? "LIVE" : "ARCHIVED",
        liveUntil: liveUntil ? liveUntil.toISOString() : null,
        archivedAt: isLive ? null : (liveUntil ? liveUntil.toISOString() : timestamp),
        supersedes: candidate.supersedes || null,
        supersededBy: candidate.supersededBy || null,
        relatedRecords: [],
        acquisitionMethod,
        sourceHealth: {
            state: "GREEN",
            fetchStatus: "FETCHED",
            parserStatus: "PARSED",
            checkedAt: candidate.retrievedAt
        },
        source: {
            name: source.organization,
            publicationTitle: title,
            url: canonicalUrl(candidate.sourceUrl)
        },
        organisation: source.organization,
        refreshCycle: "AUTOMATED_2_HOUR_DISCOVERY",
        importance: null,
        publicationYear: publicationDate.slice(0, 4),
        publicationMonth: publicationDate.slice(5, 7),
        gpirSection: taxonomy.category === "AML / CFT" ? "Regulation & Risk" : "Payment Systems",
        gpirSubsection: taxonomy.subCategory,
        gpirMapping: null,
        relatedCountryHref: null,
        tags: [...new Set([taxonomy.category, taxonomy.subCategory, taxonomy.paymentDomain, source.country, candidate.region].filter(Boolean))],
        keywords: [...new Set([taxonomy.category, taxonomy.subCategory, taxonomy.paymentDomain, source.organization, source.country, candidate.region].filter(Boolean))],
        sourceAuthorityLevel: source.tier,
        audit: {
            discoveredDate: dateOnly(candidate.retrievedAt),
            sourceVerifiedDate: timestamp.slice(0, 10),
            lastVerifiedDate: timestamp.slice(0, 10),
            candidateReferenceId: candidate.referenceId || candidate.id,
            discoveryEndpoint: candidate.discoveryEndpoint,
            publicationRule: "DETERMINISTIC_TIER_1_OFFICIAL",
            correctionHistory: []
        },
        lastUpdated: null
    };
}

function normaliseRegistryKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function registryEntries(record, source, existingIds, existingRegistry = []) {
    const sourceId = `source:${source.id}`;
    const regionAliases = {
        apac: "region:apac",
        "south-asia": "region:apac",
        europe: "region:europe",
        "middle-east": "region:middle-east",
        gcc: "region:middle-east",
        americas: "region:americas",
        latam: "region:latam",
        africa: "region:africa"
    };
    const regionKey = normaliseRegistryKey(record.region);
    const regionId = regionAliases[regionKey] || Object.keys(regionAliases).find(key => regionKey.includes(key)) && regionAliases[Object.keys(regionAliases).find(key => regionKey.includes(key))];
    const countryKey = normaliseRegistryKey(record.country);
    const countryRecord = existingRegistry.find(entry => entry.contentType === "COUNTRY" && normaliseRegistryKey(entry.title) === countryKey);
    const relationships = [
        { type: "SOURCE", target: sourceId },
        { type: "INTELLIGENCE", target: `intelligence:${record.id}` },
        countryRecord ? { type: "COUNTRY", target: countryRecord.id } : null,
        regionId && existingIds.has(regionId) ? { type: "REGION", target: regionId } : null
    ].filter(Boolean);
    const entries = [];
    if (!existingIds.has(sourceId)) {
        entries.push({
            id: sourceId,
            contentType: "SOURCE",
            title: source.organization,
            slug: source.id,
            status: "active",
            sourceRef: { file: "assets/data/trusted-sources.json", collection: "registry", key: "id", value: source.id },
            relationships: []
        });
    }
    entries.push({
        id: `announcement:${record.id}`,
        contentType: "ANNOUNCEMENT",
        title: record.title,
        slug: record.id,
        status: "GPIR_CLASSIFIED",
        sourceRef: { file: "assets/data/announcements.json", collection: "records", key: "id", value: record.id },
        page: `pages/intelligence/${record.id}.html`,
        sourceRefs: [sourceId],
        relationships
    });
    entries.push({
        id: `intelligence:${record.id}`,
        contentType: "INTELLIGENCE",
        title: record.title,
        slug: record.id,
        status: "GPIR_CLASSIFIED",
        sourceRef: { file: "assets/data/announcements.json", collection: "records", key: "id", value: record.id },
        page: `pages/intelligence/${record.id}.html`,
        sourceRefs: [sourceId],
        relationships: [
            { type: "ANNOUNCEMENT", target: `announcement:${record.id}` },
            { type: "SOURCE", target: sourceId },
            countryRecord ? { type: "COUNTRY", target: countryRecord.id } : null,
            regionId && existingIds.has(regionId) ? { type: "REGION", target: regionId } : null
        ].filter(Boolean)
    });
    return entries;
}

function publish({ sources, candidates, announcements, contentRegistry, sourceHealth = [], now = new Date(), limit = Infinity }) {
    const sourceById = new Map(sources.map(source => [source.id, source]));
    const healthById = new Map(sourceHealth.map(record => [record.sourceId, record]));
    const published = [...announcements];
    const registry = [...contentRegistry];
    const existingRegistryIds = new Set(registry.map(record => record.id));
    const promotedIds = new Set();
    const quarantined = [];

    for (const candidate of candidates) {
        if (promotedIds.size >= limit) break;
        const source = sourceById.get(candidate.sourceOrgId);
        const failures = validationFailures(candidate, source, published, healthById.get(candidate.sourceOrgId));
        if (failures.length) {
            if (sourceEligible(source)) quarantined.push({ candidateId: candidate.id, failures });
            continue;
        }
        const record = buildPublishedRecord(candidate, source, now);
        published.push(record);
        const entries = registryEntries(record, source, existingRegistryIds, registry);
        entries.forEach(entry => {
            if (!existingRegistryIds.has(entry.id)) {
                registry.push(entry);
                existingRegistryIds.add(entry.id);
            }
        });
        promotedIds.add(candidate.id);
    }

    return {
        announcements: published,
        candidates: candidates.filter(candidate => !promotedIds.has(candidate.id)),
        contentRegistry: registry,
        promotedIds: [...promotedIds],
        quarantined
    };
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function reconcileCoverage(healthData, candidates, announcements, sources = []) {
    const qualified = candidates.reduce((map, candidate) => map.set(candidate.sourceOrgId, (map.get(candidate.sourceOrgId) || 0) + 1), new Map());
    const published = announcements.reduce((map, record) => {
        const sourceId = record.sourceId || record.sourceOrgId;
        if (sourceId) map.set(sourceId, (map.get(sourceId) || 0) + 1);
        return map;
    }, new Map());
    const sourceById = new Map(sources.map(source => [source.id, source]));
    return {
        ...healthData,
        mode: "SOURCE_COVERAGE_AND_HEALTH_SNAPSHOT",
        sources: (healthData.sources || []).map(source => ({
            ...source,
            recordsQualified: (qualified.get(source.sourceId) || 0) + (published.get(source.sourceId) || 0),
            recordsAccepted: (qualified.get(source.sourceId) || 0) + (published.get(source.sourceId) || 0),
            recordsPublished: published.get(source.sourceId) || 0,
            failureReason: source.failureReason || unsupportedFailureReason(sourceById.get(source.sourceId) || {}, source)
        }))
    };
}

function main() {
    const argv = process.argv.slice(2);
    const reportOnly = argv.includes("--report-only");
    const normalizeM29Summaries = argv.includes("--normalize-m29-summaries");
    const limitArg = argv.find(value => value.startsWith("--limit="));
    const nowArg = argv.find(value => value.startsWith("--now="));
    const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;
    const now = nowArg ? new Date(nowArg.slice(6)) : new Date();
    if (Number.isNaN(now.getTime()) || !(limit > 0)) throw new Error("Invalid --now or --limit value.");

    const sourceData = readJson(SOURCES_PATH);
    const candidateData = readJson(CANDIDATES_PATH);
    const announcementData = readJson(ANNOUNCEMENTS_PATH);
    const registryData = readJson(CONTENT_REGISTRY_PATH);
    const healthData = fs.existsSync(SOURCE_HEALTH_PATH) ? readJson(SOURCE_HEALTH_PATH) : { sources: [] };
    const result = publish({
        sources: sourceData.registry || [],
        candidates: candidateData.candidates || [],
        announcements: announcementData.records || [],
        contentRegistry: registryData.records || [],
        sourceHealth: healthData.sources || [],
        now,
        limit
    });
    if (normalizeM29Summaries) {
        result.announcements = result.announcements.map(record => record.publishedAt ? {
            ...record,
            summary: deterministicSummary(record.summary, record.title, { organization: record.sourceOrganization || record.sourceName }, taxonomyFor(record))
        } : record);
    }

    if (!reportOnly && (result.promotedIds.length || normalizeM29Summaries)) {
        writeJson(ANNOUNCEMENTS_PATH, {
            ...announcementData,
            records: result.announcements,
            lastRefreshed: now.toISOString(),
            schemaVersion: "4.0"
        });
        writeJson(CANDIDATES_PATH, { ...candidateData, candidates: result.candidates });
        writeJson(CONTENT_REGISTRY_PATH, { ...registryData, records: result.contentRegistry });
    }
    if (!reportOnly) writeJson(SOURCE_HEALTH_PATH, reconcileCoverage(healthData, result.candidates, result.announcements, sourceData.registry || []));

    process.stdout.write(JSON.stringify({
        mode: reportOnly ? "REPORT_ONLY" : "AUTOMATION_BRANCH_PUBLICATION",
        evaluated: (candidateData.candidates || []).length,
        published: result.promotedIds.length,
        publishedCandidateIds: result.promotedIds,
        retainedForReview: result.candidates.length,
        quarantined: result.quarantined,
        publicMainMutationAllowed: false
    }, null, 2) + "\n");
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    exactPublicationInstant,
    strictPaymentRelevance,
    taxonomyFor,
    sourceEligible,
    validationFailures,
    buildPublishedRecord,
    deterministicSummary,
    publish,
    registryEntries,
    normaliseRegistryKey,
    reconcileCoverage
};
