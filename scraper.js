#!/usr/bin/env node

// Standalone Supabase discovery job. It does not update GPIR's canonical
// announcements.json or publish anything to the public site.
// Expected source_registry columns: id, acquisition_method, announcement_url,
// and optional item_selector (CSS selector for HTML announcement links).
// Expected global_announcements columns: source_id, title, url,
// archive_month_year, publication_status. Add a UNIQUE constraint on url so
// concurrent runs cannot create duplicates; public readers must exclude review.
// Run with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a private job only.

const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");
const { isIP } = require("node:net");

const HTML_SELECTOR = "article a[href], .news-item a[href], .announcement a[href], h2 a[href], h3 a[href]";
const MAX_ITEMS_PER_SOURCE = 20;

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
        items.push({ title: cleanText(link.text()), url: safeUrl(link.attr("href"), baseUrl) });
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
            url: safeUrl(link, baseUrl)
        });
    });
    return items;
}

function archiveMonthYear(now = new Date()) {
    return `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${now.getUTCFullYear()}`;
}

async function fetchSource(source, fetchImpl = fetch) {
    const endpoint = safeUrl(source.announcement_url);
    if (!endpoint) throw new Error("Missing or invalid HTTPS announcement_url");

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
        : extractHtml(body, finalUrl, source.item_selector || HTML_SELECTOR);
    const seen = new Set();
    return extracted.filter(item => {
        if (!item.url || !allowedHost(item.url, endpoint) || item.title.length < 8 || item.title.length > 320 || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    }).slice(0, MAX_ITEMS_PER_SOURCE);
}

async function run() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private job environment");
    }
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: sources, error: sourceError } = await db.from("source_registry")
        .select("*").in("acquisition_method", ["C", "A"]);
    if (sourceError) throw sourceError;

    let discovered = 0;
    const month = archiveMonthYear();
    for (const source of sources || []) {
        try {
            const items = await fetchSource(source);
            if (!items.length) continue;
            const rows = items.map(item => ({
                source_id: source.id,
                title: item.title,
                url: item.url,
                archive_month_year: month,
                publication_status: "review"
            }));
            const { error } = await db.from("global_announcements")
                .upsert(rows, { onConflict: "url", ignoreDuplicates: true });
            if (error) throw error;
            discovered += rows.length;
            console.log(`${source.id}: checked ${rows.length} announcement links`);
        } catch (error) {
            console.error(`${source.id}: ${error.message}`);
            process.exitCode = 1;
        }
    }
    console.log(`Checked ${discovered} candidate links; duplicates were ignored by Supabase.`);
}

if (require.main === module) {
    run().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { archiveMonthYear, extractHtml, extractRss, fetchSource, safeUrl };
