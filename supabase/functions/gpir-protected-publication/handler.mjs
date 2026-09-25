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
  const names = ['SUPABASE_URL', 'GPIR_SUPABASE_PUBLISHABLE_KEY',
    'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT', 'CONTENTFUL_DELIVERY_TOKEN'];
  const values = Object.fromEntries(names.map(name => [name, env[name]?.trim()]));
  return names.every(name => values[name]) ? values : null;
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

function normalizedPayload(entry, publicationId, supabaseRecordId) {
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
    if (!validInput(input)) return denied(400, 'MALFORMED_PUBLICATION_IDENTITY', origin);

    const token = bearerToken(request);
    if (!token) return denied(401, 'SESSION_REQUIRED', origin);
    const authHeaders = {
      apikey: config.GPIR_SUPABASE_PUBLISHABLE_KEY,
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
    if (entitlement[0].decision !== 'ALLOW') return denied(403, 'NOT_ENTITLED', origin);

    const query = new URLSearchParams({ content_type: 'gpirPublication',
      'fields.gpirPublicationId': input.publicationId, include: '2', limit: '2' });
    const contentfulUrl = `https://cdn.contentful.com/spaces/${encodeURIComponent(config.CONTENTFUL_SPACE_ID)}` +
      `/environments/${encodeURIComponent(config.CONTENTFUL_ENVIRONMENT)}/entries?${query}`;
    let contentfulResponse;
    try {
      contentfulResponse = await fetchImpl(contentfulUrl, {
        headers: { authorization: `Bearer ${config.CONTENTFUL_DELIVERY_TOKEN}` }
      });
    } catch { return providerError('CONTENT_PROVIDER_ERROR', origin); }
    if (!contentfulResponse.ok) return providerError('CONTENT_PROVIDER_ERROR', origin);
    let collection;
    try { collection = await contentfulResponse.json(); }
    catch { return providerError('CONTENT_PROVIDER_ERROR', origin); }
    if (!Array.isArray(collection?.items) || collection.items.length !== 1)
      return denied(403, collection?.items?.length > 1 ? 'DUPLICATE_PUBLICATION' : 'UNKNOWN_PUBLICATION', origin);
    const publication = normalizedPayload(collection.items[0], input.publicationId, input.supabaseRecordId);
    if (!publication) return denied(403, 'CONTENT_IDENTITY_MISMATCH', origin);
    return response(200, { status: 'ALLOW', publication }, origin);
  };
}

export { normalizedPayload, validInput };
