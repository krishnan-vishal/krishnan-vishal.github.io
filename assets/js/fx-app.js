/*=====================================================
  GPIR FX PRICING & TREASURY -- READER APP

  Powers the Live FX hub grid, Currency Explorer, Treasury Intelligence
  groupings, Weekly Trends list and per-pair FX intelligence view. Each
  page only carries the single [data-fx-view] container it actually
  needs; this script checks for each container and no-ops if absent
  (same convention as assets/js/script.js's feature initializers), and
  every dataset is fetched on demand rather than embedded inline, so a
  hub page never pulls in historical data it doesn't show.

  All rendering is driven entirely by assets/data/fx/*.json -- no rate,
  status or timestamp is invented here. A record whose fields are null
  renders "N/A"; a record with no valid comparison renders "--".
======================================================*/

(function(){

    function escapeHtml(value){
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function dataPrefix(){
        const script = document.querySelector('script[src*="assets/js/fx-app.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/fx-app.js";
        return src.replace(/assets\/js\/fx-app\.js.*$/, "assets/data/fx/");
    }

    function pagePrefix(){
        return dataPrefix().replace(/assets\/data\/fx\/$/, "");
    }

    function pairSlug(pair){
        return pair.toLowerCase().replace("/", "-");
    }

    function formatRate(value, pair){
        if(!Number.isFinite(value)) return "N/A";
        const decimals = pair && (pair.startsWith("JPY/") || pair.endsWith("/JPY")) ? 2 : 4;
        return value.toFixed(decimals);
    }

    function formatPercent(value){
        if(!Number.isFinite(value)) return "—";
        const glyph = value > 0 ? "▲" : value < 0 ? "▼" : "—";
        const sign = value > 0 ? "+" : "";
        return `${glyph} ${sign}${value.toFixed(2)}%`;
    }

    function formatObservationDate(value){
        if(!value) return "the first published snapshot";
        const date = new Date(`${value}T00:00:00Z`);
        if(isNaN(date.getTime())) return escapeHtml(value);
        return date.toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
        }).replace("Sept", "Sep");
    }

    function buildingHistoryMessage(snapshot){
        return `Building observation history — first GPIR snapshot published ${formatObservationDate(snapshot && snapshot.publicationDate)}.`;
    }

    function directionClass(direction){
        if(direction === "up") return "fx-up";
        if(direction === "down") return "fx-down";
        if(direction === "unchanged") return "fx-unchanged";
        return "fx-no-comparison";
    }

    const STATUS_LABELS = {
        LIVE: "LIVE", DELAYED: "DELAYED", REFERENCE: "REFERENCE", STALE: "STALE",
        HISTORICAL: "HISTORICAL", NO_PROVIDER_CONFIGURED: "NO PROVIDER CONFIGURED",
        PROVIDER_UNAVAILABLE_SERVED_LAST_KNOWN_GOOD: "LAST KNOWN GOOD (STALE)"
    };

    function statusBadge(dataStatus){
        const label = STATUS_LABELS[dataStatus] || dataStatus || "UNKNOWN";
        return `<span class="fx-status-badge fx-status-badge--${escapeHtml((dataStatus || "unknown").toLowerCase())}">${escapeHtml(label)}</span>`;
    }

    function fetchJson(url){
        return fetch(url).then(response => {
            if(!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`);
            return response.json();
        });
    }

    function loadCurrentSnapshot(){
        return fetchJson(dataPrefix() + "current.json").catch(() => ({ pairs: [], dataStatus: "UNAVAILABLE", generatedAt: null }));
    }

    function loadConfig(){
        return fetchJson(dataPrefix() + "fx-config.json").catch(() => ({ featuredPairs: [] }));
    }

    /*-----------------------------------------------------
      LIVE FX HUB
    -----------------------------------------------------*/
    function renderLiveGrid(){
        const grid = document.getElementById("fx-live-grid");
        const statusEl = document.getElementById("fx-live-status");
        if(!grid) return;
        loadCurrentSnapshot().then(snapshot => {
            const pairs = snapshot.pairs || [];
            if(!pairs.length){
                grid.innerHTML = `<p class="fx-empty-note">No FX snapshot is available yet. See docs/FX_PRICING_TREASURY.md for how a provider is configured and the first snapshot generated.</p>`;
                return;
            }
            grid.innerHTML = pairs.map(record => `
                <a class="fx-pair-card ${directionClass(record.direction)}" href="${pagePrefix()}pages/fx/pairs/${pairSlug(record.pair)}.html">
                    <span class="fx-pair-card-pair">${escapeHtml(record.pair)}</span>
                    <span class="fx-pair-card-rate">${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair)}</span>
                    <span class="fx-pair-card-change">${formatPercent(record.percentageChange)}</span>
                    ${statusBadge(record.dataStatus)}
                </a>
            `).join("");
            if(statusEl){
                const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleString("en-GB", { timeZone: "UTC", timeZoneName: "short" }) : "unavailable";
                statusEl.textContent = `Latest GPIR market snapshot generated: ${generated}. ${snapshot.providerUsed ? "Source: " + snapshot.providerUsed : "No provider configured for this snapshot."}`;
            }
        });
    }

    /*-----------------------------------------------------
      CURRENCY EXPLORER
    -----------------------------------------------------*/
    function renderExplorer(){
        const input = document.getElementById("fx-explorer-search");
        const results = document.getElementById("fx-explorer-results");
        if(!input || !results) return;

        Promise.all([loadCurrentSnapshot(), loadConfig()]).then(([snapshot]) => {
            const pairs = snapshot.pairs && snapshot.pairs.length ? snapshot.pairs : [];

            const render = (query) => {
                const normalized = query.trim().toUpperCase();
                const matches = !normalized ? pairs : pairs.filter(record =>
                    record.pair.includes(normalized) || record.base === normalized || record.quote === normalized
                );
                results.innerHTML = matches.length
                    ? matches.map(record => `
                        <li role="option"><a href="${pagePrefix()}pages/fx/pairs/${pairSlug(record.pair)}.html">
                            <span class="fx-pair-card-pair">${escapeHtml(record.pair)}</span>
                            <span class="fx-pair-card-rate">${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair)}</span>
                            <span class="fx-pair-card-change">${formatPercent(record.percentageChange)}</span>
                            ${statusBadge(record.dataStatus)}
                        </a></li>
                    `).join("")
                    : `<li class="fx-empty-note">No pair in the current GPIR FX universe matches "${escapeHtml(query)}".</li>`;
            };

            render("");
            input.addEventListener("input", () => render(input.value));
        });
    }

    /*-----------------------------------------------------
      TREASURY INTELLIGENCE (deterministic groupings)
    -----------------------------------------------------*/
    const GCC_MANAGED_CURRENCIES = new Set(["AED", "SAR", "QAR", "KWD", "BHD", "OMR"]);

    function classifyPair(record){
        if(GCC_MANAGED_CURRENCIES.has(record.base) || GCC_MANAGED_CURRENCIES.has(record.quote)){
            return "GCC pegged / managed currencies";
        }
        if(record.base === "INR" || record.quote === "INR"){
            return "INR corridor pairs";
        }
        if(record.base === "USD" || record.quote === "USD"){
            return "USD funding pairs";
        }
        return "Major crosses";
    }

    function renderTreasury(){
        const container = document.getElementById("fx-treasury-groups");
        if(!container) return;
        loadCurrentSnapshot().then(snapshot => {
            const pairs = snapshot.pairs || [];
            if(!pairs.length){
                container.innerHTML = `<p class="fx-empty-note">No FX snapshot is available yet for treasury groupings.</p>`;
                return;
            }
            const groups = new Map();
            pairs.forEach(record => {
                const group = classifyPair(record);
                if(!groups.has(group)) groups.set(group, []);
                groups.get(group).push(record);
            });
            container.innerHTML = Array.from(groups.entries()).map(([group, records]) => `
                <section class="fx-treasury-group">
                    <h2>${escapeHtml(group)}</h2>
                    <div class="fx-pair-grid">
                        ${records.map(record => `
                            <a class="fx-pair-card ${directionClass(record.direction)}" href="${pagePrefix()}pages/fx/pairs/${pairSlug(record.pair)}.html">
                                <span class="fx-pair-card-pair">${escapeHtml(record.pair)}</span>
                                <span class="fx-pair-card-rate">${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair)}</span>
                                <span class="fx-pair-card-change">${formatPercent(record.percentageChange)}</span>
                            </a>
                        `).join("")}
                    </div>
                </section>
            `).join("");
        });
    }

    /*-----------------------------------------------------
      WEEKLY TRENDS
    -----------------------------------------------------*/
    function renderWeekly(){
        const list = document.getElementById("fx-weekly-list");
        if(!list) return;
        Promise.all([
            fetchJson(dataPrefix() + "weekly-summary.json").catch(() => ({ summaries: [] })),
            loadCurrentSnapshot()
        ]).then(([data, snapshot]) => {
            const summaries = data.summaries || [];
            if(!summaries.length){
                list.innerHTML = `<p class="fx-empty-note">${buildingHistoryMessage(snapshot)}</p>`;
                return;
            }
            list.innerHTML = summaries.map(summary => `
                <a class="fx-weekly-card" href="${pagePrefix()}pages/fx/pairs/${pairSlug(summary.pair)}.html">
                    <span class="fx-pair-card-pair">${escapeHtml(summary.pair)}</span>
                    <span class="fx-weekly-completeness">${summary.dataCompleteness === "NO_DATA" ? "Building history" : escapeHtml(summary.dataCompleteness)}</span>
                    ${summary.weeklyChangePercent !== null ? `<span class="fx-pair-card-change">${formatPercent(summary.weeklyChangePercent)}</span>` : `<span class="fx-pair-card-change">—</span>`}
                    <p class="fx-weekly-statement">${summary.dataCompleteness === "NO_DATA" ? buildingHistoryMessage(snapshot) : escapeHtml((summary.statements || [])[0] || "Weekly observation pending.")}</p>
                </a>
            `).join("");
        });
    }

    /*-----------------------------------------------------
      HISTORICAL ARCHIVE
    -----------------------------------------------------*/
    function renderHistoricalDate(date){
        const detail = document.getElementById("fx-history-detail");
        if(!detail || !date) return;
        const [year, month] = date.split("-");
        detail.innerHTML = `<p class="fx-loading">Loading ${escapeHtml(date)}…</p>`;
        fetchJson(`${dataPrefix()}history/${year}/${month}/${date}.json`)
            .then(snapshot => {
                const pairs = snapshot.pairs || [];
                detail.innerHTML = `<h2>${escapeHtml(date)} — frozen daily snapshot</h2>
                    <div class="fx-pair-grid">${pairs.map(record => `
                        <span class="fx-pair-card fx-pair-card--static">
                            <span class="fx-pair-card-pair">${escapeHtml(record.pair)}</span>
                            <span class="fx-pair-card-rate">${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair)}</span>
                            ${statusBadge(record.dataStatus)}
                        </span>
                    `).join("")}</div>`;
            })
            .catch(() => {
                detail.innerHTML = `<p class="fx-empty-note">The archive for ${escapeHtml(date)} could not be loaded.</p>`;
            });
    }

    function initHistorical(){
        const nav = document.querySelector(".fx-history-nav");
        const detail = document.getElementById("fx-history-detail");
        if(!nav || !detail) return;
        nav.addEventListener("click", (event) => {
            const link = event.target.closest("[data-fx-history-date]");
            if(!link) return;
            event.preventDefault();
            renderHistoricalDate(link.getAttribute("data-fx-history-date"));
            history.replaceState(null, "", "#" + link.getAttribute("data-fx-history-date"));
        });
        const initialDate = window.location.hash.replace("#", "");
        if(initialDate) renderHistoricalDate(initialDate);
    }

    /*-----------------------------------------------------
      Lightweight dependency-free 7-day SVG sparkline.
    -----------------------------------------------------*/
    function buildSparkline(points){
        if(points.length < 2) return "";
        const values = points.map(point => point.rate);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const width = 280;
        const height = 56;
        const step = width / (points.length - 1);
        const coords = values.map((value, index) => {
            const x = index * step;
            const y = height - ((value - min) / range) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        return `<svg class="fx-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="7-day trend"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    /*-----------------------------------------------------
      PAIR DETAIL VIEW
    -----------------------------------------------------*/
    function renderPairDetail(){
        const container = document.querySelector('[data-fx-view="pair-detail"]');
        if(!container) return;
        const pair = container.getAttribute("data-fx-pair");

        Promise.all([loadCurrentSnapshot(), fetchJson(dataPrefix() + "weekly-summary.json").catch(() => ({ summaries: [] }))]).then(([snapshot, weeklyData]) => {
            const record = (snapshot.pairs || []).find(item => item.pair === pair);
            const summary = (weeklyData.summaries || []).find(item => item.pair === pair);

            if(!record){
                container.innerHTML = `<p class="fx-empty-note">No current snapshot data is available yet for ${escapeHtml(pair)}.</p>`;
                return;
            }

            const rate = Number.isFinite(record.mid) ? record.mid : record.last;
            const spread = Number.isFinite(record.bid) && Number.isFinite(record.ask) ? (record.ask - record.bid).toFixed(4) : "N/A";
            const rows = [
                ["LAST / MID", formatRate(rate, pair), ""],
                ["BID", formatRate(record.bid, pair), Number.isFinite(record.bid) ? "" : "fx-detail-row--unavailable"],
                ["ASK", formatRate(record.ask, pair), Number.isFinite(record.ask) ? "" : "fx-detail-row--unavailable"],
                ["SPREAD", spread, spread === "N/A" ? "fx-detail-row--unavailable" : ""],
                ["SPOT", formatRate(record.spot, pair), Number.isFinite(record.spot) ? "" : "fx-detail-row--unavailable"],
                ["TOM", formatRate(record.tom, pair), Number.isFinite(record.tom) ? "" : "fx-detail-row--unavailable"],
                ["CASH BUY", formatRate(record.cashBuy, pair), Number.isFinite(record.cashBuy) ? "" : "fx-detail-row--unavailable"],
                ["CASH SELL", formatRate(record.cashSell, pair), Number.isFinite(record.cashSell) ? "" : "fx-detail-row--unavailable"],
                ["Previous Business Day Close", record.previousBusinessDate ? `${formatRate(record.previousBusinessClose, pair)} (${escapeHtml(record.previousBusinessDate)})` : "—", record.previousBusinessDate ? "" : "fx-detail-row--pending"],
                ["Absolute Variance", Number.isFinite(record.absoluteChange) ? record.absoluteChange.toFixed(4) : "—", Number.isFinite(record.absoluteChange) ? "" : "fx-detail-row--pending"],
                ["Percentage Variance", formatPercent(record.percentageChange), Number.isFinite(record.percentageChange) ? "" : "fx-detail-row--pending"],
                ["Rate Type", record.rateType === "derived-cross" ? "Derived cross-rate" : "Provider-native", ""],
                ["Provider", record.provider || "None configured", ""],
                ["Timestamp (UTC)", record.timestamp ? new Date(record.timestamp).toISOString() : "N/A", ""],
                ["GPIR Retrieved", record.gpirRetrievedAt ? new Date(record.gpirRetrievedAt).toISOString() : "N/A", ""]
            ];

            const hasUnavailableMarketFields = [record.bid, record.ask, record.spot, record.tom, record.cashBuy, record.cashSell]
                .some(value => !Number.isFinite(value));
            const hasPendingVariance = !record.previousBusinessDate || !Number.isFinite(record.absoluteChange) || !Number.isFinite(record.percentageChange);

            const sourceLegsNote = record.rateType === "derived-cross" && Array.isArray(record.sourceLegs)
                ? `<p class="fx-source-legs">Derived from: ${record.sourceLegs.map(leg => escapeHtml(leg.pair)).join(" and ")} (${escapeHtml(record.provider)}). This is a GPIR-computed cross-rate, not a provider-native quote.</p>`
                : "";

            const sparklinePoints = summary && summary.dataCompleteness !== "NO_DATA"
                ? [{ rate: summary.weeklyStartLevel }, { rate: summary.latestRate }]
                : [];

            container.innerHTML = `
                <div class="fx-pair-detail-header">
                    <h2>${escapeHtml(pair)}</h2>
                    ${statusBadge(record.dataStatus)}
                </div>
                <table class="fx-detail-table"><tbody>
                    ${rows.map(([label, value, rowClass]) => `<tr${rowClass ? ` class="${rowClass}"` : ""}><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`).join("")}
                </tbody></table>
                ${hasUnavailableMarketFields ? `<p class="fx-data-note">Bid/Ask, Spot/TOM and Cash Buy/Sell are unavailable from the current reference-rate provider. These fields will populate when an authorised market-data source supporting them is configured.</p>` : ""}
                ${hasPendingVariance ? `<p class="fx-variance-note">Variance becomes available after the next valid business-day snapshot.</p>` : ""}
                ${sourceLegsNote}
                <section class="fx-weekly-section">
                    <h3>7-day trend</h3>
                    ${sparklinePoints.length ? buildSparkline(sparklinePoints) : `<p class="fx-empty-note">${buildingHistoryMessage(snapshot)}</p>`}
                    ${summary && summary.dataCompleteness !== "NO_DATA" ? `<p>${escapeHtml((summary.statements || [])[0] || "")}</p><p>${escapeHtml((summary.statements || [])[1] || "")}</p>` : ""}
                </section>
                <p class="fx-history-link"><a href="${pagePrefix()}pages/fx/historical.html">View the GPIR Historical Archive for this pair's past daily observations →</a></p>
            `;
        });
    }

    function init(){
        renderLiveGrid();
        renderExplorer();
        renderTreasury();
        renderWeekly();
        initHistorical();
        renderPairDetail();
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
