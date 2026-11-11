'use strict';

const fs = require('node:fs');
const { adaptEstate } = require('./contentful-publication-adapter');

async function resolveReleaseDecisions(artifact, { url, key, fetchImpl = globalThis.fetch }) {
  if (!url || !/^https:\/\//.test(url)) throw new Error('Missing or invalid SUPABASE_URL for trusted release.');
  if (!key) throw new Error('Missing GPIR_SUPABASE_SECRET_KEY in the contentful-production environment.');
  const estate = adaptEstate(artifact.records || []);
  const decisions = [];
  for (const publication of estate.publications) {
    const headers = new Headers({ Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });
    headers.set('apikey', key);
    const response = await fetchImpl(url.replace(/\/$/, '') + '/rest/v1/rpc/gpir_publication_release_decision', {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_publication_id: publication.identity, p_supabase_record_id: publication.supabaseRecordId })
    });
    if (!response.ok) throw new Error('Release authority unavailable (HTTP ' + response.status + ')');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Missing or ambiguous release authority for ' + publication.identity);
    const decision = rows[0];
    if (!['PUBLIC', 'AUTHENTICATED', 'ENTITLED'].includes(decision.access_class))
      throw new Error('Invalid access class for ' + publication.identity);
    // Ineligible records are withheld, not promoted. A classification mismatch
    // must still fail closed for any publication proposed for release.
    if (decision.release_eligible === true && decision.access_class !== publication.accessClass)
      throw new Error('Contentful/Supabase access class mismatch for eligible publication ' + publication.identity);
    decisions.push({
      identity: publication.identity, supabaseRecordId: publication.supabaseRecordId,
      route: publication.route, accessClass: decision.release_eligible === true ? decision.access_class : publication.accessClass,
      releaseEligible: decision.release_eligible === true,
      reviewState: decision.review_state, policyStatus: decision.policy_status
    });
  }
  return decisions;
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node verify-contentful-release.js INPUT OUTPUT');
  const artifact = JSON.parse(fs.readFileSync(input, 'utf8'));
  const decisions = await resolveReleaseDecisions(artifact, {
    url: process.env.SUPABASE_URL, key: process.env.GPIR_SUPABASE_SECRET_KEY
  });
  fs.mkdirSync(require('node:path').dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ schemaVersion: '1.0.0', decisions }, null, 2) + '\n');
  process.stdout.write('Release authority checked: ' + decisions.length + ' records; ' +
    decisions.filter(d => d.releaseEligible).length + ' eligible.\n');
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { resolveReleaseDecisions };
