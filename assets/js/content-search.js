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
        const script = document.currentScript ||
            document.querySelector('script[src*="assets/js/content-search.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/content-search.js";
        return src.replace(/assets\/js\/content-search\.js.*$/, "assets/data/search-index.json");
    })();

    const PAGE_PREFIX = (function(){
        const script = document.currentScript ||
            document.querySelector('script[src*="assets/js/content-search.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/content-search.js";
        return src.replace(/assets\/js\/content-search\.js.*$/, "");
    })();

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
        loadPromise = fetch(INDEX_URL)
            .then(r => { if(!r.ok) throw new Error("search index fetch failed"); return r.json(); })
            .then(data => {
                entries = (data.entries || []);
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

    function search(query, opts){

        opts = opts || {};
        const limit = opts.limit || 12;

        if(!loaded || !query || !query.trim()) return { results: [], total: 0 };

        const words = tokenize(query);

        const scored = entries
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
            score
        }));

        return { results, total };

    }

    window.GPIRContentSearch = {
        load,
        search,
        isReady: () => loaded,
        isLoading: () => !!loadPromise && !loaded && !failed,
        hasFailed: () => failed
    };

})();
