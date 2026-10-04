'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compileBatch } = require('./content-factory-batch');

const root = path.resolve(__dirname, '../..');
const inputPath = path.join(root, 'artifacts/m36/c1/candidate-inventory-input.json');
const outputPath = path.join(root, 'artifacts/m36/c1/batch-manifest.json');

function requestJson(requestPath) {
  return new Promise((resolve, reject) => {
    const request = https.get({ hostname: 'api.contentful.com', path: requestPath,
      headers: { Authorization: `Bearer ${process.env.CONTENTFUL_MANAGEMENT_TOKEN}`,
        Accept: 'application/vnd.contentful.management.v1+json' } }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300)
          return reject(new Error(`Contentful read failed with status ${response.statusCode}.`));
        resolve(JSON.parse(body));
      });
    });
    request.on('error', reject);
  });
}

async function contentfulSnapshot() {
  const env = process.env;
  for (const name of ['CONTENTFUL_MANAGEMENT_TOKEN', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT'])
    if (!env[name]) throw new Error(`Missing ${name}.`);
  const query = new URLSearchParams({ content_type: 'gpirPublication', limit: '1000' });
  const requestPath = `/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
    `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}/entries?${query}`;
  const response = await requestJson(requestPath);
  return {
    source: 'CONTENTFUL_MANAGEMENT_API_LIVE_READ',
    records: response.items.map(item => ({
      id: item.sys.id,
      publicationId: item.fields.gpirPublicationId?.['en-US'] || null,
      title: item.fields.publicationTitle?.['en-US'] || null,
      route: item.fields.canonicalUrlCandidate?.['en-US'] || null,
      published: Boolean(item.sys.publishedVersion)
    })).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  };
}

async function main() {
  const live = process.argv.includes('--live-contentful');
  const verify = process.argv.includes('--verify');
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const supabasePath = path.join(root, 'artifacts/m36/c1/supabase-reconciliation.json');
  const supabaseSnapshot = fs.existsSync(supabasePath)
    ? JSON.parse(fs.readFileSync(supabasePath, 'utf8')) : {};
  const draftPath = path.join(root, 'artifacts/m36/c1/contentful-draft-readback.json');
  const draftSnapshot = fs.existsSync(draftPath)
    ? JSON.parse(fs.readFileSync(draftPath, 'utf8')) : {};
  const snapshot = live ? await contentfulSnapshot() : {
    source: 'CACHED_M35_PLUS_M36_GOVERNED_RECORDS',
    records: [
      ...JSON.parse(fs.readFileSync(path.join(root, 'artifacts/m35/migration-manifest.json'), 'utf8'))
        .records.map(item => ({ id: item.contentfulMigration?.entryId || null,
          publicationId: item.publicationIdentity, title: item.title,
          route: item.slug ? `/${item.slug}/` : null, published: null })),
      { id: '6spQ5pgDwU7HBF561d4Umv', publicationId: 'VK-GPIR-P-000000000033-1',
        title: 'Stablecoins — Cross-Border Money Movement — C2C',
        route: '/stablecoins-cross-border-money-movement-c2c/', published: true }
    ]
  };
  const manifest = compileBatch(input, { contentfulSnapshot: snapshot, supabaseSnapshot, draftSnapshot,
    supabaseCheck: supabaseSnapshot.authority ? 'AUTHORITATIVE_READ_PASS'
      : 'UNAVAILABLE_NO_READ_CAPABILITY' });
  if (verify) {
    const testFiles = ['tests/m36/content-factory-batch.test.mjs',
      'tests/m36/research-publication-renderer.test.mjs'];
    const result = spawnSync(process.execPath, ['--test', ...testFiles], {
      cwd: root, encoding: 'utf8', windowsHide: true
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const total = Number(/tests\s+(\d+)/.exec(output)?.[1] || 0);
    manifest.tests = {
      status: result.status === 0 ? 'PASS' : 'FAIL',
      scope: 'BOUNDED_M36_CONTENT_FACTORY_ONLY',
      files: testFiles,
      total, passed: result.status === 0 ? total : null,
      failed: result.status === 0 ? 0 : null
    };
    if (result.status !== 0) throw new Error(`Bounded tests failed.\n${output}`);
  } else {
    manifest.tests = { status: 'NOT_RUN_BY_THIS_INVOCATION',
      scope: 'BOUNDED_M36_CONTENT_FACTORY_ONLY', files: [], total: 0, passed: 0, failed: 0 };
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${manifest.status}: ${manifest.counts.candidates} candidates, ` +
    `${manifest.counts.eligible} eligible, ${manifest.counts.reviewRequired} review required.\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
