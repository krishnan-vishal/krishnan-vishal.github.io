/*=====================================================
  GPIR GLOBAL ANNOUNCEMENTS — REAL-TIME INTELLIGENCE ENGINE
  + TRUST / SOURCE VERIFICATION LAYER

  Renders the Global Announcements ticker from a structured JSON
  record set (assets/data/announcements.json), and turns each
  ticker item into a source-linked GPIR intelligence record: a
  detail panel showing category, country, summary, "why it
  matters", full source attribution and two actions — Read
  Original Source (opens the real publisher, new tab, only for
  a domain-verified source) and Explore Related GPIR Intelligence
  (navigates to the mapped GPIR chapter, only where a genuine
  mapping exists).

  Every record's source is passed through assets/js/trust-engine.js
  at render time: SOURCE TRUST (does the cited URL genuinely belong
  to the claimed organization) and CONTENT STATUS (has GPIR reviewed
  the summarised content) are tracked as two separate axes rather
  than one blended "trusted" flag — a verified source does not by
  itself make the record's content beyond question.

  Governance: a record's source is never fabricated, and a source
  link is never rendered as directly clickable unless the trust
  engine resolves it to SOURCE_VERIFIED. Records without a reliably
  identified primary source, or whose editorial status is not yet
  GPIR_CLASSIFIED, do not reach the public ticker — see
  assets/data/announcements.json.
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

    function evaluateTrust(record){
        if(window.GPIRTrustEngine) return window.GPIRTrustEngine.evaluateSource(record);
        return { sourceStatus: "SOURCE_REQUIRES_VERIFICATION", confidence: "UNVERIFIED", reasons: ["TRUST_ENGINE_UNAVAILABLE"] };
    }

    // Only editorially-classified records (GPIR_CLASSIFIED — GPIR found
    // and reviewed a real primary source) reach the live ticker, and a
    // record the trust engine resolves to SOURCE_BLOCKED is withheld
    // even if it was previously classified, as a fail-safe.
    function publishedRecords(){
        return records
            .filter(r => {
                if(r.status !== "GPIR_CLASSIFIED") return false;
                return evaluateTrust(r).sourceStatus !== "SOURCE_BLOCKED";
            })
            .sort((a, b) => {
                const rank = categoryPriority(a) - categoryPriority(b);
                if(rank !== 0) return rank;
                return (b.publishedDate || "").localeCompare(a.publishedDate || "");
            });
    }

    // Ticker priority order, most to least urgent — new/unlisted
    // categories fall to the back rather than crowding out the ones
    // GPIR has explicitly prioritised.
    const CATEGORY_PRIORITY = [
        "Payment Suspension",
        "Regulatory",
        "AML / CFT",
        "Payment Infrastructure",
        "Cross-Border Payments",
        "Open Banking",
        "Digital Banking",
        "M&A",
        "Licensing",
        "Payments",
        "FinTech"
    ];

    function categoryPriority(record){
        const idx = CATEGORY_PRIORITY.indexOf(record.category);
        return idx === -1 ? CATEGORY_PRIORITY.length : idx;
    }

    function updateLastRefreshDisplay(lastRefreshed){

        const el = document.getElementById("tickerLastRefresh");

        if(!el || !lastRefreshed) return;

        const d = new Date(lastRefreshed);

        if(isNaN(d.getTime())) return;

        const label = d.toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short"
        });

        el.textContent = `Last Intelligence Refresh: ${label}`;

    }

    function renderTicker(){

        const track = document.getElementById("announcementTicker");

        if(!track) return;

        track.innerHTML = publishedRecords().map(record => {

            const tag = (record.category || "").split(" / ")[0];
            const isSuspension = record.category === "Payment Suspension";

            return `<button type="button" class="ticker-card${isSuspension ? " ticker-card--suspension" : ""}" data-intel-id="${escapeHtml(record.id)}">
                <span class="ticker-flag">${flagMarkup(record)}</span>
                <span class="ticker-body">
                    <span class="ticker-meta"><span class="ticker-country">${escapeHtml(record.country)}</span><span class="ticker-tag${isSuspension ? " ticker-tag--suspension" : ""}">${isSuspension ? "⚠ " : ""}${escapeHtml(tag)}</span></span>
                    <span class="ticker-headline">${escapeHtml(record.tickerHeadline || record.title)}</span>
                </span>
            </button>`;

        }).join("");

        track.querySelectorAll("[data-intel-id]").forEach(btn => {
            btn.addEventListener("click", () => openDetail(btn.getAttribute("data-intel-id")));
        });

    }

    const SOURCE_STATUS_META = {
        SOURCE_VERIFIED:              { icon: "✓", label: "Source Verified",              cls: "ok" },
        SOURCE_REQUIRES_VERIFICATION: { icon: "◷", label: "Source Requires Verification",  cls: "pending" },
        SOURCE_WARNING:                { icon: "⚠", label: "Source Warning",                cls: "warning" },
        SOURCE_BLOCKED:                { icon: "⛔", label: "Source Blocked",               cls: "blocked" }
    };

    const CONTENT_STATUS_META = {
        CONTENT_VERIFIED:     "Content: Reviewed by GPIR",
        CONTENT_UNDER_REVIEW: "Content: Under Review"
    };

    const REPORT_REASONS = [
        "Suspicious link",
        "Possible scam",
        "Incorrect source",
        "Misleading information",
        "Broken link",
        "Duplicate",
        "Other"
    ];

    function buildSourceBlock(record, trust){

        if(trust.sourceStatus === "SOURCE_VERIFIED"){
            return `
                <div class="intel-source-block">
                    <dl class="intel-source-list">
                        ${record.organisation && record.organisation !== record.source.name ? `<dt>Organisation</dt><dd>${escapeHtml(record.organisation)}</dd>` : ""}
                        <dt>Source</dt><dd>${escapeHtml(record.source.name)}</dd>
                        <dt>Publication</dt><dd>${escapeHtml(record.source.publicationTitle)}</dd>
                        <dt>Published</dt><dd>${escapeHtml(formatDate(record.publishedDate))}</dd>
                        ${record.lastUpdated ? `<dt>Last Updated</dt><dd>${escapeHtml(formatDate(record.lastUpdated))}</dd>` : ""}
                        <dt>Retrieved</dt><dd>${escapeHtml(formatDate(record.retrievedDate))}</dd>
                    </dl>
                    <a class="intel-source-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noopener noreferrer">Read Original Source →</a>
                </div>
            `;
        }

        if(trust.sourceStatus === "SOURCE_WARNING"){
            return `
                <div class="intel-source-block intel-source-block--warning">
                    <p class="intel-security-notice"><strong>Security Notice:</strong> GPIR could not confirm this link's destination matches the declared source (${escapeHtml((trust.reasons || []).join(", ").replace(/_/g," ").toLowerCase() || "unspecified")}). Please proceed only if you trust the destination.</p>
                    <button type="button" class="intel-reveal-source" data-record-id="${escapeHtml(record.id)}">Continue at your own risk →</button>
                </div>
            `;
        }

        if(trust.sourceStatus === "SOURCE_BLOCKED"){
            return `
                <div class="intel-source-block intel-source-block--blocked">
                    <p><strong>Source Link Blocked.</strong> GPIR has withheld this link because it was classified as a confirmed high-risk destination. No continue option is offered from GPIR for this source.</p>
                </div>
            `;
        }

        return `
            <div class="intel-source-block intel-source-block--pending">
                <p>A single authoritative primary source with a verifiable publication date has not yet been confirmed for this item. GPIR does not publish an original-source link until source verification is complete.</p>
            </div>
        `;

    }

    // Related GPIR Intelligence is computed live from what's currently
    // published (same country or same category, excluding the record
    // itself) rather than hand-curated, so it can never drift stale as
    // records are added or retired.
    function relatedRecords(record){
        return publishedRecords()
            .filter(r => r.id !== record.id && (r.country === record.country || r.category === record.category))
            .slice(0, 3);
    }

    function buildDetailMarkup(record){

        const trust = evaluateTrust(record);
        const statusMeta = SOURCE_STATUS_META[trust.sourceStatus] || SOURCE_STATUS_META.SOURCE_REQUIRES_VERIFICATION;
        const recency = recencyStatus(record.publishedDate);

        const badges = `
            <span class="intel-badge intel-badge--status intel-badge--${statusMeta.cls}">${statusMeta.icon} ${escapeHtml(statusMeta.label)}</span>
            <span class="intel-badge intel-badge--confidence">Confidence: ${escapeHtml(trust.confidence)}</span>
            <span class="intel-badge intel-badge--content">${escapeHtml(CONTENT_STATUS_META[record.contentStatus] || "Content: Under Review")}</span>
            ${recency ? `<span class="intel-badge intel-badge--recency">${recency}</span>` : ""}
        `;

        const sourceBlock = buildSourceBlock(record, trust);

        const summaryBlock = record.summary ? `
            <h4 class="intel-summary-heading">GPIR Summary</h4>
            <p class="intel-summary">${escapeHtml(record.summary)}</p>
        ` : "";

        const whyBlock = record.whyItMatters ? `
            <div class="intel-why">
                <h4>Why It Matters</h4>
                <p>${escapeHtml(record.whyItMatters)}</p>
            </div>
        ` : "";

        const gpirButton = record.gpirMapping ? `
            <a class="intel-gpir-link" href="${escapeHtml(record.gpirMapping.href)}">Explore Related GPIR Intelligence →</a>
        ` : "";

        const related = relatedRecords(record);
        const relatedBlock = related.length ? `
            <div class="intel-related">
                <h4>Related GPIR Intelligence</h4>
                <ul class="intel-related-list">
                    ${related.map(r => `<li><button type="button" class="intel-related-item" data-intel-id="${escapeHtml(r.id)}">${escapeHtml(r.country)} · ${escapeHtml(r.tickerHeadline || r.title)}</button></li>`).join("")}
                </ul>
            </div>
        ` : "";

        const reportBlock = `
            <div class="intel-report-block">
                <button type="button" class="intel-report-toggle" data-record-id="${escapeHtml(record.id)}">Report This Source →</button>
                <div class="intel-report-options" id="intel-report-options" hidden>
                    ${REPORT_REASONS.map(reason => `<a class="intel-report-reason" href="${window.GPIRTrustEngine ? escapeHtml(window.GPIRTrustEngine.buildReportMailto(record, reason)) : "#"}">${escapeHtml(reason)}</a>`).join("")}
                </div>
            </div>
        `;

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
            ${relatedBlock}
            ${reportBlock}
            <p class="intel-disclaimer">GPIR checks source domains against a maintained registry and basic domain-pattern checks — this is a source-verification status, not a guarantee of safety. Always use judgment before entering any information on an external site. GPIR will never ask you for passwords, OTPs, card details or wallet credentials.</p>
        `;

    }

    function wireDetailInteractions(record){

        const body = document.getElementById("intel-panel-body");

        if(!body) return;

        const revealBtn = body.querySelector(".intel-reveal-source");
        if(revealBtn){
            revealBtn.addEventListener("click", () => {
                const trust = evaluateTrust(record);
                const block = revealBtn.closest(".intel-source-block");
                block.innerHTML = `
                    <p class="intel-security-notice">Destination: <code>${escapeHtml(record.source.url)}</code></p>
                    <a class="intel-source-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noopener noreferrer">Open this link anyway →</a>
                `;
            });
        }

        const reportToggle = body.querySelector(".intel-report-toggle");
        if(reportToggle){
            reportToggle.addEventListener("click", () => {
                const options = body.querySelector(".intel-report-options");
                if(options) options.hidden = !options.hidden;
            });
        }

        body.querySelectorAll(".intel-related-item").forEach(btn => {
            btn.addEventListener("click", () => openDetail(btn.getAttribute("data-intel-id")));
        });

    }

    function openDetail(id){

        const record = recordsById[id];

        if(!record) return;

        const overlay = document.getElementById("intel-overlay");
        const body = document.getElementById("intel-panel-body");

        if(!overlay || !body) return;

        body.innerHTML = buildDetailMarkup(record);
        wireDetailInteractions(record);

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

        const dataReady = fetch(DATA_URL)
            .then(r => { if(!r.ok) throw new Error("announcements fetch failed"); return r.json(); })
            .then(data => {
                records = (data.records || []).filter(r => r && r.id);
                recordsById = {};
                records.forEach(r => { recordsById[r.id] = r; });
                updateLastRefreshDisplay(data.lastRefreshed);
            })
            .catch(() => {
                // A failed feed must not break the rest of the page — the ticker
                // section simply stays empty rather than showing broken content.
            });

        const trustReady = window.GPIRTrustEngine ? window.GPIRTrustEngine.ready : Promise.resolve();

        return Promise.all([dataReady, trustReady]).then(() => {

            renderTicker();
            initializeDetailPanel();

            document.dispatchEvent(new CustomEvent("gpir:announcementsready", { detail: { records: publishedRecords() } }));

        });

    }

    window.GPIRAnnouncements = {
        openDetail,
        closeDetail,
        getRecords: () => publishedRecords(),
        getAllRecords: () => records.slice(),
        getRecordById: (id) => recordsById[id] || null,
        evaluateTrust
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", load);
    } else {
        load();
    }

})();
