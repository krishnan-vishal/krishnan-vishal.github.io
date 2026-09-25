'use strict';

const DECISIONS = new Set(['ALLOW', 'DENY']);
const PUBLICATION_ID = /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function result(status, publicationId, supabaseRecordId, reason) {
  return Object.freeze({
    status,
    authority: 'supabase',
    publicationId,
    supabaseRecordId,
    reason
  });
}

function validIdentity(publicationId, supabaseRecordId) {
  return typeof publicationId === 'string' && PUBLICATION_ID.test(publicationId) &&
    typeof supabaseRecordId === 'string' && UUID.test(supabaseRecordId);
}

function validSession(session, nowSeconds) {
  return session && typeof session === 'object' &&
    session.user && typeof session.user.id === 'string' && UUID.test(session.user.id) &&
    Number.isFinite(session.expires_at) && session.expires_at > nowSeconds;
}

function rpcDecision(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  return row && DECISIONS.has(row.decision) ? row.decision : null;
}

function createPublicationAuthorizationProvider(options = {}) {
  const { supabase } = options;
  const now = options.now || (() => Date.now());
  if (!supabase?.auth || typeof supabase.auth.getSession !== 'function' ||
      typeof supabase.auth.onAuthStateChange !== 'function' || typeof supabase.rpc !== 'function')
    throw new TypeError('A Supabase browser client with Auth and RPC support is required.');

  async function resolvePublicationAuthorization({ publicationId, supabaseRecordId } = {}) {
    if (!validIdentity(publicationId, supabaseRecordId))
      return result('DENY', publicationId, supabaseRecordId, 'MALFORMED_PUBLICATION_IDENTITY');

    let sessionResponse;
    try {
      sessionResponse = await supabase.auth.getSession();
    } catch {
      return result('ERROR', publicationId, supabaseRecordId, 'SESSION_PROVIDER_ERROR');
    }
    if (sessionResponse?.error)
      return result('ERROR', publicationId, supabaseRecordId, 'SESSION_PROVIDER_ERROR');

    const session = sessionResponse?.data?.session ?? null;
    if (session !== null && !validSession(session, Math.floor(now() / 1000)))
      return result('DENY', publicationId, supabaseRecordId, 'INVALID_SESSION');

    let response;
    try {
      response = await supabase.rpc('resolve_publication_entitlement', {
        p_publication_id: publicationId,
        p_supabase_record_id: supabaseRecordId
      });
    } catch {
      return result('ERROR', publicationId, supabaseRecordId, 'ENTITLEMENT_PROVIDER_ERROR');
    }
    if (response?.error)
      return result('ERROR', publicationId, supabaseRecordId, 'ENTITLEMENT_PROVIDER_ERROR');
    const decision = rpcDecision(response?.data);
    if (!decision)
      return result('DENY', publicationId, supabaseRecordId, 'MALFORMED_ENTITLEMENT_RESULT');
    return result(decision, publicationId, supabaseRecordId,
      decision === 'ALLOW' ? 'SUPABASE_ENTITLEMENT_ALLOW' : 'SUPABASE_ENTITLEMENT_DENY');
  }

  function observeAuthState(listener) {
    if (typeof listener !== 'function') throw new TypeError('An auth-state listener is required.');
    return supabase.auth.onAuthStateChange((event, session) => {
      const authenticated = validSession(session, Math.floor(now() / 1000));
      listener(Object.freeze({ event, authenticated }));
    });
  }

  return Object.freeze({ resolvePublicationAuthorization, observeAuthState });
}

module.exports = { createPublicationAuthorizationProvider, rpcDecision, validIdentity, validSession };
