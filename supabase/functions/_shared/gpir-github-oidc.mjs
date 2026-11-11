// M40 GitHub Actions OIDC verifier. No publication or database privileges.
const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = ISSUER + '/.well-known/jwks';
const MAX_TOKEN_LENGTH = 8192;
function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('OIDC_MALFORMED');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
function parseSegment(value) {
  try { return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))); }
  catch { throw new Error('OIDC_MALFORMED'); }
}
function deny() { throw new Error('OIDC_DENIED'); }
export async function verifyGithubPublisherOIDC(token, {
  audience, repository = 'krishnan-vishal/krishnan-vishal.github.io',
  ref = 'refs/heads/main', environment = 'gpir-editorial-publisher',
  workflowPath = '.github/workflows/m40-governed-editorial-publisher.yml',
  now = Math.floor(Date.now() / 1000), fetchImpl = fetch
} = {}) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH || !audience) deny();
  const parts = token.split('.');
  if (parts.length !== 3) deny();
  const header = parseSegment(parts[0]);
  const payload = parseSegment(parts[1]);
  if (!header || !payload || !['RS256', 'ES256'].includes(header.alg) ||
      typeof header.kid !== 'string' || !header.kid || header.typ !== 'JWT') deny();
  const expectedWorkflow = repository + '/' + workflowPath + '@' + ref;
  if (payload.iss !== ISSUER || payload.aud !== audience ||
      payload.repository !== repository || payload.ref !== ref ||
      payload.environment !== environment || payload.workflow_ref !== expectedWorkflow ||
      payload.event_name !== 'workflow_dispatch' ||
      typeof payload.sub !== 'string' ||
      payload.sub !== 'repo:' + repository + ':environment:' + environment ||
      !Number.isInteger(payload.iat) || !Number.isInteger(payload.nbf) ||
      !Number.isInteger(payload.exp) || payload.iat > now + 30 ||
      payload.nbf > now + 30 || payload.exp <= now ||
      payload.exp - payload.iat > 600 || now - payload.iat > 600) deny();
  const response = await fetchImpl(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) deny();
  const jwks = await response.json();
  const key = Array.isArray(jwks.keys) && jwks.keys.find(k =>
    k.kid === header.kid && k.kty === (header.alg === 'RS256' ? 'RSA' : 'EC') &&
    k.use === 'sig' && (!k.alg || k.alg === header.alg) &&
    (header.alg !== 'ES256' || k.crv === 'P-256'));
  if (!key) deny();
  const algorithm = header.alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' };
  const publicKey = await crypto.subtle.importKey('jwk', key, algorithm, false, ['verify']);
  const signature = decodeBase64Url(parts[2]);
  const valid = await crypto.subtle.verify(header.alg === 'RS256'
    ? algorithm : { name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature,
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!valid) deny();
  return { repository, ref, environment, workflow_ref: expectedWorkflow, run_id: payload.run_id };
}
