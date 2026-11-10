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
const raw = [];
const insertedSizes = [];
let assessments = 0;
let assessmentError = null;
const db = {
    from(table) {
        if (table === "source_registry") {
            return { select: () => ({ in: async () => ({ data: [source], error: null }) }) };
        }
        assert.equal(table, "intelligence_raw_ingestion", "scraper must never write announcements");
        return {
            select() {
                return {
                    async in(column, hashes) {
                        assert.equal(column, "content_hash");
                        return { data: raw.filter(row => hashes.includes(row.content_hash)), error: null };
                    }
                };
            },
            insert(rows) {
                return {
                    async select() {
                        insertedSizes.push(rows.length);
                        const added = rows.map(row => ({ ...row, id: String(raw.length + 1 + rows.indexOf(row)) }));
                        raw.push(...added);
                        return { data: added, error: null };
                    }
                };
            }
        };
    },
    async rpc(name, { p_raw_id: id }) {
        assert.equal(name, "gpir_process_raw_record");
        const row = raw.find(item => item.id === id);
        assert.ok(row);
        assert.equal(row.ingestion_status, "RAW");
        if (assessmentError) return { data: null, error: assessmentError };
        row.ingestion_status = "PROCESSED";
        assessments++;
        return { data: "CANDIDATE", error: null };
    }
};

const candidates = Array.from({ length: 205 }, (_, index) => ({
    title: `New official announcement ${index + 1}`,
    url: `https://example.org/new-${index + 1}`,
    publishedAt: "2024-01-01T10:00:00.000Z"
}));
const options = {
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" },
    createClient: () => db,
    fetchSource: async () => candidates
};

(async () => {
    await run(options);
    assert.deepEqual(insertedSizes, [100, 100, 5]);
    assert.equal(raw.length, 205);
    assert.equal(assessments, 205);
    for (const row of raw) {
        assert.equal(row.source_published_at, "2024-01-01T10:00:00.000Z");
        assert.equal(row.canonical_url, row.discovered_url);
        assert.equal(row.ingestion_status, "PROCESSED");
        assert.match(row.content_hash, /^[a-f0-9]{64}$/);
        assert.equal(row.publication_status, undefined);
        assert.equal(row.ticker_eligible, undefined);
    }
    await run(options);
    assert.equal(raw.length, 205, "repeated discovery must not insert duplicate raw records");
    assert.equal(assessments, 205, "processed raw records must not be reassessed");
    raw[0].ingestion_status = "RAW";
    await run(options);
    assert.equal(raw.length, 205);
    assert.equal(assessments, 206, "an interrupted RAW record is retried");
    raw[1].ingestion_status = "RAW";
    assessmentError = { message: "assessment unavailable" };
    await assert.rejects(run(options), /raw ingestion assessment failed.*assessment unavailable/);
    assert.equal(raw[1].ingestion_status, "RAW", "failed assessment must remain retryable");
    console.log("Scraper governed ingestion mapping passed.");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
