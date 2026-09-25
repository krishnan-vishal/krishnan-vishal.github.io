'use strict';

function createSupabaseBrowserClient(options = {}) {
  const { url, publishableKey, createClient } = options;
  if (typeof createClient !== 'function')
    throw new TypeError('A Supabase browser createClient factory is required.');
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url.trim()))
    throw new TypeError('A valid public Supabase project URL is required.');
  if (typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey.trim()))
    throw new TypeError('A modern browser-safe Supabase publishable key is required.');
  if (/service[_-]?role/i.test(publishableKey) || publishableKey.split('.').length === 3)
    throw new TypeError('Legacy JWT and service-role credentials are forbidden in the browser.');

  return createClient(url.trim().replace(/\/$/, ''), publishableKey.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

module.exports = { createSupabaseBrowserClient };

