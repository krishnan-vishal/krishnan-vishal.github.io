import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('shared long-form tokens drive chapter and governed publication typography', () => {
  const variables = read('assets/css/variables.css');
  const chapter = read('assets/css/chapter-page.css');
  const publication = read('assets/css/contentful-publication.css');
  for (const token of ['--gpir-content-font-heading', '--gpir-content-font-body',
    '--gpir-content-h1', '--gpir-content-h2', '--gpir-content-body',
    '--gpir-content-leading', '--gpir-content-measure']) {
    assert.match(variables, new RegExp(token));
  }
  assert.match(chapter, /text-align:left/);
  assert.doesNotMatch(chapter, /text-align:justify/);
  assert.match(chapter, /\.chapter-content p:empty/);
  assert.match(publication, /\.gpir-research-module-content p:empty/);
  assert.match(publication, /\.gpir-research-module-content li > p/);
  assert.match(publication, /max-width: var\(--gpir-content-measure, 82ch\)/);
  assert.match(publication, /@media \(max-width: 720px\)/);
});

test('homepage, governed publications and archive cards expose contextual ASK GPIR navigation', () => {
  const homepage = read('index.html');
  const renderer = read('scripts/m35/contentful-publication-renderer.js');
  const hydration = read('assets/js/gpir-protected-publication.mjs');
  const archive = read('assets/js/supabase-archive.js');
  assert.match(homepage, /class="repository-btn ask-gpir-btn">ASK GPIR</);
  assert.match(renderer, /class="gpir-topic-ask"/);
  assert.match(hydration, /installPublicationAskLink/);
  assert.match(archive, /ASK GPIR about this topic/);
  assert.match(archive, /record\.topicIds\.join/);
});

test('existing static publication shells load the shared topic-aware ASK GPIR module', () => {
  const rootPages = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => path.join(root, entry.name, 'index.html'))
    .filter(filePath => fs.existsSync(filePath))
    .filter(filePath => fs.readFileSync(filePath, 'utf8').includes('class="gpir-publication"'));
  assert.ok(rootPages.length >= 35, 'expected the governed publication estate');
  for (const filePath of rootPages) {
    assert.match(fs.readFileSync(filePath, 'utf8'),
      /<script type="module" src="\/assets\/js\/gpir-protected-publication\.mjs"><\/script>/,
      path.relative(root, filePath));
  }
});

test('ASK GPIR reuses historical intelligence and published search with explicit lifecycle labels', () => {
  const assistant = read('assets/js/script.js');
  assert.match(assistant, /gpir-public-intelligence\?scope=history&limit=1000/);
  assert.match(assistant, /Current intelligence · latest 12 hours/);
  assert.match(assistant, /Archived or superseded intelligence/);
  assert.match(assistant, /Published research/);
  assert.match(assistant, /window\.GPIRContentSearch\.load/);
  assert.match(assistant, /record\.topicIds/);
});

test('the existing governed taxonomy and 12-hour lifecycle remain the only topic and expiry contracts', () => {
  const browserTopics = read('assets/js/gpir-topic-intelligence.mjs');
  const edgeTopics = read('supabase/functions/_shared/gpir-topic-intelligence.mjs');
  const archive = read('assets/js/supabase-archive.js');
  assert.equal(browserTopics, edgeTopics);
  assert.match(browserTopics, /export const TOPIC_TAXONOMY/);
  assert.match(browserTopics, /const topicIds = classifyTopicIds\(record\)/);
  assert.match(archive, /LIVE_WINDOW_MS = 12 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(archive, /delete|remove.*record/i);
});
