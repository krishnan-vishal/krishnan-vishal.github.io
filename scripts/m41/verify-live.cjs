'use strict';
const fs = require('node:fs');
const path = require('node:path');
const site = require('./site-content.cjs');
const { client } = require('./payload-site.cjs');
async function main() {
    const source = await client(process.env);
    const origin = 'https://www.fintechoisis.com';
    async function bytes(file) {
        const url = new URL('/' + file.split('/').map(encodeURIComponent).join('/'), origin);
        url.searchParams.set('m41', source.manifest.snapshot);
        const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
        if (!response.ok || !['www.fintechoisis.com', 'fintechoisis.com'].includes(new URL(response.url).hostname)) throw new Error(`Live verification failed: ${file} (HTTP ${response.status})`);
        return Buffer.from(await response.arrayBuffer());
    }
    const marker = JSON.parse((await bytes('assets/data/cms-source.json')).toString('utf8'));
    if (marker.source !== 'payload' || marker.snapshot !== source.manifest.snapshot) throw new Error('Live website is not delivering the selected Payload snapshot.');
    const pending = source.manifest.files.slice();
    let verified = 0;
    // Four bounded readers verify actual delivery bytes, including media, signed-out
    // pages and reader shells. This does not claim authenticated engine acceptance.
    await Promise.all(Array.from({ length: 4 }, async () => {
        while (pending.length) {
            const item = pending.shift();
            const file = item.path.endsWith('/index.html') ? item.path.slice(0, -10) : item.path;
            const content = await bytes(file);
            site.verifyBytes(item, content);
            verified++;
        }
    }));
    const report = { status: 'LIVE_PAYLOAD_BYTES_VERIFIED', origin, snapshot: source.manifest.snapshot,
        sourceCommit: source.manifest.sourceCommit, managedFilesVerified: verified,
        authenticatedEngineAcceptance: 'NOT_ASSERTED_BY_STATIC_BYTE_VERIFICATION' };
    const output = path.resolve(process.argv[2] || '.migration-data/m41-live-verification.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
