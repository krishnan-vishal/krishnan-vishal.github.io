const OFFICIAL_HOSTS = Object.freeze({
    OFAC: new Set(["ofac.treasury.gov", "sanctionslist.ofac.treas.gov", "sanctionslistservice.ofac.treas.gov", "www.treasury.gov"]),
    UNSC: new Set(["main.un.org", "scsanctions.un.org"]),
    FATF: new Set(["fatf-gafi.org", "www.fatf-gafi.org"])
});

export const UNSC_XML_URL = "https://scsanctions.un.org/resources/xml/en/name/consolidated.xml";

export function regulatoryRedirect(location, canonical, authority) {
    const target = new URL(location, canonical);
    if (target.protocol === "https:" && !target.username && !target.password && !target.port) {
        const original = new URL(canonical);
        const filename = original.pathname.split("/").at(-1);
        if (authority === "OFAC" &&
            original.hostname === "sanctionslistservice.ofac.treas.gov" &&
            (["SDN.XML", "CONSOLIDATED.XML"].includes(filename) ||
                (original.pathname === "/api/download/delta" && /^DeltaArchive\/\d{4}-\d{2}-\d{2}_delta\.xml$/.test(original.searchParams.get("filename") || ""))) &&
            target.hostname === "wc2h-sls-prod-public-published.s3.us-gov-west-1.amazonaws.com" &&
            /^\/(?:Published|DeltaArchive)\//.test(target.pathname) &&
            target.pathname.endsWith("/" + (original.searchParams.get("filename")?.split("/").at(-1) || filename))) {
            return target.href;
        }
        if (authority === "UNSC" && canonical === UNSC_XML_URL &&
            target.hostname === "unsolprodfiles.blob.core.windows.net" &&
            target.pathname === "/publiclegacyxmlfiles/EN/consolidatedLegacyByNAME.xml") {
            return target.href;
        }
    }
    return assertOfficialSourceUrl(target.href, authority);
}

export function parseUnscSnapshot(xml) {
    if (!/<CONSOLIDATED_LIST\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml) ||
        !/<\/CONSOLIDATED_LIST>\s*$/i.test(xml)) throw new Error("UNSC_INVALID_SNAPSHOT");
    const individuals = (xml.match(/<INDIVIDUAL(?:\s[^>]*)?>/gi) || []).length;
    const entities = (xml.match(/<ENTITY(?:\s[^>]*)?>/gi) || []).length;
    const generated = xml.match(/<CONSOLIDATED_LIST\b[^>]*\bdateGenerated=["']([^"']+)["']/i)?.[1];
    const date = generated?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (!individuals || !entities || !date || !Number.isFinite(Date.parse(date))) throw new Error("UNSC_INCOMPLETE_SNAPSHOT");
    return { individuals, entities, publicationDate: date };
}

export const OFAC_EXPORT_BASE = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/";
export const OFAC_DELTA_BASE = "https://sanctionslistservice.ofac.treas.gov/api/download/delta?filename=";
export const FATF_STATEMENTS_URL = "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html";

const MONTHS = Object.freeze({
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
});

const FATF_RESERVED_HEADINGS = new Set([
    "publication details", "language", "country", "topic", "black list", "grey list",
    "removal from fatf review", "jurisdictions no longer under increased monitoring",
    "jurisdiction subject to a fatf call on its members and other jurisdictions to apply counter-measures",
    "jurisdiction subject to a fatf call on its members and other jurisdictions to apply enhanced due diligence measures proportionate to the risks arising from the jurisdiction"
]);

const COUNTRY_ALIASES = Object.freeze({
    "democratic people's republic of korea": { code: "PRK", name: "Democratic People's Republic of Korea" },
    "north korea": { code: "PRK", name: "Democratic People's Republic of Korea" },
    "iran": { code: "IRN", name: "Iran" },
    "myanmar": { code: "MMR", name: "Myanmar" },
    "angola": { code: "AGO", name: "Angola" },
    "bolivia": { code: "BOL", name: "Bolivia" },
    "bosnia and herzegovina": { code: "BIH", name: "Bosnia and Herzegovina" },
    "cameroon": { code: "CMR", name: "Cameroon" },
    "haiti": { code: "HTI", name: "Haiti" },
    "iraq": { code: "IRQ", name: "Iraq" },
    "kenya": { code: "KEN", name: "Kenya" },
    "kuwait": { code: "KWT", name: "Kuwait" },
    "lao pdr": { code: "LAO", name: "Lao People's Democratic Republic" },
    "lao people's democratic republic": { code: "LAO", name: "Lao People's Democratic Republic" },
    "lebanon": { code: "LBN", name: "Lebanon" },
    "nepal": { code: "NPL", name: "Nepal" },
    "papua new guinea": { code: "PNG", name: "Papua New Guinea" },
    "south sudan": { code: "SSD", name: "South Sudan" },
    "syria": { code: "SYR", name: "Syria" },
    "venezuela": { code: "VEN", name: "Venezuela" },
    "vietnam": { code: "VNM", name: "Vietnam" },
    "viet nam": { code: "VNM", name: "Vietnam" },
    "virgin islands (uk)": { code: "VGB", name: "Virgin Islands (UK)" },
    "british virgin islands": { code: "VGB", name: "Virgin Islands (UK)" },
    "yemen": { code: "YEM", name: "Yemen" },
    "albania": { code: "ALB", name: "Albania" },
    "algeria": { code: "DZA", name: "Algeria" },
    "barbados": { code: "BRB", name: "Barbados" },
    "bulgaria": { code: "BGR", name: "Bulgaria" },
    "burkina faso": { code: "BFA", name: "Burkina Faso" },
    "cambodia": { code: "KHM", name: "Cambodia" },
    "cayman islands": { code: "CYM", name: "Cayman Islands" },
    "côte d'ivoire": { code: "CIV", name: "Côte d'Ivoire" },
    "cote d'ivoire": { code: "CIV", name: "Côte d'Ivoire" },
    "democratic republic of the congo": { code: "COD", name: "Democratic Republic of the Congo" },
    "gibraltar": { code: "GIB", name: "Gibraltar" },
    "jamaica": { code: "JAM", name: "Jamaica" },
    "jordan": { code: "JOR", name: "Jordan" },
    "mali": { code: "MLI", name: "Mali" },
    "malta": { code: "MLT", name: "Malta" },
    "mauritius": { code: "MUS", name: "Mauritius" },
    "monaco": { code: "MCO", name: "Monaco" },
    "morocco": { code: "MAR", name: "Morocco" },
    "mozambique": { code: "MOZ", name: "Mozambique" },
    "namibia": { code: "NAM", name: "Namibia" },
    "nicaragua": { code: "NIC", name: "Nicaragua" },
    "nigeria": { code: "NGA", name: "Nigeria" },
    "pakistan": { code: "PAK", name: "Pakistan" },
    "panama": { code: "PAN", name: "Panama" },
    "philippines": { code: "PHL", name: "Philippines" },
    "senegal": { code: "SEN", name: "Senegal" },
    "south africa": { code: "ZAF", name: "South Africa" },
    "tanzania": { code: "TZA", name: "Tanzania" },
    "turkey": { code: "TUR", name: "Türkiye" },
    "türkiye": { code: "TUR", name: "Türkiye" },
    "uganda": { code: "UGA", name: "Uganda" },
    "united arab emirates": { code: "ARE", name: "United Arab Emirates" },
    "croatia": { code: "HRV", name: "Croatia" },
    "ghana": { code: "GHA", name: "Ghana" },
    "iceland": { code: "ISL", name: "Iceland" },
    "serbia": { code: "SRB", name: "Serbia" },
    "trinidad and tobago": { code: "TTO", name: "Trinidad and Tobago" },
    "the bahamas": { code: "BHS", name: "The Bahamas" },
    "bahamas": { code: "BHS", name: "The Bahamas" },
    "botswana": { code: "BWA", name: "Botswana" },
    "ethiopia": { code: "ETH", name: "Ethiopia" },
    "guyana": { code: "GUY", name: "Guyana" },
    "sri lanka": { code: "LKA", name: "Sri Lanka" },
    "tunisia": { code: "TUN", name: "Tunisia" },
    "zimbabwe": { code: "ZWE", name: "Zimbabwe" }
});

function decodeHtml(value) {
    return String(value || "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#039;/gi, "'")
        .replace(/&nbsp;/gi, " ")
        .replace(/&ndash;/gi, "–")
        .replace(/&mdash;/gi, "—")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function safeDate(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseEnglishDate(value) {
    const match = String(value || "").match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2])));
    return date.toISOString().slice(0, 10);
}

export function assertOfficialSourceUrl(value, authority) {
    const url = new URL(value);
    const allowed = OFFICIAL_HOSTS[authority];
    if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed || !allowed.has(url.hostname.toLowerCase())) {
        throw new Error(authority + "_UNAPPROVED_SOURCE_URL");
    }
    url.hash = "";
    return url.toString();
}

export async function sha256Hex(value) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function parseOfacSnapshotMetadata(xml, sourceUrl) {
    const canonicalUrl = assertOfficialSourceUrl(sourceUrl, "OFAC");
    const text = String(xml || "");
    if (!/<(?:\w+:)?(?:sdnList|Sanctions)\b/i.test(text)) throw new Error("OFAC_SNAPSHOT_ROOT_INVALID");
    const publishDate = decodeHtml(text.match(/<(?:\w+:)?(?:Publish_Date|DateOfIssue|DataAsOf)>\s*([^<]+)\s*</i)?.[1]);
    const countText = decodeHtml(text.match(/<(?:\w+:)?(?:Record_Count|RecordCount)>\s*(\d+)\s*</i)?.[1]);
    const recordCount = /^\d+$/.test(countText) ? Number(countText) :
        (text.match(/<(?:\w+:)?(?:sdnEntry|DistinctParty)\b/gi) || []).length;
    if (!recordCount) throw new Error("OFAC_SNAPSHOT_EMPTY");
    return {
        authority: "OFAC",
        canonicalUrl,
        documentKind: "CURRENT_FULL_SNAPSHOT",
        publishedDate: safeDate(publishDate),
        recordCount,
        historicalProof: false,
        eventCount: 0
    };
}

function xmlValue(block, names) {
    for (const name of names) {
        const match = block.match(new RegExp("<(?:\\w+:)?" + name + "\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?" + name + ">", "i"));
        if (match) return decodeHtml(match[1]);
    }
    return "";
}

export function parseOfacDelta(xml, { sourceUrl, publishedDate = null } = {}) {
    const canonicalUrl = assertOfficialSourceUrl(sourceUrl, "OFAC");
    const text = String(xml || "");
    if (!/<(?:\w+:)?(?:Delta|Sanctions|sdnList)\b/i.test(text)) throw new Error("OFAC_DELTA_ROOT_INVALID");
    const events = [];
    const seen = new Set();
    const pattern = /<((?:\w+:)?(?:DistinctParty|sdnEntry|Entity))\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const block = match[0];
        const attrs = match[2] || "";
        const actionRaw = (attrs.match(/\baction\s*=\s*["']([^"']+)["']/i)?.[1] ||
            xmlValue(block, ["Action", "actionType"]) || "update").toLowerCase();
        const action = actionRaw.includes("add") ? "ADDED" :
            actionRaw.includes("remove") || actionRaw.includes("delete") ? "REMOVED" :
            actionRaw.includes("amend") || actionRaw.includes("update") || actionRaw.includes("change") ? "AMENDED" :
            "TECHNICAL";
        const uid = xmlValue(block, ["uid", "FixedRef", "ID", "Id"]) || null;
        const name = xmlValue(block, ["FormattedFullName", "lastName", "Name", "name"]) || "OFAC list record";
        const programs = [...block.matchAll(/<(?:\w+:)?(?:program|SanctionsProgram)[^>]*>([^<]+)</gi)]
            .map(item => decodeHtml(item[1])).filter(Boolean);
        const key = [action, uid || name, publishedDate || canonicalUrl].join("|").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({
            eventKey: key,
            action,
            entityUid: uid,
            displayName: name,
            programs: [...new Set(programs)],
            sourceUrl: canonicalUrl,
            publishedAt: safeDate(publishedDate),
            evidenceType: "OFAC_PUBLISHED_DELTA",
            currentSnapshotProof: false
        });
    }
    if (!events.length) throw new Error("OFAC_DELTA_NO_EVENTS");
    return events;
}

export function parseOfacRecentActions(html, baseUrl = "https://ofac.treasury.gov/recent-actions") {
    assertOfficialSourceUrl(baseUrl, "OFAC");
    const text = String(html || "");
    const results = [];
    const seen = new Set();
    const links = /<a\b[^>]*href=["']((?:https:\/\/ofac\.treasury\.gov)?\/recent-actions\/(\d{4})(\d{2})(\d{2})(?:_[^"'?#/]+)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = links.exec(text)) !== null) {
        const url = assertOfficialSourceUrl(new URL(match[1], baseUrl).toString(), "OFAC");
        if (seen.has(url)) continue;
        const date = match.slice(2, 5).join("-");
        const time = Date.parse(date);
        if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) continue;
        const title = decodeHtml(match[5]);
        if (!title || !date) continue;
        seen.add(url);
        results.push({
            title,
            canonicalUrl: url,
            publicationDate: date,
            exactTimestamp: null,
            timePrecision: "DATE_ONLY",
            eventType: /remov/i.test(title) ? "REMOVAL" :
                /amend|update|change/i.test(title) ? "AMENDMENT" : "REGULATORY_NOTICE"
        });
    }
    return results;
}

function headingCountries(html) {
    const values = [];
    for (const match of String(html || "").matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)) {
        const heading = decodeHtml(match[1]);
        const normalized = heading.toLowerCase().replace(/\s+/g, " ").trim();
        if (!normalized || FATF_RESERVED_HEADINGS.has(normalized)) continue;
        const country = COUNTRY_ALIASES[normalized];
        if (country) values.push(country);
    }
    return values;
}

function metadataCountries(html) {
    const text = String(html || "");
    const candidates = [];
    for (const match of text.matchAll(/(?:Country|countries)\s*<[^>]+>\s*([\s\S]{1,1000}?)(?=<h[1-6]|<dt|Topic|<\/dl>)/gi)) {
        const list = decodeHtml(match[1]).split(/\s*,\s*|\s*;\s*/);
        for (const item of list) {
            const normalized = item.toLowerCase().replace(/\s+/g, " ").trim();
            if (COUNTRY_ALIASES[normalized]) candidates.push(COUNTRY_ALIASES[normalized]);
        }
    }
    return candidates;
}

function activeFatfStatementScope(html) {
    const text = String(html || "");
    for (const heading of text.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
        if (/jurisdictions\s+no\s+longer/i.test(decodeHtml(heading[1]))) {
            return text.slice(0, heading.index);
        }
    }
    return text;
}

export function parseFatfStatement(html, { sourceUrl, designation, publicationDate = null } = {}) {
    const canonicalUrl = assertOfficialSourceUrl(sourceUrl, "FATF");
    if (!["FATF_CALL_FOR_ACTION", "FATF_INCREASED_MONITORING"].includes(designation)) {
        throw new Error("FATF_DESIGNATION_INVALID");
    }
    const text = String(html || "");
    if (!/FATF|Financial Action Task Force/i.test(text)) throw new Error("FATF_DOCUMENT_IDENTITY_INVALID");
    const date = publicationDate || parseEnglishDate(decodeHtml(text));
    if (!date) throw new Error("FATF_PUBLICATION_DATE_MISSING");
    const active = activeFatfStatementScope(text);
    const headings = headingCountries(active);
    const countries = headings.length ? headings : metadataCountries(active);
    const unique = new Map(countries.map(country => [country.code, country]));
    if (!unique.size) throw new Error("FATF_COUNTRY_LIST_EMPTY");
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name)).map(country => ({
        countryCode: country.code,
        countryName: country.name,
        officialDesignation: designation,
        gpirAnalyticalRisk: "UNRATED",
        publicationDate: date,
        canonicalUrl,
        evidenceType: "FATF_OFFICIAL_STATEMENT",
        ofacJurisdictionSanctioned: null,
        ofacExposureStatus: "NOT_ASSESSED"
    }));
}

export function validateFatfSnapshot(statements) {
    if (!Array.isArray(statements) || statements.length !== 2) throw new Error("FATF_SNAPSHOT_INCOMPLETE");
    const expected = new Set(["FATF_CALL_FOR_ACTION", "FATF_INCREASED_MONITORING"]);
    const dates = new Set();
    const countries = new Set();
    const rows = [];
    for (const statement of statements) {
        if (!expected.delete(statement?.designation) || !/^20\d{2}-\d{2}-\d{2}$/.test(statement?.publicationDate || "") ||
            !Array.isArray(statement?.rows) || !statement.rows.length) throw new Error("FATF_SNAPSHOT_INVALID");
        dates.add(statement.publicationDate);
        for (const row of statement.rows) {
            if (countries.has(row.countryCode)) throw new Error("FATF_SNAPSHOT_COUNTRY_CONFLICT");
            countries.add(row.countryCode);
            rows.push(row);
        }
    }
    if (expected.size || dates.size !== 1) throw new Error("FATF_SNAPSHOT_DATE_MISMATCH");
    return Object.freeze({ publicationDate: [...dates][0], rows: Object.freeze(rows) });
}

export function validateBackfillWindow(from, to, maximumDays = 31) {
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("BACKFILL_WINDOW_INVALID");
    const days = Math.ceil((end - start) / 86400000);
    if (days > maximumDays) throw new Error("BACKFILL_WINDOW_TOO_LARGE");
    return {
        from: new Date(start).toISOString(),
        to: new Date(end).toISOString(),
        days
    };
}

export function ofacDeltaUrl(day) {
    const value = /^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) ? day : null;
    if (!value) throw new Error("OFAC_DELTA_DATE_INVALID");
    return OFAC_DELTA_BASE + encodeURIComponent("DeltaArchive/" + value + "_delta.xml");
}

export function lifecycleForTimestamp(value, now = Date.now()) {
    const timestamp = Date.parse(value || "");
    if (!Number.isFinite(timestamp)) return "HISTORICAL_DATE_ONLY";
    return now - timestamp <= 12 * 60 * 60 * 1000 && timestamp <= now ? "LIVE_12_HOUR" : "ARCHIVED";
}
