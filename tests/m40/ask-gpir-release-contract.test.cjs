'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('Observatory ASK GPIR uses the existing local search overlay, never an iframe or navigation', () => {
  const html=read('pages/intelligence/index.html');
  assert.match(html, /id="ask-gpir-observatory"/);
  assert.match(html, /aria-controls="search-overlay"/);
  assert.match(html, /id="search-toggle"/);
  assert.match(html, /id="search-input"/);
  assert.match(html, /id="search-results"/);
  assert.match(html, /toggle\.click\(\)/);
  assert.match(html, /assets\/js\/content-search\.js/);
  assert.doesNotMatch(html, /<iframe\b/i);
  assert.doesNotMatch(html, /window\.location\s*=|location\.href\s*=/);
});
test('Homepage search and navigation remain available', () => {
  const html=read('index.html');
  assert.match(html, /class="repository-btn ask-gpir-btn">ASK GPIR/);
  assert.match(html, /id="search-toggle"/);
  assert.match(html, /id="search-overlay"/);
  assert.match(html, /id="search-input"/);
  assert.match(html, /id="search-results"/);
  assert.match(html, /id="main-nav"/);
  assert.match(html, /assets\/js\/content-search\.js/);
});
test('No CMS or identity architecture changes are needed for the in-page search control', () => {
  const html=read('pages/intelligence/index.html');
  assert.match(html, /assets\/js\/supabase-archive\.js/);
  assert.match(html, /class="announcement-dashboard-filters"/);
  assert.doesNotMatch(html, /<iframe\b/i);
});
