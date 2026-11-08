import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const homeHtml = await readFile(new URL('index.html', root), 'utf8');
const tickerSource = await readFile(new URL('assets/js/fx-ticker.js', root), 'utf8');
const planHtml = await readFile(new URL('reader/plan/index.html', root), 'utf8');
const dashboardSource = await readFile(new URL('assets/js/gpir-reader-dashboard.mjs', root), 'utf8');

test('homepage retains only adjacent compact FX and Global Alerts tickers', () => {
  const withoutComments = homeHtml.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(homeHtml, /fxi-home-card|FX Intelligence<\/strong>/);
  assert.match(withoutComments, /<section id="fx-ribbon"[\s\S]*?<\/section>\s*<section id="market-ribbon"/);
  assert.equal((homeHtml.match(/<section id="fx-ribbon"/g) || []).length, 1);
  assert.equal((homeHtml.match(/<section id="market-ribbon"/g) || []).length, 1);
});

test('FX ticker links select the exact currency pair on the protected dashboard', async () => {
  const fxTrack = { innerHTML: '' };
  const updated = { textContent: '', attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); } };
  const listeners = new Map();
  const document = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    querySelector(selector) {
      return selector.includes('assets/js/fx-ticker.js')
        ? { getAttribute: () => 'assets/js/fx-ticker.js?v=20261104b' } : null;
    },
    getElementById(id) {
      return id === 'fxTicker' ? fxTrack : id === 'lastUpdated' ? updated : null;
    },
    createElement() {
      let text = '';
      return { set textContent(value) { text = String(value); },
        get innerHTML() { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;'); } };
    }
  };
  const snapshot = {
    featuredPairs: ['USD/JPY', 'EUR/GBP'],
    pairs: [
      { pair: 'USD/JPY', base: 'USD', quote: 'JPY', mid: 154.25,
        percentageChange: 0.3, direction: 'up', dataStatus: 'REFERENCE' },
      { pair: 'EUR/GBP', base: 'EUR', quote: 'GBP', mid: 0.86,
        percentageChange: -0.1, direction: 'down', dataStatus: 'REFERENCE' }
    ],
    generatedAt: '2026-11-04T00:00:00.000Z',
    currencyUniverse: { gpirRetrievedAt: '2026-11-04T00:00:00.000Z' },
    refreshIntervalMinutes: 60,
    staleAfterMinutesByProviderType: { reference: 1440 }
  };
  const context = {
    document, window: {}, localStorage: { getItem: () => 'USD' },
    fetch: async () => ({ ok: true, json: async () => snapshot }),
    setTimeout: () => 1, clearTimeout() {}, console, Date, URL, Set, isFinite
  };
  vm.runInNewContext(tickerSource, context);
  listeners.get('DOMContentLoaded')();
  await new Promise(resolve => setImmediate(resolve));
  const links = [...fxTrack.innerHTML.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.length, 4);
  assert.ok([links[0], links[2]].every(href =>
    href === 'pages/fx/pairs/usd-jpy.html'));
  assert.ok([links[1], links[3]].every(href =>
    href === 'pages/fx/pairs/eur-gbp.html'));
  assert.match(fxTrack.innerHTML, /USD\/JPY/);
  assert.match(fxTrack.innerHTML, /EUR\/GBP/);
});

test('subscription plan redirect preserves the encoded FX return destination', () => {
  const script = planHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  let destination = '';
  const location = { origin: 'https://fintechoisis.com',
    search: '?returnTo=%2Fpages%2Ffx%2Fintelligence.html%3Fbase%3DEUR%26quote%3DJPY',
    replace(value) { destination = value; } };
  vm.runInNewContext(script, { URL, URLSearchParams, location });
  assert.equal(destination,
    '/reader/my-gpir/?returnTo=%2Fpages%2Ffx%2Fintelligence.html%3Fbase%3DEUR%26quote%3DJPY#plan');
  assert.match(dashboardSource,
    /rememberFxIntelligenceReturn\(global,\s*new URL\(global\.location\.href \|\| returnTo, 'https:\/\/fintechoisis\.com'\)\s*\.searchParams\.get\('returnTo'\)\)/);
});
