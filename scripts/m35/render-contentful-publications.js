'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { adaptEstate } = require('./contentful-publication-adapter');
const { controlledValidationAuthorization } = require('./contentful-auth-boundary');
const { renderNotFoundPage, renderPublicationPage } = require('./contentful-publication-renderer');

function parseArgs(argv) {
  const options = { input: null, output: null, expected: null, controlledValidation: false };
  for (const arg of argv) {
    if (arg.startsWith('--input=')) options.input = arg.slice(8);
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else if (arg.startsWith('--expected=')) options.expected = Number(arg.slice(11));
    else if (arg === '--controlled-validation') options.controlledValidation = true;
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!options.input || !options.output) throw new Error('--input and --output are required.');
  if (options.expected !== null && (!Number.isInteger(options.expected) || options.expected < 0))
    throw new Error('--expected must be a non-negative integer.');
  return options;
}

function routeDirectory(outputRoot, route) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  const resolvedRoot = path.resolve(outputRoot);
  const destination = path.resolve(resolvedRoot, relative);
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error(`Route escapes output root: ${route}`);
  return destination;
}

function buildPublicationSite(artifact, options) {
  if (artifact?.source?.contentType !== 'gpirPublication')
    throw new Error('The build input is not a gpirPublication artifact.');
  const estate = adaptEstate(artifact.records || []);
  if (options.expected !== null && estate.publications.length !== options.expected)
    throw new Error(`Expected ${options.expected} adapted publications; received ${estate.publications.length}.`);
  const outputRoot = path.resolve(options.output);
  fs.mkdirSync(outputRoot, { recursive: true });
  const manifest = [];
  for (const publication of estate.publications) {
    const destination = routeDirectory(outputRoot, publication.route);
    fs.mkdirSync(destination, { recursive: true });
    const authorization = options.controlledValidation
      ? controlledValidationAuthorization(publication) : undefined;
    const html = renderPublicationPage(publication, { authorization });
    fs.writeFileSync(path.join(destination, 'index.html'), html, 'utf8');
    manifest.push({
      identity: publication.identity,
      route: publication.route,
      canonicalUrl: publication.canonicalUrl,
      publicationType: publication.publicationType,
      authAuthority: publication.auth.authority,
      controlledValidation: Boolean(options.controlledValidation)
    });
  }
  fs.writeFileSync(path.join(outputRoot, '404.html'), renderNotFoundPage(), 'utf8');
  fs.writeFileSync(path.join(outputRoot, 'routes.json'), `${JSON.stringify({
    schemaVersion: '1.0.0',
    deploymentEligible: false,
    recordCount: manifest.length,
    routes: manifest
  }, null, 2)}\n`, 'utf8');
  return { estate, manifest, outputRoot };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const artifact = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'));
  const result = buildPublicationSite(artifact, options);
  process.stdout.write(`Rendered ${result.manifest.length} governed publication routes.\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { buildPublicationSite, parseArgs, routeDirectory };
