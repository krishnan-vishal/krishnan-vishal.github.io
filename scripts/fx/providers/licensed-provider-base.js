#!/usr/bin/env node
/*
 * Shared factory for the four licensed/commercial FX provider adapter
 * stubs (xe.js, ibrlive.js, lseg.js, bloomberg.js).
 *
 * GPIR has no licence, credential or verified API specification for
 * any of these vendors today. Rather than guess at a proprietary
 * request/response shape -- which would risk shipping a fabricated
 * integration that looks real but was never verified against actual
 * vendor documentation -- each of these stays a genuine, testable
 * adapter CONTRACT (id, providerType "live", the env var(s) that would
 * indicate a credential has been provisioned) that reports
 * NOT_CONFIGURED cleanly and does not attempt any network call until
 * both a credential is present AND a human has replaced
 * `buildAuthenticatedFetch` with a real implementation built against
 * that vendor's actual documentation. Never add a fake credential to
 * make `isConfigured()` return true.
 */

function createLicensedProvider({ id, providerType = "live", envVarNames, docsUrl }){
    function isConfigured(env = process.env){
        return envVarNames.every(name => Boolean(env[name]));
    }

    async function fetchPairs(pairs, options = {}){
        const { env = process.env, retrievedAt = new Date().toISOString() } = options;
        if(!isConfigured(env)){
            return pairs.map(pair => {
                const [base, quote] = pair.split("/");
                return {
                    pair, base, quote, timestamp: retrievedAt,
                    provider: id, providerType,
                    dataStatus: "NO_PROVIDER_CONFIGURED",
                    providerRetrievedAt: null, gpirRetrievedAt: retrievedAt,
                    unavailableReason: `Missing credential(s): ${envVarNames.join(", ")}`
                };
            });
        }
        // A credential is present, but no verified request/response
        // implementation has been built against the vendor's actual
        // API documentation yet -- see docsUrl. This deliberately does
        // not attempt a guessed HTTP call.
        throw new Error(
            `PROVIDER_INTEGRATION_NOT_YET_IMPLEMENTED: ${id} has credential(s) configured, but no verified ` +
            `request implementation exists. Build it against ${docsUrl} before enabling this provider.`
        );
    }

    return { id, providerType, envVarNames, docsUrl, isConfigured, fetchPairs };
}

module.exports = { createLicensedProvider };
