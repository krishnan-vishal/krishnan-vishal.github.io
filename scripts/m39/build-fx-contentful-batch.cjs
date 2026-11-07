'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const outputPath = path.join(root, 'artifacts/m39/fx-contentful-batch.json');
const presentationPath = path.join(root, 'scripts/m35/publication-presentation-manifest.json');
const publicationDate = '2026-11-07';
const dataCutOffDate = '2026-11-06';
const ecbSourceUrl = 'https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A';
const openErSourceUrl = 'https://open.er-api.com/v6/latest/USD';

// Snapshot is deliberately pinned to the owner-verified 6 November data cut-off.
// Seven pairs had only two dated observations at that cut-off. Later captures must
// not silently rewrite the evidence package for this publication edition.
const snapshots = Object.freeze([
  ['USD/INR', 225, 218, '2026-01-02', '2026-11-06', 89.852362, 96.825, 90.196229, 94.537031, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['EUR/INR', 225, 218, '2026-01-02', '2026-11-06', 104.9647, 112.317, 105.719, 106.164126, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['GBP/INR', 225, 218, '2026-01-02', '2026-11-06', 120.856452, 130.686938, 121.25129, 127.251477, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['AED/INR', 9, 2, '2026-11-05', '2026-11-06', 25.741874, 25.764512, 25.764512, 25.741874, ['derived-cross'], ['reference-open-er-api']],
  ['SGD/INR', 225, 218, '2026-01-02', '2026-11-06', 70.015338, 75.624158, 70.119387, 73.996782, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['AUD/INR', 225, 218, '2026-01-02', '2026-11-06', 60.208095, 69.364587, 60.383253, 65.760408, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['CAD/INR', 225, 218, '2026-01-02', '2026-11-06', 64.875487, 70.37847, 65.676213, 67.569212, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['JPY/INR', 225, 218, '2026-01-02', '2026-11-06', 0.567998, 0.620541, 0.574747, 0.598959, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['CNY/INR', 225, 218, '2026-01-02', '2026-11-06', 12.852237, 14.454408, 12.896807, 14.146903, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['EUR/USD', 225, 218, '2026-01-02', '2026-11-06', 1.113, 1.1974, 1.1721, 1.12299, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['GBP/USD', 225, 218, '2026-01-02', '2026-11-06', 1.316037, 1.381667, 1.344306, 1.346049, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['USD/CNY', 225, 218, '2026-01-02', '2026-11-06', 6.64827, 6.993687, 6.993687, 6.682525, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['USD/CHF', 225, 218, '2026-01-02', '2026-11-06', 0.767025, 0.835281, 0.793106, 0.816184, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['USD/CAD', 225, 218, '2026-01-02', '2026-11-06', 1.35244, 1.426169, 1.373347, 1.399114, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['USD/HKD', 225, 218, '2026-01-02', '2026-11-06', 7.786375, 7.848685, 7.791912, 7.842769, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['USD/AED', 9, 2, '2026-11-05', '2026-11-06', 3.6725, 3.6725, 3.6725, 3.6725, ['provider-native'], ['reference-open-er-api']],
  ['USD/SGD', 225, 218, '2026-01-02', '2026-11-06', 1.261734, 1.298236, 1.286324, 1.277583, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['USD/SAR', 9, 2, '2026-11-05', '2026-11-06', 3.75, 3.75, 3.75, 3.75, ['provider-native'], ['reference-open-er-api']],
  ['USD/QAR', 9, 2, '2026-11-05', '2026-11-06', 3.64, 3.64, 3.64, 3.64, ['provider-native'], ['reference-open-er-api']],
  ['USD/KWD', 9, 2, '2026-11-05', '2026-11-06', 0.310148, 0.310274, 0.310148, 0.310274, ['provider-native'], ['reference-open-er-api']],
  ['USD/BHD', 9, 2, '2026-11-05', '2026-11-06', 0.376, 0.376, 0.376, 0.376, ['provider-native'], ['reference-open-er-api']],
  ['USD/OMR', 9, 2, '2026-11-05', '2026-11-06', 0.384497, 0.384497, 0.384497, 0.384497, ['provider-native'], ['reference-open-er-api']],
  ['EUR/GBP', 225, 218, '2026-01-02', '2026-11-06', 0.83358, 0.8763, 0.8719, 0.834286, ['derived-cross', 'provider-native'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['AUD/USD', 225, 218, '2026-01-02', '2026-11-06', 0.666819, 0.725692, 0.669465, 0.695605, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']],
  ['NZD/USD', 225, 218, '2026-01-02', '2026-11-06', 0.558909, 0.607852, 0.576906, 0.560693, ['derived-cross'], ['frankfurter-ecb', 'reference-open-er-api']]
]);

// Authoritative return values from public.gpir_identity_resolve. Re-running the
// resolver for these stable source-unit keys returns these same assignments.
const identities = Object.freeze({
  'USD/INR': { publicationId: 'VK-GPIR-P-000000000037-2', lineageId: 'VK-GPIR-L-000000000037-2', supabaseRecordId: '07c1bc34-b551-4926-b6aa-667c34eeb77c' },
  'EUR/INR': { publicationId: 'VK-GPIR-P-000000000038-0', lineageId: 'VK-GPIR-L-000000000038-0', supabaseRecordId: 'b66f2d1e-39cd-4ec7-97c6-4b284f5231c6' },
  'GBP/INR': { publicationId: 'VK-GPIR-P-000000000039-8', lineageId: 'VK-GPIR-L-000000000039-8', supabaseRecordId: '498f5fb1-b9bd-43f0-9fa9-c377a70a096c' },
  'AED/INR': { publicationId: 'VK-GPIR-P-000000000040-6', lineageId: 'VK-GPIR-L-000000000040-6', supabaseRecordId: '52d2354e-3929-48e6-b555-9169d29921c7' },
  'SGD/INR': { publicationId: 'VK-GPIR-P-000000000041-4', lineageId: 'VK-GPIR-L-000000000041-4', supabaseRecordId: '0b53978d-6323-4498-990c-0674fbc32983' },
  'AUD/INR': { publicationId: 'VK-GPIR-P-000000000042-2', lineageId: 'VK-GPIR-L-000000000042-2', supabaseRecordId: '2c537d01-cb58-4cbc-8cde-5366cac16824' },
  'CAD/INR': { publicationId: 'VK-GPIR-P-000000000043-0', lineageId: 'VK-GPIR-L-000000000043-0', supabaseRecordId: 'c83c9895-da24-4a80-a406-082266e0ed9b' },
  'JPY/INR': { publicationId: 'VK-GPIR-P-000000000044-8', lineageId: 'VK-GPIR-L-000000000044-8', supabaseRecordId: 'c6116356-d5d2-4af7-a7c4-d94487b1f80a' },
  'CNY/INR': { publicationId: 'VK-GPIR-P-000000000045-5', lineageId: 'VK-GPIR-L-000000000045-5', supabaseRecordId: 'a458d24e-2d01-4f2e-9232-27159cfa6b15' },
  'EUR/USD': { publicationId: 'VK-GPIR-P-000000000046-3', lineageId: 'VK-GPIR-L-000000000046-3', supabaseRecordId: '28d6e044-302e-47de-b29b-d58fd74f354e' },
  'GBP/USD': { publicationId: 'VK-GPIR-P-000000000047-1', lineageId: 'VK-GPIR-L-000000000047-1', supabaseRecordId: '0e93ab01-bff3-4330-9857-3cfc6a2ec6db' },
  'USD/CNY': { publicationId: 'VK-GPIR-P-000000000048-9', lineageId: 'VK-GPIR-L-000000000048-9', supabaseRecordId: '57da0968-cc2f-47ef-b7b9-8dac5ace5993' },
  'USD/CHF': { publicationId: 'VK-GPIR-P-000000000049-7', lineageId: 'VK-GPIR-L-000000000049-7', supabaseRecordId: '95cb6c9c-d620-493a-93c7-c5cb506f9eb9' },
  'USD/CAD': { publicationId: 'VK-GPIR-P-000000000050-5', lineageId: 'VK-GPIR-L-000000000050-5', supabaseRecordId: '32171f6c-4887-4340-8ae9-13f3df1fb78a' },
  'USD/HKD': { publicationId: 'VK-GPIR-P-000000000051-3', lineageId: 'VK-GPIR-L-000000000051-3', supabaseRecordId: '6b89caca-faaf-4161-b8a1-4f056d275381' },
  'USD/AED': { publicationId: 'VK-GPIR-P-000000000052-1', lineageId: 'VK-GPIR-L-000000000052-1', supabaseRecordId: 'eda05528-f9b7-4a46-8d05-21bdb2786f02' },
  'USD/SGD': { publicationId: 'VK-GPIR-P-000000000053-9', lineageId: 'VK-GPIR-L-000000000053-9', supabaseRecordId: '0a788e20-d97a-40dd-bad9-cc2fe75c78f9' },
  'USD/SAR': { publicationId: 'VK-GPIR-P-000000000054-7', lineageId: 'VK-GPIR-L-000000000054-7', supabaseRecordId: 'd205f569-8440-448e-83c0-27c5dd1ab4a1' },
  'USD/QAR': { publicationId: 'VK-GPIR-P-000000000055-4', lineageId: 'VK-GPIR-L-000000000055-4', supabaseRecordId: '8a264967-3adc-451e-8bdf-db1b364a4789' },
  'USD/KWD': { publicationId: 'VK-GPIR-P-000000000056-2', lineageId: 'VK-GPIR-L-000000000056-2', supabaseRecordId: 'b980ebf7-5bf5-4cf9-a095-a12c97c9b518' },
  'USD/BHD': { publicationId: 'VK-GPIR-P-000000000057-0', lineageId: 'VK-GPIR-L-000000000057-0', supabaseRecordId: '71c31f32-19a3-48d9-ba77-f148bb0ba007' },
  'USD/OMR': { publicationId: 'VK-GPIR-P-000000000058-8', lineageId: 'VK-GPIR-L-000000000058-8', supabaseRecordId: 'a24ecebb-2c72-4474-8b58-c4e1641923f4' },
  'EUR/GBP': { publicationId: 'VK-GPIR-P-000000000059-6', lineageId: 'VK-GPIR-L-000000000059-6', supabaseRecordId: '5bc4d7bd-baa3-4870-8d34-b42208262b9c' },
  'AUD/USD': { publicationId: 'VK-GPIR-P-000000000060-4', lineageId: 'VK-GPIR-L-000000000060-4', supabaseRecordId: '3f09201d-88ae-4d18-aa45-9fc73744d1da' },
  'NZD/USD': { publicationId: 'VK-GPIR-P-000000000061-2', lineageId: 'VK-GPIR-L-000000000061-2', supabaseRecordId: '316b7ace-ec5b-4310-9b05-6284a3ea0e98' }
});

function textNode(value) {
  return { nodeType: 'text', value, marks: [], data: {} };
}

function paragraph(value) {
  return { nodeType: 'paragraph', data: {}, content: [textNode(value)] };
}

function heading(value) {
  return { nodeType: 'heading-2', data: {}, content: [textNode(value)] };
}

function rate(value) {
  return Number(value).toFixed(6).replace(/(?:\.0+|(?<=[0-9])0+)$/, '').replace(/\.$/, '');
}

function longDate(value) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').toUpperCase();
}

function buildEntry(snapshot) {
  const [pair, historicalRowCount, datedObservationCount, firstObservationDate,
    lastObservationDate, minRate, maxRate, firstRate, lastRate, rateMethods, sourceLineage] = snapshot;
  const [base, quote] = pair.split('/');
  const pairSlug = `${base.toLowerCase()}-${quote.toLowerCase()}`;
  const limited = datedObservationCount === 2;
  const canonicalRoute = `/${pairSlug}-reference-rate-history-source-methodology/`;
  const sourceEvidenceUrls = sourceLineage.includes('frankfurter-ecb')
    ? [ecbSourceUrl, openErSourceUrl] : [openErSourceUrl];
  const coverageSentence = limited
    ? `GPIR preserves only two dated ${pair} reference observations for this edition, ${longDate(firstObservationDate)} and ${longDate(lastObservationDate)}. The first stored rate was ${rate(firstRate)} and the latest was ${rate(lastRate)} ${quote} per ${base}. Two observations cannot support a historical trend inference.`
    : `GPIR preserves ${datedObservationCount} dated ${pair} reference observations from ${longDate(firstObservationDate)} through ${longDate(lastObservationDate)}. Within that verified window, stored rates ranged from ${rate(minRate)} to ${rate(maxRate)} ${quote} per ${base}; the first observation was ${rate(firstRate)} and the latest was ${rate(lastRate)}.`;
  const methodologySentence = sourceLineage.includes('frankfurter-ecb')
    ? `The archive lineage combines Frankfurter's ECB-backed dated series with the existing reference-open-er-api capture path. Stored methods for this pair are ${rateMethods.join(' and ')}. Cross rates are derived only from same-date source observations.`
    : `The two dated records originate from the existing reference-open-er-api capture path. The stored method is ${rateMethods.join(' and ')}. This limited provider series is preserved as captured and is not extended, interpolated or described as central-bank history.`;
  const limitationSentence = 'These values are reference observations, not executable quotes, remittance prices or recommendations. The evidence does not establish a market cause, policy effect or forecast; execution time, spreads, fees, liquidity and settlement terms are outside this publication.';
  const executiveSummary = `${coverageSentence} ${methodologySentence} ${limitationSentence}`;
  const editorialBody = {
    nodeType: 'document', data: {}, content: [
      heading('01 — Verified coverage'),
      paragraph(coverageSentence),
      heading('02 — Source lineage and rate method'),
      paragraph(methodologySentence),
      heading('03 — Interpretation boundary'),
      paragraph(limitationSentence),
      heading('04 — Evidence links'),
      paragraph(`GPIR archive authority: public.fx_historical_archive. Source endpoints: ${sourceEvidenceUrls.join('; ')}. Data cut-off: ${dataCutOffDate}. Historical rows without a source observation date are retained in the archive total but are excluded from dated-rate statements.`)
    ]
  };
  const sourceValidationSummary = `PASS — GPIR public.fx_historical_archive verified at the ${dataCutOffDate} publication cut-off: ${historicalRowCount} total pair rows, ${datedObservationCount} dated observations, ${firstObservationDate} through ${lastObservationDate}; source lineage ${sourceLineage.join(', ')}; methods ${rateMethods.join(', ')}. No observation, causal explanation or source reference was manufactured.`;
  const fieldsWithoutIdentity = {
    publicationTitle: `${pair} — Reference Rate History and Source Methodology`,
    slug: `${pairSlug}-reference-rate-history-source-methodology`,
    publicationType: 'Research Publication',
    publicationStatus: 'CURRENT',
    region: 'Global',
    countryMarket: pair,
    directionScope: pair,
    useCasePaymentCategory: 'FX Intelligence; Cross-Border Payments; Treasury and Liquidity',
    publicationDate,
    dataCutOffDate,
    executiveSummary,
    editorialBody,
    sourceValidationSummary,
    legacySourceUrl: sourceEvidenceUrls[0],
    canonicalUrlCandidate: canonicalRoute,
    editionLabel: `FX reference edition ${publicationDate}`,
    migrationStatus: 'Native',
    validationStatus: 'PASS'
  };
  const sourceHash = sha256({ pair, snapshot, fields: fieldsWithoutIdentity, sourceEvidenceUrls });
  const identity = identities[pair] || null;
  return {
    pair,
    state: identity ? 'APPROVED_FOR_PUBLICATION' : 'GOVERNED_IDENTITY_PENDING',
    sourceTable: 'public.fx_historical_archive',
    sourceUnitKey: `gpir:intake:publication:research:${pairSlug}-reference-rate-history-source-methodology:m39-contentful`,
    sourcePath: 'artifacts/m39/fx-contentful-batch.json',
    sourceHash,
    historicalRowCount,
    datedObservationCount,
    firstObservationDate,
    lastObservationDate,
    minRate,
    maxRate,
    firstRate,
    lastRate,
    rateMethods,
    sourceLineage,
    sourceEvidenceUrls,
    publicationIdentity: identity?.publicationId || null,
    editionLineageId: identity?.lineageId || null,
    supabaseRecordId: identity?.supabaseRecordId || null,
    contentfulEntryId: `m39Fx${base[0]}${base.slice(1).toLowerCase()}${quote[0]}${quote.slice(1).toLowerCase()}20261107`,
    canonicalRoute,
    publicationStatus: 'CURRENT',
    accessClass: 'PUBLIC',
    evidenceApproved: true,
    ownerApproved: true,
    editorialApproval: 'OWNER_APPROVED_2026-11-07',
    editorialBodySha256: sha256(editorialBody),
    fields: identity ? {
      gpirPublicationId: identity.publicationId,
      editionLineageId: identity.lineageId,
      supabaseRecordId: identity.supabaseRecordId,
      ...fieldsWithoutIdentity
    } : fieldsWithoutIdentity
  };
}

function buildManifest() {
  const entries = snapshots.map(buildEntry);
  return {
    schemaVersion: '2.0',
    milestone: 'M39-FX-CONTENTFUL-25-PAIR',
    purpose: 'Owner-authorized, idempotent Contentful publication package for the 25 featured FX pairs remaining after USD/JPY',
    contentful: { spaceId: 'zym0dk277ju5', environment: 'master', contentType: 'gpirPublication', locale: 'en-US' },
    dataAuthority: {
      system: 'Supabase public.fx_historical_archive',
      verifiedAt: '2026-11-07',
      dataCutOffDate,
      estateAtVerification: { pairCount: 134, totalRows: 14166, datedRows: 13228 },
      note: 'Publication evidence is pinned to the verified cut-off. Seven included pairs have exactly two dated observations.'
    },
    governance: {
      publicationStatus: 'CURRENT', accessClass: 'PUBLIC', policyStatus: 'ACTIVE',
      policyReviewState: 'EVIDENCED', classificationSource: 'M39_FX_OWNER_APPROVED_CONTENTFUL_2026_11_07',
      prohibited: ['Manufactured observations', 'Unsupported causal explanations', 'Invented source references', 'Duplicate Contentful entries']
    },
    entries
  };
}

function buildPresentationManifest(manifest, existing) {
  const result = structuredClone(existing);
  for (const entry of manifest.entries) {
    result[entry.publicationIdentity] = {
      accessClass: 'PUBLIC',
      publicDescription: `${entry.pair} reference-rate history, source methodology, verified coverage and limitations.`,
      topicContext: [
        'FX Intelligence', entry.pair, 'Reference Rate History', 'Source Methodology',
        'Cross-Border Payments', 'Treasury and Liquidity'
      ]
    };
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right, 'en')));
}

function main() {
  const manifest = buildManifest();
  if (process.argv.includes('--identity-requests')) {
    process.stdout.write(`${JSON.stringify(manifest.entries.map(entry => ({
      pair: entry.pair, sourceUnitKey: entry.sourceUnitKey, sourcePath: entry.sourcePath,
      sourceHash: entry.sourceHash, publicationType: 'research-publication',
      migrationProvenance: { milestone: 'M39-FX-CONTENTFUL-25-PAIR', pair: entry.pair,
        slug: entry.fields.slug, contentfulEntryId: entry.contentfulEntryId,
        contentfulSpaceId: 'zym0dk277ju5', contentfulEnvironment: 'master',
        publicationStatus: 'CURRENT', accessClass: 'PUBLIC', ownerAuthorizedDate: publicationDate }
    })), null, 2)}\n`);
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const existingPresentation = JSON.parse(fs.readFileSync(presentationPath, 'utf8'));
  const presentation = buildPresentationManifest(manifest, existingPresentation);
  fs.writeFileSync(presentationPath, `${JSON.stringify(presentation, null, 2)}\n`, 'utf8');
  process.stdout.write(`Generated ${manifest.entries.length} governed FX Contentful publication records and presentation mappings.\n`);
}

if (require.main === module) main();

module.exports = { buildEntry, buildManifest, buildPresentationManifest, identities, snapshots };
