'use strict';
// Read-only, deterministic CMS rollout inventory. No Contentful/Supabase writes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(root,'assets/data/fx/fx-config.json'),'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root,'assets/data/fx/editorial-public.json'),'utf8'));
const featured = config.featuredPairs;
if (!Array.isArray(featured) || new Set(featured).size !== featured.length)
  throw new Error('Invalid or duplicate featured pairs');
if (index.source !== 'contentful-published-public' || !Array.isArray(index.records))
  throw new Error('Invalid governed FX editorial index');
const records = featured.map(pair => {
  const published = index.records.filter(row => row.pair === pair);
  return {
    pair,
    cmsEditorial: published.length ? 'PUBLISHED_IN_PUBLIC_INDEX' : 'NOT_PUBLISHED_IN_PUBLIC_INDEX',
    existingPublicationIds: published.map(row => row.publicationId),
    // Identity, evidence, Contentful state and publication authorization
    // must be obtained from their existing authorities, never synthesized.
    publicationIdentity: published.length ? 'EXISTING' : 'REQUIRES_GOVERNED_ALLOCATION',
    evidenceReview: published.length ? 'REFER_TO_PUBLISHED_ARTICLE' : 'PENDING',
    nextAction: published.length ? 'PRESERVE' : 'SOURCE_REVIEW_THEN_CONTENTFUL_DRAFT'
  };
});
const result = {
  schemaVersion: '1.0',
  purpose: 'M39 FX Contentful multi-pair editorial rollout readiness only',
  featuredPairCount: records.length,
  publishedPairCount: records.filter(row => row.cmsEditorial === 'PUBLISHED_IN_PUBLIC_INDEX').length,
  pendingPairCount: records.filter(row => row.cmsEditorial !== 'PUBLISHED_IN_PUBLIC_INDEX').length,
  constraints: [
    'Do not change FX Smart Cards, rates, historical data, or reader entitlements',
    'Do not publish without governed Supabase identity and approved evidence',
    'Do not assume ECB coverage for unsupported currencies',
    'Do not treat this inventory as a Contentful publication authorization'
  ],
  records
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
