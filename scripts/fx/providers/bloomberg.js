#!/usr/bin/env node
/*
 * Bloomberg licensed market-data feed adapter stub. See
 * licensed-provider-base.js for why this does not guess at a request
 * implementation. Credential: FX_BLOOMBERG_API_KEY (GitHub Actions
 * secret / environment variable only -- never committed, never sent
 * to the browser).
 */
const { createLicensedProvider } = require("./licensed-provider-base.js");

module.exports = createLicensedProvider({
    id: "bloomberg",
    providerType: "live",
    envVarNames: ["FX_BLOOMBERG_API_KEY"],
    docsUrl: "https://www.bloomberg.com/professional/products/data/"
});
