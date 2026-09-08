#!/usr/bin/env node
/*
 * GPIR FX reference provider: open.er-api.com.
 *
 * This is the SAME public, keyless endpoint assets/js/fx-ticker.js has
 * already fetched directly from the reader's browser in production
 * (https://open.er-api.com/v6/latest/{BASE}) -- it is not a new
 * third-party relationship, only moved server-side (GitHub Actions)
 * per the milestone's secure-refresh architecture so a future licensed
 * provider's real credentials never need to reach client JavaScript.
 * It requires no API key and needs no credential env var to be
 * "configured" -- it is always available as the reference/fallback
 * tier, exactly matching the provider-priority order's step 5
 * ("approved central-bank/reference sources").
 *
 * It is a daily reference-rate service, not tick-by-tick streaming, so
 * every record it produces is providerType "reference" and dataStatus
 * "REFERENCE" -- never "live". It has no bid/ask/spot/TOM/cash data;
 * those fields stay null (rendered "N/A"), never estimated.
 *
 * One HTTP call fetches all rates relative to a single anchor
 * currency (USD); every other featured pair is then computed from
 * that one response:
 *   - base === anchor:  provider-native (the API's own quote)
 *   - quote === anchor: provider-native (reciprocal of the API's own
 *                        quote for the same two currencies -- no third
 *                        currency is introduced, so this is not a cross)
 *   - neither is anchor: derived-cross, with both anchor legs recorded
 *     as sourceLegs so it is never presented as a provider-native rate
 */

const ANCHOR = "USD";
const ENDPOINT = `https://open.er-api.com/v6/latest/${ANCHOR}`;

const id = "reference-open-er-api";
const providerType = "reference";
const envVarNames = []; // keyless; always available as the reference/fallback tier

function isConfigured(){
    return true;
}

async function fetchAnchorRates(fetchImpl = globalThis.fetch){
    const response = await fetchImpl(ENDPOINT, {
        headers: { "User-Agent": "FINTECHOISIS-GPIR-FX/1.0" },
        signal: AbortSignal.timeout(15000)
    });
    if(!response.ok){
        throw new Error(`REFERENCE_PROVIDER_UNAVAILABLE: HTTP ${response.status}`);
    }
    const data = await response.json();
    if(!data || data.result !== "success" || !data.rates || typeof data.rates !== "object"){
        throw new Error("REFERENCE_PROVIDER_UNAVAILABLE: unexpected response shape");
    }
    return data;
}

/*
 * pairs: array of "BASE/QUOTE" strings (e.g. "USD/INR", "AED/INR").
 * Returns an array of normalized-record inputs (see
 * scripts/fx/normalize-validate.js buildRecord) -- callers still run
 * them through validateRecord() before publishing.
 */
async function fetchPairs(pairs, options = {}){
    const { fetchImpl = globalThis.fetch, retrievedAt = new Date().toISOString() } = options;
    const data = await fetchAnchorRates(fetchImpl);
    const providerTimestamp = data.time_last_update_utc
        ? new Date(data.time_last_update_utc).toISOString()
        : retrievedAt;

    const rateAgainstAnchor = (code) => {
        if(code === ANCHOR) return 1;
        const value = data.rates[code];
        return Number.isFinite(value) ? value : null;
    };

    return pairs.map(pair => {
        const [base, quote] = pair.split("/");
        const baseRate = rateAgainstAnchor(base);
        const quoteRate = rateAgainstAnchor(quote);

        if(baseRate === null || quoteRate === null){
            return {
                pair, base, quote, timestamp: providerTimestamp,
                provider: id, providerType, rateType: "provider-native",
                dataStatus: "NO_PROVIDER_CONFIGURED",
                providerRetrievedAt: providerTimestamp, gpirRetrievedAt: retrievedAt,
                unavailableReason: `${ANCHOR} anchor has no quote for ${baseRate === null ? base : quote}`
            };
        }

        const mid = quoteRate / baseRate;
        const isDirect = base === ANCHOR || quote === ANCHOR;

        return {
            pair, base, quote, timestamp: providerTimestamp,
            provider: id, providerType,
            rateType: isDirect ? "provider-native" : "derived-cross",
            sourceLegs: isDirect ? null : [
                { pair: `${ANCHOR}/${base}`, provider: id },
                { pair: `${ANCHOR}/${quote}`, provider: id }
            ],
            mid, last: mid,
            // A daily reference-rate feed does not publish a bid/ask
            // spread, spot/TOM distinction or cash buy/sell -- these
            // stay null so the reader sees "N/A", never an estimate.
            bid: null, ask: null, spot: null, tom: null, cashBuy: null, cashSell: null,
            dataStatus: "REFERENCE",
            providerRetrievedAt: providerTimestamp, gpirRetrievedAt: retrievedAt
        };
    });
}

module.exports = { id, providerType, envVarNames, isConfigured, fetchPairs };
