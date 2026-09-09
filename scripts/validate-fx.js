#!/usr/bin/env node
/*
 * GPIR FX structured-data contract check (CI-style, mirrors
 * scripts/validate-content.js). Dev-time/CI check for the FX data
 * layer -- validates schema, anomaly quarantine and historical
 * immutability without contacting the network.
 */

const fs = require("fs");
const path = require("path");
const { validateRecord, findDuplicateRecords } = require("./fx/normalize-validate.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "assets", "data", "fx");
const CONFIG_PATH = path.join(DATA_DIR, "fx-config.json");
const CURRENT_PATH = path.join(DATA_DIR, "current.json");
const HISTORY_DIR = path.join(DATA_DIR, "history");

const errors = [];
const warnings = [];
const PAIR_PATTERN = /^[A-Z]{3}\/[A-Z]{3}$/;

function readJson(filePath){
    try{
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch(error){
        errors.push(`${path.relative(ROOT, filePath)}: invalid JSON (${error.message})`);
        return null;
    }
}

function validateConfig(config){
    if(!config) return;
    if(!Array.isArray(config.featuredPairs) || config.featuredPairs.length === 0){
        errors.push("fx-config.json: featuredPairs must be a non-empty array");
        return;
    }
    const seen = new Set();
    config.featuredPairs.forEach((pair, index) => {
        if(!PAIR_PATTERN.test(pair)){
            errors.push(`fx-config.json.featuredPairs[${index}]: malformed pair (${pair})`);
        }
        if(seen.has(pair)){
            errors.push(`fx-config.json.featuredPairs[${index}]: duplicate pair (${pair})`);
        }
        seen.add(pair);
    });
    if(!Array.isArray(config.providerPriority) || config.providerPriority.length === 0){
        errors.push("fx-config.json: providerPriority must be a non-empty array");
    }
    const requiredRegions = ["GLOBAL", "APAC", "SOUTH ASIA", "GCC / MIDDLE EAST", "AFRICA", "LATAM", "CIS", "EUROPE", "NORTH AMERICA", "OCEANIA"];
    const assignedPairs = [];
    requiredRegions.forEach(region => {
        if(!config.marketRegions || !Array.isArray(config.marketRegions[region])){
            errors.push(`fx-config.json.marketRegions.${region}: expected an array`);
            return;
        }
        assignedPairs.push(...config.marketRegions[region]);
    });
    config.featuredPairs.forEach(pair => {
        const assignments = assignedPairs.filter(item => item === pair).length;
        if(assignments !== 1) errors.push(`fx-config.json.marketRegions: ${pair} must be assigned exactly once (found ${assignments})`);
    });
    if(typeof config.disclaimer !== "string" || !config.disclaimer.trim()){
        errors.push("fx-config.json: disclaimer must be a non-empty string");
    }
}

function validateSnapshotPairs(records, label, options){
    if(!Array.isArray(records)){
        errors.push(`${label}: pairs must be an array`);
        return;
    }
    records.forEach((record, index) => {
        const anomalies = validateRecord(record, options);
        const recordedAnomalies = new Set(record.anomalies || []);
        // The generator already computed and stored anomalies at write
        // time; re-validating here must never find something new that
        // wasn't already disclosed, and a record must never claim
        // VALIDATED while carrying an anomaly.
        anomalies.forEach(reason => {
            if(!recordedAnomalies.has(reason)){
                errors.push(`${label}.pairs[${index}] (${record.pair}): undisclosed anomaly ${reason}`);
            }
        });
        if(anomalies.length && record.validationStatus === "VALIDATED"){
            errors.push(`${label}.pairs[${index}] (${record.pair}): marked VALIDATED but has anomalies (${anomalies.join(", ")})`);
        }
    });
    const duplicateIndexes = findDuplicateRecords(records);
    duplicateIndexes.forEach(index => {
        if(records[index].validationStatus !== "QUARANTINED"){
            errors.push(`${label}.pairs[${index}] (${records[index].pair}): duplicate record must be quarantined, not published as VALIDATED`);
        }
    });
}

function validateCurrencyUniverse(universe, label){
    if(universe == null) return;
    if(typeof universe !== "object" || Array.isArray(universe)){
        errors.push(`${label}.currencyUniverse: expected an object or null`);
        return;
    }
    if(!/^[A-Z]{3}$/.test(universe.commonBase || "")) errors.push(`${label}.currencyUniverse.commonBase: malformed currency code`);
    if(!universe.provider || typeof universe.provider !== "string") errors.push(`${label}.currencyUniverse.provider: provider attribution is required`);
    if(universe.validationStatus !== "VALIDATED") errors.push(`${label}.currencyUniverse.validationStatus: must be VALIDATED before publication`);
    if(!universe.rates || typeof universe.rates !== "object" || Array.isArray(universe.rates)){
        errors.push(`${label}.currencyUniverse.rates: expected a common-base rate object`);
        return;
    }
    const rateCodes = Object.keys(universe.rates);
    rateCodes.forEach(code => {
        if(!/^[A-Z]{3}$/.test(code) || !Number.isFinite(universe.rates[code]) || universe.rates[code] <= 0){
            errors.push(`${label}.currencyUniverse.rates.${code}: expected a positive finite rate under an ISO-style three-letter code`);
        }
    });
    if(!Array.isArray(universe.currencies) || universe.currencies.join("|") !== rateCodes.sort().join("|")){
        errors.push(`${label}.currencyUniverse.currencies: must exactly list the published common-base rate codes`);
    }
    if(universe.previousBusinessRates != null){
        if(!universe.previousBusinessDate || typeof universe.previousBusinessRates !== "object"){
            errors.push(`${label}.currencyUniverse: previous rates require a previousBusinessDate and rate object`);
        }
    }
}

function validateCurrent(){
    if(!fs.existsSync(CURRENT_PATH)){
        warnings.push("assets/data/fx/current.json does not exist yet -- no snapshot has been generated in this checkout.");
        return;
    }
    const current = readJson(CURRENT_PATH);
    if(!current) return;
    ["schemaVersion", "publicationDate", "generatedAt", "status", "dataStatus"].forEach(field => {
        if(typeof current[field] !== "string" || !current[field].trim()){
            errors.push(`current.json.${field}: expected a non-empty string`);
        }
    });
    if(current.status !== "current"){
        errors.push(`current.json.status: expected "current", got ${JSON.stringify(current.status)}`);
    }
    validateSnapshotPairs(current.pairs, "current.json", { now: new Date(current.generatedAt || Date.now()) });
    validateCurrencyUniverse(current.currencyUniverse, "current.json");
}

function validateHistory(){
    if(!fs.existsSync(HISTORY_DIR)) return;
    for(const year of fs.readdirSync(HISTORY_DIR)){
        const yearDir = path.join(HISTORY_DIR, year);
        if(!fs.statSync(yearDir).isDirectory()) continue;
        if(!/^\d{4}$/.test(year)) errors.push(`assets/data/fx/history/${year}: expected a YYYY directory name`);
        for(const month of fs.readdirSync(yearDir)){
            const monthDir = path.join(yearDir, month);
            if(!fs.statSync(monthDir).isDirectory()) continue;
            if(!/^\d{2}$/.test(month)) errors.push(`assets/data/fx/history/${year}/${month}: expected a MM directory name`);
            for(const file of fs.readdirSync(monthDir)){
                if(!file.endsWith(".json")) continue;
                const filePath = path.join(monthDir, file);
                const label = `assets/data/fx/history/${year}/${month}/${file}`;
                if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)){
                    errors.push(`${label}: filename must be YYYY-MM-DD.json`);
                    continue;
                }
                const snapshot = readJson(filePath);
                if(!snapshot) continue;
                if(snapshot.status !== "historical"){
                    errors.push(`${label}: status must be "historical"`);
                }
                const expectedDate = file.replace(".json", "");
                if(snapshot.publicationDate !== expectedDate){
                    errors.push(`${label}: publicationDate (${snapshot.publicationDate}) must match the filename date (${expectedDate})`);
                }
                validateSnapshotPairs(snapshot.pairs, label, { now: new Date(snapshot.generatedAt || Date.now()) });
                validateCurrencyUniverse(snapshot.currencyUniverse, label);
            }
        }
    }
}

function main(){
    validateConfig(readJson(CONFIG_PATH));
    validateCurrent();
    validateHistory();

    warnings.forEach(warning => console.warn(`WARN  ${warning}`));

    if(errors.length){
        console.error(`GPIR FX validation failed with ${errors.length} error(s):`);
        errors.forEach(error => console.error(`- ${error}`));
        process.exitCode = 1;
    } else {
        console.log("GPIR FX validation passed.");
    }
}

if(require.main === module){
    main();
}

module.exports = { validateConfig, validateSnapshotPairs, validateCurrencyUniverse, validateCurrent, validateHistory };
