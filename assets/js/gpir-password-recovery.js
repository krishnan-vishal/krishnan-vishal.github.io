(function (global, document) {
  'use strict';
  const config = global.GPIR_SUPABASE_PUBLIC_CONFIG;
  const factory = global.GPIR_M34?.createSupabaseBrowserClient;
  let client = global.GPIR_SUPABASE_CLIENT || null;
  if (!client && config?.url && config?.publishableKey && factory && global.supabase?.createClient) {
    try { client = factory({ url: config.url, publishableKey: config.publishableKey, createClient: global.supabase.createClient }); }
    catch { client = null; }
  }
  function message(selector, value, error = false) {
    const el = document.querySelector(selector);
    if (el) { el.textContent = value; el.dataset.state = error ? 'error' : 'success'; }
  }
  document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    if (!input) return;
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    button.textContent = showing ? 'Hide password' : 'Show password';
    button.setAttribute('aria-pressed', String(showing));
  }));
  const request = document.querySelector('[data-recovery-request]');
  if (request) request.addEventListener('submit', async event => {
    event.preventDefault();
    const email = request.elements.email;
    if (!email?.checkValidity()) { message('[data-recovery-message]', 'Enter a valid email address.', true); return; }
    if (!client) { message('[data-recovery-message]', 'Recovery is temporarily unavailable.', true); return; }
    const button = request.querySelector('[type=submit]'); button.disabled = true;
    try {
      await client.auth.resetPasswordForEmail(email.value.trim(), {
        redirectTo: global.location.origin + '/reader/reset-password/'
      });
      message('[data-recovery-message]', 'If this email is registered, a recovery link will be sent. Check your inbox and spam folder.');
    } catch {
      message('[data-recovery-message]', 'If this email is registered, a recovery link will be sent. Check your inbox and spam folder.');
    } finally { button.disabled = false; }
  });
  const update = document.querySelector('[data-recovery-update]');
  if (!update) return;
  const status = '[data-reset-status]';
  if (!client) { message(status, 'Recovery is temporarily unavailable. Please request another link.', true); return; }
  let recoverySession = false;
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
      recoverySession = true;
      update.hidden = false;
      message(status, 'Recovery link verified. Choose a new password.');
    }
  });
  const url = new URL(global.location.href);
  const hash = new URLSearchParams(global.location.hash.slice(1));
  if (url.searchParams.has('error') || hash.has('error')) message(status, 'This recovery link is invalid or expired. Request another link.', true);
  update.addEventListener('submit', async event => {
    event.preventDefault();
    if (!recoverySession) { message('[data-recovery-message]', 'Open a valid recovery link before changing your password.', true); return; }
    const proposedSecret = update.elements.password.value;
    if (proposedSecret.length < 8) { message('[data-recovery-message]', 'Use at least 8 characters.', true); return; }
    if (proposedSecret !== update.elements.confirm.value) { message('[data-recovery-message]', 'Passwords do not match.', true); return; }
    const button = update.querySelector('[type=submit]'); button.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: proposedSecret });
      if (error) throw error;
      recoverySession = false; update.hidden = true;
      await client.auth.signOut();
      message(status, 'Password updated. Please sign in using your new password.');
    } catch { message('[data-recovery-message]', 'Password could not be updated. Request a new recovery link and try again.', true); }
    finally { button.disabled = false; }
  });
})(window, document);
