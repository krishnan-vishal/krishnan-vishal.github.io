#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { resolveAnnouncementIntent } = require("../assets/js/content-search.js");

const ROOT = path.resolve(__dirname, "..");
const announcements = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/announcements.json"), "utf8"));
const archiveHtml = fs.readFileSync(path.join(ROOT, "pages/intelligence/index.html"), "utf8");
const fatfHtml = fs.readFileSync(path.join(ROOT, "pages/intelligence/fatf-r16-consultation-2026.html"), "utf8");

function assert(condition, message){
  if(!condition){
    console.error(`FAIL CONTRACT: ${message}`);
    process.exitCode = 1;
  }
}

const tests = [
  ["show india announcements", { mode: "ANNOUNCEMENT", country: "India", lifecycle: null }],
  ["show regulatory announcements", { mode: "ANNOUNCEMENT", category: "Regulatory", lifecycle: null }],
  ["show AML announcements", { mode: "ANNOUNCEMENT", category: "AML / CFT", lifecycle: null }],
  ["show historical announcements", { mode: "ANNOUNCEMENT", lifecycle: "HISTORICAL" }],
  ["show current announcements", { mode: "ANNOUNCEMENT", lifecycle: "CURRENT" }],
  ["August 2026 announcements", { mode: "ANNOUNCEMENT", month: "08", year: "2026" }],
  ["show payment infrastructure announcements", { mode: "ANNOUNCEMENT", category: "Payment Infrastructure" }],
  ["show M&A announcements", { mode: "ANNOUNCEMENT", category: "M&A" }],
  ["show FATF announcements", { mode: "ANNOUNCEMENT", sourceText: "FATF" }],
  ["show india research", { mode: "GENERAL" }],
  ["show payment details", { mode: "GENERAL" }]
];

let failed = 0;
for (const [query, expected] of tests) {
  const actual = resolveAnnouncementIntent(query);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      console.error(`FAIL QUERY: ${query}`);
      console.error(`  expected ${key}=${value}`);
      console.error(`  actual   ${key}=${actual[key]}`);
      failed += 1;
    }
  }
  if (actual.mode !== expected.mode) {
    console.error(`FAIL QUERY: ${query}`);
    console.error(`  expected mode=${expected.mode}`);
    console.error(`  actual   mode=${actual.mode}`);
    failed += 1;
  }
}

if (failed) {
  process.exit(1);
}

const currentRecords = announcements.records.filter(record => record.status === "GPIR_CLASSIFIED" && record.displayLifecycleStatus === "LIVE");
const historicalRecords = announcements.records.filter(record => record.status === "GPIR_CLASSIFIED" && record.displayLifecycleStatus === "ARCHIVED");
currentRecords.forEach(record => {
  const page = fs.readFileSync(path.join(ROOT, "pages/intelligence", `${record.id}.html`), "utf8");
  assert(!page.includes("ARCHIVED PUBLICATION"), `${record.id} must not display ARCHIVED PUBLICATION`);
  assert(page.includes(`href="https://`) || page.includes("Read Original Source"), `${record.id} must retain original source presentation`);
});
historicalRecords.forEach(record => {
  const pagePath = path.join(ROOT, "pages/intelligence", `${record.id}.html`);
  assert(fs.existsSync(pagePath), `${record.id} historical page must remain searchable and present`);
  assert(fs.readFileSync(pagePath, "utf8").includes("ARCHIVED PUBLICATION"), `${record.id} historical page must display ARCHIVED PUBLICATION`);
});
const freshnessLine = (archiveHtml.match(/<p class="announcement-archive-freshness">.*?<\/p>/s) || [""])[0];
assert(freshnessLine.includes("Last validated publication cycle:") && freshnessLine.includes("Candidate discovery automation:</strong> Scheduled every 2 hours via GitHub Actions") && freshnessLine.includes("publication remains human-reviewed"), "archive must truthfully reflect the existing scheduled discovery automation without claiming automatic publication");
assert(!freshnessLine.includes("Refresh automation:</strong> Not yet scheduled") && !/real-time|live feed|continuous(?!\s+intelligence)/i.test(freshnessLine), "freshness line must not claim automation is unscheduled when it is, or overclaim real-time/continuous/live coverage");
assert(!archiveHtml.includes("Verified Dataset") && !archiveHtml.includes("Refreshed:"), "archive must not present stale data as a current refresh");
assert(announcements.records.every(record => fs.existsSync(path.join(ROOT, "pages/intelligence", `${record.id}.html`)) || record.status !== "GPIR_CLASSIFIED"), "published announcement search targets must resolve");
const fatf = announcements.records.find(record => record.id === "fatf-r16-consultation-2026");
assert(fatf && fatf.summary && fatf.whyItMatters, "FATF benchmark must retain summary and whyItMatters");
const escapedSummary = fatf.summary.replace(/'/g, "&#39;");
const escapedWhy = fatf.whyItMatters.replace(/'/g, "&#39;");
assert(fatfHtml.includes(escapedSummary) && fatfHtml.includes(escapedWhy) && fatfHtml.includes(fatf.source.url), "FATF page must preserve summary, whyItMatters and original source");
assert(archiveHtml.includes('class="footer-container"') && archiveHtml.includes('class="footer-grid"'), "archive must use the shared GPIR footer architecture");
assert(fatfHtml.includes('class="footer-container"') && fatfHtml.includes('class="footer-grid"'), "intelligence pages must use the shared GPIR footer architecture");
assert(fs.readFileSync(path.join(ROOT, "assets/js/content-search.js"), "utf8").includes("record.lifecycleStatus !== \"HISTORICAL\"" ) === false, "historical announcements must remain searchable");

// -----------------------------------------------------------------------
// M-18.4B regression coverage: ASK GPIR announcement retrieval must stay
// available when an unrelated optional dataset (registry / trusted sources /
// dashboard metadata / dashboard narratives) fails, and must only report
// "unavailable" when announcements.json itself genuinely fails.
//
// script.js's initializeReaderAssistant() is a browser-only closure, so it
// is exercised here in a real vm context with a minimal DOM/fetch stub
// (no jsdom dependency) rather than re-implemented by hand.
// -----------------------------------------------------------------------

function makeMockElement(tag){
  const el = {
    tagName: tag,
    hidden: false,
    value: "",
    className: "",
    _attrs: {},
    _listeners: {},
    _queryCache: {},
    _innerHTML: "",
    setAttribute(name, val){ this._attrs[name] = String(val); },
    getAttribute(name){ return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null; },
    addEventListener(type, fn){ (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener(){},
    appendChild(node){ return node; },
    insertBefore(node){ this._lastInserted = node; return node; },
    insertAdjacentElement(){},
    querySelector(sel){ if(!(sel in this._queryCache)) this._queryCache[sel] = makeMockElement("div"); return this._queryCache[sel]; },
    querySelectorAll(){ return []; },
    focus(){},
    closest(){ return null; },
    get innerHTML(){ return this._innerHTML; },
    set innerHTML(v){ this._innerHTML = v; }
  };
  return el;
}

const scriptSource = fs.readFileSync(path.join(ROOT, "assets/js/script.js"), "utf8");

function buildAskGpirSandbox(datasetAvailability){
  const overlay = makeMockElement("div");
  const searchPanel = makeMockElement("div");
  overlay._queryCache[".search-panel"] = searchPanel;
  const searchHeader = makeMockElement("div");
  searchPanel._queryCache[".search-panel-header"] = searchHeader;
  const inputEl = makeMockElement("input");
  const resultsEl = makeMockElement("div");
  const scriptTag = makeMockElement("script");
  scriptTag.setAttribute("src", "assets/js/script.js");

  const elementsById = {
    "search-overlay": overlay,
    "search-input": inputEl,
    "search-results": resultsEl
  };

  const documentStub = {
    addEventListener(){},
    getElementById: (id) => elementsById[id] || null,
    querySelector: (sel) => (sel === 'script[src*="assets/js/script.js"]' ? scriptTag : null),
    createElement: (tag) => makeMockElement(tag),
    querySelectorAll(){ return []; }
  };

  const windowStub = { location: { pathname: "/index.html", hash: "" } };

  const datasetFiles = {
    "content-registry.json": datasetAvailability.registry === false ? null : { records: [] },
    "trusted-sources.json": datasetAvailability.sources === false ? null : { registry: [] },
    "announcements.json": datasetAvailability.announcements === false ? null : announcements,
    "dashboard-metadata.json": datasetAvailability.dashboards === false ? null : { records: [] },
    "dashboard-narratives.json": datasetAvailability.narratives === false ? null : { records: [] }
  };

  const fetchStub = (url) => {
    const name = Object.keys(datasetFiles).find(file => url.endsWith(file));
    const data = name ? datasetFiles[name] : null;
    if(data === null) return Promise.resolve({ ok: false, status: 500 });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
  };

  const context = vm.createContext({
    document: documentStub,
    window: windowStub,
    fetch: fetchStub,
    console: { log(){}, error(){}, warn(){} },
    setTimeout,
    clearTimeout
  });

  vm.runInContext(scriptSource, context, { filename: "script.js" });

  return { context, searchPanel, inputEl };
}

async function askGpirAnnouncementQuery(datasetAvailability, query){
  const { context, searchPanel, inputEl } = buildAskGpirSandbox(datasetAvailability);
  context.initializeReaderAssistant();

  const assistantNode = searchPanel._lastInserted;
  assistantNode.hidden = false;
  const answerNode = assistantNode._queryCache[".gpir-assistant-answer"];

  inputEl.value = query;
  const handlers = inputEl._listeners.keydown || [];
  handlers.forEach(fn => fn({ key: "Enter", shiftKey: false, preventDefault(){} }));

  await new Promise(resolve => setTimeout(resolve, 20));
  return answerNode.innerHTML;
}

async function runAskGpirResilienceTests(){
  const countListItems = (html) => (html.match(/<li>/g) || []).length;
  const isUnavailable = (html) => html.includes("temporarily unavailable");
  const isNoMatch = (html) => html.includes("No validated GPIR announcement record is available for this query");

  const scenarios = [
    ["A: registry failure", { registry: false }, "show india announcements", html => {
      assert(!isUnavailable(html), "A: registry failure must not surface the generic unavailable message");
      assert(countListItems(html) === 2, "A: registry failure must still return the 2 published India announcements");
    }],
    ["B: dashboard metadata failure", { dashboards: false }, "show india announcements", html => {
      assert(!isUnavailable(html), "B: dashboard metadata failure must not surface the generic unavailable message");
      assert(countListItems(html) === 2, "B: dashboard metadata failure must still return the 2 published India announcements");
    }],
    ["C: dashboard narratives failure", { narratives: false }, "show india announcements", html => {
      assert(!isUnavailable(html), "C: dashboard narratives failure must not surface the generic unavailable message");
      assert(countListItems(html) === 2, "C: dashboard narratives failure must still return the 2 published India announcements");
    }],
    ["D: trusted sources failure", { sources: false }, "show india announcements", html => {
      assert(!isUnavailable(html), "D: trusted sources failure must not surface the generic unavailable message");
      assert(countListItems(html) === 2, "D: trusted sources failure must still return the 2 published India announcements");
    }],
    ["E: announcements.json failure", { announcements: false }, "show india announcements", html => {
      assert(isUnavailable(html), "E: a genuine announcements.json failure must surface the honest unavailable message");
      assert(countListItems(html) === 0, "E: an unavailable announcement dataset must not render fabricated results");
    }],
    ["F: baseline current query", {}, "show regulatory announcements", html => {
      assert(!isUnavailable(html), "F: baseline query with all datasets available must not be unavailable");
      assert(countListItems(html) === 3, "F: baseline regulatory announcement query must return the 3 published records");
    }],
    ["G: historical query returns retained archive", {}, "show historical announcements", html => {
      assert(!isUnavailable(html), "G: historical query must not report unavailable when announcements.json is fine");
      assert(!isNoMatch(html) && countListItems(html) === 9, "G: historical query must return all 9 validated archived records");
    }],
    ["H: Qatar verification-pending record excluded", {}, "show qatar announcements", html => {
      assert(!isUnavailable(html), "H: Qatar query must not report unavailable when announcements.json is fine");
      assert(isNoMatch(html) && countListItems(html) === 0, "H: SOURCE_VERIFICATION_REQUIRED Qatar record must remain excluded from published results");
    }],
    ["I: implicit RBI event query", {}, "RBI cross-border payment changes September 2026", html => {
      assert(isNoMatch(html), "I: implicit RBI query must route to deterministic announcements and return the governed no-record answer");
    }],
    ["J: implicit stablecoin query", {}, "Singapore stablecoin regulation", html => {
      assert(isNoMatch(html), "J: implicit Singapore stablecoin query must return the governed no-record answer");
    }],
    ["K: implicit licensing query", {}, "latest payment licensing change in Australia", html => {
      assert(isNoMatch(html), "K: implicit Australia licensing query must return the governed no-record answer");
    }],
    ["L: implicit AML query", {}, "AML updates in GCC", html => {
      assert(isNoMatch(html), "L: implicit GCC AML query must return the governed no-record answer");
    }],
    ["M: implicit PIX query", {}, "PIX international expansion Brazil", html => {
      assert(isNoMatch(html), "M: implicit Brazil PIX query must return the governed no-record answer");
    }]
  ];

  for(const [label, datasetAvailability, query, check] of scenarios){
    try{
      const html = await askGpirAnnouncementQuery(datasetAvailability, query);
      check(html);
    } catch(error){
      console.error(`FAIL SCENARIO: ${label}`, error);
      process.exitCode = 1;
    }
  }
}

runAskGpirResilienceTests().then(() => {
  if (process.exitCode) process.exit(1);
  console.log(`Announcement intent validation passed: ${tests.length} checks, plus ASK GPIR resilience and implicit-query scenarios A-M.`);
}).catch(error => {
  console.error("ASK GPIR resilience regression harness crashed:", error);
  process.exit(1);
});
