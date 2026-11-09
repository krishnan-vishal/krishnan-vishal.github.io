import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { publicFxResearchRecords, renderPublicFxResearch, SMART_INTELLIGENCE_URL }
  from '../../assets/js/gpir-reader-dashboard.mjs';

const root = new URL('../../', import.meta.url);
const editorialText = await readFile(new URL('assets/data/fx/editorial-public.json', root), 'utf8');
const editorial = JSON.parse(editorialText);
const smartPage = await readFile(new URL('pages/intelligence/smart.html', root), 'utf8');
const smartScript = await readFile(new URL('assets/js/smart-intelligence.mjs', root), 'utf8');
const dashboardPage = await readFile(new URL('reader/my-gpir/index.html', root), 'utf8');

function fakeDocument() {
  const make = tag => ({ tag, children: [], dataset: {}, attrs: {}, textContent: '', className: '',
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener() {} });
  const target = make('div');
  return { target, createElement: make, querySelector: () => target };
}

function anchors(node, found = []) {
  if (node.tag === 'a') found.push(node);
  for (const child of node.children || []) anchors(child, found);
  return found;
}

test('all 26 published pair cards expose exactly the three approved destinations', async () => {
  const document = fakeDocument();
  await renderPublicFxResearch(document, async () => ({ ok: true, json: async () => editorial }));
  const cards = [];
  (function walk(node) {
    if (node.className === 'my-gpir-public-pair') cards.push(node);
    for (const child of node.children || []) walk(child);
  })(document.target);
  assert.equal(cards.length, 26);
  const records = new Map(publicFxResearchRecords(editorial).map(record => [record.pair, record]));
  for (const card of cards) {
    const links = anchors(card);
    assert.deepEqual(links.map(link => link.textContent),
      ['Open FX Intelligence', 'Open Smart Intelligence', 'Read Published Research']);
    const pair = card.children[0].textContent;
    const [base, quote] = pair.split('/');
    assert.equal(links[0].href, `/pages/fx/pairs/${base.toLowerCase()}-${quote.toLowerCase()}.html`);
    assert.equal(links[1].href, '/pages/intelligence/smart.html');
    assert.equal(links[2].href, records.get(pair).editorialUrl);
    assert.doesNotMatch(links[1].href, /\/pages\/fx\/|base=|quote=/);
  }
});

test('Smart Intelligence destination is the shared topic-based dashboard constant', () => {
  assert.equal(SMART_INTELLIGENCE_URL, '/pages/intelligence/smart.html');
  assert.ok(publicFxResearchRecords(editorial).every(record => record.smartIntelligenceUrl === SMART_INTELLIGENCE_URL));
});

test('the destination page is the live-alert and topic-based historical dashboard', () => {
  assert.match(smartPage, /data-smart-live/);
  assert.match(smartPage, /LIVE GLOBAL ALERTS/);
  assert.match(smartPage, /smart-intelligence\.mjs/);
  assert.match(smartScript, /gpir-public-alerts/);
  assert.match(smartScript, /SMART_TOPICS/);
});

test('My GPIR loads the corrected module version', () => {
  assert.match(dashboardPage, /gpir-reader-dashboard\.mjs\?v=20261109c/);
});
