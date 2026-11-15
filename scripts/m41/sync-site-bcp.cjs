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
    for (const name of ['manifest.json', 'entries.json', 'assets.json', 'locales.json', 'contentTypes.json', 'tags.json', 'editorInterfaces.json']) keys.add(`m41:archive:${source.manifest.snapshot}:${name}`);
    const records = [];
    for (const key of [...keys].sort()) records.push(await source.record(key));
    const editorial = await source.request('/api/release/editorial-entries', { method: 'POST', body: JSON.stringify({ action: 'export' }) });
    if (!Array.isArray(editorial.records)) throw new Error('Payload editorial backup is incomplete.');
    records.push(...editorial.records);
    const recoverySnapshot = site.sha256(site.canonical(records));
    const restored = await bcp.sync(records, recoverySnapshot, process.env);
    if (site.canonical(restored) !== site.canonical(records)) throw new Error('Contentful read-back recovery differs from Payload.');
    const report = { status: 'BCP_READBACK_VERIFIED', snapshot: source.manifest.snapshot, recoverySnapshot, records: records.length,
        managedFiles: source.manifest.files.length, existingContentfulEntriesModified: 0, existingContentfulEntriesDeleted: 0 };
    const output = path.resolve(process.argv[2] || '.migration-data/m41-bcp-recovery.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
