'use strict';
// Static delivery remains independent of the CMS at request time. Payload owns
// versioned editorial bytes; JavaScript/CSS and generated engine data stay in Git.
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const SCHEMA = 'gpir-managed-site/v1';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) :
    value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const canonical = value => JSON.stringify(stable(value));
const ENGINE_DATA = new Set(['announcements.json', 'content-registry.json', 'search-index.json', 'source-health.json', 'trusted-sources.json']);
function managed(file) {
    if (/\.(?:html|pdf|png|jpe?g|webp|gif|ico|svg|woff2?|ttf|otf)$/i.test(file)) return true;
    if (file === 'assets/data/fx/editorial-public.json') return true;
    if (/^assets\/data\//.test(file)) return !file.startsWith('assets/data/fx/') && !ENGINE_DATA.has(path.posix.basename(file));
    return /^(?:robots\.txt|sitemap\.xml|site\.webmanifest)$/.test(file) || file.startsWith('assets/i18n/');
}
function safePath(file) {
    if (typeof file !== 'string' || !file || file.includes('\\') || file.includes('\0') ||
        file.startsWith('/') || file.split('/').some(part => !part || part === '.' || part === '..') ||
        /[\x00-\x1f\x7f?#%:]/.test(file)) throw new Error('Unsafe managed content path.');
    return file;
}
function walk(root, prefix = '') {
    return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
        const file = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error('Managed content cannot contain symlinks.');
        return entry.isDirectory() ? walk(root, file) : entry.isFile() ? [file] : [];
    });
}
function inventory(root, sourceCommit) {
    if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('An exact baseline Git commit is required.');
    const files = walk(root).filter(managed).map(file => {
        safePath(file);
        const bytes = fs.readFileSync(path.join(root, file));
        return { path: file, sha256: sha256(bytes), bytes: bytes.length };
    });
    const protectedFiles = walk(root).filter(file => !managed(file)).map(file => ({ path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
    const body = { schema: SCHEMA, sourceCommit, files, protectedFiles };
    return { ...body, snapshot: sha256(canonical(body)) };
}
function validateManifest(manifest) {
    if (manifest?.schema !== SCHEMA || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || !Array.isArray(manifest.files) || !manifest.files.length || !Array.isArray(manifest.protectedFiles)) throw new Error('Invalid managed content manifest.');
    const { snapshot, ...body } = manifest;
    if (sha256(canonical(body)) !== snapshot) throw new Error('Managed content manifest hash mismatch.');
    const seen = new Set();
    for (const file of [...manifest.files, ...manifest.protectedFiles]) {
        safePath(file.path);
        if (seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Duplicate path or invalid digest.');
        seen.add(file.path);
    }
    if (manifest.files.some(file => !managed(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0)) throw new Error('Manifest includes engine or invalid content.');
    for (const required of ['index.html', '404.html', 'reader/sign-in/index.html', 'pages/intelligence/index.html']) {
        if (!manifest.files.some(file => file.path === required)) throw new Error(`Missing required managed route: ${required}`);
    }
    return manifest;
}
function verifyBytes(item, bytes) {
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) throw new Error(`Managed content digest mismatch: ${item.path}`);
}
module.exports = { SCHEMA, sha256, canonical, managed, safePath, walk, inventory, validateManifest, verifyBytes };
