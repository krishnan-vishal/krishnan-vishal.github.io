import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [page, css, script, navCss] = await Promise.all([
  read('pages/intelligence/smart.html'), read('assets/css/gpir-smart-card-sections.css'),
  read('assets/js/gpir-smart-card-sections.js'), read('assets/css/my-gpir.css')]);

test('smart page loads the presentation assets with versioned references and the .gpir-sc root', () => {
  assert.match(page, /<body class="smi-page gpir-sc">/);
  assert.match(page, /gpir-smart-card-sections\.css\?v=\d+[a-z]?"/);
  assert.match(page, /gpir-smart-card-sections\.js\?v=\d+[a-z]?" defer/);
  assert.match(page, /smart-intelligence\.mjs\?v=20261109d/);
});

test('presentation stylesheet is scoped to .gpir-sc and never hides original text', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').split('}')
    .map(rule => rule.split('{')[0].trim()).filter(Boolean);
  for (const selector of rules) assert.match(selector, /^\.gpir-sc\b/, selector);
  assert.doesNotMatch(css, /visibility:\s*hidden|font-size:\s*0\b/);
});

test('presentation script reads rendered data only and never fetches or stores anything', () => {
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|supabase|contentful|localStorage|sessionStorage|\.innerHTML\s*=\s*[^'"]*(?:title|summary)/i);
  assert.match(script, /showAllHeat/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /aria-expanded/);
  assert.match(script, /\[data-smart-topic-controls\] input:checked/);
});

test('My GPIR navigation grid change is responsive CSS only', () => {
  assert.match(navCss, /@media\(min-width:1001px\)\{\s*\.my-gpir-nav ul\{grid-template-columns:repeat\(auto-fit,minmax\(9\.5rem,1fr\)\)\}/);
});
