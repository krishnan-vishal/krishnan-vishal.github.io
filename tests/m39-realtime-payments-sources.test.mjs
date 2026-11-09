import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    PAYMENTS_PUBLISHERS,
    PAYMENTS_PUBLISHER_IDS,
    approvedArticleUrl,
    discoverPaymentsPublisherLinks,
    isApprovedPaymentsPublisherRegistry,
    selectUnseenItems
} from '../supabase/functions/_shared/gpir-payments-publishers.mjs';
import { AUTO_PUBLICATION_THRESHOLDS, T3_AUTOMATIC_PUBLICATION } from '../supabase/functions/_shared/gpir-intelligence-validation.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const fetchSource = read('../supabase/functions/gpir-intelligence-fetch/index.ts');
const release = read('../supabase/release/m39-realtime-payments-source-registration.sql');
const rollback = read('../supabase/rollback/m39-realtime-payments-source-registration.rollback.sql');

const paymentsDiveFeed = `<rss><channel>
<item><title>California takes CoinFlip to task</title><link>https://www.paymentsdive.com/news/california-coinflip-crypto-atm-enforcement-fraud/874002/</link><description>&lt;p&gt;x&lt;/p&gt;</description><pubDate>Fri, 06 Nov 2026 10:55:00 -0500</pubDate></item>
<item><title>Off-host</title><link>https://evil.example/news/a-b/1/</link><pubDate>Fri, 06 Nov 2026 10:00:00 -0500</pubDate></item>
<item><title>Section page</title><link>https://www.paymentsdive.com/topic/fraud/</link><pubDate>Fri, 06 Nov 2026 09:00:00 -0500</pubDate></item>
<item><title>California takes CoinFlip to task</title><link>https://www.paymentsdive.com/news/california-coinflip-crypto-atm-enforcement-fraud/874002/</link><pubDate>Fri, 06 Nov 2026 10:55:00 -0500</pubDate></item>
</channel></rss>`;

const finextraFeed = `<rss><channel>
<item> <title>India&#39;s NPCI creates tech and innovation unit</title> <link>https://www.finextra.com/newsarticle/48711/indias-npci-creates-tech-and-innovation-unit?utm_medium=rssfinextra&amp;utm_source=finextrafeed</link> <pubDate>Fri, 06 Nov 2026 00:01:00 GMT</pubDate></item>
<item><title>Undated item</title><link>https://www.finextra.com/newsarticle/48712/undated-item</link></item>
</channel></rss>`;

const epcListing = `<h2><a href="/news-insights/news/epc-publishes-updated-technical-documentation-srtp-scheme" rel="bookmark"><span> EPC publishes updated technical documentation for the SRTP scheme</span></a></h2>
<a href="/news-insights/news/epc-publishes-updated-technical-documentation-srtp-scheme" class="btn">Read the article</a>
<a href="/latest/monthly-e-newsletter">Monthly e-newsletter</a>
<a href="https://evil.example/news-insights/news/fake-article-with-a-long-title">Fake article with a long title</a>`;

test('Payments Dive discovery keeps only approved-host article URLs, deduplicated, with index dates', () => {
    const items = discoverPaymentsPublisherLinks('PAYMENTSDIVE-US-005', paymentsDiveFeed);
    assert.equal(items.length, 1);
    assert.equal(items[0].url, 'https://www.paymentsdive.com/news/california-coinflip-crypto-atm-enforcement-fraud/874002/');
    assert.equal(items[0].indexPublishedAt, '2026-11-06T15:55:00.000Z');
});

test('Finextra tracking parameters are stripped and undated items carry no invented timestamp', () => {
    const items = discoverPaymentsPublisherLinks('FINEXTRA-PAY-006', finextraFeed);
    assert.equal(items[0].url, 'https://www.finextra.com/newsarticle/48711/indias-npci-creates-tech-and-innovation-unit');
    assert.equal(items[0].title, "India's NPCI creates tech and innovation unit");
    assert.equal(items[1].indexPublishedAt, null);
});

test('EPC discovery yields article links only and never an invented date', () => {
    const items = discoverPaymentsPublisherLinks('EPC-EUR-007', epcListing);
    assert.deepEqual(items.map(item => item.url), ['https://www.europeanpaymentscouncil.eu/news-insights/news/epc-publishes-updated-technical-documentation-srtp-scheme']);
    assert.equal(items[0].indexPublishedAt, null);
});

test('only registered publishers are accepted and article URLs must match host and path', () => {
    assert.throws(() => discoverPaymentsPublisherLinks('UNKNOWN', ''), /UNAPPROVED_PAYMENTS_PUBLISHER/);
    assert.equal(approvedArticleUrl('PAYMENTSDIVE-US-005', 'http://www.paymentsdive.com/news/a-b/1/'), null);
    assert.equal(approvedArticleUrl('PAYMENTSDIVE-US-005', 'https://user@www.paymentsdive.com/news/a-b/1/'), null);
    assert.equal(approvedArticleUrl('PAYMENTSDIVE-US-005', 'https://paymentsdive.com.evil.example/news/a-b/1/'), null);
});

test('the registry guard requires the exact approved profile, official URL and index URL', () => {
    for (const id of PAYMENTS_PUBLISHER_IDS) {
        const c = PAYMENTS_PUBLISHERS[id];
        const row = { parser_profile: c.parserProfile, official_url: c.officialUrl, feed_or_index_url: c.indexUrl };
        assert.equal(isApprovedPaymentsPublisherRegistry(id, row), true);
        assert.equal(isApprovedPaymentsPublisherRegistry(id, { ...row, feed_or_index_url: 'https://evil.example/feed' }), false);
        assert.equal(isApprovedPaymentsPublisherRegistry(id, { ...row, official_url: 'https://evil.example/' }), false);
    }
});

test('already-ingested URLs never consume the per-run fetch cap', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(url => ({ url, title: url }));
    assert.deepEqual(selectUnseenItems(items, new Set(['a', 'b', 'c']), 3).map(i => i.url), ['d', 'e', 'f']);
    assert.deepEqual(selectUnseenItems(items, new Set(items.map(i => i.url)), 3), []);
});

test('the fetch function reuses the existing pipeline, guards the registry and filters known URLs before the cap', () => {
    assert.match(fetchSource, /\.\.\.PAYMENTS_PUBLISHER_IDS\] as const/);
    assert.match(fetchSource, /PAYMENTS_PUBLISHER_REGISTRY_MISMATCH/);
    assert.match(fetchSource, /discoverPaymentsPublisherLinks\(requestedSource, indexHtml/);
    assert.match(fetchSource, /selectUnseenItems\(routedDiscoveries, knownUrls, MAX_PAGE_FETCHES\)/);
    assert.match(fetchSource, /\.from\("intelligence_raw_ingestion"\)\s*\.select\("discovered_url"\)/);
    assert.match(fetchSource, /ECB_SOURCE_ID/);
});

test('release SQL registers verified-provenance tiers and schedules the same governed function', () => {
    assert.match(release, /'PAYMENTSDIVE-US-005'[\s\S]*'T3'/);
    assert.match(release, /'FINEXTRA-PAY-006'[\s\S]*'T3'/);
    assert.match(release, /'EPC-EUR-007'[\s\S]*'T1\.5'/);
    assert.match(release, /on conflict \(source_id\) do nothing/);
    const statements0 = release.replace(/^--.*$/gm, '');
    assert.equal((statements0.match(/'DISABLED'/g) || []).length, 3);
    assert.doesNotMatch(statements0, /'GREEN'/);
    assert.deepEqual([...statements0.matchAll(/\('(m39-[a-z-]+)'/g)].map(m => m[1]), ['m39-rba-ingestion']);
    assert.match(release, /functions\/v1\/gpir-intelligence-fetch/);
    assert.match(release, /vault\.decrypted_secrets/);
    const statements = release.replace(/^--.*$/gm, '');
    assert.doesNotMatch(statements, /m33-g1-ecb-ingestion|unschedule|create table|alter table|drop |delete from|confidence|threshold/i);
    assert.doesNotMatch(statements, /eyJ|sb_secret|service_role/);
});

test('rollback disables sources and unschedules only the new jobs, preserving history', () => {
    assert.match(rollback, /source_status = 'DISABLED'/);
    assert.doesNotMatch(rollback, /delete from|drop |m33-g1-/i);
    for (const job of ['m39-paymentsdive-ingestion', 'm39-finextra-payments-ingestion', 'm39-epc-ingestion', 'm39-rba-ingestion'])
        assert.ok(rollback.includes(job));
});

test('automatic-publication thresholds are unchanged', () => {
    assert.deepEqual({ ...AUTO_PUBLICATION_THRESHOLDS }, { T1: 70, 'T1.5': 80, T2: 90 });
    assert.deepEqual({ ...T3_AUTOMATIC_PUBLICATION }, { minConfidence: 95, minContentLength: 1000, minSentences: 3, minRelevanceTerms: 3 });
});
