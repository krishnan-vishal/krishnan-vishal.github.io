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

    function formatRate(value, pair, inverse = false){
        if(!Number.isFinite(value)) return "N/A";
        if(inverse) return value.toFixed(6);
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

    function fetchJson(url, options){
        return fetch(url, options).then(response => {
            if(!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`);
            return response.json();
        });
    }

    function fetchMutableFxJson(fileName){
        return fetchJson(`${dataPrefix()}${fileName}?v=${Date.now()}`, { cache: "no-store" });
    }

    function loadCurrentSnapshot(){
        return fetchMutableFxJson("current.json").catch(() => ({ pairs: [], dataStatus: "UNAVAILABLE", generatedAt: null }));
    }

    function loadConfig(){
        return fetchJson(dataPrefix() + "fx-config.json").catch(() => ({ featuredPairs: [] }));
    }

    function loadCountryRegistry(){
        return fetchJson(dataPrefix() + "country-currency-registry.json").catch(() => ({ countries: [] }));
    }

    function regionCurrencyMapFromRegistry(registry, snapshot){
        const supported = new Set((snapshot.currencyUniverse && snapshot.currencyUniverse.currencies) || []);
        return (registry.countries || []).filter(country => country.enabled && supported.has(country.currencyCode)).reduce((regions, country) => {
            regions[country.region] = regions[country.region] || [];
            if(!regions[country.region].includes(country.currencyCode)) regions[country.region].push(country.currencyCode);
            return regions;
        }, {});
    }

    function referenceClassification(record){
        return record && (record.rateType === "derived-cross" || record.rateType === "derived-inverse")
            ? "DERIVED REFERENCE" : "DIRECT REFERENCE";
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

    function invertRecord(record, pair){
        const standardRate = Number.isFinite(record.mid) ? record.mid : record.last;
        if(!Number.isFinite(standardRate) || standardRate <= 0) return null;
        const rate = 1 / standardRate;
        const previousRate = Number.isFinite(record.previousBusinessClose) && record.previousBusinessClose > 0
            ? 1 / record.previousBusinessClose : null;
        const percentageChange = previousRate !== null
            ? ((rate - previousRate) / previousRate) * 100
            : Number.isFinite(record.percentageChange) && record.percentageChange > -100
                ? -record.percentageChange / (1 + record.percentageChange / 100) : null;
        const [base, quote] = pair.split("/");
        return { ...record, pair, base, quote, mid: rate, last: rate,
            bid: null, ask: null, spot: null, tom: null, cashBuy: null, cashSell: null,
            rateType: "derived-inverse", inverseOf: record.pair, isInverse: true,
            sourceLegs: [{ pair: record.pair, provider: record.provider }],
            previousBusinessClose: previousRate,
            absoluteChange: previousRate === null ? null : rate - previousRate,
            percentageChange,
            direction: percentageChange > 0 ? "up" : percentageChange < 0 ? "down"
                : percentageChange === 0 ? "unchanged" : null };
    }

    function findOrDeriveRecord(snapshot, pair){
        const direct = (snapshot.pairs || []).find(item => item.pair === pair);
        if(direct) return direct;
        const [base, quote] = pair.split("/");
        const reverse = (snapshot.pairs || []).find(item => item.pair === `${quote}/${base}`);
        return (reverse && invertRecord(reverse, pair)) || deriveUniverseRecord(snapshot, pair);
    }

    function pairHref(snapshot, pair){
        const isPublishedPair = Array.isArray(snapshot.featuredPairs)
            ? snapshot.featuredPairs.includes(pair)
            : (snapshot.pairs || []).some(item => item.pair === pair);
        return isPublishedPair
            ? `${pagePrefix()}pages/fx/pairs/${pairSlug(pair)}.html`
            : `${pagePrefix()}pages/fx/explorer.html?pair=${pair.replace("/", "-")}`;
    }

    function destinationRecord(snapshot, destination, sendingBases){
        for(const base of sendingBases){
            if(base === destination) continue;
            const record = findOrDeriveRecord(snapshot, `${base}/${destination}`);
            if(record) return record;
        }
        return null;
    }

    function currencyDisplayName(code){
        try{
            const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
            return name && name !== code ? `${name} / ${code}` : code;
        } catch(error){
            return code;
        }
    }

    /*-----------------------------------------------------
      LIVE FX HUB
    -----------------------------------------------------*/
    function renderLiveGrid(){
        const grid = document.getElementById("fx-live-grid");
        const statusEl = document.getElementById("fx-live-status");
        if(!grid) return;
        Promise.all([loadCurrentSnapshot(), loadConfig(), loadCountryRegistry()]).then(([snapshot, config, registry]) => {
            const pairs = snapshot.pairs || [];
            if(!pairs.length){
                grid.innerHTML = `<p class="fx-empty-note">No FX snapshot is available yet. See docs/FX_PRICING_TREASURY.md for how a provider is configured and the first snapshot generated.</p>`;
                return;
            }
            const sendingBases = config.treasurySendingBases || ["USD", "EUR", "GBP"];
            const registryRegions = regionCurrencyMapFromRegistry(registry, snapshot);
            const regions = Object.keys(registryRegions).length ? registryRegions : (config.regionCurrencyMap || {});
            const regionNames = Object.keys(regions);
            const recordsByRegion = new Map(regionNames.map(region => [region, (regions[region] || [])
                .map(destination => {
                    const record = destinationRecord(snapshot, destination, sendingBases);
                    const markets = (registry.countries || []).filter(country => country.enabled && country.region === region && country.currencyCode === destination);
                    return record ? { record, destination, markets } : null;
                }).filter(Boolean)]));
            const initialRegion = regionNames.includes("SOUTH ASIA") ? "SOUTH ASIA" : regionNames[0];
            grid.innerHTML = `<div class="fx-region-filters" role="group" aria-label="Filter FX markets by region">
                ${regionNames.map(region => `<button type="button" class="fx-region-filter${region === initialRegion ? " is-active" : ""}" data-fx-region="${escapeHtml(region)}"${recordsByRegion.get(region).length ? "" : " disabled title=\"No supported destination markets in the current snapshot\""}>${escapeHtml(region)}</button>`).join("")}
            </div>
            <div class="fx-market-regions"></div>`;
            const marketRegions = grid.querySelector(".fx-market-regions");
            const showRegion = region => {
                const records = recordsByRegion.get(region);
                marketRegions.innerHTML = !records.length ? "" : `<section class="fx-market-region" data-fx-market-region="${escapeHtml(region)}">
                    <h2>${escapeHtml(region)}</h2>
                    <div class="fx-market-table" role="table" aria-label="${escapeHtml(region)} FX market">
                        <div class="fx-market-row fx-market-row--head" role="row"><span>Destination pair</span><span>Rate</span><span>Prev-day Δ</span><span>Status</span></div>
                        ${records.map(({ record, destination, markets }) => `<a class="fx-market-row ${directionClass(record.direction)}" role="row" href="${pairHref(snapshot, record.pair)}" title="${escapeHtml(markets.map(market => market.country).join(", "))}">
                            <span class="fx-market-pair"><strong>${escapeHtml(record.pair)}</strong><small>${escapeHtml(currencyDisplayName(destination))}${markets.length > 1 ? ` · ${markets.length} markets` : ""}</small></span>
                            <span>${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair, record.isInverse)}</span>
                            <span class="fx-market-variance">${formatCardVariance(record.percentageChange)}</span>
                            <span>${escapeHtml(referenceClassification(record))}</span>
                        </a>`).join("")}
                    </div>
                </section>`;
            };
            grid.addEventListener("click", event => {
                const button = event.target.closest("[data-fx-region]");
                if(!button) return;
                grid.querySelectorAll("[data-fx-region]").forEach(item => item.classList.toggle("is-active", item === button));
                const selected = button.getAttribute("data-fx-region");
                showRegion(selected);
            });
            showRegion(initialRegion);
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

    function renderTreasury(){
        const container = document.getElementById("fx-treasury-groups");
        if(!container) return;
        Promise.all([loadCurrentSnapshot(), loadConfig(), loadCountryRegistry()]).then(([snapshot, config, registry]) => {
            const pairs = snapshot.pairs || [];
            if(!pairs.length){
                container.innerHTML = `<p class="fx-empty-note">No FX snapshot is available yet for treasury groupings.</p>`;
                return;
            }
            const sendingBases = Array.from(new Set(["USD", ...(config.treasurySendingBases || ["EUR", "GBP"]),
                ...Object.values(config.targetRegionalCurrencies || {}).flat()]));
            const registryRegions = regionCurrencyMapFromRegistry(registry, snapshot);
            const destinationMap = Object.keys(registryRegions).length ? registryRegions : (config.regionCurrencyMap || {});
            const destinations = Array.from(new Set(Object.values(destinationMap).flat()));
            if(!destinations.length) return;
            const initialDestination = destinations.includes("INR") ? "INR" : destinations[0];
            container.innerHTML = `<div class="fx-treasury-controls">
                <label for="fx-treasury-destination">Destination market</label>
                <select id="fx-treasury-destination">${destinations.map(code => `<option value="${code}"${code === initialDestination ? " selected" : ""}>${escapeHtml(currencyDisplayName(code))}</option>`).join("")}</select>
            </div><div data-fx-treasury-market></div>`;
            const market = container.querySelector("[data-fx-treasury-market]");
            const select = container.querySelector("#fx-treasury-destination");
            const showDestination = destination => {
                const records = sendingBases.filter(base => base !== destination)
                    .map(base => findOrDeriveRecord(snapshot, `${base}/${destination}`)).filter(Boolean);
                market.innerHTML = `<section class="fx-treasury-group">
                    <h2>${escapeHtml(currencyDisplayName(destination))}</h2>
                    <p class="fx-section-note">Configured regional sending currencies into this destination market. Reverse rates are calculated from validated references.</p>
                    <div class="fx-pair-grid">
                        ${records.map(record => `
                            <a class="fx-pair-card ${directionClass(record.direction)}" href="${pairHref(snapshot, record.pair)}">
                                <span class="fx-pair-card-pair">${escapeHtml(record.pair)}</span>
                                <span class="fx-pair-card-rate">${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair, record.isInverse)}</span>
                                <span class="fx-pair-card-change">${formatCardVariance(record.percentageChange)}</span>
                                ${record.isInverse ? `<span class="fx-data-note">Calculated inverse of ${escapeHtml(record.inverseOf)}</span>` : ""}
                            </a>
                        `).join("")}
                    </div>
                </section>`;
            };
            select.addEventListener("change", () => showDestination(select.value));
            showDestination(initialDestination);
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
            fetchMutableFxJson("weekly-summary.json").catch(() => ({ summaries: [] })),
            loadCurrentSnapshot()
        ]).then(([data, snapshot]) => {
            const summaries = data.summaries || [];
            if(!summaries.length){
                list.innerHTML = `<p class="fx-empty-note">${buildingHistoryMessage(snapshot, firstSnapshotDate)}</p>`;
                return;
            }
            const sinceDate = formatObservationDate(firstSnapshotDate || snapshot.publicationDate);
            list.innerHTML = summaries.map(summary => {
                const isBuilding = !Number.isFinite(summary.weeklyChangePercent);
                return `
                    <a class="fx-weekly-card ${directionClass(summary.direction)}" href="${pairHref(snapshot, summary.pair)}">
                        <span class="fx-pair-card-pair">${escapeHtml(summary.pair)}</span>
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
                            <span class="fx-pair-card-rate">${formatRate(Number.isFinite(record.mid) ? record.mid : record.last, record.pair, record.isInverse)}</span>
                            ${statusBadge(record.dataStatus)}
                        </span>
                    `).join("")}</div>`;
            })
            .catch(() => {
                detail.innerHTML = `<p class="fx-empty-note"><strong>NO VALIDATED OBSERVATION AVAILABLE</strong><br>${escapeHtml(date)} has no stored GPIR FX snapshot. No rate has been inferred or backfilled.</p>`;
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

    function hasValidatedPreviousClose(record){
        return Boolean(record && record.validationStatus === "VALIDATED" && record.previousBusinessDate &&
            Number.isFinite(record.previousBusinessClose) && Number.isFinite(record.percentageChange));
    }

    function recentFxWindow(asOfTimestamp){
        const asOf = Date.parse(asOfTimestamp || "");
        if(!Number.isFinite(asOf)) return null;
        const endDate = new Date(asOf).toISOString().slice(0, 10);
        const start = new Date(`${endDate}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - 6);
        return { startDate: start.toISOString().slice(0, 10), endDate };
    }

    function isWithinRecentFxWindow(date, asOfTimestamp){
        if(typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
        const parsedDate = Date.parse(`${date}T00:00:00Z`);
        if(!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== date) return false;
        const window = recentFxWindow(asOfTimestamp);
        return Boolean(window && date >= window.startDate && date <= window.endDate);
    }

    function filterRecentFxObservations(points, asOfTimestamp){
        const byDate = new Map();
        (Array.isArray(points) ? points : []).forEach(point => {
            if(!point || !Number.isFinite(point.rate) || point.rate <= 0 || !isWithinRecentFxWindow(point.date, asOfTimestamp)) return;
            byDate.set(point.date, { date: point.date, rate: point.rate });
        });
        return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date)).slice(-7);
    }

    function renderWeeklyEvidence(target, snapshot, pair, points){
        if(points.length < 2){
            target.innerHTML = `<p class="fx-availability-state">Insufficient validated observations in the trailing seven-day window. A trend requires at least two observed dates.</p>`;
            return;
        }
        const values = points.map(point => point.rate);
        const first = values[0];
        const last = values[values.length - 1];
        const change = ((last - first) / first) * 100;
        const completeWindow = points.length >= 5;
        const rows = points.map((point, index) => {
            const dailyChange = index ? ((point.rate - points[index - 1].rate) / points[index - 1].rate) * 100 : null;
            const sevenDayChange = completeWindow && index === points.length - 1 ? change : null;
            return `<tr><td>${escapeHtml(point.date)}</td><td>${formatRate(point.rate, pair)}</td><td>${formatPercent(dailyChange)}</td><td>${formatPercent(sevenDayChange)}</td></tr>`;
        }).join("");
        const movementLabel = completeWindow ? "7-day movement" : "Observed-period movement";
        target.innerHTML = `${buildSparkline(points)}<p>${movementLabel}: ${formatPercent(change)}. High ${formatRate(Math.max(...values), pair)} · low ${formatRate(Math.min(...values), pair)} across ${points.length} validated observation(s) within the trailing seven-day window.</p><div class="fx-history-table-wrap"><table class="fx-history-table"><thead><tr><th>Date</th><th>Rate</th><th>Daily Δ</th><th>7D Δ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function loadUniverseHistory(snapshot, pair){
        const asOfTimestamp = snapshot.generatedAt;
        const dates = (snapshot.historyDates || []).filter(date => isWithinRecentFxWindow(date, asOfTimestamp)).slice(-7);
        return Promise.all(dates.map(date => {
            const [year, month] = date.split("-");
            return fetchJson(`${dataPrefix()}history/${year}/${month}/${date}.json`).catch(() => null);
        })).then(items => {
            const observationsByBusinessDay = new Map();
            items.filter(Boolean).forEach(item => {
                const record = findOrDeriveRecord(item, pair);
                const observationDate = record && record.timestamp ? record.timestamp.slice(0, 10) : null;
                const rate = record && (Number.isFinite(record.mid) ? record.mid : record.last);
                if(record && record.validationStatus === "VALIDATED" && Number.isFinite(rate) && rate > 0 && isWithinRecentFxWindow(observationDate, asOfTimestamp)){
                    observationsByBusinessDay.set(observationDate, { date: observationDate, rate });
                }
            });
            const current = findOrDeriveRecord(snapshot, pair);
            const currentDate = current && current.timestamp ? current.timestamp.slice(0, 10) : null;
            const currentRate = current && (Number.isFinite(current.mid) ? current.mid : current.last);
            if(current && current.validationStatus === "VALIDATED" && Number.isFinite(currentRate) && currentRate > 0 && isWithinRecentFxWindow(currentDate, asOfTimestamp)){
                observationsByBusinessDay.set(currentDate, { date: currentDate, rate: currentRate });
            }
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
        const isValidated = record.validationStatus === "VALIDATED" && Number.isFinite(rate) && rate > 0;
        const hasVariance = hasValidatedPreviousClose(record);
        const observationTime = record.timestamp && Number.isFinite(Date.parse(record.timestamp))
            ? new Date(record.timestamp).toISOString() : "Unavailable";
        const pricingValue = value => Number.isFinite(value) ? formatRate(value, pair, record.isInverse) : "Not supplied by source";
        const spread = Number.isFinite(record.bid) && Number.isFinite(record.ask) ? record.ask - record.bid : null;
        const sourceLegsNote = record.rateType === "derived-inverse"
            ? `<p class="fx-source-legs">Calculated as 1 ÷ the validated ${escapeHtml(record.inverseOf)} reference rate. It is not a provider-native or executable quote.</p>`
            : record.rateType === "derived-cross" && Array.isArray(record.sourceLegs)
            ? `<p class="fx-source-legs">Deterministically derived from ${record.sourceLegs.map(leg => escapeHtml(leg.pair)).join(" and ")} using validated ${escapeHtml(record.provider)} common-base rates. It is not a provider-native or executable quote.</p>`
            : "";
        const lastValidatedNote = snapshot.dataStatus === "PROVIDER_UNAVAILABLE_SERVED_LAST_KNOWN_GOOD" || record.dataStatus === "STALE"
            ? `<p class="fx-data-note"><strong>Provider currently unavailable.</strong> Showing the last validated observation from ${record.timestamp ? escapeHtml(new Date(record.timestamp).toISOString()) : "the recorded snapshot"}.</p>`
            : "";
        const modules = ["Regional context", "Remittance", "Competition", "Treasury"].map(name =>
            `<section class="fx-pair-module"><div><h3>${name}</h3><span class="fx-availability-label">Not published</span></div><p>No validated pair-specific evidence is available in the current dataset.</p></section>`
        ).join("");
        container.innerHTML = `<section class="fx-pair-overview" aria-label="${escapeHtml(pair)} reference summary">
                <div class="fx-pair-detail-header">
                    <div class="fx-pair-identity"><span class="fx-pair-eyebrow">Currency pair</span><h2>${escapeHtml(pair)}</h2></div>
                    <div class="fx-pair-primary-rate"><span>Current validated reference rate</span><strong>${isValidated ? formatRate(rate, pair, record.isInverse) : "Unavailable"}</strong><span>${escapeHtml(record.quote || "Quote currency")} per ${escapeHtml(record.base || "base currency")}</span></div>
                    <div class="fx-pair-status">${statusBadge(record.dataStatus)}<span class="fx-reference-class">${escapeHtml(referenceClassification(record))}</span></div>
                </div>
                <dl class="fx-pair-metadata">
                    <div><dt>Provider / source</dt><dd>${escapeHtml(record.provider || "Unavailable")}</dd></div>
                    <div><dt>Observation (UTC)</dt><dd>${escapeHtml(observationTime)}</dd></div>
                    <div><dt>Source freshness</dt><dd>${escapeHtml(freshnessLabel(snapshot, record))}</dd></div>
                </dl>
            </section>
            ${lastValidatedNote}
            <div class="fx-pair-panels">
                <section class="fx-pair-panel" aria-labelledby="fx-previous-close-heading">
                    <h3 id="fx-previous-close-heading">Previous business day</h3>
                    ${hasVariance
                        ? `<dl class="fx-pair-metrics"><div><dt>Validated close</dt><dd>${formatRate(record.previousBusinessClose, pair, record.isInverse)}</dd></div><div><dt>Observed date</dt><dd>${escapeHtml(record.previousBusinessDate)}</dd></div><div><dt>Variance</dt><dd>${formatPercent(record.percentageChange)}</dd></div></dl>`
                        : `<p class="fx-availability-state">Unavailable until an earlier validated business-day close is recorded.</p>`}
                </section>
                <section class="fx-pair-panel" aria-labelledby="fx-pricing-heading">
                    <h3 id="fx-pricing-heading">Source pricing fields</h3>
                    <dl class="fx-pricing-grid">
                        ${[["Bid", record.bid], ["Ask", record.ask], ["Spread", spread], ["Spot", record.spot], ["Tom", record.tom], ["Cash buy", record.cashBuy], ["Cash sell", record.cashSell]].map(([label, value]) => `<div><dt>${label}</dt><dd>${pricingValue(value)}</dd></div>`).join("")}
                    </dl>
                    <p class="fx-pair-footnote">Only fields supplied by the attributed source are shown; reference rates are not executable quotes.</p>
                </section>
            </div>
            ${sourceLegsNote}
            <section class="fx-pair-panel fx-weekly-section" aria-labelledby="fx-weekly-heading"><h3 id="fx-weekly-heading">Seven-day evidence</h3><div data-fx-weekly-evidence><p class="fx-loading">Checking validated observations…</p></div></section>
            <section class="fx-pair-modules" aria-label="Pair-specific intelligence availability">
                <h3>Pair-specific intelligence</h3>
                <div class="fx-pair-module-grid">${modules}</div>
            </section>
            <p class="fx-methodology-note"><strong>Methodology:</strong> Direct references reproduce a validated provider common-base rate. Derived references divide two validated rates sharing that base or invert one validated pair. Variance and trends use only earlier validated GPIR business-day observations; missing days are not interpolated.</p>
            <p class="fx-history-link"><a href="${pagePrefix()}pages/fx/historical.html">View immutable GPIR Historical observations →</a></p>`;
        const weeklyTarget = container.querySelector("[data-fx-weekly-evidence]");
        const asOfTimestamp = snapshot.generatedAt || record.timestamp;
        const summaryPoints = filterRecentFxObservations(summary && summary.observations, asOfTimestamp);
        if(summaryPoints.length >= 2) renderWeeklyEvidence(weeklyTarget, snapshot, pair, summaryPoints);
        else loadUniverseHistory(snapshot, pair).then(points => renderWeeklyEvidence(weeklyTarget, snapshot, pair, filterRecentFxObservations(points, asOfTimestamp)));
    }

    function renderPairDetail(){
        const container = document.querySelector('[data-fx-view="pair-detail"]');
        if(!container) return;
        document.body.classList.add("fx-pair-detail-page");
        const pair = container.getAttribute("data-fx-pair");
        Promise.all([loadCurrentSnapshot(), fetchMutableFxJson("weekly-summary.json").catch(() => ({ summaries: [] }))]).then(([snapshot, weeklyData]) => {
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

    if(typeof document === "undefined"){
        if(typeof module !== "undefined" && module.exports) module.exports = { invertRecord, findOrDeriveRecord, formatRate, hasValidatedPreviousClose, isWithinRecentFxWindow, filterRecentFxObservations };
        return;
    }
    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
