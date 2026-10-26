const PUBLICATION_ID = /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SANDBOX_PROJECT = 'hoewtptllwkcqrgryazu';
const SANDBOX_PREVIEW_ORIGIN =
  'https://gpir-m37-sandbox-checkout-20261026.amusedhill18.chatgpt.site';

function allowedOrigins(env) {
  const origins = new Set(String(env.GPIR_ALLOWED_ORIGINS || '').split(',')
    .map(value => value.trim()).filter(Boolean));
  try {
    if (new URL(env.SUPABASE_URL).hostname === `${SANDBOX_PROJECT}.supabase.co`)
      origins.add(SANDBOX_PREVIEW_ORIGIN);
  } catch {}
  return origins;
}

function response(status, body, origin, env) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    pragma: 'no-cache',
    vary: 'Origin'
  };
  if (origin && allowedOrigins(env).has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, content-type';
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function denied(status, reason, origin, env) {
  return response(status, { status: 'DENY', reason }, origin, env);
}

function providerError(reason, origin, env) {
  return response(503, { status: 'ERROR', reason }, origin, env);
}

function configuration(env) {
  const names = ['SUPABASE_URL', 'GPIR_SUPABASE_PUBLISHABLE_KEY',
    'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT', 'CONTENTFUL_DELIVERY_TOKEN'];
  const values = Object.fromEntries(names.map(name => [name, env[name]?.trim()]));
  if (!names.every(name => values[name])) return null;
  const contentfulHost = (env.CONTENTFUL_HOST || 'cdn.contentful.com').trim().toLowerCase();
  if (!['cdn.contentful.com', 'preview.contentful.com'].includes(contentfulHost)) return null;
  return { ...values, CONTENTFUL_HOST: contentfulHost };
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

// Sandbox-only, explicitly reviewed bridge between the runtime-test identity registry
// and the Contentful record. Never infer mappings from a publication ID alone.
const SANDBOX_CONTENT_IDENTITY_MAP = Object.freeze({
  'VK-GPIR-P-000000000001-8': Object.freeze({
    sandboxRecordId: '1f259c71-5af8-4145-b12d-d8a5754732b5',
    contentfulRecordId: '8ea94d2b-3254-4ddc-a50a-f10444b252f4'
  })
});

function contentIdentityMatches(fields, publicationId, supabaseRecordId, env) {
  if (scalar(fields?.gpirPublicationId) !== publicationId) return false;
  const actual = scalar(fields?.supabaseRecordId);
  if (actual === supabaseRecordId) return true;
  // Only the known Sandbox project may bridge a reviewed pair. Production
  // continues to require exact identity equality.
  let sandbox = false;
  try { sandbox = new URL(env?.SUPABASE_URL).hostname === `${SANDBOX_PROJECT}.supabase.co`; }
  catch { return false; }
  if (!sandbox) return false;
  const mapping = SANDBOX_CONTENT_IDENTITY_MAP[publicationId];
  return !!mapping && mapping.sandboxRecordId === supabaseRecordId &&
    mapping.contentfulRecordId === actual;
}

function normalizedPayload(entry, publicationId, supabaseRecordId, collection = null, env = null) {
  const fields = entry?.fields;
  if (!fields || !contentIdentityMatches(fields, publicationId, supabaseRecordId, env)) return null;
  return Object.freeze({
    identity: publicationId,
    supabaseRecordId,
    title: scalar(fields.publicationTitle),
    publicationType: scalar(fields.publicationType),
    summary: scalar(fields.executiveSummary),
    body: fields.editorialBody ?? null,
    primaryDashboard: resolvedDashboard(fields, collection),
    provenance: Object.freeze({
      validationSummary: scalar(fields.sourceValidationSummary),
      legacySourceUrl: scalar(fields.legacySourceUrl)
    })
  });
}

export function createProtectedPublicationHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins(env).has(origin))
      return denied(403, 'ORIGIN_NOT_ALLOWED', null, env);
    if (request.method === 'OPTIONS') return response(204, {}, origin, env);
    if (request.method !== 'POST') return denied(405, 'METHOD_NOT_ALLOWED', origin, env);

    const config = configuration(env);
    if (!config) return providerError('PROVIDER_CONFIGURATION_ERROR', origin, env);
    let input;
    try { input = await request.json(); }
    catch { return denied(400, 'MALFORMED_REQUEST', origin, env); }
    if (!validInput(input)) return denied(400, 'MALFORMED_PUBLICATION_IDENTITY', origin, env);

    const token = bearerToken(request);
    if (!token) return denied(401, 'SESSION_REQUIRED', origin, env);
    const authHeaders = {
      apikey: config.GPIR_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    };

    let userResponse;
    try {
      userResponse = await fetchImpl(`${config.SUPABASE_URL}/auth/v1/user`, { headers: authHeaders });
    } catch { return denied(401, 'SESSION_VERIFICATION_FAILED', origin, env); }
    if (!userResponse.ok) return denied(401, 'INVALID_SESSION', origin, env);
    let user;
    try { user = await userResponse.json(); }
    catch { return denied(401, 'MALFORMED_SESSION', origin, env); }
    if (!user || typeof user.id !== 'string' || !UUID.test(user.id))
      return denied(401, 'MALFORMED_SESSION', origin, env);

    let entitlementResponse;
    try {
      entitlementResponse = await fetchImpl(
        `${config.SUPABASE_URL}/rest/v1/rpc/resolve_publication_entitlement`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ p_publication_id: input.publicationId,
            p_supabase_record_id: input.supabaseRecordId })
        });
    } catch { return providerError('ENTITLEMENT_PROVIDER_ERROR', origin, env); }
    if (!entitlementResponse.ok) return providerError('ENTITLEMENT_PROVIDER_ERROR', origin, env);
    let entitlement;
    try { entitlement = await entitlementResponse.json(); }
    catch { return denied(403, 'MALFORMED_ENTITLEMENT_RESULT', origin, env); }
    if (!Array.isArray(entitlement) || entitlement.length !== 1 ||
        !['ALLOW', 'DENY'].includes(entitlement[0]?.decision))
      return denied(403, 'MALFORMED_ENTITLEMENT_RESULT', origin, env);
    if (entitlement[0].decision !== 'ALLOW') return denied(403, 'NOT_ENTITLED', origin, env);

    const query = new URLSearchParams({ content_type: 'gpirPublication',
      'fields.gpirPublicationId': input.publicationId, include: '2', limit: '2' });
    const contentfulUrl = `https://${config.CONTENTFUL_HOST}/spaces/${encodeURIComponent(config.CONTENTFUL_SPACE_ID)}` +
      `/environments/${encodeURIComponent(config.CONTENTFUL_ENVIRONMENT)}/entries?${query}`;
    let contentfulResponse;
    try {
      contentfulResponse = await fetchImpl(contentfulUrl, {
        headers: { authorization: `Bearer ${config.CONTENTFUL_DELIVERY_TOKEN}` }
      });
    } catch { return providerError('CONTENT_PROVIDER_ERROR', origin, env); }
    if (!contentfulResponse.ok) return providerError('CONTENT_PROVIDER_ERROR', origin, env);
    let collection;
    try { collection = await contentfulResponse.json(); }
    catch { return providerError('CONTENT_PROVIDER_ERROR', origin, env); }
    if (!Array.isArray(collection?.items) || collection.items.length !== 1)
      return denied(403, collection?.items?.length > 1 ? 'DUPLICATE_PUBLICATION' : 'UNKNOWN_PUBLICATION', origin, env);
    const publication = normalizedPayload(collection.items[0], input.publicationId,
      input.supabaseRecordId, collection, env);
    if (!publication) return denied(403, 'CONTENT_IDENTITY_MISMATCH', origin, env);
    return response(200, { status: 'ALLOW', publication }, origin, env);
  };
}

export { normalizedPayload, validInput };
