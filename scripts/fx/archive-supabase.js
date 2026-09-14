#!/usr/bin/env node
/* Hourly private archive and static weekly publication for the FX workflow. */

const fs = require("fs");
const path = require("path");
const { buildWeeklySummary } = require("./weekly-summary.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "assets", "data", "fx");
const TABLE = "fx_historical_archive";
const PAGE_SIZE = 1000;

function regionForPair(pair, config){
    const quote = pair.split("/")[1];
    const group = Object.entries(config.targetRegionalCurrencies || {})
        .find(([, codes]) => codes.includes(quote));
    if(group) return group[0];
    const assigned = Object.entries(config.marketRegions || {})
        .find(([, pairs]) => pairs.includes(pair));
    return assigned ? assigned[0] : "GLOBAL";
}

function archiveRows(snapshot, config){
    return snapshot.pairs.filter(record => record.validationStatus === "VALIDATED" &&
        Number.isFinite(Number.isFinite(record.mid) ? record.mid : record.last) &&
        (Number.isFinite(record.mid) ? record.mid : record.last) > 0 && record.provider).map(record => {
        const rate = Number.isFinite(record.mid) ? record.mid : record.last;
        const rounded = Number(rate.toFixed(6));
        if(rounded <= 0) throw new Error(`FX_ARCHIVE_PRECISION_LOSS: ${record.pair}`);
        return {
            base_currency: record.base,
            target_currency: record.quote,
            rate: rounded,
            region: regionForPair(record.pair, config),
            source: record.provider
        };
    });
}

async function readSevenDays(client, now){
    const cutoff = new Date(Date.parse(now) - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = [];
    for(let offset = 0;; offset += PAGE_SIZE){
        const { data, error } = await client.from(TABLE)
            .select("id,timestamp,base_currency,target_currency,rate,region,source")
            .gte("timestamp", cutoff)
            .lte("timestamp", now)
            .order("timestamp", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if(error) throw new Error(`FX_ARCHIVE_READ_FAILED: ${error.message}`);
        if(!Array.isArray(data)) throw new Error("FX_ARCHIVE_READ_FAILED: no rows returned");
        rows.push(...data);
        if(data.length < PAGE_SIZE) break;
    }
    return rows;
}

function summarizeRows(rows, featuredPairs){
    const requested = new Set(featuredPairs);
    const dailyByPair = new Map();
    rows.forEach(row => {
        const pair = `${row.base_currency}/${row.target_currency}`;
        const rate = Number(row.rate);
        const parsedTimestamp = Date.parse(row.timestamp);
        const date = Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toISOString().slice(0, 10) : "";
        if(!requested.has(pair) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(rate) || rate <= 0) return;
        if(!dailyByPair.has(pair)) dailyByPair.set(pair, new Map());
        // Rows are ordered by capture time and id: the final hourly
        // observation for a UTC day is its daily close.
        dailyByPair.get(pair).set(date, rate);
    });
    return featuredPairs.map(pair => {
        const points = [...(dailyByPair.get(pair) || new Map()).entries()]
            .slice(-7).map(([date, rate]) => ({ date, rate }));
        return buildWeeklySummary(pair, points);
    });
}

function buildHourlyArchive(rows, now){
    const byHour = new Map();
    rows.forEach(row => {
        const capturedAt = Date.parse(row.timestamp);
        const pair = `${row.base_currency}/${row.target_currency}`;
        const rate = Number(row.rate);
        if(!Number.isFinite(capturedAt) || !/^[A-Z]{3}\/[A-Z]{3}$/.test(pair) ||
            !Number.isFinite(rate) || rate <= 0) return;
        const hour = new Date(capturedAt).toISOString().slice(0, 13) + ":00:00Z";
        if(!byHour.has(hour)) byHour.set(hour, new Map());
        // The ordered query makes the last row the retained observation
        // if a scheduled hour was retried.
        byHour.get(hour).set(pair, {
            pair, rate, region: String(row.region || "GLOBAL"),
            source: String(row.source || "UNKNOWN")
        });
    });
    const captures = [...byHour.entries()].sort(([left], [right]) => right.localeCompare(left))
        .slice(0, 168).map(([hour, pairMap]) => ({
            hour,
            pairs: [...pairMap.values()].sort((left, right) =>
                left.region.localeCompare(right.region) || left.pair.localeCompare(right.pair))
        }));
    return { generatedAt: now, source: TABLE, windowDays: 7, captures };
}

async function archiveAndBuildWeekly(options = {}){
    const env = options.env || process.env;
    if(!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY){
        throw new Error("FX archive requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }
    const snapshot = options.snapshot || JSON.parse(fs.readFileSync(path.join(DATA_DIR, "current.json"), "utf8"));
    const config = options.config || JSON.parse(fs.readFileSync(path.join(DATA_DIR, "fx-config.json"), "utf8"));
    if(snapshot.dataStatus !== "OK") throw new Error("FX_ARCHIVE_REQUIRES_FRESH_SNAPSHOT");
    const rows = archiveRows(snapshot, config);
    if(rows.length === 0) throw new Error("FX_ARCHIVE_HAS_NO_VALIDATED_RATES");
    const createClient = options.createClient || require("@supabase/supabase-js").createClient;
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await client.from(TABLE).insert(rows);
    if(error) throw new Error(`FX_ARCHIVE_INSERT_FAILED: ${error.message}`);
    const now = options.now || new Date().toISOString();
    const historicalRows = await readSevenDays(client, now);
    const summaries = summarizeRows(historicalRows, rows.map(row => `${row.base_currency}/${row.target_currency}`));
    const weekly = { generatedAt: now, source: TABLE, summaries };
    fs.writeFileSync(options.weeklyPath || path.join(DATA_DIR, "weekly-summary.json"), JSON.stringify(weekly, null, 2) + "\n", "utf8");
    const hourly = buildHourlyArchive(historicalRows, now);
    fs.writeFileSync(options.hourlyPath || path.join(DATA_DIR, "hourly-archive.json"), JSON.stringify(hourly, null, 2) + "\n", "utf8");
    return { archivedPairCount: rows.length, sevenDayRowCount: historicalRows.length, summaryCount: summaries.length, hourlyCaptureCount: hourly.captures.length };
}

if(require.main === module){
    archiveAndBuildWeekly().then(report => process.stdout.write(JSON.stringify(report) + "\n"))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { archiveAndBuildWeekly, archiveRows, readSevenDays, summarizeRows, buildHourlyArchive };
