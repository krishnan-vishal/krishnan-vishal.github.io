import { createPublicationHandler, createRestPublicationRepository }
    from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { classifyEditorialPublication, contentfulEditorialConfig, fetchUnpublishedEditorialDraft }
    from '../../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { editorialUrlKey, isOfficialUrl } from '../../supabase/functions/_shared/gpir-intelligence-validation.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function publisherConfiguration(env) {
    const url = String(env.SUPABASE_URL || '').trim();
    const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const publicKey = String(env.SUPABASE_ANON_KEY || '').trim();
    const publisherJwt = String(env.GPIR_EDITORIAL_PUBLISHER_JWT || '').trim();
    let target;
    try { target = new URL(url); } catch { throw new Error('SUPABASE_CONFIGURATION_REQUIRED'); }
    const contentful = contentfulEditorialConfig(env);
    if (target.protocol !== 'https:' || target.username || target.password || target.port ||
        !/^[a-z0-9]{20}\.supabase\.co$/.test(target.hostname) ||
        target.pathname !== '/' || target.search || target.hash || !serviceKey || !publicKey ||
        !publisherJwt || publisherJwt === serviceKey || publisherJwt === publicKey ||
        !contentful)
        throw new Error('EDITORIAL_PUBLISHER_CONFIGURATION_REQUIRED');
    return { config: { url: target.origin, key: serviceKey, publicKey, publisherJwt }, contentful };
}

// Update only governed identity fields on the same unpublished draft. A version
// conflict or any editorial change fails closed; no publish endpoint is called.
export async function writebackEditorialDraftIdentity({ contentful, managementToken, entryId, identity,
    expectedUpdatedAt, candidateId, fetchImpl = fetch }) {
    if (!managementToken || managementToken === contentful.token) throw new Error('CONTENTFUL_WRITEBACK_CONFIGURATION_REQUIRED');
    const root = `https://api.contentful.com/spaces/${encodeURIComponent(contentful.spaceId)}` +
        `/environments/${encodeURIComponent(contentful.environment)}/entries/${encodeURIComponent(entryId)}`;
    const headers = new Headers({ accept: 'application/vnd.contentful.management.v1+json' });
    headers.set('authorization', `Bearer ${managementToken}`);
    const response = await fetchImpl(root, { headers });
    if (!response.ok) throw new Error(`CONTENTFUL_WRITEBACK_READ_HTTP_${response.status}`);
    const item = await response.json();
    if (item?.sys?.id !== entryId || item.sys.contentType?.sys?.id !== 'gpirPublication' ||
        item.sys.publishedVersion != null || item.sys.archivedVersion != null ||
        !Number.isInteger(item.sys.version) || item.sys.updatedAt !== expectedUpdatedAt ||
        !item.fields || typeof item.fields !== 'object') throw new Error('CONTENTFUL_WRITEBACK_DRAFT_CHANGED');
    const expected = { supabaseRecordId: identity.supabaseRecordId,
        gpirPublicationId: identity.gpirPublicationId, editionLineageId: identity.editionLineageId };
    const fields = { ...item.fields };
    let changed = false;
    for (const [key, value] of Object.entries(expected)) {
        if (typeof value !== 'string' || !value.trim()) throw new Error('CONTENTFUL_WRITEBACK_IDENTITY_INVALID');
        const existing = fields[key];
        if (existing != null && (typeof existing !== 'object' ||
            Object.keys(existing).some(locale => locale !== 'en-US')))
            throw new Error('CONTENTFUL_WRITEBACK_LOCALE_REVIEW_REQUIRED');
        const current = existing?.['en-US'];
        if (current === value) continue;
        if (current != null && current !== '' && !(key === 'supabaseRecordId' &&
            candidateId && String(current).toLowerCase() === candidateId))
            throw new Error('CONTENTFUL_WRITEBACK_IDENTITY_CONFLICT');
        fields[key] = { 'en-US': value };
        changed = true;
    }
    if (!changed) return { status: 'ALREADY_SYNCHRONIZED', entryId };
    const writeHeaders = new Headers(headers);
    writeHeaders.set('content-type', 'application/vnd.contentful.management.v1+json');
    writeHeaders.set('x-contentful-version', String(item.sys.version));
    const updated = await fetchImpl(root, { method: 'PUT', headers: writeHeaders,
        body: JSON.stringify({ fields }) });
    if (updated.status === 409 || updated.status === 412)
        throw new Error('CONTENTFUL_WRITEBACK_VERSION_CONFLICT');
    if (!updated.ok) throw new Error(`CONTENTFUL_WRITEBACK_HTTP_${updated.status}`);
    const saved = await updated.json();
    if (saved?.sys?.id !== entryId || saved.sys.publishedVersion != null ||
        !Object.entries(expected).every(([key, value]) => saved.fields?.[key]?.['en-US'] === value))
        throw new Error('CONTENTFUL_WRITEBACK_READBACK_FAILED');
    return { status: 'SYNCHRONIZED', entryId };
}

export async function registerEditorialDraft({ env, entryId, fetchImpl = fetch }) {
    const { config, contentful } = publisherConfiguration(env);
    const entry = await fetchUnpublishedEditorialDraft({ config: contentful,
        managementToken: String(env.CONTENTFUL_MANAGEMENT_TOKEN || '').trim(), entryId, fetchImpl });
    const match = /^gpir-(t1|t1-5|t2|t3)-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(entryId);
    if (!match && /^gpir-t/i.test(entryId)) throw new Error('EDITORIAL_DRAFT_ID_INVALID');
    const candidateId = match ? match[2].toLowerCase() : null;
    const repository = createRestPublicationRepository({ config, contentful, fetchImpl });
    const candidate = candidateId ? await repository.candidate(candidateId) : null;
    const source = candidate ? await repository.source(candidate.source_id) : null;
    const fields = entry.fields;
    if (classifyEditorialPublication(fields, candidate) !== 'EXECUTIVE' ||
        typeof fields.sourceValidationSummary !== 'string' || fields.sourceValidationSummary.trim().length < 40 ||
        (candidateId && (!candidate || source?.source_status !== 'GREEN' ||
            entryId !== `gpir-${String(source?.trust_tier || '').toLowerCase().replace('.', '-')}-${candidateId}` ||
            !editorialUrlKey(fields.legacySourceUrl) ||
            editorialUrlKey(fields.legacySourceUrl) !== editorialUrlKey(candidate.canonical_url) ||
            !isOfficialUrl(candidate.canonical_url, source.official_url))))
        throw new Error('EDITORIAL_DRAFT_REVIEW_REQUIRED');
    const legacyCandidateId = candidateId && String(fields.supabaseRecordId || '').toLowerCase() === candidateId;
    const identifiers = [legacyCandidateId ? null : fields.supabaseRecordId, fields.gpirPublicationId, fields.editionLineageId];
    if (!identifiers.every(Boolean) && !identifiers.every(value => !value))
        throw new Error('EDITORIAL_DRAFT_IDENTITY_REVIEW_REQUIRED');
    const identity = await repository.registerEditorialIdentity(entry, candidate, { draft: true });
    if (!identity || !identity.supabaseRecordId || !identity.gpirPublicationId || !identity.editionLineageId ||
        identity.supabaseRecordId === candidateId || identity.candidateId !== candidateId ||
        identity.entryReference !== `${contentful.spaceId}/${contentful.environment}/${entryId}` ||
        identity.policyStatus !== 'INACTIVE')
        throw new Error('EDITORIAL_DRAFT_IDENTITY_REVIEW_REQUIRED');
    const synchronization = await writebackEditorialDraftIdentity({ contentful,
        managementToken: String(env.CONTENTFUL_MANAGEMENT_TOKEN || '').trim(), entryId, identity,
        expectedUpdatedAt: entry.updatedAt, candidateId, fetchImpl });
    return { status: 'IDENTITY_REVIEW', entryId, candidateId, identity, synchronization,
        legacyCandidateId: Boolean(legacyCandidateId) };
}

export async function runEditorialPublisher({ env, fetchImpl = fetch, logger = console }) {
    publisherConfiguration(env);

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
    const draftMode = process.env.GPIR_EDITORIAL_OPERATION === 'register-draft';
    const draftId = String(process.env.GPIR_REGISTER_DRAFT_ENTRY_ID || '').trim();
    const operation = draftMode
        ? registerEditorialDraft({ env: process.env, entryId: draftId })
        : runEditorialPublisher({ env: process.env });
    operation
        .then(result => console.log(JSON.stringify(draftMode ? result : {
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
