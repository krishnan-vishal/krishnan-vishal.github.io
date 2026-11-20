const DEFAULT_START = '2021-11-19T00:00:00.000Z';
const DEFAULT_END = '2026-11-19T00:00:00.000Z';
const APPROVED_SOURCES = Object.freeze(['FINTECHNEWS-SG-008', 'ATLAS-APAC-009']);

function addUtcMonth(value) {
    const date = new Date(value);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.toISOString();
}

export function monthlyWindows(start = DEFAULT_START, end = DEFAULT_END) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs)
        throw Error('INVALID_BACKFILL_RANGE');
    const windows = [];
    let cursor = new Date(startMs).toISOString();
    while (Date.parse(cursor) < endMs) {
        const next = addUtcMonth(cursor);
        const upper = Date.parse(next) > endMs ? new Date(endMs).toISOString() : next;
        windows.push({ from: cursor, to: upper });
        cursor = upper;
        if (windows.length > 120) throw Error('BACKFILL_RANGE_TOO_LARGE');
    }
    return windows;
}

function argumentsFrom(argv = process.argv.slice(2)) {
    const value = name => argv.find(item => item.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
    const mode = argv.includes('--apply') ? 'apply' : argv.includes('--dry-run') ? 'dry-run' : 'plan';
    const sources = value('sources') ? value('sources').split(',').filter(Boolean) : [...APPROVED_SOURCES];
    if (sources.some(source => !APPROVED_SOURCES.includes(source))) throw Error('UNAPPROVED_BACKFILL_SOURCE');
    return { mode, sources, start: value('start') || DEFAULT_START, end: value('end') || DEFAULT_END };
}

async function invoke(url, secret, functionName, body) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.set('apikey', secret);
    headers.set('Authorization', `Bearer ${secret}`);
    const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${functionName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }
    if (!response.ok || payload.ok === false || payload.status === 'ERROR')
        throw Error(`${functionName.toUpperCase()}_${response.status}: ${JSON.stringify(payload)}`);
    return payload;
}

export async function run({ mode, sources, start, end, env = process.env, write = console.log }) {
    const windows = monthlyWindows(start, end);
    if (mode === 'plan') {
        const result = { mode: 'PLAN_ONLY', sources, windows, requestCountMinimum: sources.length * windows.length };
        write(JSON.stringify(result, null, 2));
        return result;
    }
    const url = env.SUPABASE_URL;
    const secret = env.GPIR_EDGE_FUNCTION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) throw Error('BACKFILL_EDGE_CONFIGURATION_REQUIRED');

    const summary = { mode: mode.toUpperCase(), sources, windowCount: windows.length, fetchCalls: 0,
        publicationCalls: 0, inserted: 0, published: 0, review: 0, duplicates: 0 };
    for (const sourceId of sources) {
        for (const window of windows) {
            let unseenRemaining = 0;
            for (let pass = 1; pass <= 20; pass += 1) {
                const result = await invoke(url, secret, 'gpir-intelligence-fetch', {
                    source_id: sourceId, dry_run: mode !== 'apply',
                    start_datetime: window.from, end_datetime: window.to, max_records: 100
                });
                summary.fetchCalls += 1;
                summary.inserted += Number(result.statistics?.raw_records_inserted || 0);
                unseenRemaining = Number(result.statistics?.unseen_remaining || 0);
                write(JSON.stringify({ sourceId, ...window, pass, stage: 'fetch', statistics: result.statistics }));
                if (mode !== 'apply' || unseenRemaining === 0) break;
                if (pass === 20) throw Error(`BACKFILL_PASS_LIMIT:${sourceId}:${window.from}`);
            }
            if (mode !== 'apply') continue;
            for (let pass = 1; pass <= 100; pass += 1) {
                const result = await invoke(url, secret, 'gpir-intelligence-publish', {
                    from: window.from, to: window.to, batchSize: 5
                });
                summary.publicationCalls += 1;
                summary.published += Number(result.published || 0);
                summary.review += Number(result.awaitingReview || 0);
                summary.duplicates += Number(result.duplicates || 0);
                write(JSON.stringify({ sourceId, ...window, pass, stage: 'publish', processed: result.processed,
                    published: result.published, awaitingReview: result.awaitingReview, duplicates: result.duplicates }));
                if (Number(result.processed || 0) === 0) break;
                if (pass === 100) throw Error(`PUBLICATION_PASS_LIMIT:${sourceId}:${window.from}`);
            }
        }
    }
    write(JSON.stringify(summary, null, 2));
    return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run(argumentsFrom()).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

export { APPROVED_SOURCES, argumentsFrom };
import { pathToFileURL } from 'node:url';

