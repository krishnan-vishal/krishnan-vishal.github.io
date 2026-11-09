// ============================================================
// GPIR M33-F2 — CONTROLLED INTELLIGENCE ACQUISITION
// Phase 1: SFA-APAC-001 only
//
// PURPOSE
// source_registry -> external source -> RAW staging
//
// SAFETY
// - DOES NOT write to global_announcements
// - DOES NOT publish to GPIR
// - DOES NOT approve candidates
// - DOES NOT schedule cron
// - Restricted to one test source
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import {
  BIS_DATAFLOWS,
  BIS_TERMS_URL,
  GITHUB_TECHNICAL_SOURCES,
  buildBisDataUrl,
  buildBisReleaseCalendarUrl,
  buildGdeltQueryUrl,
  matchGdeltPublisherSource,
  parseBisReleaseCalendarCsv,
  parseBisSdmxCsv,
  parseGdeltDiscovery,
} from "../_shared/gpir-public-source-adapters.mjs";
import { fetchTechnicalHistory } from "../_shared/gpir-github-technical.mjs";

const TEST_SOURCE_ID = "SFA-APAC-001";
const RBI_SOURCE_ID = "CB-APAC-010";
const FINTECH_FUTURES_SOURCE_ID = "FS-GLOBAL-003";
const PYMNTS_SOURCE_ID = "PYMNTS-GLOBAL-004";
const MAS_SOURCE_ID = "CB-APAC-002";
const ECB_SOURCE_ID = "CB-EUR-001";
const RBA_SOURCE_ID = "TEST-RBA-01";
const GDELT_SOURCE_ID = "GDELT-GLOBAL-001";
const BIS_SOURCE_ID = "BIS-GLOBAL-001";
const TECHNICAL_SOURCE_IDS = ["MOJALOOP-OSS-001", "HYPERSWITCH-OSS-001"] as const;
// RBA is enabled only through its official media-release RSS parser; MAS/ECB remain gated.
const CONTROLLED_SOURCE_IDS = [TEST_SOURCE_ID, RBI_SOURCE_ID, PYMNTS_SOURCE_ID, FINTECH_FUTURES_SOURCE_ID, RBA_SOURCE_ID, GDELT_SOURCE_ID, BIS_SOURCE_ID, ...TECHNICAL_SOURCE_IDS] as const;
const RBA_MEDIA_RSS = "https://www.rba.gov.au/rss/rss-cb-media-releases.xml";
const MAX_DISCOVERED_LINKS = 40;
const MAX_PAGE_FETCHES = 3;
// A write-mode claim has a finite lease so a crashed Edge invocation cannot
// strand a source. Dry runs never obtain a claim and remain write-free.
const SOURCE_RUN_CLAIM_TTL_SECONDS = 900;

const SFA_NEWS_INDEX = "https://singaporefintech.org/news/";

type SourceRecord = {
  source_id: string;
  source_name: string | null;
  official_url: string | null;
  feed_or_index_url: string | null;
  acquisition_method: string | null;
  parser_profile: string | null;
  source_status: string | null;
};

type DiscoveredItem = {
  title: string;
  url: string;

  // Optional source publication date discovered from an index/listing page.
  indexPublishedAt?: string | null;
  discovery?: Record<string, unknown> | null;
  publisherSource?: SourceRecord;
};

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function looksLikeUsefulPath(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase().replace(/\/+$/, "");

    // --------------------------------------------------------
    // Reject known section/index/container pages.
    // These are discovery surfaces, not intelligence records.
    // --------------------------------------------------------
    const containerPaths = new Set([
      "",
      "/news",
      "/event",
      "/events",
      "/publications",
      "/publication",
      "/newsroom",
      "/press",
      "/press-releases",
    ]);

    if (containerPaths.has(path)) {
      return false;
    }

    // --------------------------------------------------------
    // Individual content candidates.
    // --------------------------------------------------------
    if (path.includes("/news/")) return true;
    if (path.includes("/event/")) return true;
    if (path.includes("/events/")) return true;
    if (path.includes("/publication/")) return true;
    if (path.includes("/publications/")) return true;

    if (path.endsWith(".pdf")) return true;

    return false;
  } catch {
    return false;
  }
}

function looksLikeNewsArticle(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase().replace(/\/+$/, "");

    // /news/ itself is a discovery container, not an article.
    if (path === "/news") {
      return false;
    }

    // Accept only individual SFA news article paths.
    return path.startsWith("/news/");
  } catch {
    return false;
  }
}


function discoverLinks(html: string, baseUrl: string): DiscoveredItem[] {
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();

  const anchorRegex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1]?.trim();
    const rawTitle = match[2] ?? "";

    if (!href) continue;

    const url = absoluteUrl(href, baseUrl);
    if (!url) continue;

    if (!looksLikeUsefulPath(url)) continue;

    const title = cleanText(rawTitle);

    // Empty titles are useless at this discovery stage.
    if (!title) continue;

    if (seen.has(url)) continue;
    seen.add(url);

    results.push({
      title,
      url,
    });

    if (results.length >= MAX_DISCOVERED_LINKS) break;
  }

  return results;
}

function discoverNewsLinks(
  html: string,
  baseUrl: string,
): DiscoveredItem[] {
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();

  // M33-F5
  // SFA News index: bind each article to the date
  // contained inside its own news-item card.

  const cardRegex =
    /<div\b[^>]*class=["'][^"']*\bnews-item\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bnews-item\b|$)/gi;

  let cardMatch: RegExpExecArray | null;

  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const cardHtml = cardMatch[1] ?? "";

    const anchorMatch = cardHtml.match(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );

    if (!anchorMatch) continue;

    const href = anchorMatch[1]?.trim();
    const rawTitle = anchorMatch[2] ?? "";

    if (!href) continue;

    const url = absoluteUrl(href, baseUrl);
    if (!url) continue;

    if (!looksLikeNewsArticle(url)) continue;

    try {
      const parsed = new URL(url);

      if (parsed.hostname !== "singaporefintech.org") {
        continue;
      }
    } catch {
      continue;
    }

    const normalizedUrl = url.split("#")[0];
    const title = cleanText(rawTitle);

    if (!title || title.length < 8) continue;
    if (seen.has(normalizedUrl)) continue;

    // Extract date only from THIS article's card.
    const dateMatch = cardHtml.match(
      /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i,
    );

    let indexPublishedAt: string | null = null;

    if (dateMatch?.[1]) {
      const parsedDate = new Date(
        dateMatch[1].trim(),
      );

      if (!Number.isNaN(parsedDate.getTime())) {
        indexPublishedAt =
          parsedDate.toISOString();
      }
    }

    seen.add(normalizedUrl);

    results.push({
      title,
      url: normalizedUrl,
      indexPublishedAt,
    });

    if (results.length >= MAX_DISCOVERED_LINKS) {
      break;
    }
  }

  return results;
}


// RBA: parse official RSS items only; never treat index containers as articles.

// Conservative official RBA media-release body extraction. Missing body stays
// missing: a summary or page chrome must not become publication evidence.
function extractRbaArticleBody(html: string): string | null {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const article = main?.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    main?.match(/<div\b[^>]*class=["'][^"']*(?:media-release|article-body|content-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const rbaContent = html.match(/<div\b[^>]*class=["'][^"']*\brss-mr-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const bodyContent = article || rbaContent;
  if (!bodyContent) return null;
  const withoutNoise = bodyContent
    .replace(/<(script|style|nav|aside|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const body = cleanText(withoutNoise);
  return body.length >= 200 ? body.slice(0, 12000) : null;
}

function discoverRbaMediaLinks(xml: string): DiscoveredItem[] {
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    const field = (name: string) => {
      const match = item.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i"));
      return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
    };
    const title = cleanText(field("title"));
    const url = absoluteUrl(field("link"), "https://www.rba.gov.au/");
    const rawDate = field("pubDate") || field("dc:date");
    const date = rawDate ? new Date(rawDate) : null;
    if (!url || !title || !date || Number.isNaN(date.getTime())) continue;
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.hostname !== "www.rba.gov.au" || !parsed.pathname.startsWith("/media-releases/")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, indexPublishedAt: date.toISOString() });
    if (results.length >= MAX_DISCOVERED_LINKS) break;
  }
  return results;
}

function isOfficialRbiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "rbi.org.in" || host.endsWith(".rbi.org.in");
  } catch {
    return false;
  }
}

function isRbiRegulatoryOrPaymentsTitle(title: string): boolean {
  return /notification|circular|press release|payment|settlement|digital rupee|cbdc|upi|prepaid|card|licen[cs]|authori[sz]|kyc|aml|cross-border|remittance|fintech|payment system/i.test(title);
}

function isRbiLeafRecordUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith(".pdf")) return true;
    // RBI index/navigation pages are discovery surfaces only. An individual
    // record uses a stable detail identifier exposed by the official listing.
    if (!parsed.searchParams.has("Id") && !parsed.searchParams.has("id") && !parsed.searchParams.has("prid")) return false;
    return /notificationuser\.aspx|pressreleasedisplay\.aspx|mastercirculardetails\.aspx|viewmastercirculardetails\.aspx|circular/i.test(path);
  } catch {
    return false;
  }
}

function normalizeRbiUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() === "www.rbi.org.in") parsed.hostname = "rbi.org.in";
  parsed.hash = "";
  return parsed.toString();
}

function discoverRbiLinks(html: string, baseUrl: string): DiscoveredItem[] {
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();
  const add = (rawTitle: string, href: string, publishedAt?: string | null) => {
    const url = absoluteUrl(href.trim(), baseUrl);
    const title = cleanText(rawTitle);
    if (!url || !title || !isOfficialRbiUrl(url) || !isRbiLeafRecordUrl(url) || !isRbiRegulatoryOrPaymentsTitle(title)) return;
    const normalized = normalizeRbiUrl(url);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const parsedDate = publishedAt ? new Date(publishedAt) : null;
    results.push({ title, url: normalized, indexPublishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null });
  };

  // Official RSS/current-listing items are preferred over generic navigation.
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let item: RegExpExecArray | null;
  while ((item = itemRegex.exec(html)) !== null && results.length < MAX_DISCOVERED_LINKS) {
    const body = item[1] || "";
    const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const href = (body.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || body.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const publishedAt = (body.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    add(title, href, publishedAt);
  }

  // Stable official HTML listing fallback, still excluding generic/promotional links.
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let anchor: RegExpExecArray | null;
  while ((anchor = anchorRegex.exec(html)) !== null && results.length < MAX_DISCOVERED_LINKS) add(anchor[2] || "", anchor[1] || "");
  return results;
}

function isOfficialFintechFuturesUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "fintechfutures.com" || host === "www.fintechfutures.com";
  } catch {
    return false;
  }
}

function normalizeFintechFuturesUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() === "www.fintechfutures.com") parsed.hostname = "fintechfutures.com";
  parsed.hash = "";
  return parsed.toString();
}

function isFintechFuturesArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    if (!isOfficialFintechFuturesUrl(url) || !path) return false;
    if (path === "/category/payment" || path === "/category/payments") return false;
    return !/^\/(?:category|tag|author|page|advertise|about|contact)(?:\/|$)/.test(path) && !parsed.searchParams.has("paged");
  } catch {
    return false;
  }
}

function isFintechFuturesRelevantTitle(title: string): boolean {
  return /payment|cross-border|remittance|banking|card|wallet|real-time|stablecoin|digital asset|cbdc|digital rupee|fintech|infrastructure|settlement|regulation/i.test(title);
}

function discoverFintechFuturesLinks(html: string, baseUrl: string): DiscoveredItem[] {
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let anchor: RegExpExecArray | null;

  while ((anchor = anchorRegex.exec(html)) !== null && results.length < MAX_DISCOVERED_LINKS) {
    const url = absoluteUrl(anchor[1] || "", baseUrl);
    const title = cleanText(anchor[2] || "");
    if (!url || !title || !isFintechFuturesArticleUrl(url) || !isFintechFuturesRelevantTitle(title)) continue;
    const normalized = normalizeFintechFuturesUrl(url);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push({ title, url: normalized });
  }

  return results;
}

function isOfficialPymntsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "pymnts.com" || host === "www.pymnts.com";
  } catch {
    return false;
  }
}

function normalizePymntsUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() === "www.pymnts.com") parsed.hostname = "pymnts.com";
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

function isPymntsLeafArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    if (!isOfficialPymntsUrl(url) || !path || path === "/feed") return false;
    if (/^\/(?:tag|category|author|page|feed|about|contact|subscribe)(?:\/|$)/.test(path)) return false;
    return path.split("/").filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

function discoverPymntsLinks(html: string, baseUrl: string): DiscoveredItem[] {
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let item: RegExpExecArray | null;

  while ((item = itemRegex.exec(html)) !== null && results.length < MAX_DISCOVERED_LINKS) {
    const body = item[1] || "";
    const rawTitle = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const rawUrl = (body.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const rawDate = (body.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "");
    const url = absoluteUrl(cleanText(rawUrl), baseUrl);
    const title = cleanText(rawTitle);
    if (!url || !title || !isPymntsLeafArticleUrl(url)) continue;
    const normalized = normalizePymntsUrl(url);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const parsedDate = rawDate ? new Date(cleanText(rawDate)) : null;
    results.push({ title, url: normalized, indexPublishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null });
  }

  return results;
}

function extractRbiPressReleaseLeaf(html: string) {
  // RBI press-release leaf pages use a generic HTML title and H1. The record
  // header is instead the adjacent Date/title pair in the official tableheader
  // rows, followed by the tablecontent1 article body.
  const headerMatch = html.match(
    /<td\b[^>]*class=["'][^"']*\btableheader\b[^"']*["'][^>]*>\s*<b>\s*Date\s*:\s*([^<]+)<\/b>\s*<\/td>\s*<\/tr>\s*<tr\b[^>]*>\s*<td\b[^>]*class=["'][^"']*\btableheader\b[^"']*["'][^>]*>\s*<b>([\s\S]*?)<\/b>/i,
  );
  const bodyMatch = html.match(
    /<tr\b[^>]*class=["'][^"']*\btablecontent1\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/i,
  );
  const dateText = headerMatch?.[1] ? cleanText(headerMatch[1]) : null;
  const parsedDate = dateText ? new Date(dateText) : null;

  return {
    title: headerMatch?.[2] ? cleanText(headerMatch[2]) : null,
    description: bodyMatch?.[1] ? cleanText(bodyMatch[1]).slice(0, 12000) : null,
    sourcePublishedAt: parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : null,
  };
}

function extractMeta(
  html: string,
  discoveredTitle: string,
  pageUrl: string,
  isRbiLeaf = false,
) {
  const getMeta = (property: string): string | null => {
    const patterns = [
      new RegExp(
        `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["'][^>]*>`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["'][^>]*>`,
        "i",
      ),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return cleanText(match[1]);
    }

    return null;
  };

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  const shellTitle = /^(press releases|notifications|master circulars)\s*\|\s*official website of reserve bank of india$/i;
  const metaTitle = getMeta("og:title");
  const pageTitle = titleMatch?.[1] ? cleanText(titleMatch[1]) : null;
  const rbiLeaf = isRbiLeaf ? extractRbiPressReleaseLeaf(html) : null;
  const title = isRbiLeaf
    ? (rbiLeaf?.title || discoveredTitle || (!shellTitle.test(metaTitle || "") ? metaTitle : null) || (!shellTitle.test(pageTitle || "") ? pageTitle : null))
    : (metaTitle || pageTitle || discoveredTitle);

  const description = rbiLeaf?.description || getMeta("og:description") || getMeta("description");

  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  );

  const canonicalUrl =
    canonicalMatch?.[1]
      ? absoluteUrl(canonicalMatch[1], pageUrl)
      : absoluteUrl(getMeta("og:url") || pageUrl, pageUrl);

    // --------------------------------------------------------
  // M33-F5
  // Source publication-date extraction.
  //
  // Priority:
  // 1. Standard/meta publication dates
  // 2. JSON-LD datePublished
  // 3. HTML <time datetime="...">
  //
  // Never substitute GPIR ingestion time for source evidence.
  // --------------------------------------------------------

  const dateCandidates: string[] = rbiLeaf?.sourcePublishedAt ? [rbiLeaf.sourcePublishedAt] : [];

  // 1. Standard machine-readable metadata.
  const metaDateCandidates = [
    getMeta("article:published_time"),
    getMeta("date"),
    getMeta("datePublished"),
    getMeta("publish-date"),
    getMeta("publication_date"),
  ].filter(Boolean) as string[];

  dateCandidates.push(...metaDateCandidates);

  // 2. JSON-LD structured data.
  // Example:
  // "datePublished": "2026-08-03T10:00:00+08:00"
  const jsonLdDateMatches =
    html.matchAll(
      /["']datePublished["']\s*:\s*["']([^"']+)["']/gi,
    );

  for (const match of jsonLdDateMatches) {
    if (match[1]) {
      dateCandidates.push(cleanText(match[1]));
    }
  }

  // 3. HTML <time datetime="...">.
  const timeMatches =
    html.matchAll(
      /<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/gi,
    );

  for (const match of timeMatches) {
    if (match[1]) {
      dateCandidates.push(cleanText(match[1]));
    }
  }

  let sourcePublishedAt: string | null = null;

  for (const candidate of dateCandidates) {
    const parsed = new Date(candidate);

    if (!Number.isNaN(parsed.getTime())) {
      sourcePublishedAt = parsed.toISOString();
      break;
    }
  }


  return {
    title: cleanText(title),
    description: description ? cleanText(description) : null,
    canonicalUrl,
    sourcePublishedAt,
    publicationDateSource: sourcePublishedAt ? (isRbiLeaf ? "RBI_LEAF_RECORD" : "ARTICLE_METADATA") : "UNKNOWN",
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  fetch: withSupabase(
    { auth: ["secret"] },
    
    async (req, ctx) => {
      const startedAt = new Date().toISOString();
      let runId: string | null = null;
      let runSourceId: string | null = null;
      let sourceClaimToken: string | null = null;
      let sourceClaimHeld = false;
      let inserted = 0;
      let skippedExisting = 0;
      let fetchErrors = 0;
      let processingErrors = 0;
      let reviewCount = 0;
      let pendingCandidateCount = 0;
      let gate1RejectedCount = 0;
      let gate2RejectedCount = 0;

      try {
        // ----------------------------------------------------
        // 1. Request payload
        // ----------------------------------------------------

        let payload: {
          source_id?: string;
          dry_run?: boolean;
          gdelt_topic?: string;
          start_datetime?: string;
          end_datetime?: string;
          max_records?: number;
          bis_dataflow?: string;
          start_period?: string;
          end_period?: string;
          country_codes?: string[];
          component_filters?: Record<string, string>;
          last_n_observations?: number;
          max_observations?: number;
        } = {};

        try {
          if (req.method !== "GET") {
            payload = await req.json();
          }
        } catch {
          payload = {};
        }

        const requestedSource =
          payload.source_id || TEST_SOURCE_ID;

        const dryRun =
          payload.dry_run === undefined
            ? true
            : Boolean(payload.dry_run);

        // ----------------------------------------------------
        // 2. Hard safety restriction
        // ----------------------------------------------------

        if (!CONTROLLED_SOURCE_IDS.includes(requestedSource as typeof CONTROLLED_SOURCE_IDS[number])) {
          return Response.json(
            {
              ok: false,
              error: "SOURCE_NOT_ALLOWED_IN_M33_G1_6E",
              allowed_sources: CONTROLLED_SOURCE_IDS,
            },
            { status: 400 },
          );
        }

        // ----------------------------------------------------
        // 3. Read source registry
        // ----------------------------------------------------

        const { data: sourceRows, error: sourceError } =
  await ctx.supabaseAdmin
    .from("source_registry")
    .select(
      "source_id,source_name,official_url,feed_or_index_url,acquisition_method,parser_profile,source_status",
    )
    .eq("source_id", requestedSource)
    .limit(2);

if (sourceError) {
  throw new Error(
    `SOURCE_REGISTRY_ERROR: ${sourceError.message}`,
  );
}

if (!sourceRows || sourceRows.length === 0) {
  throw new Error(
    `SOURCE_NOT_VISIBLE_OR_NOT_FOUND: ${requestedSource}`,
  );
}

if (sourceRows.length > 1) {
  throw new Error(
    `DUPLICATE_SOURCE_ID: ${requestedSource}`,
  );
}

const source = sourceRows[0] as SourceRecord;
        const gdeltDiscoveryStatus = requestedSource === GDELT_SOURCE_ID &&
          ["AMBER", "GREEN"].includes(source.source_status || "");
        if (source.source_status !== "GREEN" && !gdeltDiscoveryStatus) {
          throw new Error(
            `SOURCE_NOT_GREEN: ${source.source_status}`,
          );
        }
        if (requestedSource === GDELT_SOURCE_ID && source.parser_profile !== "gdelt-doc-discovery") throw new Error("GDELT_PARSER_PROFILE_MISMATCH");
        if (requestedSource === BIS_SOURCE_ID && source.parser_profile !== "bis-sdmx-csv-v2") throw new Error("BIS_PARSER_PROFILE_MISMATCH");
        const technicalSource = TECHNICAL_SOURCE_IDS.includes(requestedSource as typeof TECHNICAL_SOURCE_IDS[number]);
        if (technicalSource && (source.parser_profile !== "github-technical-history-v1" || source.acquisition_method !== "A")) throw new Error("TECHNICAL_SOURCE_PROFILE_MISMATCH");
        if (technicalSource) {
          const config = GITHUB_TECHNICAL_SOURCES[requestedSource as keyof typeof GITHUB_TECHNICAL_SOURCES];
          if (source.official_url !== `https://github.com/${config.repository}` || source.feed_or_index_url !== `https://api.github.com/repos/${config.repository}/releases`) throw new Error("TECHNICAL_SOURCE_REGISTRY_MISMATCH");
        }
        if (requestedSource === RBA_SOURCE_ID && source.parser_profile !== "rba-rss-profile") {
          throw new Error(`RBA_PARSER_PROFILE_MISMATCH: ${source.parser_profile}`);
        }
        if (requestedSource === RBI_SOURCE_ID && source.parser_profile !== "rbi-rss-profile") {
          throw new Error(`RBI_PARSER_PROFILE_MISMATCH: ${source.parser_profile}`);
        }
        if (requestedSource === FINTECH_FUTURES_SOURCE_ID && source.parser_profile !== "universal-finance") {
          throw new Error(`FINTECH_FUTURES_PARSER_PROFILE_MISMATCH: ${source.parser_profile}`);
        }
        if (requestedSource === PYMNTS_SOURCE_ID && source.parser_profile !== "universal-finance") {
          throw new Error(`PYMNTS_PARSER_PROFILE_MISMATCH: ${source.parser_profile}`);
        }

        if (!dryRun) {
          // Claim before creating a run or acquiring external content. The
          // database RPC is atomic per source; a non-owner cannot release it.
          runSourceId = source.source_id;
          sourceClaimToken = crypto.randomUUID();
          const { data: claimRows, error: claimError } = await ctx.supabaseAdmin
            .rpc("gpir_claim_intelligence_source_run", {
              p_source_id: source.source_id,
              p_claim_token: sourceClaimToken,
              p_ttl_seconds: SOURCE_RUN_CLAIM_TTL_SECONDS,
            });
          if (claimError || !Array.isArray(claimRows) || claimRows.length !== 1) {
            throw new Error(`SOURCE_CLAIM_ERROR: ${claimError?.message || "invalid claim response"}`);
          }
          if (!claimRows[0].claimed) {
            return Response.json({
              ok: true,
              milestone: "M33-G1-7A",
              mode: "SKIPPED_OVERLAP",
              outcome: "SOURCE_RUN_ALREADY_ACTIVE",
              source: { source_id: source.source_id, source_name: source.source_name },
              safety: {
                external_fetch_attempted: false,
                raw_records_inserted: 0,
                processor_invoked: false,
                global_announcements_modified: false,
                publication_attempted: false,
                cron_scheduled: false,
              },
              started_at: startedAt,
              completed_at: new Date().toISOString(),
            });
          }
          sourceClaimHeld = true;
          const { data: run, error: runError } = await ctx.supabaseAdmin
            .from("intelligence_ingestion_runs")
            .insert({ source_id: source.source_id, run_status: "RUNNING", metadata: { milestone: "M33-G1-6E", canary: true, source_id: source.source_id, dry_run: false, max_page_fetches: MAX_PAGE_FETCHES } })
            .select("id")
            .single();
          if (runError || !run) throw new Error(`RUN_CREATE_ERROR: ${runError?.message || "no run returned"}`);
          runId = run.id;
          runSourceId = source.source_id;
        }

        if (technicalSource) {
          const result = await fetchTechnicalHistory({ sourceId: requestedSource, since: payload.start_date, until: payload.end_date, maxPages: payload.max_pages ?? 3 });
          if (!dryRun) {
            for (let offset = 0; offset < result.records.length; offset += 100) {
              const batch = result.records.slice(offset, offset + 100);
              const { data: existingRows, error: existingError } = await ctx.supabaseAdmin
                .from("intelligence_raw_ingestion").select("content_hash").in("content_hash", batch.map(record => record.content_hash));
              if (existingError) throw new Error(`TECHNICAL_DEDUP_READ_ERROR: ${existingError.message}`);
              const existingHashes = new Set((existingRows || []).map((row: { content_hash: string }) => row.content_hash));
              const pending = batch.filter(record => !existingHashes.has(record.content_hash)).map(record => ({ ...record, ingestion_run_id: runId }));
              skippedExisting += batch.length - pending.length;
              if (!pending.length) continue;
              const { error: insertError } = await ctx.supabaseAdmin.from("intelligence_raw_ingestion").insert(pending);
              if (insertError) throw new Error(`TECHNICAL_RAW_INSERT_ERROR: ${insertError.message}`);
              inserted += pending.length;
            }
            const { error: completionError } = await ctx.supabaseAdmin.from("intelligence_ingestion_runs").update({
              completed_at: new Date().toISOString(), run_status: "SUCCESS", records_discovered: result.records.length,
              records_candidate: 0, records_rejected: 0, records_published: 0, error_message: null,
              metadata: { milestone: "M39-GATE2-GITHUB-V1", source_id: source.source_id, statistics: result.statistics,
                raw_inserted_count: inserted, duplicate_skipped_count: skippedExisting, publication_attempted: false },
            }).eq("id", runId);
            if (completionError) throw new Error(`RUN_COMPLETE_ERROR: ${completionError.message}`);
          }
          return Response.json({ ok: true, milestone: "M39-GATE2-GITHUB-V1",
            mode: dryRun ? "DRY_RUN_NO_DATABASE_WRITES" : "TECHNICAL_REFERENCE_BACKFILL",
            source: { source_id: source.source_id }, statistics: { ...result.statistics, raw_records_inserted: inserted, duplicates_skipped: skippedExisting },
            preview: result.records.slice(0, 10).map(record => ({ title: record.raw_title, url: record.canonical_url, type: record.metadata.record_type, published_at: record.source_published_at })),
            safety: { technical_reference: true, global_announcements_modified: false, publication_attempted: false, alert_eligible: false },
            started_at: startedAt, completed_at: new Date().toISOString() });
        }

        if (requestedSource === BIS_SOURCE_ID) {
          const dataflow = String(payload.bis_dataflow || "").toUpperCase();
          if (!Object.hasOwn(BIS_DATAFLOWS, dataflow)) throw new Error("BIS_APPROVED_DATAFLOW_REQUIRED");
          const flowConfig = BIS_DATAFLOWS[dataflow as keyof typeof BIS_DATAFLOWS];
          const sourceUrl = buildBisDataUrl({
            dataflow,
            startPeriod: payload.start_period,
            endPeriod: payload.end_period,
            countryCodes: payload.country_codes,
            componentFilters: payload.component_filters || {},
            lastNObservations: payload.last_n_observations || 4,
          });
          const response = await fetch(sourceUrl, {
            headers: {
              "User-Agent": "GPIR-ResearchBot/1.0 (+https://fintechoisis.com)",
              Accept: "application/vnd.sdmx.data+csv;version=1.0.0",
            },
          });
          if (!response.ok) throw new Error(`BIS_FETCH_FAILED_HTTP_${response.status}`);
          const csv = await response.text();
          let releaseDates: Record<string, string> = {};
          if (flowConfig.releaseType) {
            const releaseUrl = buildBisReleaseCalendarUrl({
              category: flowConfig.releaseCategory,
              releaseType: flowConfig.releaseType,
              startPeriod: payload.start_period,
              endPeriod: payload.end_period,
            });
            const releaseResponse = await fetch(releaseUrl, {
              headers: {
                "User-Agent": "GPIR-ResearchBot/1.0 (+https://fintechoisis.com)",
                Accept: "application/vnd.sdmx.data+csv;version=1.0.0",
              },
            });
            if (!releaseResponse.ok) throw new Error(`BIS_RELEASE_CALENDAR_FETCH_FAILED_HTTP_${releaseResponse.status}`);
            releaseDates = parseBisReleaseCalendarCsv(await releaseResponse.text(), {
              category: flowConfig.releaseCategory,
              releaseType: flowConfig.releaseType,
            });
          }
          const observations = parseBisSdmxCsv(csv, {
            dataflow,
            sourceUrl,
            maxObservations: Math.max(1, Math.min(2000, Number(payload.max_observations) || 1000)),
            releaseDates,
          });
          const rawRecords = await Promise.all(observations.map(async (observation: Record<string, unknown>) => {
            const dimensions = observation.dimensions as Record<string, string>;
            const title = String(dimensions.TITLE || `${flowConfig.title} — ${observation.period}`).slice(0, 400);
            const identity = JSON.stringify([dataflow, observation.period, Object.entries(dimensions)]);
            const providerReleaseDate = observation.providerReleaseDate as string | null;
            return {
              source_id: source.source_id,
              discovered_url: sourceUrl,
              canonical_url: sourceUrl,
              raw_title: title,
              raw_content: JSON.stringify({
                dataflow, period: observation.period, value: observation.value, dimensions,
                observation_date: observation.observationDate,
                provider_release_date: providerReleaseDate,
              }),
              discovered_at: startedAt,
              source_published_at: providerReleaseDate ? `${providerReleaseDate}T00:00:00Z` : null,
              http_status: response.status,
              content_hash: await sha256(identity),
              ingestion_status: "PROCESSED",
              rejection_reason: null,
              metadata: {
                engine: "M39-BIS-SDMX-V2",
                parser_profile: source.parser_profile,
                acquisition_method: source.acquisition_method,
                provider: "BIS",
                data_class: "STATISTICAL_REFERENCE",
                dataflow,
                dataflow_version: "1.0",
                topic: flowConfig.topic,
                observation_period: observation.period,
                observation_date: observation.observationDate,
                provider_release_date: providerReleaseDate,
                release_date_status: providerReleaseDate
                  ? "VERIFIED_RELEASE_CALENDAR"
                  : flowConfig.releaseType ? "UNAVAILABLE_OR_NOT_YET_RELEASED" : "AMBIGUOUS_BY_RELEASE_TYPE",
                country_dimension: flowConfig.countryDimension,
                country_code: dimensions[flowConfig.countryDimension] || null,
                frequency: dimensions.FREQ || null,
                unit_measure: dimensions.UNIT_MEASURE || null,
                unit_multiplier: dimensions.UNIT_MULT || null,
                dimensions,
                value: observation.value,
                source_url: sourceUrl,
                terms_url: BIS_TERMS_URL,
                publication_eligible: false,
                alert_eligible: false,
                dry_run: dryRun,
              },
            };
          }));

          if (!dryRun) {
            for (let offset = 0; offset < rawRecords.length; offset += 100) {
              const batch = rawRecords.slice(offset, offset + 100);
              const hashes = batch.map(record => record.content_hash);
              const { data: existingRows, error: existingError } = await ctx.supabaseAdmin
                .from("intelligence_raw_ingestion").select("content_hash").in("content_hash", hashes);
              if (existingError) throw new Error(`BIS_DEDUP_READ_ERROR: ${existingError.message}`);
              const existingHashes = new Set((existingRows || []).map((row: { content_hash: string }) => row.content_hash));
              const pending = batch.filter(record => !existingHashes.has(record.content_hash))
                .map(record => ({ ...record, ingestion_run_id: runId }));
              skippedExisting += batch.length - pending.length;
              if (!pending.length) continue;
              const { error: insertError } = await ctx.supabaseAdmin.from("intelligence_raw_ingestion").insert(pending);
              if (insertError) throw new Error(`BIS_RAW_INSERT_ERROR: ${insertError.message}`);
              inserted += pending.length;
            }
            const { error: completionError } = await ctx.supabaseAdmin
              .from("intelligence_ingestion_runs")
              .update({
                completed_at: new Date().toISOString(), run_status: "SUCCESS",
                records_discovered: observations.length, records_candidate: 0,
                records_rejected: 0, records_published: 0, error_message: null,
                metadata: {
                  milestone: "M39-BIS-SDMX-V2", source_id: source.source_id,
                  dataflow, start_period: payload.start_period, end_period: payload.end_period,
                  country_codes: payload.country_codes, raw_inserted_count: inserted,
                  duplicate_skipped_count: skippedExisting, statistical_reference: true,
                  publication_attempted: false,
                },
              }).eq("id", runId);
            if (completionError) throw new Error(`RUN_COMPLETE_ERROR: ${completionError.message}`);
          }
          return Response.json({
            ok: true,
            milestone: "M39-BIS-SDMX-V2",
            mode: dryRun ? "DRY_RUN_NO_DATABASE_WRITES" : "STATISTICAL_REFERENCE_BACKFILL",
            source: { source_id: source.source_id, dataflow, source_url: sourceUrl },
            statistics: { observations_parsed: observations.length, raw_records_inserted: inserted,
              duplicates_skipped: skippedExisting },
            preview: rawRecords.slice(0, 10).map(record => ({
              title: record.raw_title,
              observation_period: record.metadata.observation_period,
              observation_date: record.metadata.observation_date,
              provider_release_date: record.metadata.provider_release_date,
              country_code: record.metadata.country_code,
              value: record.metadata.value,
              unit_measure: record.metadata.unit_measure,
            })),
            safety: { statistical_reference: true, global_announcements_modified: false,
              publication_attempted: false, alert_eligible: false },
            started_at: startedAt, completed_at: new Date().toISOString(),
          });
        }

        const indexUrl =
          source.feed_or_index_url || source.official_url;

        const gdeltTopic = String(payload.gdelt_topic || "cross-border-payments");

          const discoveryUrl =
          requestedSource === GDELT_SOURCE_ID
          ? buildGdeltQueryUrl(gdeltTopic, {
            start: payload.start_datetime,
            end: payload.end_datetime,
            maxRecords: Math.max(1, Math.min(50, Number(payload.max_records) || 20)),
          })
          : requestedSource === TEST_SOURCE_ID
          ? SFA_NEWS_INDEX
          : requestedSource === RBA_SOURCE_ID
          ? RBA_MEDIA_RSS
          : indexUrl;

        if (!indexUrl) {
          throw new Error("SOURCE_HAS_NO_FETCH_URL");
        }

        // ----------------------------------------------------
        // 4. Fetch source index
        // ----------------------------------------------------

        const indexResponse = await fetch(discoveryUrl, {
          headers: {
            "User-Agent":
              "GPIR-ResearchBot/1.0 (+https://fintechoisis.com)",
            Accept:
              requestedSource === GDELT_SOURCE_ID
                ? "application/json"
                : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
        });

        if (!indexResponse.ok) {
          throw new Error(
            `INDEX_FETCH_FAILED_HTTP_${indexResponse.status}`,
          );
        }

        const indexHtml = await indexResponse.text();

        // ----------------------------------------------------
        // 5. Discover likely intelligence links
        // ----------------------------------------------------

        const discovered = requestedSource === GDELT_SOURCE_ID
          ? parseGdeltDiscovery(JSON.parse(indexHtml), gdeltTopic, { maxRecords: MAX_DISCOVERED_LINKS }) as DiscoveredItem[]
          : requestedSource === RBA_SOURCE_ID
          ? discoverRbaMediaLinks(indexHtml)
          : requestedSource === TEST_SOURCE_ID
          ? discoverNewsLinks(indexHtml, indexResponse.url)
          : requestedSource === RBI_SOURCE_ID
          ? discoverRbiLinks(indexHtml, indexResponse.url)
          : requestedSource === FINTECH_FUTURES_SOURCE_ID
          ? discoverFintechFuturesLinks(indexHtml, indexResponse.url)
          : requestedSource === PYMNTS_SOURCE_ID
          ? discoverPymntsLinks(indexHtml, indexResponse.url)
          : discoverLinks(indexHtml, indexResponse.url);

        let unmatchedPublisherSources = 0;
        let routedDiscoveries = discovered;
        if (requestedSource === GDELT_SOURCE_ID) {
          const { data: approvedSources, error: approvedSourceError } = await ctx.supabaseAdmin
            .from("source_registry")
            .select("source_id,source_name,official_url,feed_or_index_url,acquisition_method,parser_profile,source_status")
            .eq("source_status", "GREEN")
            .limit(1000);
          if (approvedSourceError) throw new Error(`GDELT_PUBLISHER_REGISTRY_ERROR: ${approvedSourceError.message}`);
          routedDiscoveries = [];
          for (const item of discovered) {
            const publisherSource = matchGdeltPublisherSource(item.url, approvedSources || []) as SourceRecord | null;
            if (!publisherSource) {
              unmatchedPublisherSources++;
              continue;
            }
            routedDiscoveries.push({ ...item, publisherSource });
          }
        }

        const selected = routedDiscoveries.slice(0, MAX_PAGE_FETCHES);

        const preview: unknown[] = [];
        // ----------------------------------------------------
        // 6. Fetch selected individual pages
        // ----------------------------------------------------

        for (const item of selected) {
          const articleSource = item.publisherSource || source;
          try {
            const pageResponse = await fetch(item.url, {
              headers: {
                "User-Agent":
                  "GPIR-ResearchBot/1.0 (+https://fintechoisis.com)",
                Accept:
                  "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
              },
              redirect: "follow",
            });

            const contentType =
              pageResponse.headers.get("content-type") || "";

            // PDF handling is intentionally deferred.
            if (
              contentType.toLowerCase().includes("application/pdf") ||
              pageResponse.url.toLowerCase().endsWith(".pdf")
            ) {
              preview.push({
                discovered_title: item.title,
                url: pageResponse.url,
                status: pageResponse.status,
                type: "PDF_DEFERRED",
              });

              continue;
            }

            if (!pageResponse.ok) {
              fetchErrors++;

              preview.push({
                discovered_title: item.title,
                url: item.url,
                status: pageResponse.status,
                type: "FETCH_ERROR",
              });

              continue;
            }

            if (requestedSource === GDELT_SOURCE_ID &&
              !matchGdeltPublisherSource(pageResponse.url || item.url, [articleSource])) {
              fetchErrors++;
              preview.push({ discovered_title: item.title, url: item.url, status: pageResponse.status,
                type: "GDELT_PUBLISHER_DOMAIN_MISMATCH", candidate_source_id: articleSource.source_id });
              continue;
            }

            const pageHtml = await pageResponse.text();

            const meta = extractMeta(
              pageHtml,
              item.title,
              pageResponse.url,
              requestedSource === RBI_SOURCE_ID,
            );
            if (requestedSource === GDELT_SOURCE_ID &&
              !matchGdeltPublisherSource(meta.canonicalUrl || pageResponse.url || item.url, [articleSource])) {
              fetchErrors++;
              preview.push({ discovered_title: item.title, url: item.url, status: pageResponse.status,
                type: "GDELT_CANONICAL_DOMAIN_MISMATCH", candidate_source_id: articleSource.source_id });
              continue;
            }
            if (requestedSource === RBA_SOURCE_ID) {
              const canonicalUrl = absoluteUrl(meta.canonicalUrl || pageResponse.url, pageResponse.url);
              const discoveredUrl = absoluteUrl(item.url, pageResponse.url);
              const responseUrl = absoluteUrl(pageResponse.url, item.url);
              const parsedCanonical = canonicalUrl ? new URL(canonicalUrl) : null;
              if (!parsedCanonical || !discoveredUrl || !responseUrl ||
                responseUrl !== discoveredUrl ||
                parsedCanonical.protocol !== "https:" ||
                parsedCanonical.hostname !== "www.rba.gov.au" ||
                parsedCanonical.username || parsedCanonical.password ||
                canonicalUrl !== discoveredUrl) {
                fetchErrors++;
                preview.push({
                  discovered_title: item.title,
                  url: item.url,
                  status: pageResponse.status,
                  type: "RBA_CANONICAL_URL_REJECTED",
                });
                continue;
              }
            }

            const rbaArticleBody = requestedSource === RBA_SOURCE_ID
              ? extractRbaArticleBody(pageHtml)
              : null;
            if (requestedSource === RBA_SOURCE_ID && !rbaArticleBody) {
              fetchErrors++;
              preview.push({
                discovered_title: item.title,
                url: item.url,
                status: pageResponse.status,
                type: "RBA_ARTICLE_BODY_REJECTED",
                evidence_extracted: false,
              });
              continue;
            }
    // M33-F5
    // Prefer article-page publication metadata.
    // Fall back to publication date discovered from the source index.
          const resolvedPublishedAt =
          meta.sourcePublishedAt ||
          item.indexPublishedAt ||
          null;
            const fingerprint =
              await sha256(
                [
                  articleSource.source_id,
                  meta.title,
                  meta.canonicalUrl || pageResponse.url,
                ].join("|").toLowerCase(),
              );

            const rawRecord = {
              source_id: articleSource.source_id,
              discovered_url: item.url,
              canonical_url:
                meta.canonicalUrl || pageResponse.url,

              raw_title: meta.title,

              // Keep phase-one content intentionally bounded.
              raw_content:
                requestedSource === RBA_SOURCE_ID
                  ? rbaArticleBody
                  : meta.description || null,

              source_published_at:
                resolvedPublishedAt,
              http_status:
                pageResponse.status,

              content_hash:
                fingerprint,

              ingestion_status:
                "RAW",

              metadata: {
                engine: "M33-F5",
                parser_profile: articleSource.parser_profile,
                acquisition_method:
                  articleSource.acquisition_method,
                discovered_title:
                  item.title,
                content_type:
                  contentType,
                dry_run:
                  dryRun,
                discovery:
                  item.discovery || null,
                source_verification_required:
                  requestedSource === GDELT_SOURCE_ID,
                discovery_source_id: requestedSource === GDELT_SOURCE_ID ? GDELT_SOURCE_ID : null,
                publisher_source_id: articleSource.source_id,
              },
            };

            if (dryRun) {
// --------------------------------------------------------
// M33-F5
// Deterministic intelligence gates.
//
// Gate 1:
// Structural / navigation / malformed-content rejection.
//
// Gate 2:
// Payments / fintech / banking / regulatory intelligence
// relevance assessment.
//
// These RPC calls assess only.
// They do NOT write RAW, candidates or announcements.
// --------------------------------------------------------

const { data: gate1Reason, error: gate1Error } =
  await ctx.supabaseAdmin.rpc(
    "gpir_rejection_reason",
    {
      p_title: rawRecord.raw_title,
      p_url: rawRecord.canonical_url,
    },
  );

if (gate1Error) {
  throw new Error(
    `GATE_1_RPC_ERROR: ${gate1Error.message}`,
  );
}

const gate1Decision =
  gate1Reason ? "REJECT" : "PASS";

let gate2Assessment: unknown = null;
let gate2Decision = "NOT_RUN";

// Gate 2 should only run when structural Gate 1 passes.
if (gate1Decision === "PASS") {
  const {
    data: assessment,
    error: gate2Error,
  } = await ctx.supabaseAdmin.rpc(
    "gpir_intelligence_assessment",
    {
      p_title: rawRecord.raw_title,
      p_url: rawRecord.canonical_url,
    },
  );

  if (gate2Error) {
    throw new Error(
      `GATE_2_RPC_ERROR: ${gate2Error.message}`,
    );
  }

  gate2Assessment = assessment;

  if (
    assessment &&
    typeof assessment === "object" &&
    "decision" in assessment
  ) {
    gate2Decision =
      String(
        (assessment as Record<string, unknown>)
          .decision,
      );
  } else {
    gate2Decision = "UNKNOWN";
  }
}

            preview.push({
              title:
                rawRecord.raw_title,

              canonical_url:
                rawRecord.canonical_url,

              source_published_at:
                rawRecord.source_published_at,

              publication_date_source:
                meta.sourcePublishedAt
                  ? meta.publicationDateSource
                  : item.indexPublishedAt
                  ? "RBI_LISTING_OR_RSS"
                  : "UNKNOWN",

              index_published_at:
                item.indexPublishedAt || null,

              http_status:
                rawRecord.http_status,

              gate_1: {
                decision:
                  gate1Decision,
                reason:
                  gate1Reason || null,
            },

                gate_2: {
                  decision:
                    gate2Decision,
                  assessment:
                    gate2Assessment,
            },

                database_written:
                    false,
        });
            // ------------------------------------------------
            // dry_run=true:
            // fetch and parse only, NO database insert.
            // ------------------------------------------------

            continue;
            }

            // M33-G1: retain evidence before processor-owned Gate 1/Gate 2.
            // Check whether this exact content already exists.
            const { data: existing } =
              await ctx.supabaseAdmin
                .from("intelligence_raw_ingestion")
                .select("id")
                .eq("content_hash", fingerprint)
                .limit(1);

            if (existing && existing.length > 0) {
              skippedExisting++;
              continue;
            }

            const { data: insertedRaw, error: insertError } =
              await ctx.supabaseAdmin
                .from("intelligence_raw_ingestion")
                .insert({ ...rawRecord, ingestion_run_id: runId })
                .select("id")
                .single();

            if (insertError || !insertedRaw) {
              throw new Error(
                `RAW_INSERT_ERROR: ${insertError?.message || "no RAW id returned"}`,
              );
            }

            inserted++;
            const { data: processorResult, error: processorError } =
              await ctx.supabaseAdmin.rpc("gpir_process_raw_record", { p_raw_id: insertedRaw.id });
            if (processorError) {
              processingErrors++;
              throw new Error(`RAW_PROCESS_ERROR: ${processorError.message}`);
            }
            const result = String(processorResult || "UNKNOWN");
            if (result === "REVIEW") reviewCount++;
            if (result === "CANDIDATE") pendingCandidateCount++;
            if (result.startsWith("REJECT:GATE1")) gate1RejectedCount++;
            if (result.startsWith("REJECT:GATE2")) gate2RejectedCount++;

          } catch (pageError) {
            fetchErrors++;

            preview.push({
              url: item.url,
              type: "PAGE_PROCESSING_ERROR",
              error:
                pageError instanceof Error
                  ? pageError.message
                  : String(pageError),
            });
          }
        }

        if (runId) {
          const rejectedCount = gate1RejectedCount + gate2RejectedCount;
          const completedStatus = fetchErrors || processingErrors ? (inserted ? "PARTIAL" : "FAILED") : "SUCCESS";
          const { error: completionError } = await ctx.supabaseAdmin
            .from("intelligence_ingestion_runs")
            .update({
              completed_at: new Date().toISOString(), run_status: completedStatus,
              records_discovered: selected.length, records_candidate: reviewCount + pendingCandidateCount,
              records_rejected: rejectedCount, records_published: 0,
              error_message: fetchErrors || processingErrors ? `fetch_errors=${fetchErrors}; processing_errors=${processingErrors}` : null,
              metadata: { milestone: "M33-G1-6E", canary: true, source_id: runSourceId, dry_run: false, max_page_fetches: MAX_PAGE_FETCHES, fetched_count: selected.length - fetchErrors, raw_inserted_count: inserted, review_count: reviewCount, pending_candidate_count: pendingCandidateCount, gate1_rejected_count: gate1RejectedCount, gate2_rejected_count: gate2RejectedCount, duplicate_skipped_count: skippedExisting, fetch_error_count: fetchErrors, processing_error_count: processingErrors },
            }).eq("id", runId);
          if (completionError) throw new Error(`RUN_COMPLETE_ERROR: ${completionError.message}`);
        }

        // ----------------------------------------------------
        // 7. Return controlled diagnostic
        // ----------------------------------------------------

        return Response.json({
          ok: true,

          milestone: "M33-G1-6E",

          mode:
            dryRun
              ? "DRY_RUN_NO_DATABASE_WRITES"
              : "RAW_STAGING_WRITE",

          source: {
            source_id:
              source.source_id,
            source_name:
              source.source_name,
            index_url:
              indexUrl,
            discovery_url:
              discoveryUrl,
            discovery_type:
              "NEWS_INDEX",
            parser_profile:
              source.parser_profile,
          },
          statistics: {
            links_discovered:
              discovered.length,
              unmatched_publisher_sources:
                unmatchedPublisherSources,
            pages_selected:
              selected.length,
            raw_records_inserted:
              inserted,
            duplicates_skipped:
              skippedExisting,
            fetch_errors:
              fetchErrors,
          },

          preview,

          safety: {
            global_announcements_modified:
              false,
            publication_attempted:
              false,
            cron_scheduled:
              false,
          },

          started_at:
            startedAt,

          completed_at:
            new Date().toISOString(),
        });

      } catch (error) {
        if (runId) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await ctx.supabaseAdmin.from("intelligence_ingestion_runs").update({
            completed_at: new Date().toISOString(), run_status: "FAILED",
            records_published: 0, error_message: errorMessage,
            metadata: { milestone: "M33-G1-6E", canary: true, source_id: runSourceId, dry_run: false, max_page_fetches: MAX_PAGE_FETCHES, raw_inserted_count: inserted, duplicate_skipped_count: skippedExisting, fetch_error_count: fetchErrors, processing_error_count: processingErrors },
          }).eq("id", runId);
        }
        console.error("GPIR M33-F5 failure:", error);

        return Response.json(
          {
            ok: false,
            milestone: "M33-G1-6E",
            error:
              error instanceof Error
                ? error.message
                : String(error),
            started_at:
              startedAt,
            failed_at:
              new Date().toISOString(),
          },
          { status: 500 },
        );
      } finally {
        if (sourceClaimHeld && sourceClaimToken && runSourceId) {
          const { error: releaseError } = await ctx.supabaseAdmin.rpc(
            "gpir_release_intelligence_source_run",
            { p_source_id: runSourceId, p_claim_token: sourceClaimToken },
          );
          if (releaseError) {
            // The finite database lease still prevents a permanent block.
            console.error("GPIR M33-G1 source-claim release failure:", releaseError.message);
          }
        }
      }
    },
  ),
};
