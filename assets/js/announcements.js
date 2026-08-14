/*=====================================================
  GPIR GLOBAL ANNOUNCEMENTS — REAL-TIME INTELLIGENCE ENGINE

  Renders the Global Announcements ticker from a structured JSON
  record set (assets/data/announcements.json), and turns each
  ticker item into a source-linked GPIR intelligence record: a
  detail panel showing category, country, summary, "why it
  matters", full source attribution and two actions — Read
  Original Source (opens the real publisher, new tab) and
  Explore Related GPIR Intelligence (navigates to the mapped
  GPIR chapter, only where a genuine mapping exists).

  Governance: a record's source is never fabricated. Records
  without a reliably identified primary source are ingested with
  status SOURCE_VERIFICATION_REQUIRED and render with no source
  link and no GPIR mapping button — see assets/data/announcements.json.
======================================================*/

(function(){

    const DATA_URL = "assets/data/announcements.json";

    let records = [];
    let recordsById = {};

    const GLOBE_SVG = '<svg class="icon-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

    function escapeHtml(str){
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function flagMarkup(record){
        if(record.countryCode){
            return `<img class="flag-icon" src="assets/icons/flags/${record.countryCode}.svg" alt="" loading="lazy">`;
        }
        return GLOBE_SVG;
    }

    function formatDate(dateStr){
        if(!dateStr) return "Unavailable";
        const parts = dateStr.split("-");
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        if(parts.length === 3){
            const [y,m,d] = parts;
            return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${y}`;
        }
        if(parts.length === 2){
            const [y,m] = parts;
            return `${months[parseInt(m,10)-1]} ${y}`;
        }
        return dateStr;
    }

    function recencyStatus(dateStr){
        if(!dateStr) return null;
        const parts = dateStr.split("-").map(n => parseInt(n,10));
        const published = parts.length === 3
            ? new Date(parts[0], parts[1]-1, parts[2])
            : parts.length === 2
                ? new Date(parts[0], parts[1]-1, 1)
                : new Date(parts[0], 0, 1);
        const days = Math.floor((Date.now() - published.getTime()) / 86400000);
        if(days <= 30) return "LIVE";
        if(days <= 365) return "RECENT";
        return "ARCHIVED";
    }

    function renderTicker(){

        const track = document.getElementById("announcementTicker");

        if(!track) return;

        track.innerHTML = records.map(record => {

            const tag = record.status === "SOURCE_VERIFICATION_REQUIRED"
                ? "Verification Pending"
                : (record.category || "").split(" / ")[0];

            return `<button type="button" class="ticker-card" data-intel-id="${escapeHtml(record.id)}">
                <span class="ticker-flag">${flagMarkup(record)}</span>
                <span class="ticker-body">
                    <span class="ticker-meta"><span class="ticker-country">${escapeHtml(record.country)}</span><span class="ticker-tag">${escapeHtml(tag)}</span></span>
                    <span class="ticker-headline">${escapeHtml(record.tickerHeadline || record.title)}</span>
                </span>
            </button>`;

        }).join("");

        track.querySelectorAll("[data-intel-id]").forEach(btn => {
            btn.addEventListener("click", () => openDetail(btn.getAttribute("data-intel-id")));
        });

    }

    function statusLabel(status){
        const map = {
            GPIR_CLASSIFIED: "GPIR Classified",
            SOURCE_VERIFICATION_REQUIRED: "Source Verification Required",
            NEW: "New",
            SOURCE_VERIFIED: "Source Verified",
            PUBLISHED: "Published",
            UPDATED: "Updated",
            ARCHIVED: "Archived"
        };
        return map[status] || status;
    }

    function buildDetailMarkup(record){

        const verified = record.status !== "SOURCE_VERIFICATION_REQUIRED";
        const recency = recencyStatus(record.publishedDate);

        const badges = `
            <span class="intel-badge intel-badge--status intel-badge--${verified ? "ok" : "pending"}">${escapeHtml(statusLabel(record.status))}</span>
            ${recency ? `<span class="intel-badge intel-badge--recency">${recency}</span>` : ""}
        `;

        const sourceBlock = verified && record.source ? `
            <div class="intel-source-block">
                <dl class="intel-source-list">
                    <dt>Source</dt><dd>${escapeHtml(record.source.name)}</dd>
                    <dt>Publication</dt><dd>${escapeHtml(record.source.publicationTitle)}</dd>
                    <dt>Published</dt><dd>${escapeHtml(formatDate(record.publishedDate))}</dd>
                    <dt>Retrieved</dt><dd>${escapeHtml(formatDate(record.retrievedDate))}</dd>
                </dl>
                <a class="intel-source-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noopener noreferrer">Read Original Source →</a>
            </div>
        ` : `
            <div class="intel-source-block intel-source-block--pending">
                <p>A single authoritative primary source with a verifiable publication date has not yet been confirmed for this item. GPIR does not publish an original-source link until source verification is complete.</p>
            </div>
        `;

        const summaryBlock = record.summary ? `<p class="intel-summary">${escapeHtml(record.summary)}</p>` : "";
        const whyBlock = record.whyItMatters ? `
            <div class="intel-why">
                <h4>Why It Matters</h4>
                <p>${escapeHtml(record.whyItMatters)}</p>
            </div>
        ` : "";

        const gpirButton = record.gpirMapping ? `
            <a class="intel-gpir-link" href="${escapeHtml(record.gpirMapping.href)}">Explore Related GPIR Intelligence →</a>
        ` : "";

        return `
            <div class="intel-detail-meta">
                <span class="intel-detail-flag">${flagMarkup(record)}</span>
                <span class="intel-detail-country">${escapeHtml(record.country)}${record.region && record.region !== record.country ? " · " + escapeHtml(record.region) : ""}</span>
                <span class="intel-detail-category">${escapeHtml(record.category)}${record.subCategory ? " / " + escapeHtml(record.subCategory) : ""}</span>
            </div>
            <h2 class="intel-detail-title">${escapeHtml(record.title)}</h2>
            <div class="intel-badges">${badges}</div>
            ${summaryBlock}
            ${whyBlock}
            ${sourceBlock}
            ${gpirButton}
        `;

    }

    function openDetail(id){

        const record = recordsById[id];

        if(!record) return;

        const overlay = document.getElementById("intel-overlay");
        const body = document.getElementById("intel-panel-body");

        if(!overlay || !body) return;

        body.innerHTML = buildDetailMarkup(record);

        const searchOverlay = document.getElementById("search-overlay");
        if(searchOverlay) searchOverlay.classList.remove("is-open");

        overlay.classList.add("is-open");
        overlay.setAttribute("aria-hidden", "false");

        document.addEventListener("keydown", onDetailKeydown);

    }

    function closeDetail(){

        const overlay = document.getElementById("intel-overlay");

        if(!overlay) return;

        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");

        document.removeEventListener("keydown", onDetailKeydown);

    }

    function onDetailKeydown(e){
        if(e.key === "Escape") closeDetail();
    }

    function initializeDetailPanel(){

        const overlay = document.getElementById("intel-overlay");

        if(!overlay) return;

        overlay.querySelectorAll("[data-intel-close]").forEach(el => {
            el.addEventListener("click", closeDetail);
        });

    }

    function load(){

        return fetch(DATA_URL)
            .then(r => { if(!r.ok) throw new Error("announcements fetch failed"); return r.json(); })
            .then(data => {

                records = (data.records || []).filter(r => r && r.id);
                recordsById = {};
                records.forEach(r => { recordsById[r.id] = r; });

                renderTicker();
                initializeDetailPanel();

                document.dispatchEvent(new CustomEvent("gpir:announcementsready", { detail: { records } }));

            })
            .catch(() => {
                // A failed feed must not break the rest of the page — the ticker
                // section simply stays empty rather than showing broken content.
            });

    }

    window.GPIRAnnouncements = {
        openDetail,
        closeDetail,
        getRecords: () => records.slice(),
        getRecordById: (id) => recordsById[id] || null
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", load);
    } else {
        load();
    }

})();
