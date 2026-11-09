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

export function discoverPaymentsPublisherLinks(sourceId, body, { max = 40 } = {}) {
    const config = PAYMENTS_PUBLISHERS[sourceId];
    if (!config) throw Error('UNAPPROVED_PAYMENTS_PUBLISHER');
    const results = [];
    const seen = new Set();
    if (config.parserProfile === 'trade-rss-v1') {
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
