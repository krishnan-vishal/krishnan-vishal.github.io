#!/usr/bin/env node
/*
 * GPIR FX snapshot orchestrator -- the entry point GitHub Actions runs.
 *
 * PIPELINE
 *   provider priority walk -> normalize -> previous-business-day
 *   variance -> validate/quarantine -> write current.json -> freeze
 *   yesterday's outgoing snapshot into history/ if a new day started
 *
 * SAFETY CONTRACT
 *   1. Never fabricate a rate. A provider that returns nothing usable
 *      moves the whole run to the next provider; if every provider
 *      (including the always-available reference tier) fails, this
 *      falls back to the last validated GPIR snapshot on disk with
 *      dataStatus escalated to "STALE" rather than inventing numbers.
 *   2. Never rewrite an existing history/YYYY/MM/YYYY-MM-DD.json file.
 *   3. Never mark a record LIVE unless its provider is providerType
 *      "live"; the reference tier is always "REFERENCE".
 */

const fs = require("fs");
const path = require("path");
const { PROVIDER_PRIORITY } = require("./providers/index.js");
const { buildRecord, validateRecord, findDuplicateRecords } = require("./normalize-validate.js");
const { resolvePreviousBusinessClose, computeVariance } = require("./business-day.js");
const { buildWeeklySummary } = require("./weekly-summary.js");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "assets", "data", "fx");
const CONFIG_PATH = path.join(DATA_DIR, "fx-config.json");
const CURRENT_PATH = path.join(DATA_DIR, "current.json");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const WEEKLY_SUMMARY_PATH = path.join(DATA_DIR, "weekly-summary.json");

function readJsonIfExists(filePath, fallback){
    if(!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function utcDateOnly(isoTimestamp){
    return isoTimestamp.slice(0, 10);
}

function historyFilePath(isoDate){
    const [year, month] = isoDate.split("-");
    return path.join(HISTORY_DIR, year, month, `${isoDate}.json`);
}

/*
 * Builds { "USD/INR": { "2026-09-05": 88.1, ... }, ... } from every
 * history file already on disk, so previous-business-day resolution
 * has real archived closes to walk back through.
 */
function loadHistoricalCloses(){
    const closesByPair = {};
    if(!fs.existsSync(HISTORY_DIR)) return closesByPair;
    for(const year of fs.readdirSync(HISTORY_DIR)){
        const yearDir = path.join(HISTORY_DIR, year);
        if(!fs.statSync(yearDir).isDirectory()) continue;
        for(const month of fs.readdirSync(yearDir)){
            const monthDir = path.join(yearDir, month);
            if(!fs.statSync(monthDir).isDirectory()) continue;
            for(const file of fs.readdirSync(monthDir)){
                if(!file.endsWith(".json")) continue;
                const snapshot = readJsonIfExists(path.join(monthDir, file), null);
                if(!snapshot || !Array.isArray(snapshot.pairs)) continue;
                snapshot.pairs.forEach(record => {
                    const referenceRate = Number.isFinite(record.mid) ? record.mid : record.last;
                    const observationDate = record.timestamp && !Number.isNaN(Date.parse(record.timestamp))
                        ? utcDateOnly(record.timestamp)
                        : null;
                    if(record.validationStatus !== "VALIDATED" || !record.pair || !observationDate || !Number.isFinite(referenceRate)) return;
                    if(!closesByPair[record.pair]) closesByPair[record.pair] = {};
                    // Key by the provider observation day, not the scheduler run
                    // day. Two GPIR snapshots of the same provider business day
                    // can therefore never become a false variance comparison.
                    closesByPair[record.pair][observationDate] = referenceRate;
                });
            }
        }
    }
    return closesByPair;
}

function listHistoricalSnapshots(){
    const snapshots = [];
    if(!fs.existsSync(HISTORY_DIR)) return snapshots;
    for(const year of fs.readdirSync(HISTORY_DIR)){
        const yearDir = path.join(HISTORY_DIR, year);
        if(!fs.statSync(yearDir).isDirectory()) continue;
        for(const month of fs.readdirSync(yearDir)){
            const monthDir = path.join(yearDir, month);
            if(!fs.statSync(monthDir).isDirectory()) continue;
            for(const file of fs.readdirSync(monthDir)){
                if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
                const snapshot = readJsonIfExists(path.join(monthDir, file), null);
                if(snapshot) snapshots.push(snapshot);
            }
        }
    }
    return snapshots.sort((left, right) => String(left.publicationDate).localeCompare(String(right.publicationDate)));
}

function findPreviousValidatedUniverse(currentObservationDate, historicalSnapshots, maxLookbackDays){
    const byObservationDate = {};
    historicalSnapshots.forEach(snapshot => {
        const universe = snapshot.currencyUniverse;
        if(!universe || universe.validationStatus !== "VALIDATED" || !universe.timestamp || !universe.rates) return;
        const observationDate = utcDateOnly(universe.timestamp);
        byObservationDate[observationDate] = universe;
    });
    const { previousBusinessDate } = resolvePreviousBusinessClose(
        currentObservationDate,
        Object.fromEntries(Object.keys(byObservationDate).map(date => [date, 1])),
        [],
        maxLookbackDays
    );
    return previousBusinessDate ? { date: previousBusinessDate, universe: byObservationDate[previousBusinessDate] } : null;
}

/*
 * Freezes the OUTGOING current.json as its own day's history file the
 * first time a run notices the calendar date has moved on -- this is
 * what makes "complete a GPIR market-day cycle" deterministic under a
 * periodic (not streaming) refresh model, with no wall-clock
 * "end of day" timer required. Never overwrites an existing file.
 */
function freezeOutgoingSnapshotIfNewDay(outgoingSnapshot, todayDate){
    if(!outgoingSnapshot || !outgoingSnapshot.publicationDate) return null;
    if(outgoingSnapshot.publicationDate === todayDate) return null; // same day, nothing to freeze yet
    const target = historyFilePath(outgoingSnapshot.publicationDate);
    if(fs.existsSync(target)){
        return { frozen: false, reason: "ALREADY_FROZEN", path: target };
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ ...outgoingSnapshot, status: "historical" }, null, 2) + "\n", "utf8");
    return { frozen: true, path: target };
}

/*
 * Writes assets/data/fx/weekly-summary.json from archived closes only
 * -- purely deterministic quantitative observations (see
 * scripts/fx/weekly-summary.js), never editorial commentary.
 */
function writeWeeklySummaries(pairs, historicalCloses, generatedAt, currentRecords = []){
    const currentByPair = new Map(currentRecords
        .filter(record => record.validationStatus === "VALIDATED")
        .map(record => [record.pair, record]));
    const summaries = pairs.map(pair => {
        const closesForPair = { ...(historicalCloses[pair] || {}) };
        const current = currentByPair.get(pair);
        const currentRate = current && (Number.isFinite(current.mid) ? current.mid : current.last);
        if(current && current.timestamp && Number.isFinite(currentRate)){
            closesForPair[utcDateOnly(current.timestamp)] = currentRate;
        }
        const points = Object.keys(closesForPair)
            .sort()
            .slice(-7)
            .map(date => ({ date, rate: closesForPair[date] }));
        return buildWeeklySummary(pair, points);
    });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(WEEKLY_SUMMARY_PATH, JSON.stringify({ generatedAt, summaries }, null, 2) + "\n", "utf8");
    return summaries;
}

async function runProviderPriority(pairs, options){
    const attempts = [];
    for(const provider of PROVIDER_PRIORITY){
        if(!provider.isConfigured()){
            attempts.push({ provider: provider.id, status: "NOT_CONFIGURED" });
            continue;
        }
        try{
            const records = await provider.fetchPairs(pairs, options);
            const currencyUniverse = records.currencyUniverse || null;
            const usable = records.filter(record => record.dataStatus !== "NO_PROVIDER_CONFIGURED");
            if(usable.length === 0){
                attempts.push({ provider: provider.id, status: "NO_USABLE_RECORDS" });
                continue;
            }
            attempts.push({ provider: provider.id, status: "SUCCEEDED", recordCount: usable.length });
            return { records, currencyUniverse, attempts, providerUsed: provider.id };
        } catch(error){
            attempts.push({ provider: provider.id, status: "FAILED", error: error.message });
        }
    }
    return { records: null, currencyUniverse: null, attempts, providerUsed: null };
}

async function generateSnapshot(options = {}){
    const {
        retrievedAt = new Date().toISOString(),
        fetchImpl = globalThis.fetch,
        env = process.env
    } = options;

    const config = readJsonIfExists(CONFIG_PATH, { featuredPairs: [], extremeMovePercentThreshold: 8, staleAfterMinutesByProviderType: {}, maxLookbackDaysForPreviousBusinessClose: 10 });
    const pairs = config.featuredPairs || [];
    const todayDate = utcDateOnly(retrievedAt);

    const previousSnapshot = readJsonIfExists(CURRENT_PATH, null);
    const freezeResult = freezeOutgoingSnapshotIfNewDay(previousSnapshot, todayDate);

    const { records: fetchedRecords, currencyUniverse: fetchedUniverse, attempts, providerUsed } = await runProviderPriority(pairs, { fetchImpl, env, retrievedAt });
    const historicalCloses = loadHistoricalCloses();
    const historicalSnapshots = listHistoricalSnapshots();

    let pairRecords;
    let dataStatus;

    if(fetchedRecords){
        pairRecords = fetchedRecords.map(fields => {
            const providerType = fields.providerType;
            const closesForPair = historicalCloses[fields.pair] || {};
            const observationDate = fields.timestamp && !Number.isNaN(Date.parse(fields.timestamp))
                ? utcDateOnly(fields.timestamp)
                : todayDate;
            const { previousBusinessDate, previousBusinessClose } = resolvePreviousBusinessClose(
                observationDate, closesForPair, [], config.maxLookbackDaysForPreviousBusinessClose
            );
            const referenceRate = Number.isFinite(fields.mid) ? fields.mid : fields.last;
            const variance = computeVariance(referenceRate, previousBusinessClose);
            const record = buildRecord({
                ...fields,
                previousBusinessClose,
                previousBusinessDate,
                absoluteChange: variance.absoluteChange,
                percentageChange: variance.percentageChange,
                direction: variance.direction,
                dataStatus: fields.dataStatus || (providerType === "live" ? "LIVE" : providerType === "reference" ? "REFERENCE" : "DELAYED")
            });
            const staleAfterMinutes = (config.staleAfterMinutesByProviderType || {})[providerType] || 24 * 60;
            const anomalies = validateRecord(record, {
                now: new Date(retrievedAt),
                staleAfterMinutes,
                extremeMovePercent: config.extremeMovePercentThreshold || 8
            });
            record.validationStatus = anomalies.length ? "QUARANTINED" : "VALIDATED";
            record.anomalies = anomalies;
            return record;
        });
        const duplicateIndexes = findDuplicateRecords(pairRecords);
        duplicateIndexes.forEach(index => {
            pairRecords[index].validationStatus = "QUARANTINED";
            pairRecords[index].anomalies = [...(pairRecords[index].anomalies || []), "DUPLICATE_RECORD"];
        });
        dataStatus = "OK";
    } else if(previousSnapshot && Array.isArray(previousSnapshot.pairs)){
        // Every provider (including the always-on reference tier)
        // failed this run -- fall back to the last validated GPIR
        // snapshot rather than publishing nothing or inventing data,
        // but escalate every record's status to STALE so the reader
        // is never told a frozen snapshot is current.
        pairRecords = previousSnapshot.pairs.map(record => ({ ...record, dataStatus: "STALE" }));
        dataStatus = "PROVIDER_UNAVAILABLE_SERVED_LAST_KNOWN_GOOD";
    } else {
        // First-ever run with no provider reachable and no prior
        // snapshot to fall back to: publish the honest NO_PROVIDER_
        // CONFIGURED state per pair rather than nothing at all.
        pairRecords = pairs.map(pair => {
            const [base, quote] = pair.split("/");
            return buildRecord({ pair, base, quote, timestamp: retrievedAt, provider: null, providerType: "fallback", dataStatus: "NO_PROVIDER_CONFIGURED" });
        });
        dataStatus = "NO_PROVIDER_CONFIGURED";
    }

    let currencyUniverse = fetchedUniverse;
    if(currencyUniverse){
        const observationDate = utcDateOnly(currencyUniverse.timestamp);
        const previous = findPreviousValidatedUniverse(
            observationDate,
            historicalSnapshots,
            config.maxLookbackDaysForPreviousBusinessClose
        );
        currencyUniverse = {
            ...currencyUniverse,
            previousBusinessDate: previous ? previous.date : null,
            previousBusinessRates: previous ? previous.universe.rates : null
        };
    } else if(!fetchedRecords && previousSnapshot && previousSnapshot.currencyUniverse){
        currencyUniverse = { ...previousSnapshot.currencyUniverse, dataStatus: "STALE" };
    }

    const snapshot = {
        schemaVersion: "1.0",
        publicationDate: todayDate,
        generatedAt: retrievedAt,
        status: "current",
        dataStatus,
        refreshIntervalMinutes: config.refreshFrequencyMinutes,
        staleAfterMinutesByProviderType: config.staleAfterMinutesByProviderType,
        providerUsed,
        providerAttempts: attempts,
        historyDates: historicalSnapshots.map(item => item.publicationDate).filter(Boolean),
        currencyUniverse,
        pairs: pairRecords
    };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CURRENT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    const weeklySummaries = writeWeeklySummaries(pairs, historicalCloses, retrievedAt, pairRecords);

    return { snapshot, freezeResult, weeklySummaries };
}

async function main(){
    const { snapshot, freezeResult } = await generateSnapshot();
    const report = {
        mode: "FX_SNAPSHOT_GENERATION",
        publicationDate: snapshot.publicationDate,
        dataStatus: snapshot.dataStatus,
        providerUsed: snapshot.providerUsed,
        pairCount: snapshot.pairs.length,
        quarantinedCount: snapshot.pairs.filter(record => record.validationStatus === "QUARANTINED").length,
        providerAttempts: snapshot.providerAttempts,
        historyFrozen: freezeResult
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if(require.main === module){
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { generateSnapshot, loadHistoricalCloses, freezeOutgoingSnapshotIfNewDay, historyFilePath };
