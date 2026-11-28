'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const site = require('./site-content.cjs');

// Keep the existing Pages branch publication and automatic engine updates.
// Stage only verified CMS bytes; a reviewed Git commit remains the publication gate.
function stageEdition(root, output, manifest) {
    root = fs.realpathSync(root);
    output = fs.realpathSync(output);
    if (path.relative(root, output) !== '.cloudflare-preview-dist') throw Error('Expected the existing verified public-build directory.');
    site.validateManifest(manifest);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'gpir-content-source.json'), 'utf8'));
    if (lock.source !== 'payload' || lock.snapshot !== manifest.snapshot) throw Error('Reviewed source lock differs from the selected edition.');
    const markerPath = 'assets/data/cms-source.json';
    const marker = JSON.parse(fs.readFileSync(path.join(output, markerPath), 'utf8'));
    // The signed snapshot describes the engine estate at its parent commit,
    // while the builder records the current protected Git engine inventory.
    // Check the marker against the actual validated build, not the historical
    // snapshot engine count. All manifest engines remain byte-checked below.
    const builtEngineCount = site.inventory(output, manifest.sourceCommit).protectedFiles.length;
    if (marker.source !== 'payload' || marker.snapshot !== manifest.snapshot || marker.sourceCommit !== manifest.sourceCommit ||
        marker.managedFiles !== manifest.files.length || marker.protectedEngineFiles !== builtEngineCount)
        throw Error('Build completion marker differs from the selected edition.');
    // The newer Git-reviewed ASK/Observatory page is retained unchanged for
    // this phased dashboard release; never stage its older inherited CMS blob.
    const observatoryPath = 'pages/intelligence/index.html';
    const guarded = fs.existsSync(path.join(root, '.gpir-ask-observatory-required'));
    const olderObservatory = guarded && manifest.files.find(item => item.path === observatoryPath &&
        item.sha256 !== site.sha256(fs.readFileSync(path.join(root, observatoryPath))));
    if (olderObservatory && !fs.readFileSync(path.join(output, observatoryPath)).equals(
        fs.readFileSync(path.join(root, observatoryPath)))) {
        throw Error('Newer approved Observatory ASK GPIR page was not retained.');
    }
    const stagedItems = manifest.files.filter(item => !(olderObservatory && item.path === observatoryPath));
    const files = [...stagedItems.map(item => item.path), markerPath];
    function safeDestination(base, file) {
        site.safePath(file);
        if (file.split('/').some(part => part.startsWith('.')) || /^(?:apps|node_modules|docs|tests|scripts)\//.test(file)) throw Error('Internal path cannot be staged as managed content.');
        let current = base;
        for (const part of file.split('/')) {
            current = path.join(current, part);
            if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Symlink in publication staging path.');
        }
        return current;
    }
    for (const file of files) { safeDestination(root, file); safeDestination(output, file); }
    const dirty = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...files], { cwd: root });
    if (dirty.length) throw Error('Managed paths already contain local work; all existing changes preserved.');
    try { execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: root }); }
    catch { throw Error('Existing staged changes are preserved; publication staging requires a clean index.'); }
    for (const item of stagedItems) site.verifyBytes(item, fs.readFileSync(path.join(output, item.path)));
    for (const item of manifest.protectedFiles) {
        site.safePath(item.path);
        if (!fs.readFileSync(path.join(root, item.path)).equals(fs.readFileSync(path.join(output, item.path)))) throw Error('Build differs from the existing Git engine: ' + item.path);
    }
    // All content and engine checks finish before any tracked source is changed.
    for (const file of files) {
        const target = safeDestination(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temporary = target + `.m41-${process.pid}.tmp`;
        fs.copyFileSync(path.join(output, file), temporary, fs.constants.COPYFILE_EXCL);
        fs.renameSync(temporary, target);
    }
    return { snapshot: manifest.snapshot, managedFiles: manifest.files.length, protectedEngineFiles: manifest.protectedFiles.length, paths: files };
}

async function main() {
    const root = path.resolve(__dirname, '../..');
    if (!process.env.GITHUB_ACTIONS) {
        process.loadEnvFile('/workspaces/m41-payload/apps/gpir-cms/.env');
        process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://gpir-payload-cms.krishnanvishal12.workers.dev';
        process.env.GPIR_PAYLOAD_SITE_SNAPSHOT = JSON.parse(fs.readFileSync(path.join(root, 'gpir-content-source.json'), 'utf8')).snapshot;
    }
    process.env.GPIR_PAYLOAD_SITE_SNAPSHOT ||= JSON.parse(fs.readFileSync(path.join(root, 'gpir-content-source.json'), 'utf8')).snapshot;
    const { client } = require('./payload-site.cjs');
    const source = await client(process.env);
    const report = stageEdition(root, path.join(root, '.cloudflare-preview-dist'), source.manifest);
    const directory = path.join(root, '.migration-data/m41-cutover');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(directory, 'pages-stage-paths.nul'), report.paths.join('\0') + '\0', { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'pages-stage-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    if (process.env.GITHUB_OUTPUT) {
        const delimiter = 'M41_PATHS_' + require('node:crypto').randomUUID().replaceAll('-', '');
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `paths<<${delimiter}\n${report.paths.join('\n')}\n${delimiter}\n`);
    }
    console.log(JSON.stringify({ status: 'STAGED_FOR_REVIEW_NOT_PUBLISHED', snapshot: report.snapshot,
        managedFiles: report.managedFiles, protectedEngineFiles: report.protectedEngineFiles }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { stageEdition };
