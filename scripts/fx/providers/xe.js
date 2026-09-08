#!/usr/bin/env node
/*
 * XE Currency Data API adapter stub. See licensed-provider-base.js for
 * why this does not guess at a request implementation. Credential:
 * FX_XE_API_KEY (GitHub Actions secret / environment variable only --
 * never committed, never sent to the browser).
 */
const { createLicensedProvider } = require("./licensed-provider-base.js");

module.exports = createLicensedProvider({
    id: "xe",
    providerType: "live",
    envVarNames: ["FX_XE_API_KEY"],
    docsUrl: "https://www.xe.com/xecurrencydata/"
});
