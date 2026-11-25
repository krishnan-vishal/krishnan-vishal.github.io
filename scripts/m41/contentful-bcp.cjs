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
    async function maybeRead(id) {
        if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid Contentful BCP identifier.');
        const entry = await call('GET', `/entries/${id}`);
        if (!entry) return null;
        if (entry.sys.contentType?.sys?.id !== TYPE) throw new Error('Contentful BCP object type conflict.');
        const values = Object.values(entry.fields?.body || {});
        const digests = Object.values(entry.fields?.digest || {});
        if (values.length !== 1 || digests.length !== 1 || typeof values[0] !== 'string' || site.sha256(values[0]) !== digests[0]) throw new Error('Contentful BCP object failed integrity.');
        return values[0];
    }
    async function read(id) {
        const body = await maybeRead(id);
        if (body === null) throw new Error('Contentful BCP object missing.');
        return body;
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
    return { ensureModel, store, read, maybeRead, inventory };
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

// The full migrated archive was already read back and verified in run #145.
// Store only compact hashes for the baseline; later editions write immutable
// per-record overlays and a commit-last manifest, never a second full archive.
const INDEX_GROUP = 40;
const INDEX_SCHEMA = 'gpir-bcp-baseline-index/v1';
const OVERLAY_SCHEMA = 'gpir-bcp-overlay/v1';
const RECORD_SCHEMA = 'gpir-bcp-record/v1';
function rowsFor(records) {
    const seen = new Set();
    return records.map(record => {
        const key = record?.sourceRecordKey;
        if (typeof key !== 'string' || !key || key.length > 512 || seen.has(key))
            throw new Error('BCP recovery requires unique bounded source record keys.');
        seen.add(key);
        return [key, site.sha256(site.canonical(record))];
    });
}
async function storePages(remote, rows, kind, locale) {
    const ids = [];
    for (let offset = 0; offset < rows.length; offset += INDEX_GROUP) {
        const body = site.canonical(rows.slice(offset, offset + INDEX_GROUP));
        const id = recoveryId(kind, body);
        await remote.store(id, body, locale);
        ids.push(id);
    }
    return ids;
}
async function readPages(remote, ids, kind, count) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 1000 ||
        ids.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new Error('Invalid BCP index pages.');
    const rows = [];
    for (const id of ids) {
        const body = await remote.read(id);
        if (recoveryId(kind, body) !== id) throw new Error('BCP index page identity mismatch.');
        const page = JSON.parse(body);
        if (!Array.isArray(page) || page.length < 1 || page.length > INDEX_GROUP) throw new Error('BCP index page is invalid.');
        rows.push(...page);
    }
    if (rows.length !== count) throw new Error('BCP index record count mismatch.');
    return rows;
}
async function baselineRows(remote, env, base, locale, fetchImpl) {
    if (!/^[a-f0-9]{64}$/.test(base?.snapshot || '') || !Number.isSafeInteger(base.records) ||
        base.records < 1 || !Number.isFinite(Date.parse(base.verifiedAt)))
        throw new Error('The authenticated BCP baseline receipt is required.');
    const id = recoveryId('baseline-index-root', base.snapshot);
    const prior = await remote.maybeRead(id);
    if (prior !== null) {
        const index = JSON.parse(prior);
        if (index.schema !== INDEX_SCHEMA || index.snapshot !== base.snapshot || index.records !== base.records)
            throw new Error('BCP baseline index conflict.');
        const rows = await readPages(remote, index.pages, 'baseline-index-page', base.records);
        if (rows.some(row => !Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' ||
            !/^[a-f0-9]{64}$/.test(row[1])) || new Set(rows.map(row => row[0])).size !== rows.length)
            throw new Error('BCP baseline index is corrupt.');
        return rows;
    }
    // Only on the first incremental run: retrieve the verified full archive to
    // derive exact baseline hashes. Never infer its contents from current Payload.
    console.log('BCP: deriving baseline index from previously verified full recovery');
    const records = await recover(base.snapshot, env, fetchImpl);
    if (records.length !== base.records || site.sha256(site.canonical(records)) !== base.snapshot)
        throw new Error('Authenticated full BCP baseline does not match the receipt.');
    const rows = rowsFor(records);
    const pages = await storePages(remote, rows, 'baseline-index-page', locale);
    const body = site.canonical({ schema: INDEX_SCHEMA, snapshot: base.snapshot, records: rows.length, pages });
    await remote.store(id, body, locale);
    if (await remote.read(id) !== body) throw new Error('BCP baseline index readback mismatch.');
    return rows;
}
async function storeDelta(remote, record, key, hash, locale) {
    const id = recoveryId('delta-record', key + ':' + hash);
    const existing = await remote.maybeRead(id);
    if (existing !== null) {
        const index = JSON.parse(existing);
        if (index.schema !== RECORD_SCHEMA || index.key !== key || index.hash !== hash)
            throw new Error('BCP incremental record conflict.');
        return { id, index };
    }
    const archive = pack([record]);
    const unique = [...new Map(archive.chunks.map(chunk => [chunk.id, chunk])).values()];
    for (let offset = 0; offset < unique.length; offset += 40) {
        const batch = unique.slice(offset, offset + 40);
        const present = await remote.inventory(batch.map(chunk => chunk.id));
        await boundedMap(batch, 4, chunk => remote.store(chunk.id, chunk.body, locale, present));
    }
    const groups = await storePages(remote,
        Array.from({ length: Math.ceil(archive.chunks.length / 256) }, (_, i) =>
            archive.chunks.slice(i * 256, (i + 1) * 256).map(chunk => chunk.id)),
        'delta-chunk-group', locale);
    const index = { schema: RECORD_SCHEMA, key, hash, digest: archive.digest, groups };
    await remote.store(id, site.canonical(index), locale);
    return { id, index };
}
async function readDelta(remote, id, expectedKey, expectedHash) {
    const index = JSON.parse(await remote.read(id));
    if (index.schema !== RECORD_SCHEMA || index.key !== expectedKey || index.hash !== expectedHash ||
        id !== recoveryId('delta-record', expectedKey + ':' + expectedHash) ||
        !/^[a-f0-9]{64}$/.test(index.digest)) throw new Error('BCP incremental record identity mismatch.');
    if (!Array.isArray(index.groups) || index.groups.length < 1 || index.groups.length > 1000)
        throw new Error('BCP incremental record groups invalid.');
    const chunks = [];
    for (const groupId of index.groups) {
        const body = await remote.read(groupId);
        if (recoveryId('delta-chunk-group', body) !== groupId) throw new Error('BCP incremental group mismatch.');
        const group = JSON.parse(body);
        if (!Array.isArray(group) || group.length < 1 || group.length > 256 ||
            group.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new Error('Invalid BCP incremental chunks.');
        chunks.push(...group);
    }
    const bytes = new Map();
    const unique = [...new Set(chunks)];
    for (let offset = 0; offset < unique.length; offset += 40) {
        const batch = unique.slice(offset, offset + 40);
        const existing = await remote.inventory(batch);
        for (const chunkId of batch) {
            const entry = existing.get(chunkId);
            const values = Object.values(entry?.fields?.body || {});
            const digests = Object.values(entry?.fields?.digest || {});
            if (entry?.sys?.contentType?.sys?.id !== TYPE || values.length !== 1 ||
                digests.length !== 1 || site.sha256(values[0]) !== digests[0])
                throw new Error('BCP incremental chunk failed integrity.');
            bytes.set(chunkId, values[0]);
        }
    }
    const restored = unpack({ digest: index.digest, chunks }, bytes);
    if (restored.length !== 1 || site.sha256(site.canonical(restored[0])) !== expectedHash ||
        restored[0]?.sourceRecordKey !== expectedKey) throw new Error('BCP incremental readback mismatch.');
    return restored[0];
}
async function incrementalSync(records, snapshot, env, base, fetchImpl = fetch) {
    if (env.GPIR_CONTENTFUL_BCP_WRITES_AUTHORIZED !== 'true')
        throw new Error('Contentful BCP synchronization is not authorized.');
    if (!/^[a-f0-9]{64}$/.test(snapshot) || site.sha256(site.canonical(records)) !== snapshot)
        throw new Error('BCP source recovery snapshot mismatch.');
    const rows = rowsFor(records);
    const remote = management(env, fetchImpl);
    const locale = await remote.ensureModel();
    const id = recoveryId('overlay-root', snapshot);
    const prior = await remote.maybeRead(id);
    if (prior !== null) {
        const root = JSON.parse(prior);
        if (root.schema !== OVERLAY_SCHEMA || root.snapshot !== snapshot ||
            root.baseline !== base.snapshot || root.records !== rows.length ||
            !Number.isSafeInteger(root.changed) || root.changed < 0 || root.changed > rows.length)
            throw new Error('Existing BCP incremental root conflicts.');
        // Immutable root was committed only after all deltas were read back.
        return { records: rows.length, changed: root.changed, unchanged: rows.length - root.changed, reused: true };
    }
    const baseline = await baselineRows(remote, env, base, locale, fetchImpl);
    const baseMap = new Map(baseline);
    const manifest = [];
    let changed = 0;
    for (let offset = 0; offset < records.length; offset++) {
        const [key, hash] = rows[offset];
        let delta = null;
        if (baseMap.get(key) !== hash) {
            const result = await storeDelta(remote, records[offset], key, hash, locale);
            if (site.canonical(await readDelta(remote, result.id, key, hash)) !== site.canonical(records[offset]))
                throw new Error('BCP incremental record readback differs from Payload.');
            delta = result.id;
            changed++;
            if (changed % 20 === 0) console.log('BCP: new/revised records verified=' + changed);
        }
        manifest.push([key, hash, delta]);
    }
    const pages = await storePages(remote, manifest, 'overlay-page', locale);
    const root = { schema: OVERLAY_SCHEMA, snapshot, baseline: base.snapshot,
        records: records.length, changed, pages };
    const body = site.canonical(root);
    await remote.store(id, body, locale);
    if (await remote.read(id) !== body) throw new Error('BCP incremental root readback mismatch.');
    console.log('BCP: unchanged baseline=' + (records.length - changed) + '; new/revised=' + changed);
    return { records: rows.length, changed, unchanged: rows.length - changed, reused: false };
}
async function recoverIncremental(snapshot, env, fetchImpl = fetch) {
    if (!/^[a-f0-9]{64}$/.test(snapshot)) throw new Error('Invalid BCP incremental snapshot.');
    const remote = management(env, fetchImpl);
    const root = JSON.parse(await remote.read(recoveryId('overlay-root', snapshot)));
    if (root.schema !== OVERLAY_SCHEMA || root.snapshot !== snapshot ||
        !/^[a-f0-9]{64}$/.test(root.baseline) || !Number.isSafeInteger(root.records))
        throw new Error('Invalid BCP incremental root.');
    const rows = await readPages(remote, root.pages, 'overlay-page', root.records);
    const baseline = await recover(root.baseline, env, fetchImpl);
    const baseMap = new Map(baseline.map(record => [record.sourceRecordKey, record]));
    const records = [];
    for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== 'string' ||
            !/^[a-f0-9]{64}$/.test(row[1])) throw new Error('Invalid BCP incremental manifest.');
        const [key, hash, delta] = row;
        const record = delta ? await readDelta(remote, delta, key, hash) : baseMap.get(key);
        if (!record || site.sha256(site.canonical(record)) !== hash)
            throw new Error('BCP incremental baseline record mismatch.');
        records.push(record);
    }
    if (site.sha256(site.canonical(records)) !== snapshot) throw new Error('BCP incremental full recovery mismatch.');
    return records;
}

module.exports = { pack, unpack, management, sync, recover, boundedMap, incrementalSync, recoverIncremental, rowsFor };
