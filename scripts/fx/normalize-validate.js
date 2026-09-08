#!/usr/bin/env node
/*
 * GPIR FX common record schema, normalization and deterministic
 * validation. Shared by every provider adapter, the snapshot
 * generator and scripts/validate-fx.js so there is exactly one
 * definition of "a valid FX record" in the whole pipeline.
 *
 * SAFETY CONTRACT
 * ----------------
 * 1. A field GPIR does not have (no TOM quote, no bid/ask from a
 *    reference-only source, etc.) is stored as null and rendered as
 *    "N/A" -- it is never estimated or interpolated.
 * 2. A cross-rate computed from two legs against a common base is
 *    always rateType "derived-cross" with its source legs recorded;
 *    it is never presented as a provider-native quote.
 * 3. An anomaly (bad numeric value, impossible bid/ask, malformed ISO
 *    code, future timestamp, stale quote, extreme movement) is
 *    quarantined with its reason recorded -- never silently dropped.
 */

const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;
const RATE_FIELDS = ["bid", "ask", "mid", "last", "spot", "tom", "cashBuy", "cashSell", "previousBusinessClose"];
const ALLOWED_PROVIDER_TYPES = new Set(["live", "reference", "fallback"]);
const ALLOWED_RATE_TYPES = new Set(["provider-native", "derived-cross"]);
const ALLOWED_DATA_STATUS = new Set(["LIVE", "DELAYED", "REFERENCE", "STALE", "HISTORICAL", "NO_PROVIDER_CONFIGURED"]);

function isFiniteNumberOrNull(value){
    return value === null || value === undefined ? true : Number.isFinite(value);
}

/*
 * Builds one normalized record. Every rate field defaults to null
 * (never 0, never omitted) so "N/A" rendering is automatic downstream.
 */
function buildRecord(fields){
    const {
        pair, base, quote, timestamp, provider, providerType,
        rateType = "provider-native", sourceLegs = null,
        bid = null, ask = null, mid = null, last = null,
        spot = null, tom = null, cashBuy = null, cashSell = null,
        previousBusinessClose = null, previousBusinessDate = null,
        absoluteChange = null, percentageChange = null, direction = null,
        dataStatus, providerRetrievedAt = null, gpirRetrievedAt = null,
        validationStatus = "PENDING"
    } = fields;

    return {
        pair, base, quote, timestamp, provider, providerType, rateType,
        sourceLegs,
        bid, ask, mid, last, spot, tom, cashBuy, cashSell,
        previousBusinessClose, previousBusinessDate,
        absoluteChange, percentageChange, direction,
        dataStatus, providerRetrievedAt, gpirRetrievedAt, validationStatus
    };
}

/*
 * Returns an array of anomaly reason strings (empty = valid). Never
 * throws -- callers decide whether to quarantine, log, or reject.
 */
function validateRecord(record, options = {}){
    const {
        now = new Date(),
        staleAfterMinutes = 24 * 60,
        extremeMovePercent = 8
    } = options;
    const reasons = [];

    if(!record || typeof record !== "object"){
        return ["RECORD_NOT_AN_OBJECT"];
    }

    if(typeof record.pair !== "string" || !/^[A-Z]{3}\/[A-Z]{3}$/.test(record.pair)){
        reasons.push("MALFORMED_PAIR");
    }
    if(typeof record.base !== "string" || !ISO_CURRENCY_PATTERN.test(record.base)){
        reasons.push("MALFORMED_BASE_CURRENCY");
    }
    if(typeof record.quote !== "string" || !ISO_CURRENCY_PATTERN.test(record.quote)){
        reasons.push("MALFORMED_QUOTE_CURRENCY");
    }
    if(record.base && record.quote && record.base === record.quote){
        reasons.push("BASE_EQUALS_QUOTE");
    }

    RATE_FIELDS.forEach(field => {
        if(!isFiniteNumberOrNull(record[field])){
            reasons.push(`NON_NUMERIC_${field.toUpperCase()}`);
        }
    });

    ["mid", "last", "spot", "bid", "ask", "cashBuy", "cashSell", "previousBusinessClose"].forEach(field => {
        if(Number.isFinite(record[field]) && record[field] <= 0){
            reasons.push(`NON_POSITIVE_${field.toUpperCase()}`);
        }
    });

    if(Number.isFinite(record.bid) && Number.isFinite(record.ask) && record.bid > record.ask){
        reasons.push("BID_EXCEEDS_ASK");
    }

    if(!record.timestamp || Number.isNaN(Date.parse(record.timestamp))){
        reasons.push("MISSING_OR_MALFORMED_TIMESTAMP");
    } else if(Date.parse(record.timestamp) > now.getTime() + 60000){
        // A minute of tolerance absorbs ordinary clock skew between the
        // provider and the GPIR runner without disabling the check.
        reasons.push("FUTURE_TIMESTAMP");
    } else if(now.getTime() - Date.parse(record.timestamp) > staleAfterMinutes * 60000 && record.providerType === "live"){
        reasons.push("STALE_LIVE_QUOTE");
    }

    if(record.rateType && !ALLOWED_RATE_TYPES.has(record.rateType)){
        reasons.push("INVALID_RATE_TYPE");
    }
    if(record.rateType === "derived-cross" && (!Array.isArray(record.sourceLegs) || record.sourceLegs.length === 0)){
        reasons.push("DERIVED_CROSS_MISSING_SOURCE_LEGS");
    }
    if(record.providerType && !ALLOWED_PROVIDER_TYPES.has(record.providerType)){
        reasons.push("INVALID_PROVIDER_TYPE");
    }
    if(record.dataStatus && !ALLOWED_DATA_STATUS.has(record.dataStatus)){
        reasons.push("INVALID_DATA_STATUS");
    }

    const referenceRate = Number.isFinite(record.mid) ? record.mid : record.last;
    if(Number.isFinite(referenceRate) && Number.isFinite(record.previousBusinessClose) && record.previousBusinessClose !== 0){
        const movePercent = Math.abs(((referenceRate - record.previousBusinessClose) / record.previousBusinessClose) * 100);
        if(movePercent > extremeMovePercent){
            reasons.push("EXTREME_MOVEMENT_BEYOND_THRESHOLD");
        }
    }

    return reasons;
}

/*
 * Detects duplicate records within one snapshot -- same pair, provider
 * and timestamp appearing twice, which would otherwise silently
 * double-count in the ticker/explorer. Returns the indexes of the
 * later duplicate(s), not the first (kept) occurrence.
 */
function findDuplicateRecords(records){
    const seen = new Map();
    const duplicateIndexes = [];
    records.forEach((record, index) => {
        const key = `${record.pair}|${record.provider}|${record.timestamp}`;
        if(seen.has(key)){
            duplicateIndexes.push(index);
        } else {
            seen.set(key, index);
        }
    });
    return duplicateIndexes;
}

module.exports = {
    ISO_CURRENCY_PATTERN,
    RATE_FIELDS,
    ALLOWED_PROVIDER_TYPES,
    ALLOWED_RATE_TYPES,
    ALLOWED_DATA_STATUS,
    buildRecord,
    validateRecord,
    findDuplicateRecords
};
