'use strict';
const fs = require('node:fs');
const path = require('node:path');
const site = require('./site-content.cjs');
const bcp = require('./contentful-bcp.cjs');
async function main() {
    const [snapshot, destination] = process.argv.slice(2);
    if (!destination) throw new Error('Usage: recover-site.cjs RECOVERY_SNAPSHOT NEW_EMPTY_DIRECTORY');
    const output = path.resolve(destination);
    if (fs.existsSync(output)) throw new Error('Recovery requires a new destination; existing content is never overwritten.');
    const records = await bcp.recover(snapshot, process.env);
    if (site.sha256(site.canonical(records)) !== snapshot) throw new Error('Recovery root does not match its record inventory.');
    const manifests = records.filter(record => record.sourcePayload?.schema === site.SCHEMA);
    if (manifests.length !== 1) throw new Error('Recovery manifest missing or ambiguous.');
    const manifest = site.validateManifest(manifests[0].sourcePayload);
    const map = new Map(records.map(record => [record.sourceRecordKey, record]));
    const files = [];
    for (const item of manifest.files) {
        const doc = map.get(`m41:blob:${item.sha256}`);
        if (!doc || site.sha256(site.canonical(doc.sourcePayload)) !== doc.sourceHash) throw new Error('Recovery content is missing or corrupt.');
        const bytes = Buffer.from(doc.sourcePayload.body, 'base64');
        site.verifyBytes(item, bytes);
        files.push({ item, bytes });
    }
    fs.mkdirSync(output, { mode: 0o700 });
    for (const { item, bytes } of files) {
        const target = path.join(output, 'site', item.path);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.writeFileSync(target, bytes, { mode: 0o600 });
    }
    fs.writeFileSync(path.join(output, 'payload-recovery-records.json'), JSON.stringify(records), { mode: 0o600 });
    fs.writeFileSync(path.join(output, 'recovery-evidence.json'), JSON.stringify({ status: 'RECOVERED_NOT_DEPLOYED', recoverySnapshot: snapshot, siteSnapshot: manifest.snapshot, managedFiles: files.length }) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ status: 'RECOVERED_NOT_DEPLOYED', managedFiles: files.length }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
