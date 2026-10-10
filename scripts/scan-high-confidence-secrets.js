#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GREP_PATTERN = '(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|password[[:space:]]*[:=][[:space:]]*[^[:space:]]+|api[_-]?key[[:space:]]*[:=][[:space:]]*[^[:space:]]+)';
const GREP_ARGUMENTS = Object.freeze([
  'grep', '--no-index', '-n', '-I', '-E', GREP_PATTERN, '--', '.',
  ':(exclude)SECURITY.md', ':(exclude)docs/**'
]);

const RULES = Object.freeze([
  { id: 'AWS_ACCESS_KEY_ID', pattern: /AKIA[0-9A-Z]{16}/ },
  { id: 'GOOGLE_API_KEY', pattern: /AIza[0-9A-Za-z_-]{20,}/ },
  { id: 'GITHUB_TOKEN', pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { id: 'PRIVATE_KEY_HEADER', pattern: /BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY/ },
  { id: 'GENERIC_PASSWORD_ASSIGNMENT', pattern: /password\s*[:=]\s*\S+/ },
  { id: 'GENERIC_API_KEY_ASSIGNMENT', pattern: /api[_-]?key\s*[:=]\s*\S+/ }
]);

// Exact reviewed source lines only. A path, line, rule, or content change makes
// the finding unapproved and fails the scan. Fingerprints contain no values.
const FALSE_POSITIVE_ALLOWLIST = Object.freeze([
  ['assets/js/gpir-reader-auth.js', 82, 'GENERIC_PASSWORD_ASSIGNMENT', 'd3f1f3c2706a0dee86afeeb0612c582c2211c5268f0bf220203a253af8e4ea9d', 'Reads a password field from FormData; no literal value.'],
  ['scripts/m36/validate-stablecoins-c2c-real-edge.js', 74, 'GENERIC_API_KEY_ASSIGNMENT', '52958f768cfae44c204daec2234e22b710b69f3e332accfebe5ad291b82a06b3', 'Uses an environment-supplied secret variable as a request header.'],
  ['scripts/m36/validate-stablecoins-c2c-real-edge.js', 75, 'GENERIC_PASSWORD_ASSIGNMENT', 'be3f38546a938100a2a05f6a99f900a28a74acb1e60be976f0c57c0d85c42814', 'Generates an ephemeral random validation credential at runtime.'],
  ['scripts/m36/validate-stablecoins-c2c-real-edge.js', 88, 'GENERIC_API_KEY_ASSIGNMENT', '5d35f02f94b65598b2b6cd2c16aa405b47a55fd3b86391e8b0e5850c11a9faaa', 'Uses the same environment-supplied variable as a request header.'],
  ['supabase/functions/gpir-protected-publication/handler.mjs', 117, 'GENERIC_API_KEY_ASSIGNMENT', '944814f2be0d6bf8b8ff1a424050cf5e8c7c862943efe384db8dd4444e0c6a60', 'References validated runtime configuration; no literal value.'],
  ['tests/m36/reader-auth.test.mjs', 57, 'GENERIC_PASSWORD_ASSIGNMENT', 'ae785e8c9e9c686f34ee701d06a7c96c4f0cb393ab73025d6247233264ad9fac', 'Reserved example.test fixture input.'],
  ['tests/m36/reader-auth.test.mjs', 60, 'GENERIC_PASSWORD_ASSIGNMENT', 'f5afdcaac577b3dfce93099d57d0a766a8fa04688e14caa68e7ca8692bad39d1', 'Reserved example.test fixture input.'],
  ['tests/m36/reader-auth.test.mjs', 61, 'GENERIC_PASSWORD_ASSIGNMENT', 'cf59539f27610521a849be61f77faf07fe7e4eb2ecce63a3617dd8f67060c4d0', 'Reserved example.test fixture input.'],
  ['tests/m36/reader-auth.test.mjs', 62, 'GENERIC_PASSWORD_ASSIGNMENT', '3ef257cd75a10fb2ee1b4c9ab2f289b830b2842f4a0c9d7ec2c8b27c18e6dc9e', 'Reserved example.test fixture input.']
].map(([file, line, ruleId, fingerprint, rationale]) => ({ file, line, ruleId, fingerprint, rationale })));

function fingerprint(ruleId, sourceLine) {
  return crypto.createHash('sha256').update(`${ruleId}\0${sourceLine}`).digest('hex');
}

function matchingRuleIds(sourceLine) {
  return RULES.filter(rule => rule.pattern.test(sourceLine)).map(rule => rule.id);
}

function isAllowlisted({ file, line, sourceLine, ruleId }, allowlist = FALSE_POSITIVE_ALLOWLIST) {
  const digest = fingerprint(ruleId, sourceLine);
  return allowlist.some(entry => entry.file === file && entry.line === line
    && entry.ruleId === ruleId && entry.fingerprint === digest);
}

function parseGrepOutput(stdout) {
  return stdout.split(/\r?\n/).filter(Boolean).flatMap(record => {
    const match = /^(.*?):(\d+):(.*)$/.exec(record);
    if (!match) throw new Error(`Unparseable scanner output for ${record.slice(0, 80)}`);
    const file = match[1].replace(/^\.\//, '').replace(/\\/g, '/');
    const line = Number(match[2]);
    const sourceLine = match[3];
    const ruleIds = matchingRuleIds(sourceLine);
    if (!ruleIds.length) throw new Error(`Scanner rule attribution failed for ${file}:${line}`);
    return ruleIds.map(ruleId => ({ file, line, sourceLine, ruleId }));
  });
}

function evaluateFindings(findings, allowlist = FALSE_POSITIVE_ALLOWLIST) {
  return findings.map(finding => ({ ...finding, allowed: isAllowlisted(finding, allowlist) }));
}

function scanRepository(root = ROOT) {
  const result = spawnSync('git', GREP_ARGUMENTS,
    { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (![0, 1].includes(result.status)) {
    throw new Error(`git grep failed with status ${result.status}: ${String(result.stderr || '').trim()}`);
  }
  return evaluateFindings(parseGrepOutput(result.stdout || ''));
}

function main() {
  const findings = scanRepository();
  const blocked = findings.filter(finding => !finding.allowed);
  const reviewed = findings.filter(finding => finding.allowed);
  for (const finding of blocked) {
    console.error(`${finding.file}:${finding.line} [${finding.ruleId}] potential secret (value redacted)`);
  }
  if (blocked.length) {
    console.error(`High-confidence secret scan failed: ${blocked.length} unapproved finding(s); values redacted.`);
    process.exitCode = 1;
    return;
  }
  console.log(`High-confidence secret scan passed: ${reviewed.length} exact reviewed false-positive finding(s), 0 unapproved findings.`);
}

if (require.main === module) main();

module.exports = {
  FALSE_POSITIVE_ALLOWLIST,
  GREP_ARGUMENTS,
  GREP_PATTERN,
  RULES,
  evaluateFindings,
  fingerprint,
  isAllowlisted,
  matchingRuleIds,
  parseGrepOutput,
  scanRepository
};
