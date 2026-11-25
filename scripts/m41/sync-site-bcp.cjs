'use strict';
const fs = require('node:fs');
const path = require('node:path');
const site = require('./site-content.cjs');
const { client } = require('./payload-site.cjs');
const bcp = require('./contentful-bcp.cjs');
async function main() {
    const source = await client(process.env);
    const keys = new Set(source.manifest.files.map(item => `m41:blob:${item.sha256}`));
    keys.add(`m41:manifest:${source.manifest.snapshot}`);
    for (const name of ['manifest.json', 'entries.json', 'assets.json', 'locales.json', 'contentTypes.json', 'tags.json', 'editorInterfaces.json']) keys.add(`m41:archive:${source.manifest.contentfulArchiveSnapshot || source.manifest.snapshot}:${name}`);
    const orderedKeys = [...keys].sort();
    let completed = 0;
    console.log('BCP: retrieving Payload records=' + orderedKeys.length);
    const records = await bcp.boundedMap(orderedKeys, 6, async key => {
        const record = await source.record(key);
        completed++;
        if (completed % 50 === 0 || completed === orderedKeys.length) console.log('BCP: Payload records ' + completed + '/' + orderedKeys.length);
        return record;
    });
    if (source.manifest.nativeResearch?.length) records.push(await source.record(`m41:research-release:${source.manifest.snapshot}`));
    console.log('BCP: exporting editorial references');
    const editorial = await source.request('/api/release/editorial-entries', { method: 'POST', body: JSON.stringify({ action: 'export' }) });
    if (!Array.isArray(editorial.records)) throw new Error('Payload editorial backup is incomplete.');
    records.push(...editorial.records);
    for (const record of editorial.records.filter(item => item.sourcePayload?.kind === 'payload-reference' && item.sourcePayload.collection === 'media')) {
        const media = record.sourcePayload.document;
        const bytes = await source.mediaBytes(media);
        const sourcePayload = { kind: 'media-bytes', mediaId: media.id, sha256: site.sha256(bytes), body: bytes.toString('base64') };
        records.push({ sourceRecordKey: `m41:media:${media.id}`, sourcePayload, sourceHash: site.sha256(site.canonical(sourcePayload)) });
    }
    console.log('BCP: source records ready=' + records.length);
    const recoverySnapshot = site.sha256(site.canonical(records));
    const restored = await bcp.sync(records, recoverySnapshot, process.env);
    if (site.canonical(restored) !== site.canonical(records)) throw new Error('Contentful read-back recovery differs from Payload.');
    const report = { status: 'BCP_READBACK_VERIFIED', verifiedAt: new Date().toISOString(), snapshot: source.manifest.snapshot, recoverySnapshot, records: records.length,
        managedFiles: source.manifest.files.length, existingContentfulEntriesModified: 0, existingContentfulEntriesDeleted: 0 };
    const output = path.resolve(process.argv[2] || '.migration-data/m41-bcp-recovery.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT,
            `verified_records=${report.records}\nverified_at=${report.verifiedAt}\nverified_epoch=${Date.parse(report.verifiedAt)}\n`);
    }
    console.log(JSON.stringify(report));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
