import { verifyGithubPublisherOIDC } from '../_shared/gpir-github-oidc.mjs';

// Phase 2 security canary: no database client, CMS token, or publication code.
// The registration capability remains disabled until authorized end-to-end tests.
function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
  } });
}
export async function handleM40OIDC(request, verify = verifyGithubPublisherOIDC) {
  if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  const auth = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(auth)) return reply(401, { error: 'UNAUTHORIZED' });
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return reply(415, { error: 'UNSUPPORTED_MEDIA_TYPE' });
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 512) return reply(413, { error: 'REQUEST_TOO_LARGE' });
    body = JSON.parse(raw);
  } catch { return reply(400, { error: 'INVALID_JSON' }); }
  if (!body || Array.isArray(body) || Object.keys(body).length !== 1 ||
      body.operation !== 'verify-only') return reply(403, { error: 'REGISTRATION_DISABLED' });
  try {
    await verify(auth.slice(7), { audience: 'gpir-m40-draft-registration',
      workflowPath: '.github/workflows/m40-oidc-smoke.yml' });
    return reply(200, { status: 'OIDC_VERIFIED', registration: 'DISABLED' });
  } catch {
    return reply(401, { error: 'UNAUTHORIZED' });
  }
}
