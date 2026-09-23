'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { contentfulDeliveryConfig, publicBuildMetadata } =
  require('./contentful-delivery-config');

function entriesUrl(config, skip = 0) {
  const root = `https://${config.host}/spaces/${encodeURIComponent(config.spaceId)}` +
    `/environments/${encodeURIComponent(config.environment)}/entries`;
  const query = new URLSearchParams({
    content_type: config.contentType,
    include: '2',
    limit: '1000',
    order: 'sys.id',
    skip: String(skip)
  });
  return `${root}?${query}`;
}

function projectEntry(entry) {
  if (!entry?.sys?.id || entry.sys.contentType?.sys?.id !== 'gpirPublication')
    throw new Error('Contentful returned an invalid gpirPublication entry.');
  return {
    entryId: entry.sys.id,
    fields: entry.fields && typeof entry.fields === 'object' ? entry.fields : {}
  };
}

function buildArtifact(config, items) {
  const records = items.map(projectEntry)
    .sort((a, b) => a.entryId.localeCompare(b.entryId, 'en'));
  return {
    schemaVersion: '1.0.0',
    source: publicBuildMetadata(config),
    recordCount: records.length,
    records
  };
}

async function fetchContentfulPublications(config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const items = [];
  let skip = 0;
  let total = null;

  do {
    const response = await fetchImpl(entriesUrl(config, skip), {
      headers: { Authorization: `Bearer ${config.token}` }
    });
    if (!response.ok)
      throw new Error(`Contentful ${config.mode} request failed with status ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page.items) || !Number.isInteger(page.total))
      throw new Error('Contentful returned an invalid collection response.');
    total = page.total;
    items.push(...page.items);
    skip = items.length;
    if (page.items.length === 0 && skip < total)
      throw new Error('Contentful pagination stopped before all entries were returned.');
  } while (skip < total);

  return buildArtifact(config, items);
}

function parseArgs(argv) {
  const options = { mode: 'delivery', output: '.generated/m35/contentful-publications.json', expected: null };
  for (const arg of argv) {
    if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg.startsWith('--expected=')) options.expected = Number(arg.slice('--expected='.length));
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (options.expected !== null && (!Number.isInteger(options.expected) || options.expected < 0))
    throw new Error('--expected must be a non-negative integer.');
  return options;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const config = contentfulDeliveryConfig(env, options.mode);
  const artifact = await fetchContentfulPublications(config);
  if (options.expected !== null && artifact.recordCount !== options.expected)
    throw new Error(`Expected ${options.expected} gpirPublication entries; received ${artifact.recordCount}.`);

  const output = path.resolve(options.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, output);
  process.stdout.write(`Generated ${artifact.recordCount} gpirPublication records in ${options.mode} mode.\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { buildArtifact, entriesUrl, fetchContentfulPublications, parseArgs, projectEntry };

