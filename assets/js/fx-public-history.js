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

    function appendText(parent, tag, className, value){
        const element = document.createElement(tag);
        if(className) element.className = className;
        element.textContent = value;
        parent.appendChild(element);
        return element;
    }

    function displayRate(rate, inverse){
        return inverse ? rate.toFixed(6) : rate.toLocaleString("en-GB", { maximumFractionDigits: 6 });
    }

    function renderCards(grid, selectedRows, allRows, sendingBase = ""){
        grid.replaceChildren();
        const allPairs = groupByPair(allRows.filter(row => !sendingBase || row.pair.startsWith(`${sendingBase}/`)));
        const selectedPairs = groupByPair(selectedRows);
        if(!allPairs.size){
            appendText(grid, "p", "fx-empty-note", "No validated FX rows are available for this period.");
            return;
        }
        [...allPairs.keys()].sort().forEach(pair => {
            const pairRows = selectedPairs.get(pair) || [];
            const current = pairRows[pairRows.length - 1];
            const allPairRows = allPairs.get(pair);
            const latest = allPairRows[allPairRows.length - 1];
            const stats = pairStats(allPairRows);
            const card = document.createElement("article");
            card.className = `fx-weekly-card ${stats.delta > 0 ? "fx-up" : stats.delta < 0 ? "fx-down" : "fx-unchanged"}`;
            appendText(card, "h3", "fx-pair-card-pair", pair);
            appendText(card, "p", "fx-pair-card-rate", current
                ? `Capture ${displayRate(current.rate, Boolean(current.inverseOf))}`
                : "No rate in selected capture");
            appendText(card, "p", "fx-weekly-completeness", stats.observations > 1
                ? `7D ${stats.delta > 0 ? "▲" : stats.delta < 0 ? "▼" : "—"} ${stats.deltaPercent > 0 ? "+" : ""}${stats.deltaPercent.toFixed(2)}% (${stats.delta > 0 ? "+" : ""}${stats.delta.toFixed(6)})`
                : "7D variance unavailable · one capture");
            appendText(card, "p", "fx-weekly-metrics", `High ${displayRate(stats.high, Boolean(latest.inverseOf))} · Low ${displayRate(stats.low, Boolean(latest.inverseOf))}`);
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
        [...new Set(rows.map(row => row.pair.split("/")[0]))].sort().forEach(base => {
            const option = document.createElement("option");
            option.value = base;
            option.textContent = base;
            sendingSelect.appendChild(option);
        });
        const renderCurrent = () => renderCards(grid,
            view === "weekly" ? rows : rows.filter(row => row.timestamp === selector.value),
            rows, sendingSelect.value);
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
        module.exports = { normalizeRows, fetchSevenDays, groupByPair, expandBidirectionalRows, pairStats, distinctTimestamps, renderCards };
    }
    if(typeof document !== "undefined"){
        if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
        else init();
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
