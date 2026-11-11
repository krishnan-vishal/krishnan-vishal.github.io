import { createPublicationHandler } from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { contentfulEditorialConfig } from '../../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runEditorialPublisher({ env, fetchImpl = fetch, logger = console }) {
    const url = String(env.SUPABASE_URL || '').trim();
    const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const publicKey = String(env.SUPABASE_ANON_KEY || '').trim();
    const publisherJwt = String(env.GPIR_EDITORIAL_PUBLISHER_JWT || '').trim();
    let target;
    try { target = new URL(url); } catch { throw new Error('SUPABASE_CONFIGURATION_REQUIRED'); }
    if (target.protocol !== 'https:' || target.username || target.password || target.port ||
        !/^[a-z0-9]{20}\.supabase\.co$/.test(target.hostname) ||
        target.pathname !== '/' || target.search || target.hash || !serviceKey || !publicKey ||
        !publisherJwt || publisherJwt === serviceKey || publisherJwt === publicKey ||
        !contentfulEditorialConfig(env))
        throw new Error('EDITORIAL_PUBLISHER_CONFIGURATION_REQUIRED');

    let loggedError = false;
    const trackingLogger = {
        error(...args) { loggedError = true; logger.error(...args); }
    };
    const handler = createPublicationHandler({ env, fetchImpl, logger: trackingLogger });
    const response = await handler(new Request('https://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchSize: 5 })
    }));
    const result = await response.json();
    if (!response.ok || result.status !== 'OK' || result.editorial?.status !== 'OK' || loggedError)
        throw new Error(`EDITORIAL_PUBLISHER_RUN_FAILED:${result.code || result.editorial?.status || response.status}`);
    return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    runEditorialPublisher({ env: process.env })
        .then(result => console.log(JSON.stringify({
            status: result.status,
            processed: result.processed,
            editorial: {
                status: result.editorial.status,
                entries: result.editorial.entries,
                published: result.editorial.published,
                awaitingReview: result.editorial.awaitingReview,
                skipped: result.editorial.skipped,
                identityReviews: result.editorial.outcomes
                    .filter(item => item.reasonCode === 'EDITORIAL_IDENTITY_REVIEW_REQUIRED')
                    .map(({ entryId, candidateId, identity }) => ({ entryId, candidateId, identity }))
            }
        })))
        .catch(error => {
            console.error('Editorial publication run failed:', error.message);
            process.exitCode = 1;
        });
}
