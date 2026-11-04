#!/usr/bin/env node
/* Dry-run by default; Production writes require both --apply and approval env. */

const fs = require("fs");
const path = require("path");
const { insertArchiveRows } = require("./archive-supabase.js");
const { recoverHistoricalReference, renderCoverageMarkdown } = require("./historical-reference.js");

const ROOT = path.resolve(__dirname, "..", "..");
const CONFIG = path.join(ROOT, "assets", "data", "fx", "fx-config.json");

function argumentsFrom(argv){
    const apply = argv.includes("--apply");
    const plan = argv.includes("--plan") || !apply;
    if(apply && argv.includes("--plan")) throw new Error("FX_HISTORY_SELECT_ONE_MODE");
    const value = name => argv.find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
    return { apply, plan, from: value("--from") || "2026-01-01",
        to: value("--to") || new Date().toISOString().slice(0, 10),
        reportPath: value("--report") };
}

async function main(options = {}){
    const args = options.args || argumentsFrom(process.argv.slice(2));
    const env = options.env || process.env;
    if(args.apply){
        if(env.FX_HISTORY_BACKFILL_APPROVED !== "true") throw new Error("FX_HISTORY_BACKFILL_APPROVAL_REQUIRED");
        if(!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
            throw new Error("FX_HISTORY_BACKFILL_SUPABASE_CONFIGURATION_REQUIRED");
    }
    const config = options.config || JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    const recovery = await recoverHistoricalReference({ config, from: args.from,
        to: args.to, fetchImpl: options.fetchImpl || globalThis.fetch });
    if(args.apply){
        const createClient = options.createClient || require("@supabase/supabase-js").createClient;
        const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        await insertArchiveRows(client, recovery.rows);
    }
    if(args.reportPath){
        fs.writeFileSync(path.resolve(ROOT, args.reportPath), renderCoverageMarkdown(recovery.report), "utf8");
    }
    const result = { mode: args.apply ? "APPLY_APPROVED" : "PLAN_ONLY",
        ...recovery.report, rowsSubmitted: args.apply ? recovery.rows.length : 0 };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
}

if(require.main === module){
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { argumentsFrom, main };
