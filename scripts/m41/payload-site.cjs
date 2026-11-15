'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const site = require('./site-content.cjs');
function configuration(env) {
    const origin = new URL(env.PAYLOAD_PUBLIC_SERVER_URL || 'https://invalid.invalid');
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
        !env.PAYLOAD_RELEASE_API_KEY || !env.GPIR_RELEASE_SIGNING_SECRET || env.GPIR_RELEASE_SIGNING_SECRET.length < 32 ||
        !/^[a-f0-9]{64}$/.test(env.GPIR_PAYLOAD_SITE_SNAPSHOT || '')) throw new Error('Complete HTTPS Payload managed-site configuration is required.');
    return { origin: origin.origin, key: env.PAYLOAD_RELEASE_API_KEY, secret: env.GPIR_RELEASE_SIGNING_SECRET, snapshot: env.GPIR_PAYLOAD_SITE_SNAPSHOT };
}
async function client(env, fetchImpl = fetch) {
    const config = configuration(env);
    async function request(route, options = {}) {
        const response = await fetchImpl(`${config.origin}${route}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(60000),
            headers: { authorization: `users API-Key ${config.key}`, 'content-type': 'application/json' } });
        if (!response.ok) throw new Error(`Payload managed-site request failed: HTTP ${response.status}`);
        return response.json();
    }
    const result = await request('/api/release/managed-site', { method: 'POST', body: JSON.stringify({ snapshot: config.snapshot }) });
    const expected = crypto.createHmac('sha256', config.secret).update(site.canonical(result.manifest)).digest('hex');
    if (result.integrity?.signature !== expected || result.integrity?.sha256 !== site.sha256(site.canonical(result.manifest))) throw new Error('Payload manifest signature mismatch.');
    const manifest = site.validateManifest(result.manifest);
    if (manifest.snapshot !== config.snapshot) throw new Error('Payload returned another snapshot.');
    async function record(key) {
        const query = new URLSearchParams({ 'where[sourceRecordKey][equals]': key, limit: '2', depth: '0' });
        const response = await request(`/api/editorial-metadata?${query}`);
        if (response.totalDocs !== 1 || response.docs?.length !== 1) throw new Error('Payload managed content is missing or ambiguous.');
        const doc = response.docs[0];
        if (site.sha256(site.canonical(doc.sourcePayload)) !== doc.sourceHash) throw new Error('Payload managed content was changed outside its immutable snapshot.');
        return { sourceRecordKey: key, sourceHash: doc.sourceHash, sourcePayload: doc.sourcePayload };
    }
    return { manifest, record, request };
}
async function materialize(outputRoot, env = process.env, fetchImpl = fetch) {
    const source = await client(env, fetchImpl);
    const current = site.inventory(outputRoot, source.manifest.sourceCommit);
    // This migration switches an exact, already-public edition. Content changes
    // require a new manifest/release; it never overwrites a newly changed engine.
    if (site.canonical(current) !== site.canonical(source.manifest)) throw new Error('Public baseline changed since migration; reconcile before cutover.');
    // Verify the entire source before replacing any output bytes.
    const pending = [];
    for (const item of source.manifest.files) {
        const doc = await source.record(`m41:blob:${item.sha256}`);
        if (doc.sourcePayload.kind !== 'site-bytes' || doc.sourcePayload.encoding !== 'base64') throw new Error('Invalid Payload site object.');
        const bytes = Buffer.from(doc.sourcePayload.body, 'base64');
        site.verifyBytes(item, bytes);
        pending.push({ item, bytes });
    }
    for (const { item, bytes } of pending) fs.writeFileSync(path.join(outputRoot, item.path), bytes);
    const marker = { source: 'payload', snapshot: source.manifest.snapshot, sourceCommit: source.manifest.sourceCommit,
        managedFiles: pending.length, protectedEngineFiles: source.manifest.protectedFiles.length };
    fs.writeFileSync(path.join(outputRoot, 'assets/data/cms-source.json'), JSON.stringify(marker) + '\n');
    return marker;
}
module.exports = { client, materialize, configuration };
