'use strict';

// Read-only CMS transport. Never log response bodies, credentials or headers.
async function readJSON(fetchImpl, url, options, {
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
    timeoutMs = 60_000
} = {}) {
    const parsed = new URL(url);
    const key = parsed.searchParams.get('where[sourceRecordKey][equals]');
    const label = parsed.pathname + (/^m41:blob:[a-f0-9]{64}$/.test(key || '') ? ` (${key})` : '');
    let failure;
    for (let attempt = 1; attempt <= 3; attempt++) {
        let status = 'NO_RESPONSE';
        let length = 0;
        let retryable = true;
        try {
            const headers = new Headers(options.headers);
            headers.set('accept-encoding', 'identity');
            const response = await fetchImpl(url, { ...options, headers, signal: AbortSignal.timeout(timeoutMs) });
            status = response.status;
            if (!response.ok) {
                retryable = [502, 503, 504].includes(status);
                await response.body?.cancel();
                throw Error('HTTP_FAILURE');
            }
            const body = await response.text();
            length = Buffer.byteLength(body);
            try { return JSON.parse(body); } catch { throw Error('INVALID_JSON'); }
        } catch (error) {
            const category = ['HTTP_FAILURE', 'INVALID_JSON'].includes(error.message) ? error.message : 'BODY_OR_CONNECTION_FAILURE';
            failure = new Error(`Payload read failed: ${label}; HTTP=${status}; bytes=${length}; attempt=${attempt}/3; ${category}`);
            if (!retryable || attempt === 3) throw failure;
            console.error(failure.message + '; retrying this read only');
            await delay(attempt * 1000);
        }
    }
    throw failure;
}

module.exports = { readJSON };
