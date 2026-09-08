#!/usr/bin/env node
/*
 * LSEG (London Stock Exchange Group) licensed market-data feed adapter
 * stub. See licensed-provider-base.js for why this does not guess at
 * a request implementation. Credentials: FX_LSEG_API_KEY and
 * FX_LSEG_API_SECRET (GitHub Actions secrets / environment variables
 * only -- never committed, never sent to the browser).
 */
const { createLicensedProvider } = require("./licensed-provider-base.js");

module.exports = createLicensedProvider({
    id: "lseg",
    providerType: "live",
    envVarNames: ["FX_LSEG_API_KEY", "FX_LSEG_API_SECRET"],
    docsUrl: "https://www.lseg.com/en/data-analytics"
});
