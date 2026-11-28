const DAY = 86_400_000;
const HALF_HOUR = 1_800_000;
const HISTORY_FLOOR = Date.parse('2021-11-19T00:00:00Z');
const LIVE_SOURCES = [
    ['CB-APAC-002', 'mas-rss'],
    ['EPC-EUR-007', 'epc-news-html-v1'],
    ['PAYMENTSDIVE-US-005', 'trade-rss-v1'],
    ['FINEXTRA-PAY-006', 'trade-rss-v1'],
    ['FS-GLOBAL-003', 'universal-finance']
];
const TECHNICAL_SOURCES = ['MOJALOOP-OSS-001', 'HYPERSWITCH-OSS-001'];
const HISTORY_SOURCES = ['FINTECHNEWS-SG-008', 'ATLAS-APAC-009'];
const PROFILES = new Map([...LIVE_SOURCES,
    ...TECHNICAL_SOURCES.map(id => [id, 'github-technical-history-v1']),
    ...HISTORY_SOURCES.map(id => [id, 'wordpress-payments-v1'])]);

function iso(time) { return new Date(time).toISOString(); }

function bounds(run) {
    const from = Date.parse(run.metadata?.start_datetime || '');
    const to = Date.parse(run.metadata?.end_datetime || '');
    return from < to ? { from, to } : null;
}

function closedHistoryWindow(run) {
    const metadata = run.metadata || {};
    return run.run_status === 'SUCCESS' && metadata.unseen_remaining === 0 &&
        (metadata.window_truncated === false || (metadata.window_truncated === undefined &&
            Number.isInteger(metadata.links_discovered) && metadata.links_discovered < 100));
}

// An exact interval is complete only when every overlapping subinterval is covered.
// Start with the most recent gap and bisect an interval when its publisher capped it.
export function nextHistoryWindow(runs, now) {
    const done = runs.filter(closedHistoryWindow).map(bounds).filter(Boolean).sort((a, b) => a.to - b.to);
    const truncated = runs.filter(run => run.metadata?.window_truncated === true).map(bounds).filter(Boolean);
    const date = new Date(now);
    let to = Math.floor(now / DAY) * DAY;
    let from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    while (to > HISTORY_FLOOR) {
        from = Math.max(from, HISTORY_FLOOR);
        let end = to;
        while (end > from) {
            const covering = done.findLast(range => range.from < end && range.to >= end);
            if (covering) { end = covering.from; continue; }
            let start = done.findLast(range => range.to < end && range.to > from)?.to ?? from;
            // Keep trying the newest missing segment of a capped range. At one
            // day the source's capacity issue remains explicit in its run.
            while (end - start > DAY && truncated.some(range => range.from === start && range.to === end)) {
                start = start + Math.floor((end - start) / 2);
            }
            if (truncated.some(range => range.from === start && range.to === end)) {
                end = start;
                continue;
            }
            return { start_datetime: iso(start), end_datetime: iso(end), max_records: 100 };
        }
        to = from;
        const floorDate = new Date(from);
        from = Date.UTC(floorDate.getUTCFullYear(), floorDate.getUTCMonth() - 1, 1);
    }
    return null;
}

function technicalWindow(runs, now) {
    const today = Math.floor(now / DAY) * DAY;
    const completed = runs.find(run => run.run_status === 'SUCCESS' &&
        run.metadata?.statistics?.possibly_truncated?.changes === false &&
        run.metadata?.statistics?.possibly_truncated?.releases === false &&
        /^\d{4}-\d{2}-\d{2}$/.test(run.metadata?.technical_end_date || ''));
    // With no explicit saved range, recheck seven days through yesterday. The
    // existing acquisition adapter deduplicates identities across both windows.
    let start = completed ? Date.parse(completed.metadata.technical_end_date) + DAY : today - 7 * DAY;
    if (start >= today) return null;
    const capped = runs.find(run => run.metadata?.technical_start_date === iso(start).slice(0, 10) &&
        (run.metadata?.statistics?.possibly_truncated?.changes || run.metadata?.statistics?.possibly_truncated?.releases));
    const last = Math.min(today - DAY, start + 6 * DAY,
        capped ? Math.floor((start + Date.parse(capped.metadata.technical_end_date)) / 2 / DAY) * DAY : Infinity);
    return { start_date: iso(start).slice(0, 10), end_date: iso(last).slice(0, 10), max_pages: 3 };
}

function due(run, now) {
    const started = Date.parse(run?.started_at || '');
    if (!Number.isFinite(started)) return true;
    if (run.run_status === 'RUNNING') return now - started >= HALF_HOUR;
    if (/HTTP_(401|403)$/.test(run.error_message || '')) return now - started >= 7 * DAY;
    const backoff = run.run_status === 'SUCCESS' ? DAY : 6 * HALF_HOUR;
    return now - started >= backoff;
}

export function createAdaptiveAcquisition({ fetchImpl = fetch, now = Date.now } = {}) {
    return async ({ config, apiKey }) => {
        if (!apiKey) return null;
        const time = now();
        // The existing ten-minute publisher remains the only trigger. One of
        // its three slots per half hour may spend the bounded acquisition budget.
        if (Math.floor(time / 600_000) % 3 !== 0) return null;
        const deadline = time + 25_000;
        const headers = new Headers();
        headers.set('apikey', config.key);
        headers.set('authorization', `Bearer ${config.key}`);
        async function list(table, filters) {
            const response = await fetchImpl(`${config.url}/rest/v1/${table}?${new URLSearchParams(filters)}`,
                { headers, redirect: 'error', signal: AbortSignal.timeout(4_000) });
            if (!response.ok) throw Error('ACQUISITION_CHECKPOINT_UNAVAILABLE');
            const rows = await response.json();
            if (!Array.isArray(rows)) throw Error('ACQUISITION_CHECKPOINT_INVALID');
            return rows;
        }

        const registry = await list('source_registry', {
            select: 'source_id,parser_profile', source_status: 'eq.GREEN',
            feed_or_index_url: 'not.is.null', source_id: `in.(${[...PROFILES.keys()].join(',')})`
        });
        const eligible = registry.filter(row => PROFILES.get(row.source_id) === row.parser_profile);
        const checkpointReads = await Promise.allSettled(eligible.map(async ({ source_id: sourceId }) => {
            const historical = HISTORY_SOURCES.includes(sourceId);
            const filter = { source_id: `eq.${sourceId}`, select: 'started_at,run_status,metadata,error_message',
                order: 'started_at.desc,id.desc', limit: historical ? '512' : '12' };
            if (historical) filter['metadata->>start_datetime'] = 'not.is.null';
            const runs = await list('intelligence_ingestion_runs', filter);
            return { sourceId, runs };
        }));

        const checkpoints = checkpointReads.flatMap(item => item.status === 'fulfilled' ? [item.value] : []);
        const unavailableSources = eligible.filter((_, index) => checkpointReads[index].status === 'rejected')
            .map(row => row.source_id);

        const attempts = [];
        const oldestFirst = checkpoints.filter(({ runs }) => due(runs[0], time)).sort((left, right) =>
            (Date.parse(left.runs[0]?.started_at) || 0) - (Date.parse(right.runs[0]?.started_at) || 0) ||
            [...PROFILES.keys()].indexOf(left.sourceId) - [...PROFILES.keys()].indexOf(right.sourceId));
        for (const { sourceId, runs } of oldestFirst) {
            const remaining = Math.min(10_000, deadline - now());
            if (remaining < 1_000 || attempts.length >= 2) break;
            const window = HISTORY_SOURCES.includes(sourceId) ? nextHistoryWindow(runs, time)
                : TECHNICAL_SOURCES.includes(sourceId) ? technicalWindow(runs, time) : {};
            if (!window) continue;
            const result = { sourceId, mode: window.start_datetime ? 'HISTORY' : window.start_date ? 'TECHNICAL' : 'LIVE',
                ...(window.start_datetime ? { from: window.start_datetime, to: window.end_datetime } : {}),
                ...(window.start_date ? { from: window.start_date, to: window.end_date } : {}) };
            try {
                const sourceHeaders = new Headers({ 'content-type': 'application/json' });
                sourceHeaders.set('apikey', apiKey);
                sourceHeaders.set('authorization', `Bearer ${apiKey}`);
                const response = await fetchImpl(`${config.url}/functions/v1/gpir-intelligence-fetch`, {
                    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(remaining), headers: sourceHeaders,
                    body: JSON.stringify({ source_id: sourceId, dry_run: false, ...window })
                });
                const payload = await response.json();
                const stats = payload.statistics;
                result.status = !response.ok || payload.ok !== true ? 'FAILED'
                    : payload.mode === 'SKIPPED_OVERLAP' ? 'ALREADY_RUNNING' : !stats ? 'UNVERIFIED' : 'ACQUIRED';
                if (result.status === 'ACQUIRED') {
                    result.inserted = stats.raw_records_inserted;
                    result.unseenRemaining = stats.unseen_remaining;
                }
            } catch {
                // If the caller times out, the source lease and run record own
                // recovery. The next publisher must never assume an empty fetch.
                result.status = 'UNCONFIRMED';
            }
            attempts.push(result);
            if (result.inserted > 0) break;
        }
        return attempts.length || unavailableSources.length ? { attempts, unavailableSources } : null;
    };
}
