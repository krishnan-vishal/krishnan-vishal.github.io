#!/usr/bin/env node
/*=====================================================
  GPIR FX PRICING & TREASURY PAGE GENERATOR

  Generates the FX Pricing & Treasury static page shells (hub pages
  plus one page per featured currency pair) using the SAME shared
  header/footer template extraction pattern as
  scripts/generate-intelligence-pages.js, so every FX page carries the
  existing GPIR navigation, header, footer and design language rather
  than a new layout.

  These pages are shells: none of them embed the FX dataset inline.
  Each loads assets/data/fx/fx-config.json, assets/data/fx/current.json
  and (where relevant) one assets/data/fx/history/... file on demand
  via assets/js/fx-app.js, keeping the homepage/hub payload small per
  the milestone's performance requirement.

  Run manually after editing assets/data/fx/fx-config.json or after a
  new FX snapshot/history file is generated:
    node scripts/generate-fx-pages.js
======================================================*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "assets/data/fx/fx-config.json");
const CURRENT_PATH = path.join(ROOT, "assets/data/fx/current.json");
const HISTORY_DIR = path.join(ROOT, "assets/data/fx/history");
const COUNTRY_REGISTRY_PATH = path.join(ROOT, "assets/data/fx/country-currency-registry.json");
const TEMPLATE_SOURCE_PATH = path.join(ROOT, "pages/legal/privacy-policy.html");
const OUTPUT_DIR = path.join(ROOT, "pages/fx");
const PAIR_OUTPUT_DIR = path.join(OUTPUT_DIR, "pairs");
const SITE_ORIGIN = "https://krishnan-vishal.github.io";

function escapeHtml(str){
    if(str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function pairSlug(pair){
    return pair.toLowerCase().replace("/", "-");
}

const CURRENCY_BY_COUNTRY = {
    AR:"ARS", AU:"AUD", BD:"BDT", BO:"BOB", BR:"BRL", BZ:"BZD", CL:"CLP", CN:"CNY", CO:"COP", CR:"CRC",
    CU:"CUP", DO:"DOP", EC:"USD", GT:"GTQ", HN:"HNL", HK:"HKD", ID:"IDR", IN:"INR", JP:"JPY", KR:"KRW",
    LK:"LKR", MX:"MXN", MY:"MYR", NI:"NIO", NZ:"NZD", PA:"PAB", PE:"PEN", PH:"PHP", PK:"PKR", PY:"PYG",
    SG:"SGD", SV:"USD", TH:"THB", UY:"UYU", VE:"VES", VN:"VND"
};

const APAC_BY_NAME = {
    Australia:["AU","AUD"], Bangladesh:["BD","BDT"], China:["CN","CNY"], "Hong Kong":["HK","HKD"],
    India:["IN","INR"], Indonesia:["ID","IDR"], Japan:["JP","JPY"], Malaysia:["MY","MYR"],
    "New Zealand":["NZ","NZD"], Pakistan:["PK","PKR"], Philippines:["PH","PHP"], Singapore:["SG","SGD"],
    "South Korea":["KR","KRW"], "Sri Lanka":["LK","LKR"], Thailand:["TH","THB"], Vietnam:["VN","VND"]
};

const SUPPLEMENTAL_COUNTRIES = [
    ["Afghanistan","AF","AFN","SOUTH ASIA","Southern Asia"], ["Bhutan","BT","BTN","SOUTH ASIA","Southern Asia"],
    ["Maldives","MV","MVR","SOUTH ASIA","Southern Asia"], ["Nepal","NP","NPR","SOUTH ASIA","Southern Asia"],
    ["Brunei","BN","BND","APAC","South-East Asia"], ["Cambodia","KH","KHR","APAC","South-East Asia"],
    ["Laos","LA","LAK","APAC","South-East Asia"], ["Mongolia","MN","MNT","APAC","East Asia"],
    ["Myanmar","MM","MMK","APAC","South-East Asia"], ["Taiwan","TW","TWD","APAC","East Asia"],
    ["Timor-Leste","TL","USD","APAC","South-East Asia"], ["Fiji","FJ","FJD","OCEANIA","Melanesia"],
    ["Kiribati","KI","AUD","OCEANIA","Micronesia"], ["Marshall Islands","MH","USD","OCEANIA","Micronesia"],
    ["Micronesia","FM","USD","OCEANIA","Micronesia"], ["Nauru","NR","AUD","OCEANIA","Micronesia"],
    ["Palau","PW","USD","OCEANIA","Micronesia"], ["Papua New Guinea","PG","PGK","OCEANIA","Melanesia"],
    ["Samoa","WS","WST","OCEANIA","Polynesia"], ["Solomon Islands","SB","SBD","OCEANIA","Melanesia"],
    ["Tonga","TO","TOP","OCEANIA","Polynesia"], ["Tuvalu","TV","AUD","OCEANIA","Polynesia"],
    ["Vanuatu","VU","VUV","OCEANIA","Melanesia"],
    ["Armenia","AM","AMD","CIS","Caucasus"], ["Azerbaijan","AZ","AZN","CIS","Caucasus"],
    ["Georgia","GE","GEL","CIS","Caucasus"], ["Kazakhstan","KZ","KZT","CIS","Central Asia"],
    ["Kyrgyzstan","KG","KGS","CIS","Central Asia"], ["Russia","RU","RUB","CIS","Eastern Europe"],
    ["Tajikistan","TJ","TJS","CIS","Central Asia"], ["Turkmenistan","TM","TMT","CIS","Central Asia"],
    ["Uzbekistan","UZ","UZS","CIS","Central Asia"]
];

function buildCountryCurrencyRegistry(current){
    const sources = [
        ["africa-countries.json", "AFRICA"], ["latam-countries.json", "LATAM"],
        ["sepa-countries.json", "EUROPE"], ["americas-countries.json", "LATAM"],
        ["middle-east-countries.json", "GCC / MIDDLE EAST"], ["apac-countries.json", "APAC"]
    ];
    const southAsia = new Set(["BD", "IN", "PK", "LK"]);
    const oceania = new Set(["AU", "NZ"]);
    const supported = new Set((current.currencyUniverse && current.currencyUniverse.currencies) || []);
    const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
    const countries = [];
    sources.forEach(([fileName, defaultRegion]) => {
        readJson(path.join(ROOT, "assets/data", fileName)).countries.forEach(country => {
            const apacIdentity = APAC_BY_NAME[country.name];
            const countryCode = country.countryCode || (apacIdentity && apacIdentity[0]);
            const currencyCode = country.currencyCode || (apacIdentity && apacIdentity[1]) || CURRENCY_BY_COUNTRY[countryCode];
            if(!currencyCode) return;
            let region = defaultRegion;
            if(countryCode === "US" || countryCode === "CA" || countryCode === "MX") region = "NORTH AMERICA";
            if(southAsia.has(countryCode)) region = "SOUTH ASIA";
            if(oceania.has(countryCode)) region = "OCEANIA";
            countries.push({ country: country.name, countryCode, currencyName: country.currencyName || currencyNames.of(currencyCode), currencyCode, region, subregion: country.subRegion || region, enabled: supported.has(currencyCode) });
        });
    });
    SUPPLEMENTAL_COUNTRIES.forEach(([country, countryCode, currencyCode, region, subregion]) => {
        countries.push({ country, countryCode, currencyName: currencyNames.of(currencyCode), currencyCode, region, subregion, enabled: supported.has(currencyCode) });
    });
    const unique = Array.from(new Map(countries.map(country => [country.countryCode, country])).values())
        .sort((a, b) => a.region.localeCompare(b.region) || a.country.localeCompare(b.country));
    return { schemaVersion: "1.0", generatedFrom: sources.map(source => `assets/data/${source[0]}`), countries: unique };
}

function readJson(filePath){
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listHistoryDates(){
    const dates = [];
    if(!fs.existsSync(HISTORY_DIR)) return dates;
    for(const year of fs.readdirSync(HISTORY_DIR)){
        const yearDir = path.join(HISTORY_DIR, year);
        if(!fs.statSync(yearDir).isDirectory() || !/^\d{4}$/.test(year)) continue;
        for(const month of fs.readdirSync(yearDir)){
            const monthDir = path.join(yearDir, month);
            if(!fs.statSync(monthDir).isDirectory() || !/^\d{2}$/.test(month)) continue;
            for(const file of fs.readdirSync(monthDir)){
                const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
                if(match) dates.push(match[1]);
            }
        }
    }
    return dates.sort();
}

function loadTemplate(){
    const templateSource = fs.readFileSync(TEMPLATE_SOURCE_PATH, "utf8");
    const HERO_MARKER = '<section class="chapter-hero">';
    const FOOTER_MARKER = '<footer id="footer">';
    const heroIdx = templateSource.indexOf(HERO_MARKER);
    const footerIdx = templateSource.indexOf(FOOTER_MARKER);
    if(heroIdx === -1 || footerIdx === -1){
        throw new Error("Template extraction markers not found in " + TEMPLATE_SOURCE_PATH);
    }
    const headerBlockTemplate = templateSource.slice(0, heroIdx)
        .replace("assets/css/market.css?v=20260908a", "assets/css/market.css?v=20260911f");
    const FX_APP_SCRIPT_ANCHOR = '<script src="../../assets/js/content-protection.js?v=20260822c"></script>';
    let footerBlock = templateSource.slice(footerIdx).replace(
        /href="(privacy-policy|disclaimer|terms-of-use|copyright-ip-policy|cookie-policy)\.html"/g,
        'href="../../pages/legal/$1.html"'
    );
    if(!footerBlock.includes(FX_APP_SCRIPT_ANCHOR)){
        throw new Error("Expected script-tag anchor not found in template: " + FX_APP_SCRIPT_ANCHOR);
    }
    footerBlock = footerBlock.split(FX_APP_SCRIPT_ANCHOR).join(
        `${FX_APP_SCRIPT_ANCHOR}\n<script src="../../assets/js/fx-app.js?v=20260911c"></script>`
    ).replace("assets/js/fx-ticker.js?v=20260908a", "assets/js/fx-ticker.js?v=20260911d");
    const TEMPLATE_TITLE_TAG = "<title>Privacy Policy | FINTECHOISIS — GPIR</title>";
    const TEMPLATE_DESCRIPTION = "How FINTECHOISIS and the Global Payments Intelligence Repository (GPIR) collect, use, process, store, protect and disclose information.";
    const TEMPLATE_CANONICAL_URL = "https://krishnan-vishal.github.io/pages/legal/privacy-policy.html";
    const TEMPLATE_OG_TWITTER_TITLE = 'content="Privacy Policy">';
    [TEMPLATE_TITLE_TAG, TEMPLATE_DESCRIPTION, TEMPLATE_CANONICAL_URL, TEMPLATE_OG_TWITTER_TITLE].forEach(marker => {
        if(!headerBlockTemplate.includes(marker)) throw new Error("Expected head-meta marker not found: " + marker);
    });
    return { headerBlockTemplate, footerBlock, TEMPLATE_TITLE_TAG, TEMPLATE_DESCRIPTION, TEMPLATE_CANONICAL_URL, TEMPLATE_OG_TWITTER_TITLE };
}

// The shared header/footer template (extracted from pages/legal/
// privacy-policy.html) is authored for depth-2 pages (pages/X/file.html)
// and its root-relative links are all "../../assets/...",
// "../../pages/..." or "../../index.html" (verified against the
// template source -- no other "../../" prefix exists in it). Pair
// pages live one level deeper (pages/fx/pairs/file.html), so those
// three prefixes need one extra "../" for depth-3 pages.
function rewriteForDepth(block, depth){
    if(depth !== 3) return block;
    return block
        .replace(/\.\.\/\.\.\/assets\//g, "../../../assets/")
        .replace(/\.\.\/\.\.\/pages\//g, "../../../pages/")
        .replace(/\.\.\/\.\.\/index\.html/g, "../../../index.html")
        // Sibling pages/X -> pages/Y links (e.g. "../chapters/...") are
        // written relative to a depth-2 page (pages/legal/ -> pages/
        // chapters/ is one level up); a depth-3 page needs one more.
        .replace(/\.\.\/chapters\//g, "../../chapters/");
}

function buildHeaderBlock(template, { title, description, urlPath, depth }){
    let block = template.headerBlockTemplate;
    block = block.split(template.TEMPLATE_TITLE_TAG).join(`<title>${escapeHtml(title)} | FINTECHOISIS — GPIR</title>`);
    block = block.split(template.TEMPLATE_DESCRIPTION).join(escapeHtml(description));
    block = block.split(template.TEMPLATE_CANONICAL_URL).join(`${SITE_ORIGIN}/${urlPath}`);
    block = block.split(template.TEMPLATE_OG_TWITTER_TITLE).join(`content="${escapeHtml(title)}">`);
    return rewriteForDepth(block, depth);
}

const DISCLAIMER_HTML = `<p class="fx-disclaimer">FX rates are provided for market intelligence and informational purposes only. Rates may be delayed, indicative or reference rates depending on the underlying provider and are not executable quotes. GPIR does not provide investment, trading or treasury advice.</p>`;

function breadcrumb(currentLabel, depth){
    // depth 2: pages/fx/file.html (2 segments before the filename).
    // depth 3: pages/fx/pairs/file.html (3 segments).
    const home = depth === 2 ? "../../index.html" : "../../../index.html";
    const hub = depth === 2 ? "index.html" : "../index.html";
    return `<div class="chapter-breadcrumb"><a href="${home}">Home</a><span>/</span><a href="${hub}">FX Pricing &amp; Treasury</a><span>/</span><strong>${escapeHtml(currentLabel)}</strong></div>`;
}

function subNav(active, depth){
    const prefix = depth === 2 ? "" : "../";
    const items = [
        ["Live FX", "index.html"],
        ["Currency Explorer", "explorer.html"],
        ["Treasury Intelligence", "treasury.html"],
        ["Weekly Trends", "weekly.html"],
        ["Historical", "historical.html"]
    ];
    return `<nav class="fx-subnav" aria-label="FX Pricing & Treasury sections">${items.map(([label, href]) =>
        `<a href="${prefix}${href}"${label === active ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`
    ).join("")}</nav>`;
}

function assemblePage({ template, title, description, urlPath, heroTitle, heroIntro, breadcrumbLabel, activeNav, depth, bodyHtml }){
    const headerBlock = buildHeaderBlock(template, { title, description, urlPath, depth });
    const footerBlock = rewriteForDepth(template.footerBlock, depth);
    const html = `${headerBlock}<section class="chapter-hero fx-page-hero">
    <div class="container">
        ${breadcrumb(breadcrumbLabel, depth)}
        <span class="chapter-part-tag">FX Pricing &amp; Treasury</span>
        <h1>${escapeHtml(heroTitle)}</h1>
        <p class="chapter-hero-intro">${escapeHtml(heroIntro)}</p>
        ${subNav(activeNav, depth)}
    </div>
</section>
<section class="chapter-body fx-page-body">
    <div class="container">
${bodyHtml}
        ${DISCLAIMER_HTML}
    </div>
</section>
${footerBlock}`;
    return html.replace(/[ \t]+$/gm, "");
}

function main(){
    const config = readJson(CONFIG_PATH);
    const current = readJson(CURRENT_PATH);
    const registry = buildCountryCurrencyRegistry(current);
    const registryJson = `{"schemaVersion":"${registry.schemaVersion}","generatedFrom":${JSON.stringify(registry.generatedFrom)},"countries":[\n${registry.countries.map(country => JSON.stringify(country)).join(",\n")}\n]}\n`;
    fs.writeFileSync(COUNTRY_REGISTRY_PATH, registryJson, "utf8");
    const currentSnapshot = readJson(path.join(ROOT, "assets/data/fx/current.json"));
    const pairs = config.featuredPairs || [];
    const historyDates = listHistoryDates();
    const firstSnapshotDate = [currentSnapshot.publicationDate, ...historyDates].filter(Boolean).sort()[0];
    const formattedFirstSnapshotDate = firstSnapshotDate
        ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${firstSnapshotDate}T00:00:00Z`)).replace("Sept", "Sep")
        : "the first published snapshot";
    const template = loadTemplate();

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(PAIR_OUTPUT_DIR, { recursive: true });

    // --- Live FX hub -----------------------------------------------
    const hubHtml = assemblePage({
        template,
        title: "FX Pricing & Treasury",
        description: "Compact live FX pricing, currency-pair intelligence, weekly trends and immutable daily historical rates from GPIR.",
        urlPath: "pages/fx/index.html",
        heroTitle: "FX Pricing & Treasury",
        heroIntro: `Current GPIR reference rates, status and business-day variance for ${pairs.length} curated market pairs.`,
        breadcrumbLabel: "Live FX",
        activeNav: "Live FX",
        depth: 2,
        bodyHtml: `        <div id="fx-live-grid" class="fx-market-grid" data-fx-view="live" aria-live="polite">
            <p class="fx-loading">Loading the latest GPIR FX snapshot…</p>
        </div>
        <p class="fx-status-note" id="fx-live-status"></p>`
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), hubHtml, "utf8");

    // --- Currency Explorer -------------------------------------------
    const explorerHtml = assemblePage({
        template,
        title: "Currency Explorer",
        description: "Select any two currencies in the active validated provider universe for deterministic direct or cross-rate intelligence.",
        urlPath: "pages/fx/explorer.html",
        heroTitle: "Currency Explorer",
        heroIntro: "Select any two currencies supplied by the active validated provider. Cross-rates are calculated deterministically without generating thousands of pages.",
        breadcrumbLabel: "Currency Explorer",
        activeNav: "Currency Explorer",
        depth: 2,
        bodyHtml: `        <div class="fx-explorer" data-fx-view="explorer">
            <form id="fx-explorer-form" class="fx-explorer-form">
                <label for="fx-explorer-base" class="fx-explorer-label">Base currency</label>
                <select id="fx-explorer-base" class="fx-explorer-select" aria-label="Base currency"></select>
                <label for="fx-explorer-quote" class="fx-explorer-label">Quote currency</label>
                <select id="fx-explorer-quote" class="fx-explorer-select" aria-label="Quote currency"></select>
                <button type="submit" class="fx-explorer-submit">View pair intelligence</button>
            </form>
            <div id="fx-explorer-detail" class="fx-pair-detail" aria-live="polite"></div>
        </div>`
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, "explorer.html"), explorerHtml, "utf8");

    // --- Treasury Intelligence ---------------------------------------
    const treasuryHtml = assemblePage({
        template,
        title: "Treasury Intelligence",
        description: "Treasury-relevant FX groupings: GCC pegged/managed currencies, major crosses and USD funding pairs from GPIR's curated universe.",
        urlPath: "pages/fx/treasury.html",
        heroTitle: "Treasury Intelligence",
        heroIntro: "Treasury-focused groupings for GCC currencies, INR corridors, major crosses and USD funding pairs.",
        breadcrumbLabel: "Treasury Intelligence",
        activeNav: "Treasury Intelligence",
        depth: 2,
        bodyHtml: `        <div id="fx-treasury-groups" class="fx-treasury-groups" data-fx-view="treasury" aria-live="polite">
            <p class="fx-loading">Loading treasury groupings…</p>
        </div>`
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, "treasury.html"), treasuryHtml, "utf8");

    // --- Weekly Trends -------------------------------------------------
    const weeklyHtml = assemblePage({
        template,
        title: "Weekly FX Trends",
        description: "Deterministic weekly quantitative FX observations per currency pair -- open, high, low, change and range, computed from GPIR's own archived history.",
        urlPath: "pages/fx/weekly.html",
        heroTitle: "Weekly FX Trends",
        heroIntro: "Validated GPIR observations only, with no inferred market drivers or synthetic trends.",
        breadcrumbLabel: "Weekly Trends",
        activeNav: "Weekly Trends",
        depth: 2,
        bodyHtml: `        <div id="fx-weekly-list" class="fx-weekly-list" data-fx-view="weekly" data-fx-first-snapshot-date="${escapeHtml(firstSnapshotDate)}" aria-live="polite">
            <p class="fx-loading">Loading weekly summaries…</p>
        </div>`
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, "weekly.html"), weeklyHtml, "utf8");

    // --- Historical ------------------------------------------------
    const archiveStart = "2026-09-01";
    const archiveEnd = current.publicationDate;
    const archiveDates = [];
    for(let cursor = new Date(`${archiveStart}T00:00:00Z`), end = new Date(`${archiveEnd}T00:00:00Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)){
        archiveDates.push(cursor.toISOString().slice(0, 10));
    }
    const storedHistoryDates = new Set(historyDates);
    const byYear = {};
    archiveDates.forEach(date => {
        const year = date.slice(0, 4);
        (byYear[year] = byYear[year] || []).push(date);
    });
    const monthName = (m) => ["January","February","March","April","May","June","July","August","September","October","November","December"][parseInt(m, 10) - 1];
    const historyListHtml = Object.keys(byYear).sort().reverse().map(year => {
        const dates = byYear[year];
        return `<section class="fx-history-year"><h2>${escapeHtml(year)}</h2><ul class="fx-history-date-list">${dates.map(date => {
            const [, m, d] = date.split("-");
            const unavailable = !storedHistoryDates.has(date);
            return `<li><a href="historical.html#${escapeHtml(date)}" data-fx-history-date="${escapeHtml(date)}"${unavailable ? ' class="fx-history-date--unavailable"' : ""}>${escapeHtml(monthName(m))} ${parseInt(d, 10)}, ${escapeHtml(year)}${unavailable ? " — no validated observation" : ""}</a></li>`;
        }).join("")}</ul></section>`;
    }).join("") || `<p class="fx-empty-note">Building observation history — first GPIR snapshot published ${escapeHtml(formattedFirstSnapshotDate)}.</p>`;
    const historicalHtml = assemblePage({
        template,
        title: "FX Historical Archive",
        description: "Immutable daily FX snapshots by year and month, and per-pair historical observations.",
        urlPath: "pages/fx/historical.html",
        heroTitle: "FX Historical Archive",
        heroIntro: "Select an immutable daily snapshot to view its recorded GPIR reference rates.",
        breadcrumbLabel: "Historical",
        activeNav: "Historical",
        depth: 2,
        bodyHtml: `        <div class="fx-history-nav">${historyListHtml}</div>
        <div id="fx-history-detail" class="fx-history-detail" data-fx-view="historical" aria-live="polite"></div>`
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, "historical.html"), historicalHtml, "utf8");

    // --- Per-pair intelligence views ---------------------------------
    let pairPageCount = 0;
    pairs.forEach(pair => {
        const slug = pairSlug(pair);
        const pairHtml = assemblePage({
            template,
            title: `${pair} — FX Intelligence`,
            description: `${pair} live pricing, previous-business-day variance, weekly trend and historical observations from GPIR.`,
            urlPath: `pages/fx/pairs/${slug}.html`,
            heroTitle: `${pair} FX Intelligence`,
            heroIntro: `Current reference rate, business-day variance and source attribution for ${pair}.`,
            breadcrumbLabel: pair,
            activeNav: "Currency Explorer",
            depth: 3,
            bodyHtml: `        <div class="fx-pair-detail" data-fx-view="pair-detail" data-fx-pair="${escapeHtml(pair)}" data-fx-first-snapshot-date="${escapeHtml(firstSnapshotDate)}" aria-live="polite">
            <p class="fx-loading">Loading ${escapeHtml(pair)}…</p>
        </div>`
        });
        fs.writeFileSync(path.join(PAIR_OUTPUT_DIR, `${slug}.html`), pairHtml, "utf8");
        pairPageCount++;
    });

    console.log(`FX pages generated: 5 hub page(s), ${pairPageCount} pair page(s) in ${path.relative(ROOT, OUTPUT_DIR)}.`);
}

if(require.main === module){
    main();
}

module.exports = { pairSlug, listHistoryDates };
