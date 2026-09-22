'use strict';

// Caller must supply two independent disposable-project sessions. Never imports credentials.
async function runSameSourceConcurrency({ environment, sourceUnitKey, createSession, request } = {}) {
  if (environment !== 'GPIR-M35-RUNTIME-TEST' ||
      !/^gpir:intake:publication:runtime-validation:[a-z0-9-]+$/.test(sourceUnitKey || '') ||
      typeof createSession !== 'function' || !request || request.sourceUnitKey !== sourceUnitKey ||
      request.claimedPublicationId != null)
    throw new Error('Disposable project, fresh test key and governed request are required.');
  const sessions = await Promise.all([createSession(1), createSession(2)]);
  if (!sessions[0] || !sessions[1] || sessions[0] === sessions[1] ||
      sessions.some(session => typeof session.resolve !== 'function' || typeof session.inspect !== 'function'))
    throw new Error('Two independent resolve/inspect sessions are required.');
  let release;
  const start = new Promise(resolve => { release = resolve; });
  const calls = sessions.map(async session => { await start; return session.resolve(request); });
  release();
  const outcomes = await Promise.allSettled(calls);
  if (outcomes.some(outcome => outcome.status !== 'fulfilled'))
    throw new Error('Concurrent resolution failed; inspect both session outcomes.');
  const [first, second] = outcomes.map(outcome => outcome.value);
  const snapshot = await sessions[0].inspect(sourceUnitKey);
  if (!first || !second || first.identityStatus !== 'GOVERNED_ASSIGNED' ||
      second.identityStatus !== 'GOVERNED_ASSIGNED' || first.id !== second.id ||
      first.gpirPublicationId !== second.gpirPublicationId ||
      first.editionLineageId !== second.editionLineageId ||
      snapshot.publicationRows !== 1 || snapshot.lineageRows !== 1 ||
      snapshot.assignmentEvents !== 1 || snapshot.duplicatePublicIds !== 0)
    throw new Error('Concurrent same-source identity invariant failed.');
  return { concurrentSessions: 2, sameAuthoritativeRow: true,
    publicationRows: 1, lineageRows: 1, assignmentEvents: 1,
    duplicatePublicIds: 0, identityStatus: 'GOVERNED_ASSIGNED' };
}

module.exports = { runSameSourceConcurrency };
