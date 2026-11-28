'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const site = require('../../scripts/m41/site-content.cjs');
const { stageEdition } = require('../../scripts/m41/stage-pages-edition.cjs');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm41-pages-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const output = path.join(root, '.cloudflare-preview-dist');
    const routes = ['index.html', '404.html', 'reader/sign-in/index.html', 'pages/intelligence/index.html'];
    for (const route of routes) {
        for (const base of [root, output]) {
            fs.mkdirSync(path.dirname(path.join(base, route)), { recursive: true });
            fs.writeFileSync(path.join(base, route), (base === root ? 'old ' : 'approved ') + route);
        }
    }
    for (const base of [root, output]) fs.writeFileSync(path.join(base, 'engine.js'), 'existing engine');
    const manifest = site.inventory(output, 'a'.repeat(40));
    fs.mkdirSync(path.join(output, 'assets/data'), { recursive: true });
    fs.writeFileSync(path.join(output, 'assets/data/cms-source.json'), JSON.stringify({ source: 'payload', snapshot: manifest.snapshot,
        sourceCommit: manifest.sourceCommit, managedFiles: 4, protectedEngineFiles: 1 }));
    fs.writeFileSync(path.join(root, '.gitignore'), '.cloudflare-preview-dist/\n.migration-data/\n');
    fs.writeFileSync(path.join(root, 'gpir-content-source.json'), JSON.stringify({ source: 'payload', snapshot: manifest.snapshot }));
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c','user.name=M41 Fixture','-c','user.email=m41@example.invalid','commit','-qm','fixture'], { cwd: root });
    return { root, output, manifest };
}
test('stages complete verified Payload bytes and marker, preserving engines and unrelated local work', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'unrelated.txt'), 'preserve me');
    const staged = stageEdition(f.root, f.output, f.manifest);
    assert.equal(staged.managedFiles, 4);
    assert.equal(fs.readFileSync(path.join(f.root, 'index.html'), 'utf8'), 'approved index.html');
    assert.equal(fs.readFileSync(path.join(f.root, 'engine.js'), 'utf8'), 'existing engine');
    assert.equal(fs.readFileSync(path.join(f.root, 'unrelated.txt'), 'utf8'), 'preserve me');
    assert.equal(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim(), '1');
});
test('dirty managed work is retained instead of overwritten', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'index.html'), 'owner work');
    assert.throws(() => stageEdition(f.root, f.output, f.manifest), /local work/);
    assert.equal(fs.readFileSync(path.join(f.root, 'index.html'), 'utf8'), 'owner work');
    assert.equal(fs.readFileSync(path.join(f.root, '404.html'), 'utf8'), 'old 404.html');
});
test('bad content or engine bytes cannot partially stage an edition', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.output, 'engine.js'), 'changed engine');
    assert.throws(() => stageEdition(f.root, f.output, f.manifest), /existing Git engine/);
    assert.equal(fs.readFileSync(path.join(f.root, 'index.html'), 'utf8'), 'old index.html');
    fs.writeFileSync(path.join(f.output, 'engine.js'), 'existing engine');
    fs.writeFileSync(path.join(f.output, '404.html'), 'bad content');
    assert.throws(() => stageEdition(f.root, f.output, f.manifest), /digest mismatch/);
    assert.equal(fs.readFileSync(path.join(f.root, 'index.html'), 'utf8'), 'old index.html');
});
test('an unrelated staged change is preserved and blocks publication staging', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'owner.txt'), 'staged owner work');
    execFileSync('git', ['add', 'owner.txt'], { cwd: f.root });
    assert.throws(() => stageEdition(f.root, f.output, f.manifest), /clean index/);
    assert.equal(fs.readFileSync(path.join(f.root, 'index.html'), 'utf8'), 'old index.html');
    assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: f.root, encoding: 'utf8' }).trim(), 'owner.txt');
});

test('phased release stages 43-edition files but never replaces newer approved Observatory', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, '.gpir-ask-observatory-required'), 'retain newest ASK page');
    const obs = 'pages/intelligence/index.html';
    const approved = fs.readFileSync(path.join(f.root, obs));
    fs.writeFileSync(path.join(f.output, obs), approved);
    const staged = stageEdition(f.root, f.output, f.manifest);
    assert.ok(!staged.paths.includes(obs));
    assert.equal(fs.readFileSync(path.join(f.root, obs), 'utf8'), approved.toString('utf8'));
    assert.equal(fs.readFileSync(path.join(f.root, 'index.html'), 'utf8'), 'approved index.html');
});
test('phased staging rejects any changed Observatory preview even with guard', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, '.gpir-ask-observatory-required'), 'retain newest ASK page');
    assert.throws(() => stageEdition(f.root, f.output, f.manifest), /Newer approved Observatory ASK GPIR page was not retained/);
    assert.equal(fs.readFileSync(path.join(f.root, 'index.html'), 'utf8'), 'old index.html');
});
