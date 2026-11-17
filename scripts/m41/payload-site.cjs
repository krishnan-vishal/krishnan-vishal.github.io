'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const site = require('./site-content.cjs');
const { readJSON } = require('./read-json.cjs');
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
        return readJSON(fetchImpl, `${config.origin}${route}`, { ...options, redirect: 'error',
            headers: { authorization: `users API-Key ${config.key}`, 'content-type': 'application/json' } });
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
    async function mediaBytes(media) {
        const response = await fetchImpl(`${config.origin}/api/media/file/${encodeURIComponent(media.filename)}`, {
            redirect: 'error', signal: AbortSignal.timeout(60000), headers: { authorization: `users API-Key ${config.key}` } });
        if (!response.ok) throw new Error('Payload media backup could not read source bytes.');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (media.sourceSha256 && site.sha256(bytes) !== media.sourceSha256) throw new Error('Payload media differs from its preserved source digest.');
        return bytes;
    }
    return { manifest, record, request, mediaBytes };
}
async function materialize(outputRoot, env = process.env, fetchImpl = fetch) {
    const source = await client(env, fetchImpl);
    const current = site.inventory(outputRoot, source.manifest.sourceCommit);
    // This migration switches an exact, already-public edition. Content changes
    // require a new manifest/release; it never overwrites a newly changed engine.
    const covered = new Set(source.manifest.files.map(file => file.path));
    if (current.files.some(file => !covered.has(file.path))) throw new Error('Payload does not cover every existing managed public path.');
    // Current Git engine bytes are authoritative and are never overwritten by
    // CMS content. New editorial editions may differ from obsolete Git copies.
    const engineBefore = site.canonical(current.protectedFiles);
    // Verify the entire source before replacing any output bytes.
    const pending = [];
    const cache = path.join(path.dirname(outputRoot), '.migration-data/m41-cutover/build-cache', source.manifest.snapshot);
    fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
    let reused = 0;
    for (const item of source.manifest.files) {
        const cached = path.join(cache, item.sha256);
        let bytes;
        if (fs.existsSync(cached)) {
            if (!fs.lstatSync(cached).isFile() || fs.lstatSync(cached).isSymbolicLink()) throw new Error('Unsafe Payload build cache entry.');
            bytes = fs.readFileSync(cached);
            site.verifyBytes(item, bytes);
            reused++;
        } else {
            let doc;
            try { doc = await source.record(`m41:blob:${item.sha256}`); }
            catch (error) { throw new Error(`Managed file ${item.path}: ${error.message}`); }
            if (doc.sourcePayload.kind !== 'site-bytes' || doc.sourcePayload.encoding !== 'base64') throw new Error('Invalid Payload site object.');
            bytes = Buffer.from(doc.sourcePayload.body, 'base64');
            site.verifyBytes(item, bytes);
            const temporary = `${cached}.${process.pid}.${crypto.randomUUID()}.tmp`;
            fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, cached);
        }
        pending.push({ item, bytes });
        if (pending.length === 1 || pending.length % 25 === 0 || pending.length === source.manifest.files.length) {
            console.log(`M41: verified build files ${pending.length}/${source.manifest.files.length}; cached=${reused}`);
        }
    }
    for (const { item, bytes } of pending) {
        fs.mkdirSync(path.dirname(path.join(outputRoot, item.path)), { recursive: true });
        fs.writeFileSync(path.join(outputRoot, item.path), bytes);
    }
    if (site.canonical(site.inventory(outputRoot, source.manifest.sourceCommit).protectedFiles) !== engineBefore) throw new Error('A managed edition changed protected engine files.');
    const marker = { source: 'payload', snapshot: source.manifest.snapshot, sourceCommit: source.manifest.sourceCommit,
        managedFiles: pending.length, protectedEngineFiles: current.protectedFiles.length };
    fs.writeFileSync(path.join(outputRoot, 'assets/data/cms-source.json'), JSON.stringify(marker) + '\n');
    return marker;
}
module.exports = { client, materialize, configuration };

