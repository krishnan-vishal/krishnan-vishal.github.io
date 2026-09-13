#!/usr/bin/env node

// Mirrors validated canonical country metadata after the static publication
// workflow. GitHub remains authoritative; this is an optional cloud copy.
const fs = require("fs");
const path = require("path");

const COUNTRIES_PATH = path.resolve(__dirname, "../assets/data/country-intelligence.json");

function firstScalarField(record, fields, allowNumber = false){
    for(const field of fields){
        const value = record[field];
        if(typeof value === "string" && value.trim()) return { field, value };
        if(allowNumber && typeof value === "number" && Number.isFinite(value)) return { field, value: String(value) };
    }
    return null;
}

function formatCountryRows(countryData){
    if(!countryData || !Array.isArray(countryData.records)){
        throw new Error("country-intelligence.json must contain a records array");
    }

    const seenCodes = new Set();
    return countryData.records.map((record, index) => {
        const countryCode = record && (record.country_code || record.isoAlpha2);
        const countryName = record && (record.country_name || record.name);
        if(typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode)){
            throw new Error(`country-intelligence.records[${index}] has no valid ISO alpha-2 code`);
        }
        if(typeof countryName !== "string" || !countryName.trim() || countryName.length > 100){
            throw new Error(`country-intelligence.records[${index}] has no valid country name`);
        }
        if(seenCodes.has(countryCode)){
            throw new Error(`Duplicate country code in canonical metadata: ${countryCode}`);
        }
        seenCodes.add(countryCode);

        const summary = firstScalarField(record, ["intelligence_summary", "intelligenceSummary", "primarySummary", "markdownSummary", "summary"]);
        const risk = firstScalarField(record, ["risk_level", "riskLevel", "securityRiskLevel", "securityIndex", "securityIndicator"], true);
        if(risk && risk.value.length > 50){
            throw new Error(`country-intelligence.records[${index}] risk level exceeds 50 characters`);
        }

        const remainingFields = { ...record };
        ["country_code", "isoAlpha2", "country_name", "name", summary && summary.field, risk && risk.field]
            .filter(Boolean)
            .forEach(field => delete remainingFields[field]);
        const row = {
            country_code: countryCode,
            country_name: countryName,
            metadata: {
                schemaVersion: countryData.schemaVersion,
                ...remainingFields
            }
        };
        if(summary) row.intelligence_summary = summary.value;
        if(risk) row.risk_level = risk.value;
        return row;
    });
}

async function syncCountryIntelligence(options = {}){
    const env = options.env || process.env;
    const url = env.SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url || !serviceRoleKey){
        throw new Error("Country sync requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }

    const countryData = JSON.parse(fs.readFileSync(options.countriesPath || COUNTRIES_PATH, "utf8"));
    const rows = formatCountryRows(countryData);
    if(rows.length === 0) throw new Error("Country sync refused an empty canonical dataset");

    const createClient = options.createClient || require("@supabase/supabase-js").createClient;
    const supabase = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await supabase
        .from("country_intelligence")
        .upsert(rows, { onConflict: "country_code" });

    if(error){
        if(error.code === "42P10"){
            throw new Error("Supabase country sync requires a UNIQUE constraint on country_intelligence.country_code");
        }
        throw new Error(`Supabase country sync failed: ${error.message}`);
    }
    return rows.length;
}

if(require.main === module){
    syncCountryIntelligence()
        .then(count => console.log(`Upserted ${count} canonical country records into country_intelligence.`))
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
}

module.exports = { formatCountryRows, syncCountryIntelligence };
