#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const modulePath = path.join(ROOT, "assets/js/supabase-announcements.js");
const cssPath = path.join(ROOT, "assets/css/supabase-ticker.css");
const indexPath = path.join(ROOT, "index.html");
const source = fs.readFileSync(modulePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

function clientFor(responses, calls) {
    return {
        from(table) {
            assert.equal(table, "global_announcements");
            const call = { filters: [] };
            calls.push(call);
            return {
                select(columns) {
                    call.columns = columns;
                    return this;
                },
                eq(field, value) {
                    call.filters.push([field, value]);
                    return this;
                },
                order(field, options) {
                    call.order = [field, options];
                    return this;
                },
                limit(value) {
                    call.limit = value;
                    return Promise.resolve(responses.shift());
                }
            };
        }
    };
}

async function main() {
    const testableSource = source.replace(
        /^import \{ createClient \} from "[^"]+";/,
        "const createClient = globalThis.__tickerCreateClient;"
    );
    const moduleUrl = "data:text/javascript;base64," + Buffer.from(testableSource).toString("base64");
    const api = await import(moduleUrl);
    const now = Date.parse("2026-09-15T12:00:00Z");

    const normalized = api.normalizeSupabaseRows([
        {
            source_id: "rbi",
            title: "  RBI launches a payment settlement consultation  ",
            canonical_url: "https://rbi.org.in/notice",
            published_at: "2026-09-15T11:00:00Z",
            summary_narration: " Official consultation summary. "
        },
        { title: "", canonical_url: "https://example.org/blank" },
        { title: "Unsafe source remains plain text", canonical_url: "javascript:alert(1)" }
    ], now);

    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].title, "RBI launches a payment settlement consultation");
    assert.equal(normalized[0].sourceLabel, "RBI");
    assert.equal(normalized[0].sourceUrl, "https://rbi.org.in/notice");
    assert.equal(normalized[0].lifecycle, "LIVE");
    assert.equal(normalized[1].sourceUrl, null);

    const calls = [];
    const client = clientFor([{
        data: [{
            source_id: "mas",
            title: "MAS publishes payments update",
            canonical_url: "https://mas.gov.sg/update",
            published_at: "2026-09-10T08:00:00Z",
            summary_narration: "Payments update."
        }],
        error: null
    }], calls);
    const fetched = await api.fetchLatestAnnouncements(client, 20, now);

    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].lifecycle, "ARCHIVE");
    assert.deepEqual(calls[0].filters, [
        ["publication_status", "approved"],
        ["ticker_eligible", true]
    ]);
    assert.deepEqual(calls[0].order, [
        "published_at",
        { ascending: false, nullsFirst: false }
    ]);
    assert.equal(calls[0].limit, 20);

    const retryCalls = [];
    const retryClient = clientFor([
        { data: null, error: { code: "42703", message: "summary_narration is unavailable" } },
        { data: [{ title: "Schema-compatible announcement", canonical_url: "https://example.org/item" }], error: null }
    ], retryCalls);
    const retried = await api.fetchLatestAnnouncements(retryClient, 20, now);

    assert.equal(retryCalls.length, 2);
    assert.match(retryCalls[0].columns, /summary_narration/);
    assert.doesNotMatch(retryCalls[1].columns, /summary_narration/);
    assert.equal(retried[0].title, "Schema-compatible announcement");

    const fallback = await api.fetchCanonicalFallback(async (url, options) => {
        assert.equal(url, "assets/data/announcements.json");
        assert.deepEqual(options, { cache: "no-store" });
        return {
            ok: true,
            async json() {
                return {
                    records: [{
                        id: "canonical-record",
                        status: "GPIR_CLASSIFIED",
                        title: "Canonical fallback record",
                        publicationDate: "2026-09-15",
                        publicationTime: "10:30:00Z",
                        region: "APAC",
                        summary: "Retained fallback summary.",
                        source: { url: "https://authority.example/record" }
                    }]
                };
            }
        };
    }, now);

    assert.equal(fallback.length, 1);
    assert.equal(fallback[0].detailUrl, "pages/intelligence/canonical-record.html");
    assert.equal(fallback[0].lifecycle, "LIVE");

    assert.match(source, /@supabase\/supabase-js@2\.116\.0\/\+esm/);
    assert.match(source, /sb_publishable_/);
    assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /\.innerHTML\s*=/);
    assert.match(source, /replaceChildren\(primary, duplicate\)/);
    assert.match(source, /aria-hidden/);
    assert.match(source, /canonical-fallback/);
    assert.match(css, /#market-ribbon\.supabase-ticker-active/);
    assert.match(css, /height:\s*32px/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(index, /assets\/css\/supabase-ticker\.css\?v=20260915a/);
    assert.match(index, /assets\/js\/supabase-announcements\.js\?v=20260915a/);
    assert.doesNotMatch(index, /assets\/js\/supabase-combined-engine\.js/);

    console.log("Supabase ticker staging tests passed: query, schema fallback, canonical fallback, safety and scoped UI contracts.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
