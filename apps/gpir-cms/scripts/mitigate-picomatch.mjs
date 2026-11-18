// Conservative temporary mitigation for GHSA-fc5q-39xc-vjpf.
// Deliberately rejects complex repeated extglobs; not an upstream fix.
// Run after npm ci, before any build. No external dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const entries = Object.entries(lock.packages).filter(([p]) => /(?:^|\/)node_modules\/picomatch$/.test(p));
if (!entries.length) throw new Error('No picomatch installations in lockfile');
const anchor = '    const analysis = analyzeRepeatedExtglob(body, opts);';
const marker = 'GPIR_GHSA_fc5q_39xc_vjpf';
const replacement = [
  '    // ' + marker,
  "    if (token.type === 'plus' || token.type === 'star') {",
  '      const branches = body.split("|");',
  '      // Only fixed ASCII words with disjoint prefixes are allowed to repeat.',
  '      // Reject rather than silently changing the meaning of a pattern.',
  '      const words = branches.map(word => word.toLowerCase());',
  '      if (branches.some(word => !/^[a-zA-Z0-9_-]+$/.test(word)) ||',
  '          words.some((word, i) => words.some((other, j) => i !== j && other.startsWith(word)))) {',
  '        throw new SyntaxError("GPIR: unsafe or unsupported repeated extglob");',
  '      }',
  '    }',
  anchor
].join('\n');
const entryAnchor = '  input = REPLACEMENTS[input] || input;';
const entryGuard = [
  '  // GPIR repeated-extglob preflight: cover parser shortcuts as well.',
  '  for (let i = 0; i < input.length - 1; i++) {',
  '    if ((input[i] !== "+" && input[i] !== "*") || input[i + 1] !== "(") continue;',
  '    const end = input.indexOf(")", i + 2);',
  '    const branches = end < 0 ? [] : input.slice(i + 2, end).split("|");',
  '    const words = branches.map(word => word.toLowerCase());',
  '    if (!branches.length || branches.some(word => !/^[a-zA-Z0-9_-]+$/.test(word)) ||',
  '        words.some((word, j) => words.some((other, k) => j !== k && other.startsWith(word)))) {',
  '      throw new SyntaxError("GPIR: unsafe or unsupported repeated extglob");',
  '    }',
  '  }',
  entryAnchor
].join('\n');
for (const [relative, item] of entries) {
  if (!['2.3.2', '4.0.7'].includes(item.version)) throw new Error('Unreviewed picomatch version: ' + item.version);
  const dir = path.join(root, relative);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (pkg.version !== item.version || pkg.name !== 'picomatch') throw new Error('Installed package mismatch');
  const file = path.join(dir, 'lib/parse.js');
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(marker)) {
    if (!source.includes(replacement) || !source.includes(entryGuard)) throw new Error('Unexpected existing mitigation');
    continue;
  }
  if (source.split(anchor).length !== 2) throw new Error('Unexpected parser source: ' + relative);
  if (source.split(entryAnchor).length !== 2) throw new Error('Unexpected parser entry: ' + relative);
  fs.writeFileSync(file, source.replace(anchor, replacement).replace(entryAnchor, entryGuard));
  console.log('Applied temporary repeated-extglob restriction:', relative, item.version);
}
