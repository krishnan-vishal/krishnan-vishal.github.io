#!/usr/bin/env node

// Standalone Supabase discovery job. It does not update GPIR's canonical
// announcements.json or publish anything to the public site.
// Uses the owner-supplied source_registry and global_announcements schemas.
// Discovered links are approved for the Supabase-backed ticker after the
// registered-source and URL checks below. Canonical GPIR JSON is unchanged.
// Run with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a private job only.

const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");
const { isIP } = require("node:net");

const HTML_SELECTOR = "article a[href], .news-item a[href], .announcement a[href], h2 a[href], h3 a[href]";
const MAX_ITEMS_PER_SOURCE = 20;

function describeError(error) {
    if (!error) return "Unknown error";
    return [error.code, error.message, error.details, error.hint]
        .filter(Boolean).join(" | ");
}

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function safeUrl(value, baseUrl) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const url = new URL(value.trim(), baseUrl);
        if (url.protocol !== "https:" || url.username || url.password) return null;
        if (isIP(url.hostname) || url.hostname === "localhost" ||
            url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) return null;
        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}

function allowedHost(url, endpoint) {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const sourceHost = new URL(endpoint).hostname.replace(/^www\./, "");
    return host === sourceHost || host.endsWith(`.${sourceHost}`);
}

function extractHtml(html, baseUrl, selector = HTML_SELECTOR) {
    const $ = cheerio.load(html);
    const items = [];
    $(selector).each((_, element) => {
        const link = $(element).is("a") ? $(element) : $(element).find("a[href]").first();
        items.push({ title: cleanText(link.text()), url: safeUrl(link.attr("href"), baseUrl), publishedAt: null });
    });
    return items;
}

function extractRss(xml, baseUrl) {
    const $ = cheerio.load(xml, { xml: true });
    const items = [];
    $("item, entry").each((_, element) => {
        const entry = $(element);
        const link = entry.find('link[rel="alternate"]').first().attr("href") ||
            entry.find("link[href]").first().attr("href") ||
            cleanText(entry.find("link").first().text());
        items.push({
            title: cleanText(entry.find("title").first().text()),
            url: safeUrl(link, baseUrl),
            publishedAt: publicationTime(entry.find("pubDate, published, updated").first().text())
        });
    });
    return items;
}

function publicationTime(value) {
    const time = Date.parse(cleanText(value));
    return Number.isFinite(time) && time <= Date.now() ? new Date(time).toISOString() : null;
}

function archiveMonthYear(now = new Date()) {
    return `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${now.getUTCFullYear()}`;
}

async function fetchSource(source, fetchImpl = fetch) {
    const endpoint = safeUrl(source.feed_or_index_url);
    if (!endpoint) throw new Error("Missing or invalid HTTPS feed_or_index_url");
    if (source.official_url && !allowedHost(endpoint, source.official_url)) {
        throw new Error("feed_or_index_url is outside the registered official_url host");
    }

    let requestedUrl = endpoint;
    let response;
    for (let redirect = 0; redirect < 4; redirect++) {
        response = await fetchImpl(requestedUrl, {
            headers: { "User-Agent": "GPIR-announcement-discovery/1.0" },
            redirect: "manual",
            signal: AbortSignal.timeout(15000)
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const nextUrl = safeUrl(response.headers.get("location"), requestedUrl);
        if (!nextUrl || !allowedHost(nextUrl, endpoint)) throw new Error("Untrusted source redirect");
        requestedUrl = nextUrl;
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error("Too many redirects");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finalUrl = requestedUrl;
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("Source response exceeds 2 MB");

    const extracted = source.acquisition_method === "A"
        ? extractRss(body, finalUrl)
        : extractHtml(body, finalUrl);
    const seen = new Set();
    return extracted.filter(item => {
        if (!item.url || !allowedHost(item.url, endpoint) || item.title.length < 8 || item.title.length > 320 || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    }).slice(0, MAX_ITEMS_PER_SOURCE);
}

async function run(options = {}) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = options.env || process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private job environment");
    }
    const db = (options.createClient || createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: sources, error: sourceError } = await db.from("source_registry")
        .select("*").in("acquisition_method", ["C", "A"]);
    if (sourceError) throw new Error(`source_registry query failed: ${describeError(sourceError)}`);

    let discovered = 0;
    let failedSources = 0;
    const month = archiveMonthYear();
    for (const source of sources || []) {
        let items;
        try {
            items = await (options.fetchSource || fetchSource)(source);
        } catch (error) {
            failedSources++;
            console.warn(`${source.source_id}: source skipped: ${describeError(error)}`);
            continue;
        }
        if (!items.length) continue;
        const rows = items.map(item => ({
            source_id: source.source_id,
            title: item.title,
            canonical_url: item.url,
            url: item.url,
            published_at: item.publishedAt,
            archive_month_year: month,
            publication_status: "approved",
            ticker_eligible: true
        }));
        const { error } = await db.from("global_announcements")
            .upsert(rows, { onConflict: "canonical_url", ignoreDuplicates: true });
        if (error) throw new Error(`${source.source_id}: global_announcements insert failed: ${describeError(error)}`);
        const { error: updateError } = await db.from("global_announcements")
            .update({ publication_status: "approved", ticker_eligible: true })
            .in("canonical_url", rows.map(row => row.canonical_url));
        if (updateError) throw new Error(`${source.source_id}: global_announcements visibility update failed: ${describeError(updateError)}`);
        discovered += rows.length;
        console.log(`${source.source_id}: checked ${rows.length} announcement links`);
    }
    console.log(`Approved ${discovered} candidate links; skipped ${failedSources} unavailable sources.`);
}

if (require.main === module) {
    run().catch(error => {
        console.error(describeError(error));
        process.exitCode = 1;
    });
}

module.exports = { archiveMonthYear, describeError, extractHtml, extractRss, fetchSource, run, safeUrl };
