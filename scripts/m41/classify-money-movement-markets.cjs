'use strict';
async function main() {
  const origin = new URL(process.env.PAYLOAD_PUBLIC_SERVER_URL);
  const key = process.env.PAYLOAD_RELEASE_API_KEY;
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !key) throw Error('Invalid HTTPS API configuration');
  const apply = process.argv.includes('--apply');
  const response = await fetch(origin.origin + '/api/release/editorial-entries', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
    headers: { authorization: 'users API-Key ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'classify-money-movement-markets', apply })
  });
  const result = await response.json();
  if (!response.ok) { console.error(JSON.stringify({ status: response.status, missing: result.missing, error: result.error })); throw Error('Classification API rejected request'); }
  const expected = apply ? 'PAYLOAD_CLASSIFICATION_VERIFIED' : 'PAYLOAD_CLASSIFICATION_DRY_RUN_VERIFIED';
  if (result.status !== expected || ![10, 11].includes(result.matched?.length) || (result.missing?.length > 0 && (result.missing.length !== 1 || result.missing[0] !== 'adult-content-payments'))) throw Error('Classification receipt incomplete');
  console.log(JSON.stringify({ status: expected, matched: result.matched, missing: result.missing, pendingUnpublishedChapter: result.missing?.includes('adult-content-payments') || false }));
}
main().catch(() => { console.error('Classification failed; verify deployed API and protected configuration.'); process.exitCode = 1; });
