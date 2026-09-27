import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const script = await readFile(new URL('../../assets/js/gpir-reader-auth.js', import.meta.url), 'utf8');

function loadAuth({ origin = 'https://fintechoisis.com', href = `${origin}/` } = {}) {
  const values = new Map();
  const window = {
    location: new URL(href),
    localStorage: { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    addEventListener() {}
  };
  const document = { readyState: 'loading', head: { append() {} }, createElement: () => ({}),
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null };
  vm.runInNewContext(script, { window, document, URL, URLSearchParams, FormData: class {} });
  return { api: window.GPIRReaderAuth, window, values };
}

test('safe return only accepts same-origin GPIR-owned routes', () => {
  const { api } = loadAuth();
  assert.equal(api.safeReturnTo('/stablecoins-cross-border-money-movement-c2c/?ref=reader'),
    '/stablecoins-cross-border-money-movement-c2c/?ref=reader');
  assert.equal(api.safeReturnTo('/reader/sign-in/'), '/reader/sign-in/');
  assert.equal(api.safeReturnTo('https://attacker.example/'), '/');
  assert.equal(api.safeReturnTo('//attacker.example/'), '/');
  assert.equal(api.safeReturnTo('/not-a-gpir-route/'), '/');
  assert.equal(api.safeReturnTo('/%5c%5cattacker.example/'), '/');
});

test('return destination survives same-origin auth navigation and is consumed once', () => {
  const { api, values } = loadAuth();
  assert.equal(api.rememberReturnTo('/stablecoins-cross-border-money-movement-c2c/'),
    '/stablecoins-cross-border-money-movement-c2c/');
  assert.equal(values.get('gpir.reader.returnTo'), '/stablecoins-cross-border-money-movement-c2c/');
  assert.equal(api.consumeReturnTo(), '/stablecoins-cross-border-money-movement-c2c/');
  assert.equal(values.has('gpir.reader.returnTo'), false);
  assert.equal(api.consumeReturnTo(), '/');
});

test('reader-facing errors do not expose backend implementation terminology', () => {
  const { api } = loadAuth();
  assert.match(api.friendlyError({ message: 'Email link is invalid or has expired token' }), /verification link has expired/i);
  assert.match(api.friendlyError({ message: 'Invalid login credentials' }), /email or password was not recognized/i);
  assert.doesNotMatch(api.friendlyError({ message: 'database RPC error' }), /supabase|rpc|database/i);
});

test('signup requires verification callback and sign-in establishes only an authenticated session', async () => {
  const { api } = loadAuth();
  let signupInput;
  const client = { auth: {
    signUp: async input => { signupInput = input; return { data: { user: { id: 'reader' }, session: null } }; },
    signInWithPassword: async input => ({ data: { user: { id: 'reader' }, session: { access_token: 'test-only' } }, input })
  } };
  assert.equal(await api.submitCredentials({ client, type: 'signup', email: 'reader@example.test', password: 'long-enough-password', origin: 'https://fintechoisis.com' }), 'verification-pending');
  assert.equal(signupInput.options.emailRedirectTo, 'https://fintechoisis.com/auth/callback/');
  assert.equal(signupInput.email, 'reader@example.test');
  assert.equal(await api.submitCredentials({ client, type: 'signin', email: 'reader@example.test', password: 'long-enough-password' }), 'authenticated');
  assert.equal(await api.submitCredentials({ client: { auth: { signInWithPassword: async () => ({ data: { session: null } }) } }, type: 'signin', email: 'reader@example.test', password: 'x' }), 'verification-required');
  await assert.rejects(api.submitCredentials({ client, type: 'signup', email: 'reader@example.test', password: 'short' }), /8 characters/);
});
