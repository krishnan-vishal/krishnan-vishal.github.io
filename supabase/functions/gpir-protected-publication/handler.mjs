const PRODUCTION_ORIGIN = 'https://fintechoisis.com';
const PUBLICATION_ID = /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(status, body, origin = null) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    pragma: 'no-cache',
    vary: 'Origin'
  };
  if (origin === PRODUCTION_ORIGIN) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, content-type';
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function denied(status, reason, origin) {
  return response(status, { status: 'DENY', reason }, origin);
}

function providerError(reason, origin) {
  return response(503, { status: 'ERROR', reason }, origin);
}

function configuration(env) {
  if (env.GPIR_EDITORIAL_SOURCE === 'payload') {
    const origin = String(env.PAYLOAD_PUBLIC_SERVER_URL || '').replace(/\/$/, '');
    if (!/^https:\/\/[^/]+$/.test(origin) || !env.PAYLOAD_RELEASE_API_KEY || !env.SUPABASE_URL || !env.GPIR_SUPABASE_PUBLISHABLE_KEY || !env.GPIR_SUPABASE_SECRET_KEY) return null;
    return { SUPABASE_URL: env.SUPABASE_URL, GPIR_SUPABASE_PUBLISHABLE_KEY: env.GPIR_SUPABASE_PUBLISHABLE_KEY,
      GPIR_SUPABASE_SECRET_KEY: env.GPIR_SUPABASE_SECRET_KEY, GPIR_ADMIN_READER_ID: env.GPIR_ADMIN_READER_ID,
      GPIR_EDITORIAL_SOURCE: 'payload', PAYLOAD_PUBLIC_SERVER_URL: origin, PAYLOAD_RELEASE_API_KEY: env.PAYLOAD_RELEASE_API_KEY };
  }
  if (env.GPIR_EDITORIAL_SOURCE && env.GPIR_EDITORIAL_SOURCE !== 'contentful') return null;
  const names = ['SUPABASE_URL', 'GPIR_SUPABASE_PUBLISHABLE_KEY',
    'GPIR_SUPABASE_SECRET_KEY', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT', 'CONTENTFUL_DELIVERY_TOKEN'];
  const values = Object.fromEntries(names.map(name => [name, env[name]?.trim()]));
  if (!names.every(name => values[name])) return null;
  const contentfulHost = (env.CONTENTFUL_HOST || 'cdn.contentful.com').trim().toLowerCase();
  if (!['cdn.contentful.com', 'preview.contentful.com'].includes(contentfulHost)) return null;
  return { ...values, GPIR_ADMIN_READER_ID: env.GPIR_ADMIN_READER_ID, CONTENTFUL_HOST: contentfulHost };
}

function bearerToken(request) {
  const value = request.headers.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] || null;
}

function validInput(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.publicationId === 'string' && PUBLICATION_ID.test(value.publicationId) &&
    typeof value.supabaseRecordId === 'string' && UUID.test(value.supabaseRecordId);
}

function scalar(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function localized(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  if (value.sys || value.url || value.fileName || value.details) return value;
  return value['en-US'] ?? Object.values(value)[0] ?? null;
}

function resolvedDashboard(fields, collection) {
  const linkId = localized(fields?.dashboardAsset)?.sys?.id || fields?.dashboardAsset?.sys?.id || null;
  if (!linkId) return null;
  const asset = collection?.includes?.Asset?.find(item => item?.sys?.id === linkId);
  const file = localized(asset?.fields?.file);
  const alt = scalar(asset?.fields?.description);
  const source = typeof file?.url === 'string'
    ? file.url.startsWith('//') ? `https:${file.url}` : file.url : null;
  if (!asset || !file || !alt || !source || !/^https:\/\//i.test(source)) return null;
  const reference = scalar(asset.fields.title) || String(file.fileName || '').replace(/\.[^.]+$/, '');
  return Object.freeze({ reference, role: 'PRIMARY_PUBLICATION_DASHBOARD', src: source,
    highResolutionHref: source, alt,
    width: Number.isInteger(file.details?.image?.width) ? file.details.image.width : null,
    height: Number.isInteger(file.details?.image?.height) ? file.details.image.height : null });
}

// Payload has already resolved its approved native media record. Never accept
// Google Drive links, arbitrary remote hosts, or an unverified editor URL.
function payloadDashboard(value, mediaOrigin) {
  if (!value || value.role !== 'PRIMARY_PUBLICATION_DASHBOARD' ||
      typeof mediaOrigin !== 'string' || !/^https:\/\/[^/]+$/.test(mediaOrigin)) return null;
  let url;
  try { url = new URL(value.src, 'https://fintechoisis.com/'); } catch { return null; }
  if (!/^[a-f0-9]{64}$/i.test(value.sha256 || '') || url.search || url.hash) return null;
  const payloadMedia = url.origin === mediaOrigin &&
    /^\/api\/media\/file\/[a-f0-9]{64}\.(?:png|jpe?g|webp)$/i.test(url.pathname) &&
    url.pathname.split('/').pop().toLowerCase().startsWith(value.sha256.toLowerCase() + '.');
  // Two previously approved images have immutable Contentful asset references.
  // Allow only GPIR's existing Contentful delivery space, never arbitrary CDN
  // domains, editor-upload URLs, redirects, or Google Drive.
  const contentfulMedia = url.origin === 'https://images.ctfassets.net' &&
    /^\/zym0dk277ju5\/[A-Za-z0-9]{10,}\/[a-f0-9]{32}\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(url.pathname);
  if (!payloadMedia && !contentfulMedia) return null;
  const alt = typeof value.alt === 'string' ? value.alt.trim().slice(0,280) : '';
  if (!alt) return null;
  return Object.freeze({
    reference: typeof value.reference === 'string' ? value.reference.slice(0,200) : '',
    role: 'PRIMARY_PUBLICATION_DASHBOARD', src: url.href,
    highResolutionHref: url.href, alt,
    width: Number.isSafeInteger(value.width) && value.width > 0 ? value.width : null,
    height: Number.isSafeInteger(value.height) && value.height > 0 ? value.height : null
  });
}

function normalizedPayload(entry, publicationId, supabaseRecordId, collection = null, mediaOrigin = null) {
  const fields = entry?.fields;
  if (!fields || scalar(fields.gpirPublicationId) !== publicationId ||
      scalar(fields.supabaseRecordId) !== supabaseRecordId) return null;
  return Object.freeze({
    identity: publicationId,
    supabaseRecordId,
    title: scalar(fields.publicationTitle),
    publicationType: scalar(fields.publicationType),
    summary: scalar(fields.executiveSummary),
    body: fields.editorialBody ?? null,
    primaryDashboard: payloadDashboard(entry.presentation?.primaryDashboard, mediaOrigin) || resolvedDashboard(fields, collection),
    provenance: Object.freeze({
      validationSummary: scalar(fields.sourceValidationSummary),
      legacySourceUrl: scalar(fields.legacySourceUrl)
    })
  });
}

export function createProtectedPublicationHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && origin !== PRODUCTION_ORIGIN) return denied(403, 'ORIGIN_NOT_ALLOWED', null);
    if (request.method === 'OPTIONS') return response(204, {}, origin);
    if (request.method !== 'POST') return denied(405, 'METHOD_NOT_ALLOWED', origin);

    const config = configuration(env);
    if (!config) return providerError('PROVIDER_CONFIGURATION_ERROR', origin);
    let input;
    try { input = await request.json(); }
    catch { return denied(400, 'MALFORMED_REQUEST', origin); }
    if (!validInput(input) || (input.action !== undefined && input.action !== 'media'))
      return denied(400, 'MALFORMED_PUBLICATION_IDENTITY', origin);

    const token = bearerToken(request);
    if (!token) return denied(401, 'SESSION_REQUIRED', origin);
    const authHeaders = {
      ['apikey']: config.GPIR_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    };

    let userResponse;
    try {
      userResponse = await fetchImpl(`${config.SUPABASE_URL}/auth/v1/user`, { headers: authHeaders });
    } catch { return denied(401, 'SESSION_VERIFICATION_FAILED', origin); }
    if (!userResponse.ok) return denied(401, 'INVALID_SESSION', origin);
    let user;
    try { user = await userResponse.json(); }
    catch { return denied(401, 'MALFORMED_SESSION', origin); }
    if (!user || typeof user.id !== 'string' || !UUID.test(user.id))
      return denied(401, 'MALFORMED_SESSION', origin);

    let entitlementResponse;
    try {
      entitlementResponse = await fetchImpl(
        `${config.SUPABASE_URL}/rest/v1/rpc/resolve_publication_entitlement`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ p_publication_id: input.publicationId,
            p_supabase_record_id: input.supabaseRecordId })
        });
    } catch { return providerError('ENTITLEMENT_PROVIDER_ERROR', origin); }
    if (!entitlementResponse.ok) return providerError('ENTITLEMENT_PROVIDER_ERROR', origin);
    let entitlement;
    try { entitlement = await entitlementResponse.json(); }
    catch { return denied(403, 'MALFORMED_ENTITLEMENT_RESULT', origin); }
    if (!Array.isArray(entitlement) || entitlement.length !== 1 ||
        !['ALLOW', 'DENY'].includes(entitlement[0]?.decision))
      return denied(403, 'MALFORMED_ENTITLEMENT_RESULT', origin);
    if (entitlement[0].decision !== 'ALLOW') {
      // Preserve the original publication-policy RPC while recognizing the
      // existing production subscriber/admin authority used by GPIR readers.
      // The fallback is available only for an exact ACTIVE/EVIDENCED ENTITLED
      // publication policy and therefore cannot bypass release governance.
      const policyQuery = new URLSearchParams({
        select: 'supabase_record_id,publication_id,access_class,status,review_state',
        supabase_record_id: `eq.${input.supabaseRecordId}`,
        publication_id: `eq.${input.publicationId}`,
        limit: '2'
      });
      const serviceHeaders = new Headers([['apikey', config.GPIR_SUPABASE_SECRET_KEY]]);
      if (!config.GPIR_SUPABASE_SECRET_KEY.startsWith('sb_secret_'))
        serviceHeaders.set('authorization', `Bearer ${config.GPIR_SUPABASE_SECRET_KEY}`);
      let policyResponse;
      try {
        policyResponse = await fetchImpl(`${config.SUPABASE_URL}/rest/v1/gpir_publication_access_policies?${policyQuery}`, { headers: serviceHeaders });
      } catch { return providerError('ENTITLEMENT_PROVIDER_ERROR', origin); }
      if (!policyResponse.ok) return providerError('ENTITLEMENT_PROVIDER_ERROR', origin);
      let policies;
      try { policies = await policyResponse.json(); }
      catch { return denied(403, 'MALFORMED_ENTITLEMENT_RESULT', origin); }
      const policy = Array.isArray(policies) && policies.length === 1 ? policies[0] : null;
      if (!policy || policy.access_class !== 'ENTITLED' || policy.status !== 'ACTIVE' || policy.review_state !== 'EVIDENCED')
        return denied(403, 'NOT_ENTITLED', origin);
      const subscriber = await resolveSubscriberAccess({ fetchImpl, supabaseUrl: config.SUPABASE_URL,
        serviceKey: config.GPIR_SUPABASE_SECRET_KEY, accessToken: token,
        adminReaderId: config.GPIR_ADMIN_READER_ID });
      if (subscriber.decision === 'ERROR') return providerError('ENTITLEMENT_PROVIDER_ERROR', origin);
      if (subscriber.decision !== 'ALLOW') return denied(403, 'NOT_ENTITLED', origin);
    }

    const query = new URLSearchParams({ content_type: 'gpirPublication',
      'fields.gpirPublicationId': input.publicationId, include: '2', limit: '2' });
    const contentfulUrl = `https://${config.CONTENTFUL_HOST}/spaces/${encodeURIComponent(config.CONTENTFUL_SPACE_ID)}` +
      `/environments/${encodeURIComponent(config.CONTENTFUL_ENVIRONMENT)}/entries?${query}`;
    let contentfulResponse;
    try {
      contentfulResponse = config.GPIR_EDITORIAL_SOURCE === 'payload'
        ? await fetchImpl(`${config.PAYLOAD_PUBLIC_SERVER_URL}/api/release/editorial-entries`, {
          method: 'POST', redirect: 'error',
          headers: { authorization: `users API-Key ${config.PAYLOAD_RELEASE_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'publication', publicationId: input.publicationId, supabaseRecordId: input.supabaseRecordId })
        })
        : await fetchImpl(contentfulUrl, { headers: { authorization: `Bearer ${config.CONTENTFUL_DELIVERY_TOKEN}` } });
    } catch { return providerError('CONTENT_PROVIDER_ERROR', origin); }
    if (!contentfulResponse.ok) return providerError('CONTENT_PROVIDER_ERROR', origin);
    let collection;
    try { collection = await contentfulResponse.json(); }
    catch { return providerError('CONTENT_PROVIDER_ERROR', origin); }
    if (!Array.isArray(collection?.items) || collection.items.length !== 1)
      return denied(403, collection?.items?.length > 1 ? 'DUPLICATE_PUBLICATION' : 'UNKNOWN_PUBLICATION', origin);
    // The native editorial response deliberately keeps the media relationship
    // as an ID. Resolve it from the existing authenticated Payload media REST
    // endpoint *after* both identity and Supabase entitlement have been checked.
    // Never load an image directly from Google Drive or accept an editor URL.
    const entry = collection.items[0];
    let resolvedEntry = entry;
    if (config.GPIR_EDITORIAL_SOURCE === 'payload') {
      const mediaId = entry.fields?.dashboardAsset?.sys?.id;
      const nativeId = typeof mediaId === 'string' && UUID.test(mediaId);
      const legacyId = typeof mediaId === 'string' &&
        /^[A-Za-z0-9]{12,40}$/.test(mediaId) && !nativeId;
      if (nativeId || legacyId) {
        // Some approved legacy media records retain their existing Contentful
        // asset ID as relationship identity; resolve that indexed media field.
        const mediaUrl = nativeId
          ? config.PAYLOAD_PUBLIC_SERVER_URL + '/api/media/' + mediaId + '?depth=0'
          : config.PAYLOAD_PUBLIC_SERVER_URL + '/api/media?' + new URLSearchParams({
              'where[contentfulAssetId][equals]': mediaId, limit: '2', depth: '0'
            });
        let mediaResponse;
        try {
          mediaResponse = await fetchImpl(mediaUrl, {
            redirect: 'error',
            headers: { authorization: 'users API-Key ' + config.PAYLOAD_RELEASE_API_KEY }
          });
        } catch { return providerError('MEDIA_PROVIDER_ERROR', origin); }
        if (!mediaResponse.ok) return providerError('MEDIA_PROVIDER_ERROR', origin);
        let body;
        try { body = await mediaResponse.json(); }
        catch { return providerError('MEDIA_PROVIDER_ERROR', origin); }
        const media = nativeId ? body :
          Array.isArray(body?.docs) && body.docs.length === 1 ? body.docs[0] : null;
        if (!media || !UUID.test(media.id || '') ||
            (nativeId ? media.id !== mediaId : media.contentfulAssetId !== mediaId) ||
            !/^[a-f0-9]{64}$/i.test(media.sourceSha256 || '') ||
            !media.sourceUrl || !media.alt) return providerError('MEDIA_INTEGRITY_ERROR', origin);
        resolvedEntry = { ...entry, presentation: { primaryDashboard: {
          role: 'PRIMARY_PUBLICATION_DASHBOARD',
          reference: media.sourceFilename || media.filename || entry.fields.publicationTitle,
          src: media.sourceUrl, highResolutionHref: media.sourceUrl,
          alt: media.alt, sha256: media.sourceSha256,
          width: media.width, height: media.height
        } } };
      }
    }
    const publication = normalizedPayload(resolvedEntry, input.publicationId,
      input.supabaseRecordId, collection, config.GPIR_EDITORIAL_SOURCE === 'payload'
        ? config.PAYLOAD_PUBLIC_SERVER_URL : null);
    if (!publication) return denied(403, 'CONTENT_IDENTITY_MISMATCH', origin);
    if (config.GPIR_EDITORIAL_SOURCE === 'payload' &&
        typeof entry.fields?.dashboardAsset?.sys?.id === 'string' &&
        (UUID.test(entry.fields.dashboardAsset.sys.id) ||
          /^[A-Za-z0-9]{12,40}$/.test(entry.fields.dashboardAsset.sys.id)) &&
        !publication.primaryDashboard)
      return providerError('MEDIA_INTEGRITY_ERROR', origin);
    if (input.action === 'media') {
      const dashboard = publication.primaryDashboard;
      if (!dashboard || !dashboard.src) return providerError('MEDIA_NOT_AVAILABLE', origin);
      let mediaResponse;
      try {
        const mediaUrl = new URL(dashboard.src);
        const isCms = mediaUrl.origin === config.PAYLOAD_PUBLIC_SERVER_URL;
        mediaResponse = await fetchImpl(mediaUrl.href, {
          redirect: 'error',
          headers: isCms
            ? { authorization: 'users API-Key ' + config.PAYLOAD_RELEASE_API_KEY }
            : {},
        });
      } catch { return providerError('MEDIA_BYTES_UNAVAILABLE', origin); }
      if (!mediaResponse.ok) return providerError('MEDIA_BYTES_UNAVAILABLE', origin);
      const type = (mediaResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(type))
        return providerError('MEDIA_MIME_UNEXPECTED', origin);
      const length = Number(mediaResponse.headers.get('content-length'));
      if (Number.isFinite(length) && length > 16 * 1024 * 1024)
        return providerError('MEDIA_TOO_LARGE', origin);
      let bytes;
      try { bytes = await mediaResponse.arrayBuffer(); }
      catch { return providerError('MEDIA_BYTES_UNAVAILABLE', origin); }
      if (bytes.byteLength === 0 || bytes.byteLength > 16 * 1024 * 1024)
        return providerError('MEDIA_SIZE_INVALID', origin);
      const expectedSha = resolvedEntry.presentation?.primaryDashboard?.sha256;
      if (!/^[a-f0-9]{64}$/i.test(expectedSha || ''))
        return providerError('MEDIA_HASH_MISSING', origin);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actualSha = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (actualSha.toLowerCase() !== expectedSha.toLowerCase())
        return providerError('MEDIA_INTEGRITY_ERROR', origin);
      const headers = {
        'content-type': type,
        'cache-control': 'private, no-store, max-age=0',
        pragma: 'no-cache', vary: 'Origin',
        'x-content-type-options': 'nosniff'
      };
      if (origin === PRODUCTION_ORIGIN) {
        headers['access-control-allow-origin'] = origin;
        headers['access-control-allow-headers'] = 'authorization, content-type';
        headers['access-control-allow-methods'] = 'POST, OPTIONS';
      }
      return new Response(bytes, { status: 200, headers });
    }
    const delivered = response(200, { status: 'ALLOW', publication }, origin);
    delivered.headers.set('x-gpir-editorial-source', config.GPIR_EDITORIAL_SOURCE === 'payload' ? 'payload' : 'contentful');
    return delivered;
  };
}

export { normalizedPayload, validInput };
import { resolveSubscriberAccess } from '../_shared/gpir-reader-entitlement.mjs';
