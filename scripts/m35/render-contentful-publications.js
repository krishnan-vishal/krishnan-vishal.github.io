'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { adaptEstate } = require('./contentful-publication-adapter');
const { controlledValidationAuthorization } = require('./contentful-auth-boundary');
const { renderNotFoundPage, renderPublicationPage } = require('./contentful-publication-renderer');

function parseArgs(argv) {
  const options = { input: null, output: null, expected: null, controlledValidation: false, releaseDecisions: null, previewSkipIncomplete: false };
  for (const arg of argv) {
    if (arg.startsWith('--input=')) options.input = arg.slice(8);
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else if (arg.startsWith('--expected=')) options.expected = Number(arg.slice(11));
    else if (arg.startsWith('--release-decisions=')) options.releaseDecisions = arg.slice(20);
    else if (arg === '--controlled-validation') options.controlledValidation = true;
    else if (arg === '--preview-skip-incomplete') options.previewSkipIncomplete = true;
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (options.previewSkipIncomplete && (!options.controlledValidation || options.releaseDecisions))
    throw new Error('Preview incomplete-record exclusion requires controlled validation without release decisions.');
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
  const records = artifact.records || [];
  if (options.expected !== null && records.length !== options.expected)
    throw new Error(`Expected ${options.expected} input publications; received ${records.length}.`);
  let selectedRecords = records;
  if (options.previewSkipIncomplete) {
    if (artifact?.source?.mode !== 'preview') throw new Error('Incomplete-record exclusion is only allowed for Contentful Preview input.');
    const { adaptPublication } = require('./contentful-publication-adapter');
    const excluded = [];
    selectedRecords = records.filter(record => {
      try { adaptPublication(record); return true; }
      catch (error) {
        if (!/^Missing required governed publication fields: /.test(error.message)) throw error;
        excluded.push({ entryId: record.entryId, reason: error.message });
        return false;
      }
    });
    if (!selectedRecords.length) throw new Error('No complete governed Preview records are available for rendering.');
    process.stdout.write(`Controlled Preview: ${selectedRecords.length} complete records; ${excluded.length} incomplete drafts excluded.\n`);
    const reportPath = path.resolve(options.output, 'preview-exclusions.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ inputCount: records.length, renderedCandidates: selectedRecords.length, excluded }, null, 2) + '\n');
  }
  const estate = adaptEstate(selectedRecords);
  if (options.releaseDecisions && options.controlledValidation) throw new Error('Production and controlled validation cannot be combined.');
  const releaseRows = options.releaseDecisions ? JSON.parse(fs.readFileSync(options.releaseDecisions, 'utf8')).decisions : null;
  if (releaseRows && (!Array.isArray(releaseRows) || releaseRows.length !== estate.publications.length)) throw new Error('Release authority coverage mismatch.');
  const decisions = releaseRows ? new Map(releaseRows.map(d => [d.identity + ':' + d.supabaseRecordId, d])) : null;
  if (decisions && decisions.size !== releaseRows.length) throw new Error('Duplicate release authority decisions.');
  const outputRoot = path.resolve(options.output);
  fs.mkdirSync(outputRoot, { recursive: true });
  const manifest = [];
  for (const publication of estate.publications) {
    const decision = decisions?.get(publication.identity + ':' + publication.supabaseRecordId);
    if (decisions && (!decision || decision.route !== publication.route || (publication.accessClass != null && decision.releaseEligible && decision.accessClass !== publication.accessClass))) throw new Error('Release decision mismatch for ' + publication.identity);
    if (decisions && !decision.releaseEligible) continue;
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
    releaseAuthorityChecked: Boolean(decisions),
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
