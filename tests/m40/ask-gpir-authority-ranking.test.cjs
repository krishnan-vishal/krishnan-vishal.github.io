const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const search = require('../../assets/js/content-search.js');

test('ASK GPIR ranks exact authority aliases above incidental matches', async t => {
    const originalFetch = global.fetch;
    global.fetch = async url => {
        if (url.startsWith('https:')) return { ok: false };
        const contents = await fs.readFile(path.resolve(__dirname, '../..', url), 'utf8');
        return { ok: true, json: async () => JSON.parse(contents) };
    };
    global.document = {
        createElement: () => ({
            set textContent(text) {
                this.innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        })
    };
    t.after(() => {
        global.fetch = originalFetch;
        delete global.document;
    });
    await search.load();
    for (const [query, country] of [
        ['UAE Central bank', 'uae'],
        ['Central Bank of the United Arab Emirates', 'uae'],
        ['United Arab Emirates', 'uae'],
        ['CBUAE', 'uae'],
        ['RBI', 'india'],
        ['Monetary Authority of Singapore', 'singapore']
    ]) {
        assert.equal(search.search(query).results[0]?.id, 'country-' + country + '-regulatory', query);
    }
    assert.ok(search.search('UAE Central bank').results.some(record => record.id === 'chapter-payment-infrastructure-rails'));
});
