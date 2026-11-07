// Run with: node --test tests/m39-rba-acquisition.test.mjs
// Regression fixtures for RBA RSS discovery and strict body-evidence gate.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = readFileSync(new URL("../supabase/functions/gpir-intelligence-fetch/index.ts", import.meta.url), "utf8");
function sliceFunction(name, nextName) {
  const start = source.indexOf("function " + name + "(");
  let end = source.indexOf("function " + nextName + "(", start + 1);
  if (source.slice(end - 6, end) === "async ") end -= 6;
  assert.ok(start >= 0 && end > start, "function anchors present: " + name);
  return source.slice(start, end);
}
const cleanText = (s) => s.replace(/<[^>]*>/g, " ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
const absoluteUrl = (s,b) => { try { const u = new URL(s,b); if (!["https:","http:"].includes(u.protocol)) return null; u.hash="";return u.href; } catch { return null; } };
const MAX_DISCOVERED_LINKS = 40;
const impl = sliceFunction("extractRbaArticleBody","discoverRbaMediaLinks") + sliceFunction("discoverRbaMediaLinks","isOfficialRbiUrl") + sliceFunction("extractMeta","sha256");
const { extractRbaArticleBody, discoverRbaMediaLinks, extractMeta } = new Function("cleanText","absoluteUrl","MAX_DISCOVERED_LINKS",stripTypeScriptTypes(impl,{mode:"strip"})+";return {extractRbaArticleBody,discoverRbaMediaLinks,extractMeta};")(cleanText,absoluteUrl,MAX_DISCOVERED_LINKS);
const rss = (url,date="Sat, 07 Nov 2026 00:00:00 GMT",title="Payments systems statement") => '<item><title>'+title+'</title><link>'+url+'</link><pubDate>'+date+'</pubDate></item>';
const rbaRdf = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item rdf:about="https://www.rba.gov.au/media-releases/2026/mr-26-31.html"><title>Cash distribution framework statement</title><link>https://www.rba.gov.au/media-releases/2026/mr-26-31.html</link><dc:date>2026-11-06T10:45+11:00</dc:date></item></rdf:RDF>';
test("discovers official dated media release",()=>assert.equal(discoverRbaMediaLinks("<rss>"+rss("https://www.rba.gov.au/media-releases/2026/mr-26-01.html")+"</rss>").length,1));
test("discovers official RDF media release and preserves its namespaced timestamp",()=>assert.deepEqual(discoverRbaMediaLinks(rbaRdf),[{title:"Cash distribution framework statement",url:"https://www.rba.gov.au/media-releases/2026/mr-26-31.html",indexPublishedAt:"2026-11-05T23:45:00.000Z"}]));
test("rejects third-party links",()=>assert.equal(discoverRbaMediaLinks(rss("https://example.org/media-releases/2026/a.html")).length,0));
test("rejects insecure official article URLs",()=>assert.equal(discoverRbaMediaLinks(rss("http://www.rba.gov.au/media-releases/2026/a.html")).length,0));
test("rejects unrelated RBA pages",()=>assert.equal(discoverRbaMediaLinks(rss("https://www.rba.gov.au/about-rba/")).length,0));
test("rejects missing dates",()=>assert.equal(discoverRbaMediaLinks(rss("https://www.rba.gov.au/media-releases/a.html","")).length,0));
test("rejects invalid dates",()=>assert.equal(discoverRbaMediaLinks(rss("https://www.rba.gov.au/media-releases/a.html","not-a-date")).length,0));
test("deduplicates links",()=>assert.equal(discoverRbaMediaLinks(rss("https://www.rba.gov.au/media-releases/a.html")+rss("https://www.rba.gov.au/media-releases/a.html")).length,1));
test("extracts substantive body inside main article",()=>{const h="<main><article><h1>Statement</h1><p>"+("Payments regulation and settlement evidence. ".repeat(9))+"</p></article></main>";assert.ok(extractRbaArticleBody(h).length>=200)});
test("extracts substantive RBA rss-mr-content from its role-main page layout",()=>{const h='<div id="content" role="main"><div class="rss-mr-content"><p>'+("Synthetic regulatory statement body for a parser fixture. ".repeat(6))+'</p></div></div>';assert.ok(extractRbaArticleBody(h).length>=200)});
test("does not use meta description as article evidence",()=>assert.equal(extractRbaArticleBody('<meta name="description" content="short summary">'),null));
test("rejects short article bodies",()=>assert.equal(extractRbaArticleBody("<main><article><p>Short notice.</p></article></main>"),null));
test("rejects site navigation as evidence",()=>assert.equal(extractRbaArticleBody("<main><nav>"+("Menu ".repeat(100))+"</nav></main>"),null));
test("rejects missing RBA body instead of falling back to metadata",()=>assert.match(source,/requestedSource === RBA_SOURCE_ID && !rbaArticleBody/));
test("uses official Open Graph canonical and preserves source issue timestamp",()=>{const meta=extractMeta('<meta property="og:url" content="https://www.rba.gov.au/media-releases/2026/mr-26-31.html"><time datetime="2026-11-06T10:45+11:00">6 November 2026</time>',"Release","https://www.rba.gov.au/media-releases/redirect.html");assert.equal(meta.canonicalUrl,"https://www.rba.gov.au/media-releases/2026/mr-26-31.html");assert.equal(meta.sourcePublishedAt,"2026-11-05T23:45:00.000Z")});
