#!/usr/bin/env node
/*
 * GPIR FX weekly summary engine -- deterministic quantitative
 * observations only. This module NEVER writes editorial/market-driver
 * commentary; it computes open/high/low/close/range/direction from
 * the pair's own archived history and states plainly when there is
 * not yet enough history to say anything (never pads with invented
 * commentary or implies a cause for a price move).
 */

const DATA_OBSERVATION = "DATA_OBSERVATION";

/*
 * dailyCloses: array of { date, rate } for one pair, already sorted
 * ascending by date, covering at most the trailing 7 valid data
 * points GPIR has archived (callers pass exactly what they want
 * summarized -- this function does not reach into the filesystem).
 */
function buildWeeklySummary(pair, dailyCloses){
    const points = dailyCloses.filter(point => Number.isFinite(point.rate));
    if(points.length < 2){
        return {
            pair,
            kind: DATA_OBSERVATION,
            dataCompleteness: points.length === 0 ? "NO_DATA" : "INSUFFICIENT_HISTORY",
            observedDays: points.length,
            weeklyStartLevel: points[0] ? points[0].rate : null,
            latestRate: points[0] ? points[0].rate : null,
            high: points[0] ? points[0].rate : null,
            low: points[0] ? points[0].rate : null,
            weeklyChange: null,
            weeklyChangePercent: null,
            direction: null,
            rangePercent: null,
            observations: points,
            statements: points.length === 0
                ? [`No archived daily closes are available yet for ${pair}.`]
                : [`Only one archived daily close is available for ${pair}; a weekly comparison requires at least two.`]
        };
    }

    const weeklyStartLevel = points[0].rate;
    const latestRate = points[points.length - 1].rate;
    const high = Math.max(...points.map(point => point.rate));
    const low = Math.min(...points.map(point => point.rate));
    const weeklyChange = latestRate - weeklyStartLevel;
    const weeklyChangePercent = (weeklyChange / weeklyStartLevel) * 100;
    const rangePercent = ((high - low) / low) * 100;
    const direction = weeklyChange > 0 ? "up" : weeklyChange < 0 ? "down" : "unchanged";

    const statements = [
        `${pair} ${direction === "unchanged" ? "closed the observation period unchanged from" : `closed the ${points.length - 1}-day observation period ${Math.abs(weeklyChangePercent).toFixed(1)}% ${direction === "up" ? "above" : "below"}`} the period's starting level.`,
        `The pair traded within a ${rangePercent.toFixed(1)}% high-low range during the period.`
    ];

    return {
        pair,
        kind: DATA_OBSERVATION,
        dataCompleteness: points.length >= 5 ? "COMPLETE" : "PARTIAL",
        observedDays: points.length,
        weeklyStartLevel,
        latestRate,
        high,
        low,
        weeklyChange,
        weeklyChangePercent,
        direction,
        rangePercent,
        observations: points,
        statements
    };
}

module.exports = { buildWeeklySummary, DATA_OBSERVATION };
