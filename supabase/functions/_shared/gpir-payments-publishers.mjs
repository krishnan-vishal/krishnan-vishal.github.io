// Approved payments-specific publishers acquired through the existing governed ingestion.
// Discovery only: every discovered article is still fetched individually, bound to the
// registered official host, and validated by the unchanged publication validator.

export const PAYMENTS_PUBLISHERS = Object.freeze({
    'PAYMENTSDIVE-US-005': Object.freeze({
        parserProfile: 'trade-rss-v1',
        host: 'www.paymentsdive.com',
        officialUrl: 'https://www.paymentsdive.com/',
        indexUrl: 'https://www.paymentsdive.com/feeds/news/',
        pathPattern: /^\/news\/[a-z0-9-]+\/\d+\/?$/
    }),
    'FINEXTRA-PAY-006': Object.freeze({
        parserProfile: 'trade-rss-v1',
        host: 'www.finextra.com',
        officialUrl: 'https://www.finextra.com/',
        indexUrl: 'https://www.finextra.com/rss/channel.aspx?channel=payments',
        pathPattern: /^\/newsarticle\/\d+\/[a-z0-9-]+\/?$/
    }),
    'EPC-EUR-007': Object.freeze({
        parserProfile: 'epc-news-html-v1',
        host: 'www.europeanpaymentscouncil.eu',
        officialUrl: 'https://www.europeanpaymentscouncil.eu/',
        indexUrl: 'https://www.europeanpaymentscouncil.eu/news-insights',
        pathPattern: /^\/news-insights\/news\/[a-z0-9-]+\/?$/
    }),
    'FINTECHNEWS-SG-008': Object.freeze({
        parserProfile: 'wordpress-payments-v1',
        host: 'fintechnews.sg',
        officialUrl: 'https://fintechnews.sg/',
        indexUrl: 'https://fintechnews.sg/payments/feed/',
        historyApiUrl: 'https://fintechnews.sg/wp-json/wp/v2/posts',
        historyCategoryId: 5666,
        pathPattern: /^\/\d+\/[a-z0-9-]+\/[a-z0-9-]+\/?$/
    }),
    'ATLAS-APAC-009': Object.freeze({
        parserProfile: 'wordpress-payments-v1',
        host: 'sg.atlstech.com',
        officialUrl: 'https://sg.atlstech.com/',
        indexUrl: 'https://sg.atlstech.com/category/insight/blogs/payments-research/feed/',
        historyApiUrl: 'https://sg.atlstech.com/wp-json/wp/v2/posts',
        historyCategoryId: 3100,
        pathPattern: /^\/insight\/blogs\/[a-z0-9-]+\/[a-z0-9-]+\/?$/
    })
});

export const PAYMENTS_PUBLISHER_IDS = Object.freeze(Object.keys(PAYMENTS_PUBLISHERS));

export function isApprovedPaymentsPublisherRegistry(sourceId, source) {
    const config = PAYMENTS_PUBLISHERS[sourceId];
    return Boolean(config && source &&
        source.parser_profile === config.parserProfile &&
        source.official_url === config.officialUrl &&
        source.feed_or_index_url === config.indexUrl);
}

export function buildPaymentsPublisherDiscoveryUrl(sourceId, { start, end, maxRecords = 40 } = {}) {
    const config = PAYMENTS_PUBLISHERS[sourceId];
    if (!config) throw Error('UNAPPROVED_PAYMENTS_PUBLISHER');
    if (!start && !end) return config.indexUrl;
    if (!config.historyApiUrl || !start || !end) throw Error('PAYMENTS_HISTORY_WINDOW_UNSUPPORTED');

    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs)
        throw Error('INVALID_PAYMENTS_HISTORY_WINDOW');
    if (endMs - startMs > 32 * 24 * 60 * 60 * 1000)
        throw Error('PAYMENTS_HISTORY_WINDOW_EXCEEDS_32_DAYS');

    const url = new URL(config.historyApiUrl);
    url.searchParams.set('categories', String(config.historyCategoryId));
    // WordPress treats `after` as exclusive. Moving it back one millisecond and
    // filtering the parsed result preserves the exact [start, end) contract.
    url.searchParams.set('after', new Date(startMs - 1).toISOString());
    url.searchParams.set('before', new Date(endMs).toISOString());
    url.searchParams.set('per_page', String(Math.max(1, Math.min(100, Number(maxRecords) || 40))));
    url.searchParams.set('orderby', 'date');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('_fields', 'id,date_gmt,link,title,categories');
    return url.toString();
}

function decodeText(value) {
    return String(value || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
        .replace(/\s+/g, ' ').trim();
}

// Returns a canonical https article URL on the approved host, or null. Tracking parameters
// and fragments are removed so one article cannot be ingested twice.
export function approvedArticleUrl(sourceId, value) {
    const config = PAYMENTS_PUBLISHERS[sourceId];
    if (!config) return null;
    try {
        const url = new URL(decodeText(value));
        if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== config.host || url.username || url.password) return null;
        if (!config.pathPattern.test(url.pathname)) return null;
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

export function discoverPaymentsPublisherLinks(sourceId, body, { max = 40, start, end } = {}) {
    const config = PAYMENTS_PUBLISHERS[sourceId];
    if (!config) throw Error('UNAPPROVED_PAYMENTS_PUBLISHER');
    const results = [];
    const seen = new Set();
    const trimmed = String(body || '').trim();
    if (config.historyApiUrl && trimmed.startsWith('[')) {
        let posts;
        try {
            posts = JSON.parse(trimmed);
        } catch {
            throw Error('INVALID_WORDPRESS_HISTORY_RESPONSE');
        }
        if (!Array.isArray(posts)) throw Error('INVALID_WORDPRESS_HISTORY_RESPONSE');
        for (const post of posts) {
            if (!Array.isArray(post?.categories) || !post.categories.includes(config.historyCategoryId)) continue;
            const title = decodeText(post?.title?.rendered);
            const url = approvedArticleUrl(sourceId, post?.link);
            const rawDate = String(post?.date_gmt || '');
            const date = new Date(rawDate.endsWith('Z') ? rawDate : `${rawDate}Z`);
            if (!title || !url || Number.isNaN(date.getTime()) || seen.has(url)) continue;
            if ((start && date.getTime() < Date.parse(start)) || (end && date.getTime() >= Date.parse(end))) continue;
            seen.add(url);
            results.push({
                title,
                url,
                indexPublishedAt: date.toISOString(),
                discovery: { adapter: 'wordpress-rest-v2', postId: Number(post.id) || null }
            });
            if (results.length >= max) break;
        }
        return results;
    }
    if (config.parserProfile === 'trade-rss-v1' || config.parserProfile === 'wordpress-payments-v1') {
        for (const item of String(body || '').match(/<item\b[\s\S]*?<\/item>/gi) || []) {
            const field = name => item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1] || '';
            const title = decodeText(field('title'));
            const url = approvedArticleUrl(sourceId, field('link'));
            const date = new Date(decodeText(field('pubDate')));
            if (!title || !url || seen.has(url)) continue;
            seen.add(url);
            results.push({ title, url, indexPublishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString() });
            if (results.length >= max) break;
        }
        return results;
    }
    // The EPC listing carries no machine-readable dates; the article page metadata supplies
    // the publication timestamp and an undated article is never published.
    for (const match of String(body || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const url = approvedArticleUrl(sourceId, new URL(match[1], config.officialUrl).toString());
        const title = decodeText(match[2]);
        if (!url || title.length < 12 || /^read the article$/i.test(title) || seen.has(url)) continue;
        seen.add(url);
        results.push({ title, url, indexPublishedAt: null });
        if (results.length >= max) break;
    }
    return results;
}

// Article URLs already ingested for the source are skipped before the per-run fetch cap, so a
// burst of new items cannot be starved by older items that always sit at the top of an index.
export function selectUnseenItems(items, knownUrls, limit) {
    const known = knownUrls instanceof Set ? knownUrls : new Set(knownUrls || []);
    return items.filter(item => !known.has(item.url)).slice(0, limit);
}
