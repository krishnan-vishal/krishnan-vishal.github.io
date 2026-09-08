/*=====================================================
  LIVE FX RATES + ANNOUNCEMENTS TICKER
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initializeFxTicker();

    initializeAnnouncementTicker();

});

/*=====================================================
  LIVE FX RATES

  Reads the pre-generated, GitHub-Actions-produced snapshot
  (assets/data/fx/current.json) instead of calling a market-data
  provider directly from the browser -- see docs/FX_PRICING_TREASURY.md
  for the full pipeline. This keeps any future licensed provider's
  credentials server-side (GitHub Actions Secrets only) and lets the
  ticker show previous-business-day variance, which a raw per-refresh
  live fetch cannot compute on its own.

  Compact single-line format per pair: "USD/INR 88.2000 ▲ +0.34%".
  Direction is always carried by the ▲/▼/— glyph, never colour alone.
  Each item is a real link to that pair's FX intelligence view, so it
  is keyboard-focusable (see the :focus-within pause rule in
  assets/css/market.css) and works with screen readers.
======================================================*/

// Reordering preference only (which featured pairs surface first) --
// the underlying data is the same static snapshot for every visitor,
// never a fresh live re-fetch keyed to the chosen currency.
let fxBaseCurrency = (function(){
    try{
        return localStorage.getItem("gpir-currency") || "USD";
    } catch(e){
        return "USD";
    }
})();

function fxDataPrefix(){
    const script = document.querySelector('script[src*="assets/js/fx-ticker.js"]');
    const src = script ? script.getAttribute("src") : "assets/js/fx-ticker.js";
    return src.replace(/assets\/js\/fx-ticker\.js.*$/, "assets/data/fx/");
}

function fxPagePrefix(){
    return fxDataPrefix().replace(/assets\/data\/fx\/$/, "");
}

function fxPairSlug(pair){
    return pair.toLowerCase().replace("/", "-");
}

function fxEscapeHtml(str){
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}

function fxFormatRate(value, pair){
    if(typeof value !== "number" || !isFinite(value)) return "N/A";
    const decimals = pair && (pair.indexOf("JPY") === 0 || pair.slice(-3) === "JPY") ? 2 : 4;
    return value.toFixed(decimals);
}

function fxFormatChange(percentageChange){
    if(typeof percentageChange !== "number" || !isFinite(percentageChange)) return "—";
    const glyph = percentageChange > 0 ? "▲" : percentageChange < 0 ? "▼" : "—";
    const sign = percentageChange > 0 ? "+" : "";
    return glyph + " " + sign + percentageChange.toFixed(2) + "%";
}

function fxDirectionClass(direction){
    if(direction === "up") return "fx-up";
    if(direction === "down") return "fx-down";
    if(direction === "unchanged") return "fx-unchanged";
    return "fx-no-comparison";
}

let fxSnapshotCache = null;

function initializeFxTicker(){

    const track = document.getElementById("fxTicker");

    if(!track) return;

    loadRates();

    // The generated snapshot refreshes on a GitHub Actions schedule
    // (see fx-config.json / .github/workflows/fx-market-data.yml), not
    // every 60 seconds -- re-checking that often would just re-fetch an
    // unchanged static file. A periodic re-fetch still catches a
    // snapshot that updated while the page has been open.
    setInterval(loadRates, 15 * 60 * 1000);

    document.addEventListener("gpir:languagechange", renderTicker);

}

function setFxBaseCurrency(code){

    if(!code || code === fxBaseCurrency) return;

    fxBaseCurrency = code;

    renderTicker();

}

async function loadRates(){

    const track = document.getElementById("fxTicker");

    if(!track) return;

    try{

        const response = await fetch(fxDataPrefix() + "current.json");

        if(!response.ok) throw new Error("FX snapshot fetch failed: HTTP " + response.status);

        fxSnapshotCache = await response.json();

        renderTicker();

    } catch(err){

        console.error(err);

        const unableText = window.GPIRI18n ? window.GPIRI18n.t("ticker.unable_to_load") : "Unable to load exchange rates.";
        track.innerHTML = `<span class="fx-ticker-item">${fxEscapeHtml(unableText)}</span>`;

        const updated = document.getElementById("lastUpdated");
        if(updated) updated.textContent = "";

    }

}

function renderTicker(){

    const track = document.getElementById("fxTicker");

    const updated = document.getElementById("lastUpdated");

    if(!track || !fxSnapshotCache) return;

    const pairs = Array.isArray(fxSnapshotCache.pairs) ? fxSnapshotCache.pairs.slice() : [];

    if(!pairs.length){

        const unavailableText = window.GPIRI18n ? window.GPIRI18n.t("ticker.unable_to_load") : "FX snapshot unavailable.";
        track.innerHTML = `<span class="fx-ticker-item">${fxEscapeHtml(unavailableText)}</span>`;
        if(updated) updated.textContent = "";
        return;

    }

    // Reordering only -- pairs involving the reader's chosen currency
    // surface first within the same curated, already-fetched snapshot.
    pairs.sort((a, b) => {
        const aMatch = a.base === fxBaseCurrency || a.quote === fxBaseCurrency ? 0 : 1;
        const bMatch = b.base === fxBaseCurrency || b.quote === fxBaseCurrency ? 0 : 1;
        return aMatch - bMatch;
    });

    const pagePrefix = fxPagePrefix();

    const html = pairs.map(record => {

        const rate = typeof record.mid === "number" ? record.mid : record.last;
        const change = typeof record.percentageChange === "number" && isFinite(record.percentageChange)
            ? `<span class="fx-ticker-change">${fxFormatChange(record.percentageChange)}</span>`
            : "";

        return `<a class="fx-ticker-item ${fxDirectionClass(record.direction)}" href="${pagePrefix}pages/fx/pairs/${fxPairSlug(record.pair)}.html">` +
            `<span class="fx-ticker-pair">${fxEscapeHtml(record.pair)}</span>` +
            `<span class="fx-ticker-rate">${fxFormatRate(rate, record.pair)}</span>` +
            change +
            `</a>`;

    }).join("");

    track.innerHTML = html + html;

    if(updated){

        const generatedAt = fxSnapshotCache.generatedAt ? new Date(fxSnapshotCache.generatedAt) : null;
        if(generatedAt && !isNaN(generatedAt.getTime())){
            const dateText = generatedAt.toLocaleDateString("en-GB", {
                day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
            }).replace("Sept", "Sep");
            const timeText = generatedAt.toLocaleTimeString("en-GB", {
                hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata"
            }) + " IST";
            updated.setAttribute("datetime", generatedAt.toISOString());
            updated.setAttribute("aria-label", `FX snapshot generated ${dateText} at ${timeText}`);
            updated.innerHTML = `<span>${dateText}</span><span>${timeText}</span>`;
        } else {
            updated.textContent = "";
            updated.removeAttribute("datetime");
            updated.removeAttribute("aria-label");
        }

    }

}

/*=====================================================
  ANNOUNCEMENTS TICKER
  Duplicates the cards once so the CSS marquee
  (translateX 0 -> -50%) loops seamlessly.
======================================================*/

function initializeAnnouncementTicker(){

    const track = document.getElementById("announcementTicker");

    if(!track) return;

    const originalHTML = track.innerHTML;

    track.innerHTML = originalHTML + originalHTML;

}
