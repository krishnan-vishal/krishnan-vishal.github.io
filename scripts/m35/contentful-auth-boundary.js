'use strict';

const CONTROLLED_VALIDATION_CAPABILITY = Symbol('M35_K1_CONTROLLED_VALIDATION');

function controlledValidationAuthorization(publication) {
  return Object.freeze({
    authority: 'supabase',
    decision: 'ALLOW',
    mode: 'controlled-local-validation',
    publicationId: publication.identity,
    supabaseRecordId: publication.supabaseRecordId,
    capability: CONTROLLED_VALIDATION_CAPABILITY
  });
}

function authorizePublication(publication, authorization) {
  const allowed = authorization?.authority === 'supabase' &&
    authorization?.decision === 'ALLOW' &&
    authorization?.publicationId === publication.identity &&
    authorization?.supabaseRecordId === publication.supabaseRecordId &&
    authorization?.capability === CONTROLLED_VALIDATION_CAPABILITY;
  return Object.freeze({
    allowed,
    authority: 'supabase',
    reason: allowed ? 'CONTROLLED_LOCAL_VALIDATION' : 'SUPABASE_AUTHORIZATION_REQUIRED'
  });
}

async function resolveProviderAuthorization(publication, provider) {
  if (!provider || typeof provider.resolvePublicationAuthorization !== 'function')
    return undefined;
  let decision;
  try {
    decision = await provider.resolvePublicationAuthorization({
      publicationId: publication?.identity,
      supabaseRecordId: publication?.supabaseRecordId
    });
  } catch {
    return undefined;
  }
  if (decision?.status !== 'ALLOW' || decision?.authority !== 'supabase' ||
      decision?.publicationId !== publication?.identity ||
      decision?.supabaseRecordId !== publication?.supabaseRecordId)
    return undefined;
  return Object.freeze({
    authority: 'supabase',
    decision: 'ALLOW',
    mode: 'm34-entitlement-provider',
    publicationId: decision.publicationId,
    supabaseRecordId: decision.supabaseRecordId,
    capability: CONTROLLED_VALIDATION_CAPABILITY
  });
}

async function authorizePublicationWithProvider(publication, provider) {
  return authorizePublication(publication,
    await resolveProviderAuthorization(publication, provider));
}

module.exports = { authorizePublication, authorizePublicationWithProvider,
  controlledValidationAuthorization, resolveProviderAuthorization };
