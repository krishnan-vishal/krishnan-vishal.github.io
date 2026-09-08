#!/usr/bin/env node
/*
 * GPIR FX business-day resolution.
 *
 * "Previous working day variance" means change versus the previous
 * valid business-day closing reference GPIR has stored, never change
 * versus the previous API refresh and never a naive "yesterday" that
 * could land on a Saturday/Sunday/holiday. This module is pure date
 * logic with no network or filesystem access, so it is fully
 * deterministic and unit-testable.
 */

// ISO 8601 UTC calendar date (YYYY-MM-DD) -> UTC day-of-week, so this
// never depends on the host machine's local timezone.
function dayOfWeekUTC(isoDate){
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun .. 6=Sat
}

function addDaysUTC(isoDate, delta){
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
}

function isWeekend(isoDate){
    const dow = dayOfWeekUTC(isoDate);
    return dow === 0 || dow === 6;
}

/*
 * Walks backwards from (but not including) `fromDate` to find the most
 * recent date that is: not a weekend, not in `holidays` (an array of
 * ISO dates GPIR has confirmed as market holidays where that
 * information is available), and present as a key in `availableDates`
 * (the calendar dates GPIR actually has a validated snapshot for).
 *
 * Returns null -- never a fabricated/guessed date -- when nothing
 * valid is found within `maxLookbackDays` (default 10, generously
 * covering a long holiday cluster without scanning indefinitely).
 */
function resolvePreviousBusinessDate(fromDate, availableDates, holidays = [], maxLookbackDays = 10){
    const holidaySet = new Set(holidays);
    const availableSet = new Set(availableDates);
    let cursor = fromDate;
    for(let i = 0; i < maxLookbackDays; i++){
        cursor = addDaysUTC(cursor, -1);
        if(isWeekend(cursor)) continue;
        if(holidaySet.has(cursor)) continue;
        if(availableSet.has(cursor)) return cursor;
    }
    return null;
}

/*
 * Given a set of historical daily closes keyed by ISO date
 * (`{ "2026-09-05": 94.51, ... }`), resolves the previous business
 * day's close for `currentDate`. Returns { previousBusinessDate,
 * previousBusinessClose } or { previousBusinessDate: null,
 * previousBusinessClose: null } when no valid prior close exists --
 * callers must render "--" in that case, never a manufactured zero.
 */
function resolvePreviousBusinessClose(currentDate, closesByDate, holidays = []){
    const availableDates = Object.keys(closesByDate);
    const previousBusinessDate = resolvePreviousBusinessDate(currentDate, availableDates, holidays);
    if(previousBusinessDate === null){
        return { previousBusinessDate: null, previousBusinessClose: null };
    }
    return { previousBusinessDate, previousBusinessClose: closesByDate[previousBusinessDate] };
}

/*
 * absoluteChange = currentRate - previousBusinessClose
 * percentageChange = ((currentRate - previousBusinessClose) / previousBusinessClose) * 100
 *
 * Returns nulls (never 0) when currentRate or previousBusinessClose is
 * missing/non-finite -- an absent comparison must render as "--", not
 * as a manufactured unchanged (0.00%) reading.
 */
function computeVariance(currentRate, previousBusinessClose){
    if(!Number.isFinite(currentRate) || !Number.isFinite(previousBusinessClose) || previousBusinessClose === 0){
        return { absoluteChange: null, percentageChange: null, direction: null };
    }
    const absoluteChange = currentRate - previousBusinessClose;
    const percentageChange = (absoluteChange / previousBusinessClose) * 100;
    const direction = absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "unchanged";
    return { absoluteChange, percentageChange, direction };
}

module.exports = {
    dayOfWeekUTC,
    addDaysUTC,
    isWeekend,
    resolvePreviousBusinessDate,
    resolvePreviousBusinessClose,
    computeVariance
};
