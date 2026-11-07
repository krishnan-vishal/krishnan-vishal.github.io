'use strict';
// M39 FX Contentful controlled batch: read-only Management API preflight.
// Never creates, edits or publishes entries. Existing M36 five-entry release is untouched.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(root,'assets/data/fx/fx-config.json'),'utf8'));
const publicIndex = JSON.parse(fs.readFileSync(path.join(root,'assets/data/fx/editorial-public.json'),'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'artifacts/m39/fx-contentful-batch.json'),'utf8'));
const featured = new Set(config.featuredPairs);
const published = new Set(publicIndex.records.map(r => r.pair));
const pending = config.featuredPairs.filter(pair => !published.has(pair));
const fields = ['publicationId','lineageId','supabaseRecordId','contentfulEntryId','canonicalRoute','sourceEvidenceUrl','editorialBodySha256'];
const isNonempty = x => typeof x === 'string' && x.trim().length > 0;
function checkManifest() {
  if (manifest.schemaVersion !== '1.0' || !Array.isArray(manifest.entries))
    throw new Error('Invalid M39 FX batch manifest');
  const seen = new Set();
  for (const entry of manifest.entries) {
    if (!featured.has(entry.pair) || published.has(entry.pair) || seen.has(entry.pair))
      throw new Error('Duplicate, unknown or already published pair in batch');
    seen.add(entry.pair);
    if (entry.state !== 'APPROVED_FOR_PUBLICATION') continue;
    for (const field of fields) if (!isNonempty(entry[field]))
      throw new Error(entry.pair + ': missing governed field ' + field);
    if (entry.accessClass !== 'PUBLIC' || entry.publicationStatus !== 'CURRENT' ||
        entry.evidenceApproved !== true || entry.ownerApproved !== true ||
        !/^https:\/\//.test(entry.sourceEvidenceUrl) ||
        !/^\/(?!\/)(?!.*\.\.)[a-z0-9/_-]+\/$/.test(entry.canonicalRoute) ||
        !/^[a-f0-9]{64}$/i.test(entry.editorialBodySha256))
      throw new Error(entry.pair + ': approval, route or evidence gate failed');
  }
  return { pending, seen };
}
function scalar(value) { return value?.['en-US']; }
async function main() {
  const {pending,seen} = checkManifest();
  const approved = manifest.entries.filter(e => e.state === 'APPROVED_FOR_PUBLICATION');
  const report = { mode:'READ_ONLY_PREFLIGHT', featured:featured.size, pending:pending.length,
    listed:seen.size, approved:approved.length, verified:0, blocked:[],
    productionWrites:0 };
  if (!approved.length) {
    report.blocked.push('No governed, evidence-approved FX publications available');
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    return;
  }
  for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN','CONTENTFUL_SPACE_ID','CONTENTFUL_ENVIRONMENT'])
    if (!isNonempty(process.env[name])) throw new Error('Missing secure configuration: '+name);
  const base = 'https://api.contentful.com/spaces/'+encodeURIComponent(process.env.CONTENTFUL_SPACE_ID)+
    '/environments/'+encodeURIComponent(process.env.CONTENTFUL_ENVIRONMENT)+'/entries/';
  for (const entry of approved) {
    const response = await fetch(base+encodeURIComponent(entry.contentfulEntryId), {
      headers:{Authorization:'Bearer '+process.env.CONTENTFUL_MANAGEMENT_TOKEN,
        Accept:'application/vnd.contentful.management.v1+json'} });
    if (!response.ok) throw new Error(entry.pair+': Contentful readback HTTP '+response.status);
    const item = await response.json();
    const f = item.fields || {};
    if (scalar(f.gpirPublicationId)!==entry.publicationId ||
        scalar(f.editionLineageId)!==entry.lineageId ||
        scalar(f.supabaseRecordId)!==entry.supabaseRecordId ||
        scalar(f.canonicalUrlCandidate)!==entry.canonicalRoute ||
        scalar(f.publicationStatus)!=='CURRENT' ||
        !item.sys?.publishedVersion)
      throw new Error(entry.pair+': Contentful authority/published readback mismatch');
    const title = scalar(f.publicationTitle);
    if (!isNonempty(title) || !title.toUpperCase().includes(entry.pair))
      throw new Error(entry.pair+': explicit pair title missing');
    report.verified++;
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
main().catch(err=>{process.stderr.write('M39 FX preflight blocked: '+err.message+'\n');process.exitCode=1;});
