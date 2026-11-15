'use strict';
// Immutable, unpublished recovery objects; never edits/deletes existing GPIR entries.
const zlib = require('node:zlib');
const site = require('./site-content.cjs');
const TYPE = 'gpirPayloadRecoveryV1';
const CHUNK_BYTES = 24000;
function pack(records) {
    const bytes = zlib.gzipSync(Buffer.from(site.canonical(records)), { level: 9 });
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const body = bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64');
        chunks.push({ id: `m41-bcp-${site.sha256(body)}`, body });
    }
    return { digest: site.sha256(bytes), chunks };
}
function unpack(index, chunks) {
    if (!Array.isArray(index.chunks) || !index.chunks.length) throw new Error('BCP index has no chunks.');
    const encoded = index.chunks.map(id => {
        const body = chunks.get(id);
        if (typeof body !== 'string' || `m41-bcp-${site.sha256(body)}` !== id) throw new Error('BCP chunk missing or corrupt.');
        return Buffer.from(body, 'base64');
    });
    const bytes = Buffer.concat(encoded);
    if (site.sha256(bytes) !== index.digest) throw new Error('BCP archive digest mismatch.');
    return JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'));
}
function management(env, fetchImpl = fetch) {
    const { CONTENTFUL_SPACE_ID: space, CONTENTFUL_ENVIRONMENT: environment, CONTENTFUL_MANAGEMENT_TOKEN: token } = env;
    if (!space || !environment || !token) throw new Error('Private Contentful BCP management settings are required.');
    const base = `https://api.contentful.com/spaces/${encodeURIComponent(space)}/environments/${encodeURIComponent(environment)}`;
    async function call(method, route, body, extra = {}) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const response = await fetchImpl(base + route, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/vnd.contentful.management.v1+json', ...extra },
                body: body ? JSON.stringify(body) : undefined });
            if (response.status === 404 && method === 'GET') return null;
            if (response.status === 429 && attempt < 4) {
                const seconds = Math.max(1, Math.min(30, Number(response.headers.get('x-contentful-ratelimit-reset')) || 2));
                await new Promise(resolve => setTimeout(resolve, seconds * 1000));
                continue;
            }
            if (!response.ok) throw new Error(`Contentful BCP request failed: HTTP ${response.status}`);
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
    async function store(id, body, locale) {
        const route = `/entries/${encodeURIComponent(id)}`;
        if (Buffer.byteLength(body, 'utf8') > 48000) throw new Error('BCP object exceeds bounded Contentful field size.');
        const existing = await call('GET', route);
        const digest = site.sha256(body);
        if (existing) {
            if (existing.sys.contentType?.sys?.id !== TYPE || existing.fields?.digest?.[locale] !== digest || existing.fields?.body?.[locale] !== body) throw new Error('Immutable Contentful BCP object conflicts.');
            return;
        }
        await call('PUT', route, { fields: { digest: { [locale]: digest }, body: { [locale]: body } } }, { 'x-contentful-content-type': TYPE });
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
    return { ensureModel, store, read };
}
async function sync(records, snapshot, env, fetchImpl = fetch) {
    const remote = management(env, fetchImpl);
    const locale = await remote.ensureModel();
    const archive = pack(records);
    for (const chunk of archive.chunks) await remote.store(chunk.id, chunk.body, locale);
    // Commit the root only after every immutable chunk exists. Interrupted runs retry safely.
    // Bound Text-field size even for a complete media repository. Large chunk
    // inventories are split into immutable index pages before committing the root.
    const groups = [];
    for (let offset = 0; offset < archive.chunks.length; offset += 256) {
        const body = site.canonical(archive.chunks.slice(offset, offset + 256).map(chunk => chunk.id));
        const id = `m41-bcp-index-${site.sha256(body)}`;
        await remote.store(id, body, locale);
        groups.push(id);
    }
    const index = { schema: 'gpir-contentful-bcp/v1', snapshot, digest: archive.digest, groups };
    await remote.store(`m41-bcp-root-${snapshot}`, site.canonical(index), locale);
    return recover(snapshot, env, fetchImpl);
}
async function recover(snapshot, env, fetchImpl = fetch) {
    if (!/^[a-f0-9]{64}$/.test(snapshot)) throw new Error('Invalid BCP snapshot.');
    const remote = management(env, fetchImpl);
    const index = JSON.parse(await remote.read(`m41-bcp-root-${snapshot}`));
    if (index.schema !== 'gpir-contentful-bcp/v1' || index.snapshot !== snapshot) throw new Error('Contentful BCP snapshot mismatch.');
    if (!Array.isArray(index.groups) || !index.groups.length || index.groups.length > 10000) throw new Error('Invalid BCP index pages.');
    index.chunks = [];
    for (const id of index.groups) {
        const group = JSON.parse(await remote.read(id));
        if (!Array.isArray(group) || !group.length || group.length > 256) throw new Error('Invalid BCP index page.');
        index.chunks.push(...group);
    }
    const chunks = new Map();
    for (const id of index.chunks) chunks.set(id, await remote.read(id));
    return unpack(index, chunks);
}
module.exports = { pack, unpack, management, sync, recover };
