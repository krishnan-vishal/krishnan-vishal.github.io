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
  const groups = {
    'Global B2B Payments (SME & Trade)': ['trade-payments', 'education-payments'],
    'Global B2C & C2B Payments': ['marketplace-ecommerce', 'gig-economy-creator-payments', 'healthcare-payments'],
    'Bill Payments': ['bill-payments'],
    'High-Risk Payments': ['gaming-payments', 'betting-payments'],
    'Regional Structure': ['government-payments', 'travel-payments']
  };
  const required = Object.entries(groups).flatMap(([category, slugs]) => slugs.map(slug => ({slug, category})));
  const matched = result.matched;
  if (result.status !== expected || !Array.isArray(matched) || !Array.isArray(result.missing) ||
      new Set(matched.map(x => x.slug)).size !== matched.length ||
      !required.every(x => matched.some(y => y.slug === x.slug && y.category === x.category)) ||
      matched.some(x => !required.some(y => y.slug === x.slug && y.category === x.category) && !(x.slug === 'adult-content-payments' && x.category === 'High-Risk Payments')) ||
      result.missing.some(x => x !== 'adult-content-payments') || result.missing.length > 1)
    throw Error('Classification receipt incomplete');
  console.log(JSON.stringify({ status: expected, matched, missing: result.missing, managed: result.managed, pendingUnpublishedChapter: result.missing.includes('adult-content-payments') }));
}
main().catch(() => { console.error('Classification failed; verify deployed API and protected configuration.'); process.exitCode = 1; });
