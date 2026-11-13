'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const moduleTag = '<script type="module" src="/assets/js/gpir-protected-publication.mjs"></script>';

function publicationPages(root = repositoryRoot) {
    return fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => path.join(root, entry.name, 'index.html'))
        .filter(filePath => fs.existsSync(filePath))
        .filter(filePath => fs.readFileSync(filePath, 'utf8').includes('class="gpir-publication"'));
}

function installEntryPoint(filePath) {
    const html = fs.readFileSync(filePath, 'utf8');
    if (html.includes(moduleTag)) return false;
    if (!html.includes('</head>')) throw new Error(`Publication page has no closing head: ${filePath}`);
    fs.writeFileSync(filePath, html.replace('</head>', `${moduleTag}</head>`), 'utf8');
    return true;
}

function main() {
    const pages = publicationPages();
    const changed = pages.filter(installEntryPoint);
    process.stdout.write(`M39 ASK GPIR entry point installed on ${changed.length} of ${pages.length} publication pages.\n`);
}

if (require.main === module) main();

module.exports = { installEntryPoint, moduleTag, publicationPages };
