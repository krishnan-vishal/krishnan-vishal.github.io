/* Public, read-only FX archive reader. The service-role key never enters this file. */
(function(root){
    "use strict";

    const API_URL = "https://qlnvhfapctcpzqyuhhth.supabase.co/rest/v1/fx_historical_archive";
    const PUBLISHABLE_KEY = "sb_publishable_WXg6w9pZIWatIraPV1mUVQ_JAUZ7PQ6";
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 100;
    const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const PAIR_PATTERN = /^[A-Z]{3}\/[A-Z]{3}$/;

    function normalizeRows(input, cutoffMs, nowMs){
        if(!Array.isArray(input)) throw new Error("FX archive returned an invalid payload");
        return input.map(row => {
            const timestampMs = Date.parse(row && row.timestamp);
            const pair = `${row && row.base_currency}/${row && row.target_currency}`;
            const rate = Number(row && row.rate);
            if(!PAIR_PATTERN.test(pair) || !Number.isFinite(timestampMs) || timestampMs < cutoffMs ||
                timestampMs > nowMs || !Number.isFinite(rate) || rate <= 0) return null;
            return {
                pair,
                timestamp: new Date(timestampMs).toISOString(),
                rate,
                region: String(row.region || "GLOBAL"),
                source: String(row.source || "UNKNOWN"),
                id: Number(row.id) || 0
            };
        }).filter(Boolean).sort((left, right) =>
            left.timestamp.localeCompare(right.timestamp) || left.id - right.id);
    }

    async function fetchSevenDays(fetchImpl = root.fetch, now = new Date()){
        const nowMs = now.getTime();
        const cutoffMs = nowMs - WINDOW_MS;
        const rows = [];
        for(let page = 0; page < MAX_PAGES; page++){
            const url = new URL(API_URL);
            url.searchParams.set("select", "id,timestamp,base_currency,target_currency,rate,region,source");
            url.searchParams.append("timestamp", `gte.${new Date(cutoffMs).toISOString()}`);
            url.searchParams.append("timestamp", `lte.${now.toISOString()}`);
            url.searchParams.set("order", "timestamp.asc,id.asc");
            url.searchParams.set("limit", String(PAGE_SIZE));
            url.searchParams.set("offset", String(page * PAGE_SIZE));
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            let response;
            try{
                const headers = new Headers();
                headers.set("apikey", PUBLISHABLE_KEY);
                headers.set("Accept", "application/json");
                response = await fetchImpl(url.toString(), {
                    headers,
                    cache: "no-store",
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeout);
            }
            if(!response.ok) throw new Error(`FX archive API returned HTTP ${response.status}`);
            const batch = await response.json();
            if(!Array.isArray(batch)) throw new Error("FX archive API returned an invalid payload");
            rows.push(...batch);
            if(batch.length < PAGE_SIZE) return normalizeRows(rows, cutoffMs, nowMs);
        }
        throw new Error("FX archive exceeded the bounded seven-day page limit");
    }

    function groupByPair(rows){
        const groups = new Map();
        rows.forEach(row => {
            if(!groups.has(row.pair)) groups.set(row.pair, []);
            groups.get(row.pair).push(row);
        });
        return groups;
    }

    function expandBidirectionalRows(rows){
        const recorded = new Set(rows.map(row => `${row.pair}|${row.timestamp}`));
        const result = rows.slice();
        rows.forEach(row => {
            const [base, target] = row.pair.split("/");
            const inversePair = `${target}/${base}`;
            if(recorded.has(`${inversePair}|${row.timestamp}`)) return;
            result.push({ ...row, pair: inversePair, rate: 1 / row.rate,
                inverseOf: row.pair });
        });
        return result.sort((left, right) =>
            left.timestamp.localeCompare(right.timestamp) || left.id - right.id);
    }

    function pairStats(points){
        if(!points.length) return null;
        const first = points[0].rate;
        const latest = points[points.length - 1].rate;
        return {
            latest,
            delta: latest - first,
            deltaPercent: ((latest - first) / first) * 100,
            high: Math.max(...points.map(point => point.rate)),
            low: Math.min(...points.map(point => point.rate)),
            observations: points.length
        };
    }

    function distinctTimestamps(rows){
        return [...new Set(rows.map(row => row.timestamp))].sort().reverse();
    }

    function normalizePair(value){
        if(typeof value !== "string") return "";
        const match = value.trim().toUpperCase().match(/^([A-Z]{3})[-/]([A-Z]{3})$/);
        return match && match[1] !== match[2] ? `${match[1]}/${match[2]}` : "";
    }

    function filterRows(rows, pair = "", sendingBase = ""){
        if(pair) return rows.filter(row => row.pair === pair);
        return rows.filter(row => !sendingBase || row.pair.startsWith(`${sendingBase}/`));
    }

    function setPairQuery(pair){
        const url = new URL(root.location.href);
        if(pair) url.searchParams.set("pair", pair.replace("/", "-"));
        else url.searchParams.delete("pair");
        root.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    function pairViewHref(view, pair){
        const pages = { explorer: "explorer", weekly: "weekly", historical: "historical" };
        if(!pages[view]) throw new Error(`Unknown FX view: ${view}`);
        return `${pages[view]}.html?pair=${encodeURIComponent(pair.replace("/", "-"))}`;
    }

    function renderPairLinks(container, pair, currentView){
        if(!container) return;
        container.replaceChildren();
        if(!pair) return;
        const views = [
            ["explorer", "Currency Explorer"],
            ["weekly", "Weekly Trends"],
            ["historical", "Historical"]
        ];
        views.filter(([view]) => view !== currentView).forEach(([view, label]) => {
            const link = document.createElement("a");
            link.href = pairViewHref(view, pair);
            link.textContent = `${pair} · ${label}`;
            container.appendChild(link);
        });
    }

    function appendText(parent, tag, className, value){
        const element = document.createElement(tag);
        if(className) element.className = className;
        element.textContent = value;
        parent.appendChild(element);
        return element;
    }

    function displayRate(rate, pair, inverse){
        if(!Number.isFinite(rate)) return "N/A";
        if(inverse) return rate.toFixed(6);
        const decimals = pair && (pair.startsWith("JPY/") || pair.endsWith("/JPY")) ? 2 : 4;
        return rate.toFixed(decimals);
    }

    function displayDelta(rate, pair, inverse){
        const sign = rate > 0 ? "+" : "";
        return `${sign}${displayRate(rate, pair, inverse)}`;
    }

    function renderCards(grid, selectedRows, allRows, sendingBase = "", selectedPair = ""){
        grid.replaceChildren();
        const allPairs = groupByPair(filterRows(allRows, selectedPair, sendingBase));
        const selectedPairs = groupByPair(selectedRows);
        if(!allPairs.size){
            appendText(grid, "p", "fx-empty-note", selectedPair
                ? `No validated observations for ${selectedPair} in the available seven-day archive.`
                : "No validated FX rows are available for this period.");
            return;
        }
        [...allPairs.keys()].sort().forEach(pair => {
            const pairRows = selectedPairs.get(pair) || [];
            const current = pairRows[pairRows.length - 1];
            const allPairRows = allPairs.get(pair);
            const latest = allPairRows[allPairRows.length - 1];
            const stats = pairStats(allPairRows);
            const inverse = Boolean(latest.inverseOf);
            const card = document.createElement("article");
            card.className = `fx-weekly-card ${stats.delta > 0 ? "fx-up" : stats.delta < 0 ? "fx-down" : "fx-unchanged"}`;
            appendText(card, "h3", "fx-pair-card-pair", pair);
            appendText(card, "p", "fx-pair-card-rate", current
                ? `Capture ${displayRate(current.rate, pair, Boolean(current.inverseOf))}`
                : "No rate in selected capture");
            appendText(card, "p", "fx-weekly-completeness", stats.observations > 1
                ? `7D ${stats.delta > 0 ? "▲" : stats.delta < 0 ? "▼" : "—"} ${stats.deltaPercent > 0 ? "+" : ""}${stats.deltaPercent.toFixed(2)}% (${displayDelta(stats.delta, pair, inverse)})`
                : "7D variance unavailable · one capture");
            appendText(card, "p", "fx-weekly-metrics", `High ${displayRate(stats.high, pair, inverse)} · Low ${displayRate(stats.low, pair, inverse)}`);
            appendText(card, "p", "fx-data-note", `${latest.region} · ${latest.source} · ${latest.timestamp}${latest.inverseOf ? ` · Calculated inverse of ${latest.inverseOf}` : ""}`);
            grid.appendChild(card);
        });
    }

    async function loadStaticFallback(fetchImpl, now){
        const response = await fetchImpl(`../../assets/data/fx/hourly-archive.json?v=${Date.now()}`, { cache: "no-store" });
        if(!response.ok) throw new Error("No validated static FX archive is available");
        const archive = await response.json();
        const rows = (Array.isArray(archive.captures) ? archive.captures : []).flatMap(capture =>
            (Array.isArray(capture.pairs) ? capture.pairs : []).map(item => {
                const [base_currency, target_currency] = String(item.pair || "").split("/");
                return { timestamp: capture.hour, base_currency, target_currency,
                    rate: item.rate, region: item.region, source: item.source };
            }));
        return normalizeRows(rows, now.getTime() - WINDOW_MS, now.getTime());
    }

    async function init(){
        const grid = document.getElementById("dynamic-ticker-grid");
        if(!grid) return;
        const view = grid.closest("[data-fx-public-view]").getAttribute("data-fx-public-view");
        const status = document.getElementById("fx-public-status");
        const selector = document.getElementById("fx-hourly-select");
        const sendingSelect = document.getElementById("fx-sending-base-select");
        const pairSelect = document.getElementById("fx-pair-select");
        const pairLinks = document.getElementById("fx-pair-context-links");
        if(!pairSelect) return;
        const now = new Date();
        let rows;
        try{
            rows = await fetchSevenDays(root.fetch.bind(root), now);
            if(!rows.length) throw new Error("No publicly readable FX archive rows");
            status.textContent = "Public Supabase archive · last seven days · UTC";
        } catch(error){
            try{
                rows = await loadStaticFallback(root.fetch.bind(root), now);
                if(!rows.length) throw new Error("No recent static FX archive rows");
                status.textContent = "Last validated GPIR archive · public API unavailable";
            } catch(fallbackError){
                status.textContent = "FX archive unavailable; no rates have been inferred.";
                return;
            }
        }
        rows = expandBidirectionalRows(rows);
        const requestedPair = normalizePair(new URLSearchParams(root.location.search).get("pair"));
        const availablePairs = [...new Set(rows.map(row => row.pair))].sort();
        pairSelect.replaceChildren();
        const allPairsOption = document.createElement("option");
        allPairsOption.value = "";
        allPairsOption.textContent = "All currency pairs";
        pairSelect.appendChild(allPairsOption);
        [...new Set([...availablePairs, ...(requestedPair ? [requestedPair] : [])])].sort().forEach(pair => {
            const option = document.createElement("option");
            option.value = pair;
            option.textContent = pair;
            pairSelect.appendChild(option);
        });
        pairSelect.value = requestedPair;
        renderPairLinks(pairLinks, requestedPair, view);
        [...new Set(rows.map(row => row.pair.split("/")[0]))].sort().forEach(base => {
            const option = document.createElement("option");
            option.value = base;
            option.textContent = base;
            sendingSelect.appendChild(option);
        });
        const renderCurrent = () => {
            const selectedPair = pairSelect.value;
            sendingSelect.disabled = Boolean(selectedPair);
            renderPairLinks(pairLinks, selectedPair, view);
            renderCards(grid,
                view === "weekly" ? rows : rows.filter(row => row.timestamp === selector.value),
                rows, selectedPair ? "" : sendingSelect.value, selectedPair);
        };
        pairSelect.addEventListener("change", () => {
            setPairQuery(pairSelect.value);
            renderCurrent();
        });
        sendingSelect.addEventListener("change", renderCurrent);
        if(view === "weekly"){
            renderCurrent();
            return;
        }
        const timestamps = distinctTimestamps(rows);
        timestamps.forEach(timestamp => {
            const option = document.createElement("option");
            option.value = timestamp;
            option.textContent = timestamp;
            selector.appendChild(option);
        });
        selector.disabled = false;
        selector.addEventListener("change", renderCurrent);
        renderCurrent();
    }

    if(typeof module !== "undefined" && module.exports){
        module.exports = {
            normalizeRows, fetchSevenDays, groupByPair, expandBidirectionalRows,
            pairStats, distinctTimestamps, normalizePair, filterRows, setPairQuery,
            pairViewHref, renderPairLinks, displayRate, displayDelta, renderCards
        };
    }
    if(typeof document !== "undefined"){
        if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
        else init();
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
