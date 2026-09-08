#!/usr/bin/env node
/*
 * IBRLive API adapter stub. See licensed-provider-base.js for why this
 * does not guess at a request implementation. Credential:
 * FX_IBRLIVE_API_KEY (GitHub Actions secret / environment variable
 * only -- never committed, never sent to the browser).
 */
const { createLicensedProvider } = require("./licensed-provider-base.js");

module.exports = createLicensedProvider({
    id: "ibrlive",
    providerType: "live",
    envVarNames: ["FX_IBRLIVE_API_KEY"],
    docsUrl: "https://www.ibrlive.com/"
});
