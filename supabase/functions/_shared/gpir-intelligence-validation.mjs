const PAYMENT_TERMS = Object.freeze([
  'payment', 'payments', 'settlement', 'clearing', 'cross-border', 'remittance',
  'banking', 'fintech', 'wallet', 'card', 'instant payment', 'real-time payment',
  'cbdc', 'stablecoin', 'open banking', 'iso 20022', 'fraud', 'aml', 'kyc',
  'merchant', 'acquiring', 'payment infrastructure', 'payment rail'
]);

export const AUTO_PUBLICATION_THRESHOLDS = Object.freeze({
  T1: 70,
  'T1.5': 80,
  T2: 90
});

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

export function cleanText(value) {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isOfficialUrl(candidateUrl, officialUrl) {
  const candidateHost = normalizedHost(candidateUrl);
  const officialHost = normalizedHost(officialUrl);
  return Boolean(candidateHost && officialHost &&
    (candidateHost === officialHost || candidateHost.endsWith(`.${officialHost}`)) &&
    !candidateHost.includes('xn--'));
}

function absoluteHttpsUrl(value, base) {
  try {
    const parsed = new URL(value, base);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return null;
}

function jsonLdObjects(html) {
  const values = [];
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        values.push(item);
        if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
      }
    } catch {}
  }
  return values;
}

function sourceTimestamp(html) {
  const candidates = [
    metaContent(html, 'article:published_time'),
    metaContent(html, 'datePublished'),
    ...jsonLdObjects(html).map(item => item.datePublished),
    html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]
  ].filter(value => typeof value === 'string' && value.trim());
  for (const value of candidates) {
    const time = Date.parse(value);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return null;
}

function canonicalUrl(html, responseUrl) {
  const href = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["']/i)?.[1];
  return absoluteHttpsUrl(href || responseUrl, responseUrl);
}

function articleContent(html) {
  const jsonBody = jsonLdObjects(html)
    .map(item => typeof item.articleBody === 'string' ? cleanText(item.articleBody) : '')
    .sort((left, right) => right.length - left.length)[0];
  if (jsonBody && jsonBody.length >= 400) return jsonBody;
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const body = article || main || html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
  return cleanText(body
    .replace(/<(?:nav|footer|header|aside)\b[\s\S]*?<\/(?:nav|footer|header|aside)>/gi, ' '));
}

function meaningfulSentences(content, title) {
  const normalizedTitle = cleanText(title).toLowerCase();
  return content.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(cleanText)
    .filter(sentence => sentence.length >= 60 && sentence.length <= 360)
    .filter(sentence => sentence.toLowerCase() !== normalizedTitle)
    .filter(sentence => !/cookie|privacy policy|subscribe|newsletter|all rights reserved/i.test(sentence));
}

function relevantEvidence(title, content) {
  const text = `${title || ''} ${content || ''}`.toLowerCase();
  return PAYMENT_TERMS.filter(term => text.includes(term));
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function evidenceSummary(sourceName, sentences) {
  const selected = [];
  let length = 0;
  for (const sentence of sentences) {
    if (selected.length >= 3 || length + sentence.length > 850) break;
    selected.push(sentence);
    length += sentence.length;
  }
  if (selected.length < 2) return null;
  return `${sourceName} reports: ${selected.join(' ')}`;
}

function review(reasonCode, evidence = {}) {
  return { decision: 'REVIEW', reasonCode, ...evidence };
}

function reject(reasonCode, evidence = {}) {
  return { decision: 'REJECTED', reasonCode, ...evidence };
}

export async function validateCandidateSource({ candidate, source, fetchImpl = fetch,
  now = () => Date.now(), timeoutMs = 15000 }) {
  if (!source || source.source_status !== 'GREEN' || !source.official_url)
    return review('SOURCE_NOT_APPROVED');
  if (!candidate?.canonical_url || !isOfficialUrl(candidate.canonical_url, source.official_url))
    return reject('CANDIDATE_SOURCE_DOMAIN_MISMATCH');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let requestUrl = candidate.canonical_url;
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetchImpl(requestUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'GPIR-ResearchBot/1.0 (+https://fintechoisis.com)'
        }
      });
      if (response.status < 300 || response.status >= 400) break;
      const nextUrl = absoluteHttpsUrl(response.headers?.get?.('location'), requestUrl);
      if (!nextUrl || !isOfficialUrl(nextUrl, source.official_url))
        return reject('SOURCE_REDIRECT_DOMAIN_MISMATCH', { sourceHttpStatus: response.status });
      requestUrl = nextUrl;
      response = null;
    }
    if (!response) return review('SOURCE_REDIRECT_LIMIT_EXCEEDED');
  } catch {
    return review('SOURCE_FETCH_FAILED');
  } finally {
    clearTimeout(timeout);
  }

  const responseUrl = response.url || requestUrl;
  if (!response.ok) return review(`SOURCE_HTTP_${response.status}`, { sourceHttpStatus: response.status });
  if (!isOfficialUrl(responseUrl, source.official_url))
    return reject('SOURCE_REDIRECT_DOMAIN_MISMATCH', { sourceHttpStatus: response.status });
  const contentType = response.headers?.get?.('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType))
    return review('UNSUPPORTED_SOURCE_CONTENT_TYPE', { sourceHttpStatus: response.status });

  const html = await response.text();
  if (html.length > 2_000_000) return review('SOURCE_DOCUMENT_TOO_LARGE', { sourceHttpStatus: response.status });
  const canonical = canonicalUrl(html, responseUrl);
  if (!canonical || !isOfficialUrl(canonical, source.official_url) ||
      normalizedHost(canonical) !== normalizedHost(candidate.canonical_url) ||
      new URL(canonical).pathname.replace(/\/+$/, '') !== new URL(candidate.canonical_url).pathname.replace(/\/+$/, ''))
    return review('CANONICAL_URL_NOT_VERIFIED', { sourceHttpStatus: response.status });

  const publishedAt = sourceTimestamp(html);
  if (!publishedAt) return review('SOURCE_TIMESTAMP_MISSING', { canonicalUrl: canonical, sourceHttpStatus: response.status });
  const publishedTime = Date.parse(publishedAt);
  const candidateTime = Date.parse(candidate.published_at || '');
  if (!Number.isFinite(candidateTime) || publishedTime > now() + 5 * 60 * 1000)
    return reject('SOURCE_TIMESTAMP_INVALID', { canonicalUrl: canonical, sourcePublishedAt: publishedAt });
  if (Math.abs(publishedTime - candidateTime) > 36 * 60 * 60 * 1000)
    return review('SOURCE_TIMESTAMP_MISMATCH', { canonicalUrl: canonical, sourcePublishedAt: publishedAt });

  const content = articleContent(html);
  const sentences = meaningfulSentences(content, candidate.title);
  if (content.length < 600 || sentences.length < 2)
    return review('INSUFFICIENT_SOURCE_EVIDENCE', { canonicalUrl: canonical, sourcePublishedAt: publishedAt });
  const relevanceTerms = relevantEvidence(candidate.title, content);
  if (relevanceTerms.length < 2)
    return review('INSUFFICIENT_PAYMENTS_RELEVANCE', { canonicalUrl: canonical, sourcePublishedAt: publishedAt });

  const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ').trim();
  const contentFingerprint = await sha256(normalizedContent);
  const summary = evidenceSummary(source.source_name || source.source_id, sentences);
  if (!summary || summary.length < 120)
    return review('SUMMARY_GROUNDING_FAILED', { canonicalUrl: canonical, sourcePublishedAt: publishedAt });

  const threshold = AUTO_PUBLICATION_THRESHOLDS[source.trust_tier];
  const confidence = Number(candidate.confidence_score);
  const evidence = {
    canonicalUrl: canonical,
    sourcePublishedAt: publishedAt,
    sourceHttpStatus: response.status,
    contentFingerprint,
    summary,
    evidenceExcerpt: sentences.slice(0, 2).join(' ').slice(0, 1000),
    relevanceTerms,
    validationPayload: {
      source_verified: true,
      canonical_verified: true,
      timestamp_verified: true,
      content_verified: true,
      relevance_verified: true,
      summary_grounded: true,
      source_trust_tier: source.trust_tier,
      confidence_score: confidence,
      validator: 'GPIR-G1-PUBLICATION-1'
    }
  };
  if (!threshold || !Number.isFinite(confidence) || confidence < threshold)
    return review('AUTO_PUBLICATION_THRESHOLD_NOT_MET', evidence);
  return { decision: 'PUBLISHED', reasonCode: 'VALIDATED_FOR_PUBLICATION', ...evidence };
}

export function isWithinLiveWindow(publishedAt, now = Date.now()) {
  const timestamp = Date.parse(publishedAt || '');
  return Number.isFinite(timestamp) && timestamp <= now && timestamp >= now - 12 * 60 * 60 * 1000;
}
