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

    function formatCardVariance(value){
        return Number.isFinite(value) ? formatPercent(value) : "Variance pending";
    }

    function formatObservationDate(value){
        if(!value) return "the first published snapshot";
        const date = new Date(`${value}T00:00:00Z`);
        if(isNaN(date.getTime())) return escapeHtml(value);
        return date.toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
        }).replace("Sept", "Sep");
    }

    function buildingHistoryMessage(snapshot, firstSnapshotDate){
        return `Building observation history — first GPIR snapshot published ${formatObservationDate(firstSnapshotDate || (snapshot && snapshot.publicationDate))}.`;
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

    function referenceClassification(record){
        return record && record.rateType === "derived-cross" ? "DERIVED REFERENCE" : "DIRECT REFERENCE";
    }

    function deriveUniverseRecord(snapshot, pair, ratesOverride){
        const universe = snapshot && snapshot.currencyUniverse;
        if(!universe || universe.validationStatus !== "VALIDATED" || !universe.rates) return null;
        const [base, quote] = pair.split("/");
        const rates = ratesOverride || universe.rates;
        const baseRate = rates[base];
        const quoteRate = rates[quote];
        if(!Number.isFinite(baseRate) || !Number.isFinite(quoteRate) || base === quote) return null;
        const rate = quoteRate / baseRate;
        const direct = base === universe.commonBase;
        const previousRates = ratesOverride ? null : universe.previousBusinessRates;
        const previousRate = previousRates && Number.isFinite(previousRates[base]) && Number.isFinite(previousRates[quote])
            ? previousRates[quote] / previousRates[base]
            : null;
        const absoluteChange = Number.isFinite(previousRate) ? rate - previousRate : null;
        const percentageChange = Number.isFinite(previousRate) && previousRate !== 0 ? (absoluteChange / previousRate) * 100 : null;
        return {
            pair, base, quote, mid: rate, last: rate,
            bid: null, ask: null, spot: null, tom: null, cashBuy: null, cashSell: null,
            timestamp: universe.timestamp,
            providerRetrievedAt: universe.providerRetrievedAt,
            gpirRetrievedAt: universe.gpirRetrievedAt,
            provider: universe.provider,
            providerType: universe.providerType,
            rateType: direct ? "provider-native" : "derived-cross",
            sourceLegs: direct ? null : [
                { pair: `${universe.commonBase}/${base}`, provider: universe.provider },
                { pair: `${universe.commonBase}/${quote}`, provider: universe.provider }
            ],
            previousBusinessDate: previousRate === null ? null : universe.previousBusinessDate,
            previousBusinessClose: previousRate,
            absoluteChange,
            percentageChange,
            direction: absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : absoluteChange === 0 ? "unchanged" : null,
            dataStatus: universe.dataStatus === "STALE" ? "STALE" : "REFERENCE",
            validationStatus: "VALIDATED",
            anomalies: []
        };
    }

    function findOrDeriveRecord(snapshot, pair){
        return (snapshot.pairs || []).find(item => item.pair === pair) || deriveUniverseRecord(snapshot, pair);
    }

    /*-----------------------------------------------------
      LIVE FX HUB
    -----------------------------------------------------*/
    function renderLiveGrid(){
        const grid = document.getElementById("fx-live-grid");
        const statusEl = document.getElementById("fx-live-status");
        if(!grid) return;
        Promise.all([loadCurrentSnapshot(), loadConfig()]).then(([snapshot, config]) => {
            const pairs = snapshot.pairs || [];
            if(!pairs.length){
                grid.innerHTML = `<p class="fx-empty-note">No FX snapshot is available yet. See docs/FX_PRICING_TREASURY.md for how a provider is configured and the first snapshot generated.</p>`;
                return;
            }
            const recordsByPair = new Map(pairs.map(record => [record.pair, record]));
            const regions = config.marketRegions || { GLOBAL: pairs.map(record => record.pair) };
            const regionNames = Object.keys(regions);
            grid.innerHTML = `<div class="fx-region-filters" role="group" aria-label="Filter FX markets by region">
                <button type="button" class="fx-region-filter is-active" data-fx-region="ALL">ALL</button>
                ${regionNames.map(region => `<button type="button" class="fx-region-filter" data-fx-region="${escapeHtml(region)}"${(regions[region] || []).some(pair => recordsByPair.has(pair)) ? "" : " disabled title=\"No curated market pairs in the current snapshot\""}>${escapeHtml(region)}</button>`).join("")}
            </div>
            <div class="fx-market-regions">${regionNames.map(region => {
                const records = (regions[region] || []).map(pair => recordsByPair.get(pair)).filter(Boolean);
                if(!records.length) return "";
                return `<section class="fx-market-region" data-fx-market-region="${escapeHtml(region)}">
                    <h2>${escapeHtml(region)}</h2>
                    <div class="fx-market-table" role="table" aria-label="${escapeHtml(region)} FX market">
                        <div class="fx-market-row fx-market-row--head" role="row"><span>Pair</span><span>Rate</span><span>Prev-day Δ</span><span>Status</span></div>
                        ${records.map(record => `<a class="fx-market-row ${directionClass(record.direction)}" role="row" href="${pagePrefix()}pages/fx/pairs/${pairSlug(record.pair)}.html">
                            <strong>${escapeHtml(record.pair)}</strong>
                            <span>${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair)}</span>
                            <span class="fx-market-variance">${formatCardVariance(record.percentageChange)}</span>
                            <span>${escapeHtml(referenceClassification(record))}</span>
                        </a>`).join("")}
                    </div>
                </section>`;
            }).join("")}</div>`;
            grid.addEventListener("click", event => {
                const button = event.target.closest("[data-fx-region]");
                if(!button) return;
                grid.querySelectorAll("[data-fx-region]").forEach(item => item.classList.toggle("is-active", item === button));
                const selected = button.getAttribute("data-fx-region");
                grid.querySelectorAll("[data-fx-market-region]").forEach(section => {
                    section.hidden = selected !== "ALL" && section.getAttribute("data-fx-market-region") !== selected;
                });
            });
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
        const baseSelect = document.getElementById("fx-explorer-base");
        const quoteSelect = document.getElementById("fx-explorer-quote");
        const form = document.getElementById("fx-explorer-form");
        const detail = document.getElementById("fx-explorer-detail");
        if(!baseSelect || !quoteSelect || !form || !detail) return;

        loadCurrentSnapshot().then(snapshot => {
            const universe = snapshot.currencyUniverse;
            const currencies = universe && Array.isArray(universe.currencies)
                ? universe.currencies
                : Array.from(new Set((snapshot.pairs || []).flatMap(record => [record.base, record.quote]))).sort();
            if(!currencies.length){
                detail.innerHTML = `<p class="fx-empty-note">No validated currency universe is available in the current snapshot.</p>`;
                return;
            }
            const options = currencies.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join("");
            baseSelect.innerHTML = options;
            quoteSelect.innerHTML = options;
            const requested = new URLSearchParams(window.location.search).get("pair");
            const [requestedBase, requestedQuote] = requested && /^[A-Z]{3}-[A-Z]{3}$/.test(requested) ? requested.split("-") : ["USD", "INR"];
            baseSelect.value = currencies.includes(requestedBase) ? requestedBase : currencies[0];
            quoteSelect.value = currencies.includes(requestedQuote) ? requestedQuote : currencies.find(code => code !== baseSelect.value) || currencies[0];

            const show = () => {
                if(baseSelect.value === quoteSelect.value){
                    detail.innerHTML = `<p class="fx-empty-note">Choose two different currencies.</p>`;
                    return;
                }
                const pair = `${baseSelect.value}/${quoteSelect.value}`;
                history.replaceState(null, "", `?pair=${baseSelect.value}-${quoteSelect.value}`);
                renderPairIntelligence(detail, snapshot, pair, null);
            };
            form.addEventListener("submit", event => { event.preventDefault(); show(); });
            show();
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
                                <span class="fx-pair-card-change">${formatCardVariance(record.percentageChange)}</span>
                                ${statusBadge(record.dataStatus)}
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
        const firstSnapshotDate = list.getAttribute("data-fx-first-snapshot-date");
        Promise.all([
            fetchJson(dataPrefix() + "weekly-summary.json").catch(() => ({ summaries: [] })),
            loadCurrentSnapshot()
        ]).then(([data, snapshot]) => {
            const summaries = data.summaries || [];
            if(!summaries.length){
                list.innerHTML = `<p class="fx-empty-note">${buildingHistoryMessage(snapshot, firstSnapshotDate)}</p>`;
                return;
            }
            const recordsByPair = new Map((snapshot.pairs || []).map(record => [record.pair, record]));
            const sinceDate = formatObservationDate(firstSnapshotDate || snapshot.publicationDate);
            list.innerHTML = summaries.map(summary => {
                const record = recordsByPair.get(summary.pair);
                const isBuilding = !Number.isFinite(summary.weeklyChangePercent);
                return `
                    <a class="fx-weekly-card ${directionClass(summary.direction)}" href="${pagePrefix()}pages/fx/pairs/${pairSlug(summary.pair)}.html">
                        <span class="fx-pair-card-pair">${escapeHtml(summary.pair)}</span>
                        ${statusBadge(record && record.dataStatus)}
                        <span class="fx-weekly-completeness">${isBuilding ? "Building history" : `7D ${formatPercent(summary.weeklyChangePercent)}`}</span>
                        ${isBuilding
                            ? `<p class="fx-weekly-statement">Since ${sinceDate}</p>`
                            : `<p class="fx-weekly-metrics">High ${formatRate(summary.high, summary.pair)} · Low ${formatRate(summary.low, summary.pair)}</p>`}
                    </a>`;
            }).join("");
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
    function freshnessLabel(snapshot, record){
        if(!record.timestamp || !snapshot.generatedAt) return "Unavailable";
        const ageHours = Math.max(0, (Date.parse(snapshot.generatedAt) - Date.parse(record.timestamp)) / 3600000);
        return `${ageHours.toFixed(1)} hours old at snapshot generation`;
    }

    function renderWeeklyEvidence(target, snapshot, pair, points){
        if(points.length < 2){
            target.innerHTML = `<p class="fx-empty-note">${buildingHistoryMessage(snapshot, null)}</p>`;
            return;
        }
        const values = points.map(point => point.rate);
        const first = values[0];
        const last = values[values.length - 1];
        const change = ((last - first) / first) * 100;
        target.innerHTML = `${buildSparkline(points)}<p>7-day movement: ${formatPercent(change)}. Weekly high ${formatRate(Math.max(...values), pair)} · low ${formatRate(Math.min(...values), pair)} across ${points.length} genuine GPIR observation(s).</p>`;
    }

    function loadUniverseHistory(snapshot, pair){
        const dates = (snapshot.historyDates || []).slice(-7);
        return Promise.all(dates.map(date => {
            const [year, month] = date.split("-");
            return fetchJson(`${dataPrefix()}history/${year}/${month}/${date}.json`).catch(() => null);
        })).then(items => {
            const observationsByBusinessDay = new Map();
            items.filter(Boolean).forEach(item => {
                const record = deriveUniverseRecord(item, pair);
                const observationDate = record && record.timestamp ? record.timestamp.slice(0, 10) : null;
                if(record && observationDate && Number.isFinite(record.mid)) observationsByBusinessDay.set(observationDate, { date: observationDate, rate: record.mid });
            });
            const current = deriveUniverseRecord(snapshot, pair);
            const currentDate = current && current.timestamp ? current.timestamp.slice(0, 10) : null;
            if(current && currentDate && Number.isFinite(current.mid)) observationsByBusinessDay.set(currentDate, { date: currentDate, rate: current.mid });
            return Array.from(observationsByBusinessDay.values()).sort((left, right) => left.date.localeCompare(right.date)).slice(-7);
        });
    }

    function renderPairIntelligence(container, snapshot, pair, summary){
        const record = findOrDeriveRecord(snapshot, pair);
        if(!record){
            container.innerHTML = `<p class="fx-empty-note">No validated common-base data is available for ${escapeHtml(pair)}.</p>`;
            return;
        }
        const rate = Number.isFinite(record.mid) ? record.mid : record.last;
        const spread = Number.isFinite(record.bid) && Number.isFinite(record.ask) ? (record.ask - record.bid).toFixed(4) : "N/A";
        const hasPendingVariance = !record.previousBusinessDate || !Number.isFinite(record.percentageChange);
        const rows = [
            ["CURRENT REFERENCE RATE", formatRate(rate, pair), ""],
            ["PREVIOUS BUSINESS DAY", record.previousBusinessDate ? `${formatRate(record.previousBusinessClose, pair)} (${escapeHtml(record.previousBusinessDate)})` : "Variance pending", hasPendingVariance ? "fx-detail-row--pending" : ""],
            ["PREV-DAY VARIANCE", Number.isFinite(record.percentageChange) ? formatPercent(record.percentageChange) : "Variance pending", hasPendingVariance ? "fx-detail-row--pending" : ""],
            ["CLASSIFICATION", referenceClassification(record), ""],
            ["PROVIDER / SOURCE", record.provider || "None configured", ""],
            ["OBSERVATION (UTC)", record.timestamp ? new Date(record.timestamp).toISOString() : "N/A", ""],
            ["SOURCE FRESHNESS", freshnessLabel(snapshot, record), ""],
            ["BID", formatRate(record.bid, pair), Number.isFinite(record.bid) ? "" : "fx-detail-row--unavailable"],
            ["ASK", formatRate(record.ask, pair), Number.isFinite(record.ask) ? "" : "fx-detail-row--unavailable"],
            ["SPREAD", spread, spread === "N/A" ? "fx-detail-row--unavailable" : ""],
            ["SPOT", formatRate(record.spot, pair), Number.isFinite(record.spot) ? "" : "fx-detail-row--unavailable"],
            ["TOM", formatRate(record.tom, pair), Number.isFinite(record.tom) ? "" : "fx-detail-row--unavailable"],
            ["CASH BUY / SELL", `${formatRate(record.cashBuy, pair)} / ${formatRate(record.cashSell, pair)}`, Number.isFinite(record.cashBuy) && Number.isFinite(record.cashSell) ? "" : "fx-detail-row--unavailable"]
        ];
        const sourceLegsNote = record.rateType === "derived-cross" && Array.isArray(record.sourceLegs)
            ? `<p class="fx-source-legs">Deterministically derived from ${record.sourceLegs.map(leg => escapeHtml(leg.pair)).join(" and ")} using validated ${escapeHtml(record.provider)} common-base rates. It is not a provider-native or executable quote.</p>`
            : "";
        container.innerHTML = `<div class="fx-pair-detail-header"><h2>${escapeHtml(pair)}</h2><span class="fx-reference-class">${referenceClassification(record)}</span></div>
            <table class="fx-detail-table"><tbody>${rows.map(([label, value, rowClass]) => `<tr${rowClass ? ` class="${rowClass}"` : ""}><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`).join("")}</tbody></table>
            <p class="fx-data-note">Bid/Ask, Spot/TOM and Cash pricing appear only when the authorised source genuinely supplies them. No executable price is inferred from reference or cross-rate data.</p>
            ${hasPendingVariance ? `<p class="fx-variance-note">Variance pending until an earlier validated GPIR business-day observation exists.</p>` : ""}
            ${sourceLegsNote}
            <section class="fx-weekly-section"><h3>7-day trend</h3><div data-fx-weekly-evidence><p class="fx-loading">Loading validated observations…</p></div></section>
            <section class="fx-future-modules" aria-label="Future FX intelligence modules">
                ${["REGIONAL CONTEXT", "CONSUMER / REMITTANCE INTELLIGENCE", "COMPETITION INTELLIGENCE", "TREASURY INTELLIGENCE"].map(name => `<div data-fx-module="${escapeHtml(name.toLowerCase().replace(/[^a-z]+/g, "-"))}"><h3>${escapeHtml(name)}</h3><p>Data hook reserved. No intelligence is published in this module yet.</p></div>`).join("")}
            </section>
            <p class="fx-methodology-note"><strong>Methodology:</strong> Direct references reproduce a validated provider common-base rate. Derived references divide two validated rates sharing that base. Variance and trends use only earlier validated GPIR business-day observations; missing days are not interpolated.</p>
            <p class="fx-history-link"><a href="${pagePrefix()}pages/fx/historical.html">View immutable GPIR Historical observations →</a></p>`;
        const weeklyTarget = container.querySelector("[data-fx-weekly-evidence]");
        const summaryPoints = summary && Array.isArray(summary.observations) ? summary.observations.filter(point => Number.isFinite(point.rate)) : [];
        if(summaryPoints.length) renderWeeklyEvidence(weeklyTarget, snapshot, pair, summaryPoints);
        else loadUniverseHistory(snapshot, pair).then(points => renderWeeklyEvidence(weeklyTarget, snapshot, pair, points));
    }

    function renderPairDetail(){
        const container = document.querySelector('[data-fx-view="pair-detail"]');
        if(!container) return;
        const pair = container.getAttribute("data-fx-pair");
        Promise.all([loadCurrentSnapshot(), fetchJson(dataPrefix() + "weekly-summary.json").catch(() => ({ summaries: [] }))]).then(([snapshot, weeklyData]) => {
            renderPairIntelligence(container, snapshot, pair, (weeklyData.summaries || []).find(item => item.pair === pair));
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
