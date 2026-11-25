'use strict';
// Immutable, unpublished recovery objects; never edits/deletes existing GPIR entries.
const zlib = require('node:zlib');
const site = require('./site-content.cjs');
const TYPE = 'gpirPayloadRecoveryV1';
const CHUNK_BYTES = 24000;
// Domain-separated full SHA-256 IDs fit the Contentful 64-character limit.
const recoveryId = (kind, value) => site.sha256(`m41-bcp:${kind}:${value}`);
function pack(records) {
    const bytes = zlib.gzipSync(Buffer.from(site.canonical(records)), { level: 9 });
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const body = bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64');
        chunks.push({ id: recoveryId('chunk', body), body });
    }
    return { digest: site.sha256(bytes), chunks };
}
function unpack(index, chunks) {
    if (!Array.isArray(index.chunks) || !index.chunks.length) throw new Error('BCP index has no chunks.');
    const encoded = index.chunks.map(id => {
        const body = chunks.get(id);
        if (typeof body !== 'string' || recoveryId('chunk', body) !== id && `m41-bcp-${site.sha256(body)}` !== id) throw new Error('BCP chunk missing or corrupt.');
        return Buffer.from(body, 'base64');
    });
    const bytes = Buffer.concat(encoded);
    if (site.sha256(bytes) !== index.digest) throw new Error('BCP archive digest mismatch.');
    return JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'));
}
// Fixed-size batches preserve input order and stop scheduling after a failed batch.
async function boundedMap(items, width, fn) {
    const results = [];
    for (let offset = 0; offset < items.length; offset += width) {
        const batch = await Promise.allSettled(items.slice(offset, offset + width).map(fn));
        const failed = batch.find(item => item.status === 'rejected');
        if (failed) throw failed.reason;
        results.push(...batch.map(item => item.value));
    }
    return results;
}
function management(env, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
    const { CONTENTFUL_SPACE_ID: space, CONTENTFUL_ENVIRONMENT: environment, CONTENTFUL_MANAGEMENT_TOKEN: token } = env;
    if (!space || !environment || !token) throw new Error('Private Contentful BCP management settings are required.');
    const base = `https://api.contentful.com/spaces/${encodeURIComponent(space)}/environments/${encodeURIComponent(environment)}`;
    let nextRequest = 0;
    async function call(method, route, body, extra = {}) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const now = Date.now();
            const slot = Math.max(now, nextRequest);
            nextRequest = slot + 250;
            if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
            const response = await fetchImpl(base + route, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/vnd.contentful.management.v1+json', ...extra },
                body: body ? JSON.stringify(body) : undefined });
            if (response.status === 404 && method === 'GET') return null;
            if ((response.status === 429 ||
                (method === 'GET' &&
                 [408, 500, 502, 503, 504].includes(response.status)))
                && attempt < 4) {
                const seconds = Math.max(1, Math.min(30, Number(response.headers.get('x-contentful-ratelimit-reset')) || Math.pow(2, attempt + 1)));
                await new Promise(resolve => setTimeout(resolve, seconds * 1000));
                continue;
            }
            if (!response.ok) {
                const detail = await response.json().catch(() => ({}));
                const code = /^[A-Za-z0-9_-]{1,80}$/.test(detail?.sys?.id || '') ? detail.sys.id : 'UNKNOWN';
                const resource = route.split('/')[1];
                throw new Error(`Contentful BCP request failed: HTTP ${response.status}; ${method} ${resource}; code=${code}`);
            }
            return response.json();
        }
        throw new Error('Contentful BCP retry budget exhausted.');
    }
    async function ensureModel() {
        const route = `/content_types/${TYPE}`;
        let model = await call('GET', route);
        if (!model) model = await call('PUT', route, { name: 'GPIR Payload recovery objects', displayField: 'digest', fields: [
            { id: 'digest', name: 'Digest', type: 'Symbol', required: true, localized: false },
            { id: 'body', name: 'Recovery bytes', type: 'Text', required: true, localized: false },
        ] });
        if (!model.fields?.some(field => field.id === 'digest' && field.type === 'Symbol') ||
            !model.fields?.some(field => field.id === 'body' && field.type === 'Text')) throw new Error('Contentful BCP model conflict.');
        if (!model.sys.publishedVersion) await call('PUT', `${route}/published`, null, { 'x-contentful-version': String(model.sys.version) });
        const locales = await call('GET', '/locales');
        const locale = locales?.items?.find(item => item.default)?.code;
        if (!locale) throw new Error('Contentful default locale is unavailable.');
        return locale;
    }
    async function store(id, body, locale, inventory) {
        const route = `/entries/${encodeURIComponent(id)}`;
        if (Buffer.byteLength(body, 'utf8') > 48000) throw new Error('BCP object exceeds bounded Contentful field size.');
        const digest = site.sha256(body);
        function matches(existing) {
            if (!existing) return false;
            if (existing.sys.contentType?.sys?.id !== TYPE || existing.fields?.digest?.[locale] !== digest || existing.fields?.body?.[locale] !== body) throw new Error('Immutable Contentful BCP object conflicts.');
            return true;
        }
        if (matches(inventory ? inventory.get(id) : await call('GET', route))) return;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await call('PUT', route, { fields: { digest: { [locale]: digest }, body: { [locale]: body } } }, { 'x-contentful-content-type': TYPE });
                break;
            } catch (error) {
                if (!/HTTP (408|409|500|502|503|504); PUT entries;/.test(error.message) &&
                    !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)) throw error;
                if (matches(await call('GET', route))) return;
                if (attempt === 2 || /HTTP 409;/.test(error.message)) throw error;
                await sleep(1000 * Math.pow(2, attempt));
            }
        }
        // Recovery records intentionally remain unpublished; current site delivery is untouched.
    }
    async function read(id) {
        const entry = await call('GET', `/entries/${encodeURIComponent(id)}`);
        if (!entry || entry.sys.contentType?.sys?.id !== TYPE) throw new Error('Contentful BCP object missing.');
        const values = Object.values(entry.fields?.body || {});
        const digests = Object.values(entry.fields?.digest || {});
        if (values.length !== 1 || digests.length !== 1 || site.sha256(values[0]) !== digests[0]) throw new Error('Contentful BCP object failed integrity.');
        return values[0];
    }
    async function inventory(ids) {
        const found = new Map();
        for (let offset = 0; offset < ids.length; offset += 40) {
            const group = ids.slice(offset, offset + 40);
            const query = new URLSearchParams({ 'sys.id[in]': group.join(','), limit: String(group.length) });
            const result = await call('GET', '/entries?' + query);
            if (!Array.isArray(result?.items) || result.total !== result.items.length) throw new Error('Incomplete Contentful BCP inventory.');
            for (const entry of result.items) {
                if (!group.includes(entry.sys?.id) || found.has(entry.sys.id)) throw new Error('Unexpected Contentful BCP inventory object.');
                found.set(entry.sys.id, entry);
            }
        }
        return found;
    }
    return { ensureModel, store, read, inventory };
}
async function sync(records, snapshot, env, fetchImpl = fetch) {
    if (env.GPIR_CONTENTFUL_BCP_WRITES_AUTHORIZED !== 'true') throw new Error('Contentful is read-only. BCP synchronization needs separate explicit authorization and is not a primary-cutover gate.');
    const remote = management(env, fetchImpl);
    const locale = await remote.ensureModel();
    const archive = pack(records);
    const unique = [...new Map(archive.chunks.map(chunk => [chunk.id, chunk])).values()];
    console.log('BCP: recovery chunks=' + unique.length);
    for (let offset = 0; offset < unique.length; offset += 40) {
        const batch = unique.slice(offset, offset + 40);
        const existing = await remote.inventory(batch.map(chunk => chunk.id));
        await boundedMap(batch, 4, chunk => remote.store(chunk.id, chunk.body, locale, existing));
        console.log('BCP: chunks verified or stored ' + Math.min(offset + 40, unique.length) + '/' + unique.length);
    }
    // Commit the root only after every immutable chunk exists. Interrupted runs retry safely.
    // Bound Text-field size even for a complete media repository. Large chunk
    // inventories are split into immutable index pages before committing the root.
    const groups = [];
    for (let offset = 0; offset < archive.chunks.length; offset += 256) {
        const body = site.canonical(archive.chunks.slice(offset, offset + 256).map(chunk => chunk.id));
        const id = recoveryId('index', body);
        await remote.store(id, body, locale);
        groups.push(id);
    }
    const index = { schema: 'gpir-contentful-bcp/v1', snapshot, digest: archive.digest, groups };
    await remote.store(recoveryId('root', snapshot), site.canonical(index), locale);
    return recover(snapshot, env, fetchImpl);
}
async function recover(snapshot, env, fetchImpl = fetch) {
    if (!/^[a-f0-9]{64}$/.test(snapshot)) throw new Error('Invalid BCP snapshot.');
    const remote = management(env, fetchImpl);
    const index = JSON.parse(await remote.read(recoveryId('root', snapshot)));
    if (index.schema !== 'gpir-contentful-bcp/v1' || index.snapshot !== snapshot) throw new Error('Contentful BCP snapshot mismatch.');
    if (!Array.isArray(index.groups) || !index.groups.length || index.groups.length > 10000) throw new Error('Invalid BCP index pages.');
    index.chunks = [];
    for (const id of index.groups) {
        const group = JSON.parse(await remote.read(id));
        if (!Array.isArray(group) || !group.length || group.length > 256) throw new Error('Invalid BCP index page.');
        index.chunks.push(...group);
    }
    const chunks = new Map();
    const unique = [...new Set(index.chunks)];
    for (let offset = 0; offset < unique.length; offset += 40) {
        const batch = unique.slice(offset, offset + 40);
        const entries = await remote.inventory(batch);
        for (const id of batch) {
            const entry = entries.get(id);
            const values = Object.values(entry?.fields?.body || {});
            const digests = Object.values(entry?.fields?.digest || {});
            if (entry?.sys?.contentType?.sys?.id !== TYPE || values.length !== 1 || digests.length !== 1 || site.sha256(values[0]) !== digests[0]) throw new Error('Contentful BCP object failed integrity.');
            chunks.set(id, values[0]);
        }
        console.log('BCP: readback chunks ' + Math.min(offset + 40, unique.length) + '/' + unique.length);
    }
    return unpack(index, chunks);
}
module.exports = { pack, unpack, management, sync, recover, boundedMap };
