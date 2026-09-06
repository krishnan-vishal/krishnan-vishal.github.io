/*=====================================================
  GPIR CONTENT SEARCH ENGINE

  Loads the pre-built, real-content search index
  (assets/data/search-index.json — section-level text
  extracted from the site's own chapter/country/legal pages)
  and scores it against a reader's query.

  This is an indexed search, not a live page scan: the index is
  fetched once — on the reader's first search interaction, not on
  page load, since most visits never open search — and matched
  entirely client-side afterwards, so keystrokes never trigger
  network requests. If the index fails to load, isReady() reports
  false and callers should show a graceful "search temporarily
  unavailable" state rather than pretending content search still
  works.

  Governance: relevance is scored from real matches against real
  extracted text — synonyms/related terms are never invented. Where
  the GPIR taxonomy itself uses interchangeable terms for the same
  thing (e.g. a chapter titled "RTP" whose own text says "instant
  payments"), that connection is discovered naturally because both
  words already appear in the same indexed section — nothing is
  hard-coded as a fabricated relationship.
======================================================*/

(function(){

    const INDEX_URL = (function(){
        if(typeof document === "undefined") return "assets/data/search-index.json";
        const script = document.currentScript ||
            document.querySelector('script[src*="assets/js/content-search.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/content-search.js";
        return src.replace(/assets\/js\/content-search\.js.*$/, "assets/data/search-index.json");
    })();

    const PAGE_PREFIX = (function(){
        if(typeof document === "undefined") return "";
        const script = document.currentScript ||
            document.querySelector('script[src*="assets/js/content-search.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/content-search.js";
        return src.replace(/assets\/js\/content-search\.js.*$/, "");
    })();

    const DASHBOARD_URL = INDEX_URL.replace(/assets\/data\/search-index\.json$/, "assets/data/dashboard-metadata.json");
    const ANNOUNCEMENTS_URL = INDEX_URL.replace(/assets\/data\/search-index\.json$/, "assets/data/announcements.json");

    // Existing dashboard cards are structured records, not indexed prose. Each
    // published record becomes one search entry from its own already-existing
    // title/country/region/description/pagePath fields — no new text is
    // written, and this fails silently (dashboards simply stay unsearched) if
    // the optional fetch is unavailable, matching the graceful-degradation
    // pattern used for the primary search index below.
    function dashboardEntries(data){
        return (data.records || []).map(record => ({
            id: "dashboard-" + record.dashboardId,
            pageTitle: record.title,
            sectionTitle: "Country Intelligence Dashboard",
            url: "index.html#" + record.dashboardId,
            type: "GPIR Dashboard",
            category: "Country Dashboard",
            header: "Dashboards",
            country: record.country,
            text: [record.dashboardId, record.region, "Country Dashboard", record.description, record.edition, record.status].filter(Boolean).join(" · ")
        }));
    }

    function announcementEntries(data){
        return (data.records || [])
            .filter(record => record.status === "GPIR_CLASSIFIED" && record.lifecycleStatus !== "HISTORICAL" && record.contentStatus !== "CONTENT_UNDER_REVIEW")
            .map(record => ({
                id: "announcement-" + record.id,
                pageTitle: record.title,
                sectionTitle: "Global Announcement",
                url: "pages/intelligence/" + record.id + ".html",
                type: "Global Announcement",
                category: [record.category, record.subCategory].filter(Boolean).join(" / "),
                header: "Global Announcements",
                country: record.country,
                text: [record.title, record.tickerHeadline, record.category, record.subCategory, record.country, record.region, record.eventType, record.organisation, record.source && record.source.name, record.source && record.source.publicationTitle, record.publishedDate, record.publicationMonth, record.publicationYear, record.lifecycleStatus, record.summary, record.whyItMatters].filter(Boolean).join(" · ")
            }));
    }

    // Legal/policy text is real and searchable, but shouldn't drown out
    // research content for common words that appear in both.
    const CATEGORY_WEIGHT = {
        "Legal & Policy": 0.35
    };

    let entries = [];
    let loaded = false;
    let failed = false;
    let loadPromise = null;

    // Loaded lazily on first search interaction (see load()), not here —
    // fetching ~300KB of section text on every page view when most
    // visits never open search is exactly the payload-you-don't-need
    // pattern GPIR's performance architecture avoids.
    function load(){
        if(loadPromise) return loadPromise;
        loadPromise = Promise.all([
            fetch(INDEX_URL)
                .then(r => { if(!r.ok) throw new Error("search index fetch failed"); return r.json(); })
                .then(data => data.entries || []),
            fetch(DASHBOARD_URL)
                .then(r => { if(!r.ok) throw new Error("dashboard metadata unavailable"); return r.json(); })
                .then(dashboardEntries)
                .catch(() => []),
            fetch(ANNOUNCEMENTS_URL)
                .then(r => { if(!r.ok) throw new Error("announcement data unavailable"); return r.json(); })
                .then(announcementEntries)
                .catch(() => [])
        ])
            .then(([indexEntries, dashboardIndexEntries, announcementIndexEntries]) => {
                entries = indexEntries.concat(dashboardIndexEntries, announcementIndexEntries);
                loaded = true;
            })
            .catch(() => {
                failed = true;
            });
        return loadPromise;
    }

    function escapeHtml(str){
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function tokenize(query){
        return query
            .toLowerCase()
            .split(/\s+/)
            .map(w => w.replace(/[^\p{L}\p{N}-]/gu, ""))
            .filter(Boolean);
    }

    function scoreEntry(entry, query, words){
        const haystackTitle = (entry.pageTitle + " " + entry.sectionTitle).toLowerCase();
        const haystackText = entry.text.toLowerCase();
        const q = query.toLowerCase();

        let score = 0;

        if(haystackTitle.includes(q)) score += 120;
        if(haystackText.includes(q)) score += 80;

        words.forEach(w => {
            if(!w) return;
            if(haystackTitle.includes(w)) score += 25;
            if(haystackText.includes(w)) score += 8;
        });

        if(entry.country && q.includes(entry.country.toLowerCase())) score += 20;

        const weight = CATEGORY_WEIGHT[entry.category] || 1;

        return score * weight;
    }

    function buildExcerpt(text, query, words){

        const lower = text.toLowerCase();
        let idx = lower.indexOf(query.toLowerCase());

        if(idx === -1){
            for(const w of words){
                idx = lower.indexOf(w);
                if(idx !== -1) break;
            }
        }

        if(idx === -1) idx = 0;

        const radius = 90;
        let start = Math.max(0, idx - radius);
        let end = Math.min(text.length, idx + query.length + radius);

        // Snap to word boundaries so we don't cut mid-word.
        while(start > 0 && /\S/.test(text[start - 1])) start--;
        while(end < text.length && /\S/.test(text[end])) end++;

        let excerpt = text.slice(start, end).trim();

        if(start > 0) excerpt = "…" + excerpt;
        if(end < text.length) excerpt = excerpt + "…";

        const escaped = escapeHtml(excerpt);

        const allTerms = [query].concat(words).filter((v, i, a) => v && a.indexOf(v) === i);
        let highlighted = escaped;
        allTerms
            .sort((a, b) => b.length - a.length)
            .forEach(term => {
                if(term.length < 2) return;
                const re = new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
                highlighted = highlighted.replace(re, "<mark>$1</mark>");
            });

        return highlighted;

    }

    function resolveAnnouncementIntent(rawQuery){
        const query = String(rawQuery || "").trim().toLowerCase();
        if(!query || !/\bannouncements?\b/.test(query)) return { mode: "GENERAL" };

        const normalized = query.replace(/[^\p{L}\p{N}\s&-]/gu, " ");
        const intent = {
            mode: "ANNOUNCEMENT",
            lifecycle: null,
            country: null,
            month: null,
            year: null,
            category: null,
            sourceText: null
        };

        const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
        const monthIndex = monthNames.findIndex(month => normalized.includes(month));
        if(monthIndex !== -1) intent.month = String(monthIndex + 1).padStart(2, "0");

        const yearMatch = normalized.match(/\b(20\d{2})\b/);
        if(yearMatch) intent.year = yearMatch[1];

        if(/\bhistorical\b/.test(normalized)) intent.lifecycle = "HISTORICAL";
        else if(/\bcurrent\b/.test(normalized)) intent.lifecycle = "CURRENT";

        if(/\bindia\b/.test(normalized)) intent.country = "India";
        else if(/\buae\b|united arab emirates/.test(normalized)) intent.country = "United Arab Emirates";
        else if(/\bsingapore\b/.test(normalized)) intent.country = "Singapore";
        else if(/\bsaudi arabia\b/.test(normalized)) intent.country = "Saudi Arabia";
        else if(/\bqatar\b/.test(normalized)) intent.country = "Qatar";
        else if(/\bglobal\b/.test(normalized)) intent.country = "Global";

        if(/\baml\b|cft/.test(normalized)) intent.category = "AML / CFT";
        else if(/\bregulatory\b/.test(normalized)) intent.category = "Regulatory";
        else if(/\bpayment infrastructure\b/.test(normalized)) intent.category = "Payment Infrastructure";
        else if(/\bm&a\b|\bacquisition\b/.test(normalized)) intent.category = "M&A";
        else if(/\blicensing\b/.test(normalized)) intent.category = "Licensing";
        else if(/\bpayments?\b/.test(normalized) && !/\bpayment infrastructure\b/.test(normalized)) intent.category = "Payments";

        if(/\bfatf\b/.test(normalized)) intent.sourceText = "FATF";

        return intent;
    }

    function entryMatchesAnnouncementIntent(entry, intent){
        if(!intent || intent.mode !== "ANNOUNCEMENT") return true;

        const countryText = `${entry.country || ""} ${entry.region || ""}`.toLowerCase();
        const categoryText = `${entry.category || ""} ${entry.subCategory || ""}`.toLowerCase();
        const sourceText = `${entry.organisation || ""} ${(entry.source && entry.source.name) || ""} ${(entry.source && entry.source.publicationTitle) || ""} ${entry.text || ""}`.toLowerCase();

        if(intent.country && !countryText.includes(intent.country.toLowerCase())) return false;
        if(intent.category && !categoryText.includes(intent.category.toLowerCase())) return false;
        if(intent.lifecycle && entry.lifecycleStatus !== intent.lifecycle) return false;
        if(intent.month && entry.publicationMonth !== intent.month) return false;
        if(intent.year && entry.publicationYear !== intent.year) return false;
        if(intent.sourceText && !sourceText.includes(intent.sourceText.toLowerCase())) return false;

        return true;
    }

    function search(query, opts){

        opts = opts || {};
        const limit = opts.limit || 12;

        if(!loaded || !query || !query.trim()) return { results: [], total: 0, intent: "GENERAL" };

        const intent = resolveAnnouncementIntent(query);
        const words = tokenize(query);

        let filteredEntries = entries;
        if(intent.mode === "ANNOUNCEMENT"){
            filteredEntries = entries.filter(entry => entry.type === "Global Announcement" && entryMatchesAnnouncementIntent(entry, intent));
            if(!filteredEntries.length) return { results: [], total: 0, intent: intent.mode };
        }

        const scored = filteredEntries
            .map(entry => ({ entry, score: scoreEntry(entry, query, words) }))
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score);

        const total = scored.length;

        const results = scored.slice(0, limit).map(({ entry, score }) => ({
            id: entry.id,
            pageTitle: entry.pageTitle,
            sectionTitle: entry.sectionTitle,
            href: PAGE_PREFIX + entry.url,
            type: entry.type,
            category: entry.category,
            header: entry.header,
            country: entry.country,
            excerptHtml: buildExcerpt(entry.text, query, words),
            score,
            intent: intent.mode
        }));

        return { results, total, intent: intent.mode };

    }

    const api = {
        load,
        search,
        isReady: () => loaded,
        isLoading: () => !!loadPromise && !loaded && !failed,
        hasFailed: () => failed,
        resolveAnnouncementIntent
    };

    if(typeof window !== "undefined") window.GPIRContentSearch = api;
    if(typeof module !== "undefined") module.exports = { ...api, resolveAnnouncementIntent, search };

})();
