#!/usr/bin/env node
/*
 * GPIR FX ticker formatting -- pure, testable functions shared by the
 * static page generator. assets/js/fx-ticker.js mirrors this same
 * logic in the browser (see the comment there); keep both in sync if
 * this changes.
 *
 * Direction must never rely on colour alone -- every formatted change
 * carries its own glyph (▲ / ▼ / —).
 */

function formatRate(value, decimals = 4){
    return Number.isFinite(value) ? value.toFixed(decimals) : "N/A";
}

function formatPercentChange(percentageChange){
    if(!Number.isFinite(percentageChange)) return "—";
    const glyph = percentageChange > 0 ? "▲" : percentageChange < 0 ? "▼" : "—";
    const sign = percentageChange > 0 ? "+" : "";
    return `${glyph} ${sign}${percentageChange.toFixed(2)}%`;
}

function directionClass(direction){
    if(direction === "up") return "fx-up";
    if(direction === "down") return "fx-down";
    if(direction === "unchanged") return "fx-unchanged";
    return "fx-no-comparison";
}

/*
 * Renders one compact ticker line's plain-text content, e.g.
 * "USD/INR 88.2000 ▲ +0.34%" -- the visual target from the milestone
 * spec, decimals chosen per currency pair convention (JPY-quoted pairs
 * conventionally show 2 decimals, everything else 4).
 */
function formatTickerLine(record){
    const decimals = record.quote === "JPY" || record.base === "JPY" ? 2 : 4;
    const rate = Number.isFinite(record.mid) ? record.mid : record.last;
    return `${record.pair} ${formatRate(rate, decimals)} ${formatPercentChange(record.percentageChange)}`;
}

module.exports = { formatRate, formatPercentChange, directionClass, formatTickerLine };
