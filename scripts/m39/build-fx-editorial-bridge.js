'use strict';

// Consumes the existing governed Contentful delivery artifact. Never exposes
// Contentful credentials, unpublished entries or subscriber-only editorial text.
const fs = require('node:fs');
const path = require('node:path');

function buildFxEditorialIndex(artifact) {
  if (!artifact || artifact.source?.mode !== 'delivery' || !Array.isArray(artifact.records))
    throw new Error('A published Contentful delivery artifact is required.');
  const records = [];
  for (const entry of artifact.records) {
    const fields = entry?.fields || {};
    const title = fields.publicationTitle;
    const summary = fields.executiveSummary;
    const route = fields.canonicalUrlCandidate;
    const status = String(fields.publicationStatus || '').toUpperCase();
    // Delivery API visibility is the technical publication signal. The M35
    // business lifecycle contract separately permits CURRENT or HISTORICAL;
    // only CURRENT, explicitly PUBLIC pair research belongs in the live FX
    // editorial index.
    if (status !== 'CURRENT' || entry?.presentation?.accessClass !== 'PUBLIC') continue;
    if (typeof title !== 'string' || typeof summary !== 'string' ||
        typeof route !== 'string' || !/^\/(?!\/)(?!.*\.\.)(?:[a-z0-9/_-]+)\/?$/i.test(route)) continue;
    // Pair attribution must be explicit in the editorial title. A market name,
    // country or coincidental mention is not pair-specific economic evidence.
    const matches = [...title.toUpperCase().matchAll(/\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})\b/g)];
    const pairs = [...new Set(matches.filter(match => match[1] !== match[2])
      .map(match => match[1] + '/' + match[2]))];
    for (const pair of pairs) {
      records.push({
        pair, title: title.slice(0, 180), summary: summary.slice(0, 600),
        url: route, publicationId: String(fields.gpirPublicationId || ''),
        publishedAt: typeof fields.publicationDate === 'string' ? fields.publicationDate : null
      });
    }
  }
  return { schemaVersion: '1.0', source: 'contentful-published-public',
    records: records.sort((a,b) => a.pair.localeCompare(b.pair) || a.title.localeCompare(b.title)) };
}

if (require.main === module) {
  const input = process.argv[2] || '.generated/m35/contentful-publications.json';
  const output = process.argv[3] || '.generated/m39/fx-editorial-public.json';
  const index = buildFxEditorialIndex(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, JSON.stringify(index, null, 2) + '\n');
  process.stdout.write('Exported ' + index.records.length + ' explicitly public FX editorial references.\n');
}
module.exports = { buildFxEditorialIndex };
