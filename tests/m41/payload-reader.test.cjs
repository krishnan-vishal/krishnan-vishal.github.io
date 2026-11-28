'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJSON } = require('../../scripts/m41/read-json.cjs');
const { materialize } = require('../../scripts/m41/payload-site.cjs');
const site = require('../../scripts/m41/site-content.cjs');
const endpoint = 'https://cms.example/api/editorial-metadata';
const noDelay = { delay: async () => {} };

test('HTTP 200 with incomplete JSON is not accepted; retries only that read', async () => {
    let reads = 0;
    const value = await readJSON(async (url, options) => {
        assert.equal(options.headers.get('accept-encoding'), 'identity');
        reads++;
        return new Response(reads === 1 ? '{"body":"cut' : '{"complete":true}');
    }, endpoint, { headers: { authorization: 'private-token' } }, noDelay);
    assert.deepEqual(value, { complete: true });
    assert.equal(reads, 2);
});

test('persistent invalid JSON stops after three attempts without leaking body or key', async () => {
    let reads = 0;
    await assert.rejects(readJSON(async () => { reads++; return new Response('{"secret":"DO_NOT_LOG'); }, endpoint,
        { headers: { authorization: 'DO_NOT_LOG' } }, noDelay), error => {
        assert.match(error.message, /bytes=21; attempt=3\/3; INVALID_JSON/);
        assert.ok(!error.message.includes('DO_NOT_LOG'));
        return true;
    });
    assert.equal(reads, 3);
});

test('503 retries, while 401, 403 and 429 stop immediately', async () => {
    for (const status of [503, 401, 403, 429]) {
        let reads = 0;
        await assert.rejects(readJSON(async () => { reads++; return new Response('', { status }); }, endpoint, {}, noDelay));
        assert.equal(reads, status === 503 ? 3 : 1);
    }
});

test('body stream failure is bounded and reported without the raw exception', async () => {
    let reads = 0;
    await assert.rejects(readJSON(async () => {
        reads++;
        return { ok: true, status: 200, text: async () => { throw Error('private connection details'); } };
    }, endpoint, {}, noDelay), /BODY_OR_CONNECTION_FAILURE/);
    assert.equal(reads, 3);
});

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm41-reader-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const output = path.join(root, 'dist');
    const routes = ['index.html', '404.html', 'reader/sign-in/index.html', 'pages/intelligence/index.html'];
    for (const route of routes) {
        fs.mkdirSync(path.dirname(path.join(output, route)), { recursive: true });
        fs.writeFileSync(path.join(output, route), `accepted ${route}`);
    }
    fs.writeFileSync(path.join(output, 'engine.js'), 'preserved engine');
    const manifest = site.inventory(output, 'a'.repeat(40));
    const env = { PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.example', PAYLOAD_RELEASE_API_KEY: 'fixture-key',
        GPIR_RELEASE_SIGNING_SECRET: 's'.repeat(32), GPIR_PAYLOAD_SITE_SNAPSHOT: manifest.snapshot };
    const docs = new Map(manifest.files.map(item => {
        const sourcePayload = { kind: 'site-bytes', encoding: 'base64', body: fs.readFileSync(path.join(output, item.path)).toString('base64') };
        return [`m41:blob:${item.sha256}`, { sourcePayload, sourceHash: site.sha256(site.canonical(sourcePayload)) }];
    }));
    const reads = [];
    let failKey;
    const fetchImpl = async url => {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/release/managed-site') {
            return Response.json({ manifest, integrity: { sha256: site.sha256(site.canonical(manifest)),
                signature: crypto.createHmac('sha256', env.GPIR_RELEASE_SIGNING_SECRET).update(site.canonical(manifest)).digest('hex') } });
        }
        const key = parsed.searchParams.get('where[sourceRecordKey][equals]');
        reads.push(key);
        if (key === failKey) return new Response('', { status: 403 });
        return Response.json({ totalDocs: 1, docs: [docs.get(key)] });
    };
    return { root, output, env, manifest, docs, reads, fetchImpl, fail: key => { failKey = key; } };
}

test('restart retains verified downloads; failed build never replaces output', async t => {
    const f = fixture(t);
    const first = f.manifest.files[0];
    const second = f.manifest.files[1];
    f.fail(`m41:blob:${second.sha256}`);
    fs.writeFileSync(path.join(f.output, first.path), 'current output');
    // The second file must be absent to exercise the simulated 403 fetch.
    fs.unlinkSync(path.join(f.output, second.path));
    fs.mkdirSync(path.join(f.output, 'assets/data'), { recursive: true });
    await assert.rejects(materialize(f.output, f.env, f.fetchImpl), /HTTP=403/);
    assert.equal(fs.readFileSync(path.join(f.output, first.path), 'utf8'), 'current output');
    assert.equal(fs.existsSync(path.join(f.output, 'assets/data/cms-source.json')), false);
    fs.mkdirSync(path.join(f.output, 'assets/data'), { recursive: true });
    f.fail(undefined);
    f.reads.length = 0;
    const marker = await materialize(f.output, f.env, f.fetchImpl);
    assert.equal(marker.managedFiles, 4);
    assert.ok(!f.reads.includes(`m41:blob:${first.sha256}`));
    assert.equal(fs.readFileSync(path.join(f.output, 'engine.js'), 'utf8'), 'preserved engine');
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.output, 'assets/data/cms-source.json'))).snapshot, f.manifest.snapshot);
});

test('tampered cache is rejected before publication and preserved for inspection', async t => {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.output, 'assets/data'), { recursive: true });
    const item = f.manifest.files[0];
    const cached = path.join(f.root, '.migration-data/m41-cutover/build-cache', f.manifest.snapshot, item.sha256);
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, 'tampered');
    // Force the restore path to read the cache rather than reuse the valid output.
    fs.unlinkSync(path.join(f.output, item.path));
    await assert.rejects(materialize(f.output, f.env, f.fetchImpl), /digest mismatch/);
    assert.equal(fs.readFileSync(cached, 'utf8'), 'tampered');
    assert.equal(fs.existsSync(path.join(f.output, 'assets/data/cms-source.json')), false);
});

test('manifest signature failure prevents all cached or remote content reads', async t => {
    const f = fixture(t);
    f.env.GPIR_RELEASE_SIGNING_SECRET = 'different-secret'.repeat(3);
    await assert.rejects(materialize(f.output, f.env, async () => Response.json({ manifest: f.manifest,
        integrity: { signature: 'invalid', sha256: site.sha256(site.canonical(f.manifest)) } })), /signature mismatch/);
    assert.equal(f.reads.length, 0);
});

test('owner-deferred four Git-managed routes survive a signed Payload edition unchanged', async t => {
    const f = fixture(t);
    const pages = [
        'pages/intelligence/domain-experts.html',
        'pages/intelligence/trusted-source-network.html',
        'pages/risk/global-central-banks.html',
        'pages/risk/global-country-risk-monitor.html',
    ];
    for (const page of pages) {
        const target = path.join(f.output, page);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'existing Git page: ' + page);
    }
    fs.mkdirSync(path.join(f.output, 'assets/data'), { recursive: true });
    const marker = await materialize(f.output, f.env, f.fetchImpl);
    assert.equal(marker.snapshot, f.manifest.snapshot);
    for (const page of pages) {
        assert.equal(fs.readFileSync(path.join(f.output, page), 'utf8'), 'existing Git page: ' + page);
    }
});

test('unapproved fifth managed route is still blocked before any Payload edition mutation', async t => {
    const f = fixture(t);
    const extra = path.join(f.output, 'pages/intelligence/unapproved-fifth.html');
    fs.mkdirSync(path.dirname(extra), { recursive: true });
    fs.writeFileSync(extra, 'keep unrelated content');
    await assert.rejects(materialize(f.output, f.env, f.fetchImpl),
        /Payload does not cover every existing managed public path/);
    assert.equal(fs.readFileSync(extra, 'utf8'), 'keep unrelated content');
    assert.equal(fs.existsSync(path.join(f.output, 'assets/data/cms-source.json')), false);
});
