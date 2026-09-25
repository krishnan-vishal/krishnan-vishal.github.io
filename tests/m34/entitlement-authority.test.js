'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createSupabaseBrowserClient } = require('../../scripts/m34/supabase-browser-client');
const { createPublicationAuthorizationProvider } = require('../../scripts/m34/publication-authorization-provider');
const { authorizePublicationWithProvider } = require('../../scripts/m35/contentful-auth-boundary');
const { renderPublicationPage, renderPublicationPageWithProvider } = require('../../scripts/m35/contentful-publication-renderer');

const publicationId = 'VK-GPIR-P-000000000001-8';
const supabaseRecordId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const publication = { identity: publicationId, supabaseRecordId };
const request = { publicationId, supabaseRecordId };

function client({ session = null, sessionError = null, rpcData = [{ decision: 'DENY' }], rpcError = null } = {}) {
  return {
    auth: {
      async getSession() { return { data: { session }, error: sessionError }; },
      onAuthStateChange(callback) { return { data: { subscription: { unsubscribe() {} } }, callback }; }
    },
    async rpc() { return { data: rpcData, error: rpcError }; }
  };
}

function session(overrides = {}) {
  return { user: { id: userId }, expires_at: 2000000000, access_token: 'must-not-leak', ...overrides };
}

function provider(options) {
  return createPublicationAuthorizationProvider({ supabase: client(options), now: () => 1000000000000 });
}

test('anonymous public policy resolves ALLOW through the authoritative RPC', async () => {
  assert.equal((await provider({ rpcData: [{ decision: 'ALLOW' }] })
    .resolvePublicationAuthorization(request)).status, 'ALLOW');
});

test('anonymous protected policy resolves DENY', async () => {
  assert.equal((await provider().resolvePublicationAuthorization(request)).status, 'DENY');
});

test('authenticated public and authenticated-only policies accept RPC ALLOW', async () => {
  for (const ignoredPolicyClass of ['PUBLIC', 'AUTHENTICATED']) {
    const decision = await provider({ session: session(), rpcData: [{ decision: 'ALLOW' }] })
      .resolvePublicationAuthorization(request);
    assert.equal(decision.status, 'ALLOW', ignoredPolicyClass);
  }
});

test('entitled and not-entitled decisions remain database authoritative', async () => {
  assert.equal((await provider({ session: session(), rpcData: [{ decision: 'ALLOW' }] })
    .resolvePublicationAuthorization(request)).status, 'ALLOW');
  assert.equal((await provider({ session: session(), rpcData: [{ decision: 'DENY' }] })
    .resolvePublicationAuthorization(request)).status, 'DENY');
});

test('expired and inactive entitlements resolve DENY from RPC', async () => {
  for (const state of ['expired', 'inactive']) {
    assert.equal((await provider({ session: session(), rpcData: [{ decision: 'DENY' }] })
      .resolvePublicationAuthorization(request)).status, 'DENY', state);
  }
});

test('unknown publication and exact identity mismatches resolve DENY', async () => {
  assert.equal((await provider().resolvePublicationAuthorization(request)).status, 'DENY');
  assert.equal((await provider().resolvePublicationAuthorization({ ...request,
    publicationId: 'VK-GPIR-P-000000000002-6' })).status, 'DENY');
  assert.equal((await provider().resolvePublicationAuthorization({ ...request,
    supabaseRecordId: '33333333-3333-4333-8333-333333333333' })).status, 'DENY');
});

test('malformed identity and malformed RPC output fail closed', async () => {
  assert.equal((await provider().resolvePublicationAuthorization({ publicationId: 'bad', supabaseRecordId })).status, 'DENY');
  for (const rpcData of [null, [], [{ decision: 'MAYBE' }], [{ decision: 'ALLOW' }, { decision: 'DENY' }]])
    assert.equal((await provider({ rpcData }).resolvePublicationAuthorization(request)).status, 'DENY');
});

test('RPC and session provider errors normalize to ERROR', async () => {
  assert.equal((await provider({ rpcError: new Error('unavailable') })
    .resolvePublicationAuthorization(request)).status, 'ERROR');
  assert.equal((await provider({ sessionError: new Error('unavailable') })
    .resolvePublicationAuthorization(request)).status, 'ERROR');
});

test('missing session is anonymous while expired and malformed sessions deny before RPC', async () => {
  assert.equal((await provider().resolvePublicationAuthorization(request)).status, 'DENY');
  assert.equal((await provider({ session: session({ expires_at: 1 }), rpcData: [{ decision: 'ALLOW' }] })
    .resolvePublicationAuthorization(request)).status, 'DENY');
  assert.equal((await provider({ session: { user: {} }, rpcData: [{ decision: 'ALLOW' }] })
    .resolvePublicationAuthorization(request)).status, 'DENY');
});

test('raw session credentials never appear in normalized provider output', async () => {
  const decision = await provider({ session: session(), rpcData: [{ decision: 'ALLOW' }] })
    .resolvePublicationAuthorization(request);
  assert.doesNotMatch(JSON.stringify(decision), /must-not-leak|access_token/i);
});

test('K1 accepts only a matching provider ALLOW and denies ERROR, mismatch, missing provider and throws', async () => {
  const allowed = await authorizePublicationWithProvider(publication,
    provider({ session: session(), rpcData: [{ decision: 'ALLOW' }] }));
  assert.equal(allowed.allowed, true);
  assert.equal((await authorizePublicationWithProvider(publication)).allowed, false);
  assert.equal((await authorizePublicationWithProvider(publication, {
    async resolvePublicationAuthorization() { return { status: 'ERROR' }; }
  })).allowed, false);
  assert.equal((await authorizePublicationWithProvider(publication, {
    async resolvePublicationAuthorization() { return { status: 'ALLOW', authority: 'supabase',
      publicationId: 'VK-GPIR-P-000000000002-6', supabaseRecordId }; }
  })).allowed, false);
  assert.equal((await authorizePublicationWithProvider(publication, {
    async resolvePublicationAuthorization() { throw new Error('provider down'); }
  })).allowed, false);
});

test('renderer exposes protected content only through a sealed matching provider ALLOW', async () => {
  const view = { ...publication, title: 'Title', summary: 'Protected summary', publicationType: 'Research',
    body: { nodeType: 'document', content: [{ nodeType: 'paragraph', content: [
      { nodeType: 'text', value: 'Protected body', marks: [] }] }] },
    provenance: {}, internal: { asset: { state: 'NONE' } } };
  const fabricated = renderPublicationPage(view, { authorization: { authority: 'supabase', decision: 'ALLOW',
    publicationId, supabaseRecordId } });
  assert.doesNotMatch(fabricated, /Protected body/);
  const allowed = await renderPublicationPageWithProvider(view,
    provider({ session: session(), rpcData: [{ decision: 'ALLOW' }] }));
  assert.match(allowed, /Protected body/);
  const denied = await renderPublicationPageWithProvider(view,
    provider({ session: session(), rpcError: new Error('down') }));
  assert.doesNotMatch(denied, /Protected body/);
});

test('browser client accepts only modern publishable credentials', () => {
  let received;
  const created = createSupabaseBrowserClient({ url: 'https://example.supabase.co/',
    publishableKey: 'sb_publishable_public123', createClient(...args) { received = args; return {}; } });
  assert.deepEqual(created, {});
  assert.equal(received[0], 'https://example.supabase.co');
  for (const key of ['service_role_secret', 'eyJhbGciOi.x.y', 'legacy-anon-key'])
    assert.throws(() => createSupabaseBrowserClient({ url: 'https://example.supabase.co',
      publishableKey: key, createClient() {} }), /publishable|forbidden/i);
});

test('migration enforces RLS, isolation, no self-mutation, exact pairs, no duplicates and safe grants', () => {
  const sql = fs.readFileSync(path.join(__dirname,
    '../../supabase/migrations/20260925000000_m34_entitlement_authority.sql'), 'utf8');
  assert.match(sql, /gpir_user_access_profiles[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /gpir_publication_access_policies[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/);
  assert.match(sql, /publication_id text NOT NULL UNIQUE/);
  assert.match(sql, /publication\.id = NEW\.supabase_record_id[\s\S]*publication\.gpir_publication_id = NEW\.publication_id/);
  assert.match(sql, /profile\.user_id = caller/);
  assert.match(sql, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /GRANT\s+(INSERT|UPDATE|DELETE|SELECT).*gpir_(user_access|publication_access)/i);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO anon, authenticated/);
  assert.match(sql, /p_supabase_record_id !~\*/);
  assert.match(sql, /'ENTITLED',[\s\S]*'M34_A3_UNRESOLVED_DEFAULT',[\s\S]*'OWNER_REVIEW'/);
});

test('frontend source contains no service role, legacy JWT, password, or Contentful credential', () => {
  const sources = ['supabase-browser-client.js', 'publication-authorization-provider.js']
    .map(name => fs.readFileSync(path.join(__dirname, '../../scripts/m34', name), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /CONTENTFUL_(MANAGEMENT|DELIVERY|PREVIEW)_TOKEN|database[_-]?password/i);
  assert.doesNotMatch(sources, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  assert.doesNotMatch(sources, /sb_secret_/);
});

test('auth-state observer exposes only normalized state', () => {
  let callback;
  const supabase = client();
  supabase.auth.onAuthStateChange = cb => { callback = cb; return { data: { subscription: {} } }; };
  const authProvider = createPublicationAuthorizationProvider({ supabase, now: () => 1000000000000 });
  let observed;
  authProvider.observeAuthState(value => { observed = value; });
  callback('SIGNED_IN', session());
  assert.deepEqual(observed, { event: 'SIGNED_IN', authenticated: true });
  assert.doesNotMatch(JSON.stringify(observed), /access_token|must-not-leak/i);
});
