import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const entries = Object.entries(lock.packages).filter(([p]) => /(?:^|\/)node_modules\/picomatch$/.test(p));
test('both reviewed picomatch versions are present', () => {
  assert.deepEqual([...new Set(entries.map(([,p]) => p.version))].sort(), ['2.3.2','4.0.7']);
});
for (const [relative, pkg] of entries) {
  test('bounded shared parser mitigation: ' + relative, () => {
    const source = `
      const assert = require('node:assert/strict');
      const pm = require(process.argv[1]);
      for (const options of [{}, {maxExtglobRecursion:false}, {fastpaths:false}, {nocase:true}]) {
        for (const pattern of ['+(*)','*(*)','+(a*)','+(*(a))','+(+(a))','+(a|aa)','+(?(a))']) {
          for (const method of [p => pm(p, options), p => pm.makeRe(p, options), p => pm.parse(p, options)]) {
            assert.throws(() => method(pattern), /GPIR: unsafe or unsupported repeated extglob/, pattern);
          }
        }
      }
      assert.equal(pm('**/*.js')('src/lib/test.js'), true);
      assert.equal(pm('**/*.js')('src/lib/test.css'), false);
      assert.equal(pm('*.{js,ts}')('index.ts'), true);
      assert.equal(pm('@(foo|bar).js')('foo.js'), true);
      assert.equal(pm('+(ab|cd)')('abcdab'), true);
      assert.equal(pm('+(ab|cd)')('abc'), false);
      assert.equal(pm('file?.txt')('file1.txt'), true);
    `;
    const result = spawnSync(process.execPath, ['-e', source, path.join(root, relative)], {timeout: 5000, encoding:'utf8'});
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
