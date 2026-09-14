const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function(name, ...args) {
    if (name === "cheerio") return {};
    if (name === "@supabase/supabase-js") return { createClient() {} };
    return originalLoad.call(this, name, ...args);
};
const { run } = require("../scraper.js");
Module._load = originalLoad;

const source = {
    source_id: "official-source",
    acquisition_method: "A",
    feed_or_index_url: "https://example.org/feed"
};
const existing = {
    canonical_url: "https://example.org/old",
    title: "Previously discovered announcement",
    publication_status: "review",
    ticker_eligible: false
};
const announcements = [existing];
let conflict;

const db = {
    from(table) {
        if (table === "source_registry") {
            return { select: () => ({ in: async () => ({ data: [source], error: null }) }) };
        }
        assert.equal(table, "global_announcements");
        return {
            async upsert(rows, options) {
                conflict = options;
                for (const row of rows) {
                    if (!announcements.some(item => item.canonical_url === row.canonical_url)) {
                        announcements.push({ ...row });
                    }
                }
                return { error: null };
            },
            update(fields) {
                return {
                    async in(column, urls) {
                        assert.equal(column, "canonical_url");
                        for (const row of announcements) {
                            if (urls.includes(row.canonical_url)) Object.assign(row, fields);
                        }
                        return { error: null };
                    }
                };
            }
        };
    }
};

run({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" },
    createClient: () => db,
    fetchSource: async () => [
        { title: "Previously discovered announcement", url: "https://example.org/old", publishedAt: null },
        { title: "New official announcement", url: "https://example.org/new", publishedAt: null }
    ]
}).then(() => {
    assert.deepEqual(conflict, { onConflict: "canonical_url", ignoreDuplicates: true });
    assert.equal(announcements.length, 2);
    assert.equal(existing.title, "Previously discovered announcement");
    for (const row of announcements) {
        assert.equal(row.publication_status, "approved");
        assert.equal(row.ticker_eligible, true);
    }
    console.log("Scraper publication mapping passed.");
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
