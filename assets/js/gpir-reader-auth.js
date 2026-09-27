(function (global, document) {
  'use strict';
  if (!document.querySelector('link[href*="reader-auth.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet'; stylesheet.href = '/assets/css/reader-auth.css?v=1';
    document.head.append(stylesheet);
  }
  const RETURN_KEY = 'gpir.reader.returnTo';
  const C2C = '/stablecoins-cross-border-money-movement-c2c/';
  const OWNED_ROUTES = new Set(['/', C2C, '/auth/callback/', '/reader/sign-in/', '/reader/create-account/']);
  const callback = '/auth/callback/';

  function safeReturnTo(value, origin = global.location.origin) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
    try {
      const url = new URL(value, origin);
      if (url.origin !== origin || url.username || url.password || !OWNED_ROUTES.has(url.pathname)) return '/';
      return `${url.pathname}${url.search}${url.hash}`;
    } catch { return '/'; }
  }
  function rememberReturnTo(value) {
    const safe = safeReturnTo(value);
    try { global.localStorage.setItem(RETURN_KEY, safe); } catch {}
    return safe;
  }
  function consumeReturnTo() {
    let stored = '/';
    try { stored = global.localStorage.getItem(RETURN_KEY) || '/'; global.localStorage.removeItem(RETURN_KEY); } catch {}
    return safeReturnTo(stored);
  }
  function formDestination() {
    const supplied = new URL(global.location.href).searchParams.get('returnTo');
    let previous = null;
    try { previous = global.localStorage.getItem(RETURN_KEY); } catch {}
    return rememberReturnTo(supplied || previous || C2C);
  }
  function friendlyError(error) {
    const message = String(error?.message || '').toLowerCase();
    if (/email.*not.*(confirm|verif)|not confirmed/.test(message)) return 'Verify your email before signing in. Check your inbox for the latest verification link.';
    if (/expired|invalid.*(token|otp)|token.*(expired|invalid)/.test(message)) return 'That verification link has expired or is invalid. Please request a new one.';
    if (/already.*(confirm|verified|used)|email.*confirmed/.test(message)) return 'Your email is already verified. You can sign in to continue.';
    if (/invalid login|credentials/.test(message)) return 'The email or password was not recognized.';
    if (/password/.test(message)) return 'Please choose a password with at least 8 characters.';
    return 'We could not complete that request. Please try again.';
  }
  function announce(form, message, isError = false) {
    const output = form?.querySelector('[data-auth-message]') || document.querySelector('[data-auth-message]');
    if (output) { output.textContent = message; output.dataset.state = isError ? 'error' : 'success'; }
  }
  async function submitCredentials({ client, type, email, password, origin = global.location.origin }) {
    if (!client?.auth || !email || !password) throw new TypeError('Email and password are required.');
    if (type === 'signup') {
      if (password.length < 8) throw new TypeError('Choose a password with at least 8 characters.');
      const response = await client.auth.signUp({ email, password,
        options: { emailRedirectTo: `${origin}${callback}` } });
      if (response.error) throw response.error;
      return response.data?.session ? 'authenticated' : 'verification-pending';
    }
    const response = await client.auth.signInWithPassword({ email, password });
    if (response.error) throw response.error;
    return response.data?.session ? 'authenticated' : 'verification-required';
  }
  function initializeClient() {
    if (global.GPIR_SUPABASE_CLIENT) return global.GPIR_SUPABASE_CLIENT;
    const config = global.GPIR_SUPABASE_PUBLIC_CONFIG;
    const sdk = global.supabase;
    const factory = global.GPIR_M34?.createSupabaseBrowserClient;
    if (!config?.url || !config.publishableKey || !sdk?.createClient || !factory) return null;
    try {
      return global.GPIR_SUPABASE_CLIENT = factory({ url: config.url,
        publishableKey: config.publishableKey, createClient: sdk.createClient });
    } catch { return null; }
  }
  function returnAfterLogin() { global.location.assign(consumeReturnTo()); }

  async function handleForm(form, client) {
    const type = form.dataset.authForm;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');
      if (!email || !password) { announce(form, 'Enter your email and password.', true); return; }
      if (!form.querySelector('[name="email"]')?.checkValidity()) { announce(form, 'Enter a valid email address.', true); return; }
      if (type === 'signup' && password.length < 8) { announce(form, 'Use a password with at least 8 characters.', true); return; }
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const result = await submitCredentials({ client, type, email, password, origin: global.location.origin });
        if (result === 'verification-pending') {
          announce(form, 'Check your inbox for a verification link. After verifying, sign in to continue.');
          return;
        }
        if (result === 'verification-required') {
          announce(form, 'Verify your email before signing in. Check your inbox for the latest verification link.', true);
          return;
        }
        returnAfterLogin();
      } catch (error) { announce(form, friendlyError(error), true); }
      finally { if (button) button.disabled = false; }
    });
  }
  async function initialize() {
    const client = sharedClient;
    const path = global.location.pathname.replace(/\/{2,}/g, '/');
    const forms = document.querySelectorAll('[data-auth-form]');
    for (const form of forms) {
      formDestination();
      if (!client) { announce(form, 'Reader access is temporarily unavailable. Please try again later.', true); continue; }
      await handleForm(form, client);
    }
    const buttons = document.querySelector('[data-gpir-reader-actions]');
    if (buttons) {
      const current = `${global.location.pathname}${global.location.search}${global.location.hash}`;
      const destination = safeReturnTo(current);
      buttons.innerHTML = `<a class="gpir-reader-action" href="/reader/sign-in/?returnTo=${encodeURIComponent(destination)}">Sign in</a><a class="gpir-reader-action gpir-reader-action--primary" href="/reader/create-account/?returnTo=${encodeURIComponent(destination)}">Create account</a>`;
      if (client) {
        const { data } = await client.auth.getSession();
        if (data?.session?.user) {
          const email = document.createElement('span'); email.className = 'gpir-reader-state'; email.textContent = 'Reader';
          const signout = document.createElement('button'); signout.type = 'button'; signout.className = 'gpir-reader-action'; signout.textContent = 'Sign out';
          signout.addEventListener('click', async () => {
            try { const response = await client.auth.signOut(); if (response.error) throw response.error;
              global.location.reload(); }
            catch (error) { announce(null, friendlyError(error), true); }
          });
          buttons.replaceChildren(email, signout);
        }
      }
    }
    if (path === callback) {
      const status = document.querySelector('[data-callback-status]');
      const params = new URLSearchParams(global.location.search);
      const hashParams = new URLSearchParams(global.location.hash.replace(/^#/, ''));
      const codeError = params.get('error_description') || params.get('error') ||
        hashParams.get('error_description') || hashParams.get('error');
      if (codeError) { if (status) status.textContent = friendlyError({ message: codeError }); return; }
      if (!client) { if (status) status.textContent = 'Email verification could not be completed right now. Please try again later.'; return; }
      const { data, error } = await client.auth.getSession();
      if (error) { if (status) status.textContent = friendlyError(error); return; }
      if (data?.session) returnAfterLogin();
      else if (status) status.textContent = 'Your email link was received. Sign in to continue, or create an account if you have not registered yet.';
    }
  }
  const sharedClient = initializeClient();
  global.GPIRReaderAuth = Object.freeze({ safeReturnTo, rememberReturnTo, consumeReturnTo,
    friendlyError, submitCredentials });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void initialize(); });
  else void initialize();
})(window, document);
