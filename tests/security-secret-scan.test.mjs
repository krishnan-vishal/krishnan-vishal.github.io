import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import scanner from '../scripts/scan-high-confidence-secrets.js';

const {
  FALSE_POSITIVE_ALLOWLIST,
  GREP_ARGUMENTS,
  GREP_PATTERN,
  evaluateFindings,
  matchingRuleIds,
  scanRepository
} = scanner;

test('scanner preserves the original git grep scope and exclusions exactly', () => {
  assert.deepEqual(GREP_ARGUMENTS, [
    'grep', '--no-index', '-n', '-I', '-E', GREP_PATTERN, '--', '.',
    ':(exclude)SECURITY.md', ':(exclude)docs/**'
  ]);
});

test('provider tokens, private-key headers, and literal assignments retain coverage', () => {
  const cases = [
    [`const value = ${['AKIA', 'A'.repeat(16)].join('')};`, 'AWS_ACCESS_KEY_ID'],
    [`const value = ${['AIza', 'A'.repeat(24)].join('')};`, 'GOOGLE_API_KEY'],
    [`const value = ${['ghp_', 'A'.repeat(24)].join('')};`, 'GITHUB_TOKEN'],
    [`-----${['BEGIN ', 'PRIVATE', ' KEY'].join('')}-----`, 'PRIVATE_KEY_HEADER'],
    [`const ${['pass', 'word'].join('')} = 'not-allowlisted';`, 'GENERIC_PASSWORD_ASSIGNMENT'],
    [`const value = { ${['api', 'key'].join('')}: 'not-allowlisted' };`, 'GENERIC_API_KEY_ASSIGNMENT']
  ];
  for (const [sourceLine, ruleId] of cases) {
    assert.ok(matchingRuleIds(sourceLine).includes(ruleId), `${ruleId} must remain detected`);
  }
});

test('allowlist requires the exact path, line, rule, and content fingerprint', () => {
  const entry = FALSE_POSITIVE_ALLOWLIST[0];
  const changed = {
    file: entry.file,
    line: entry.line,
    ruleId: entry.ruleId,
    sourceLine: `const ${['pass', 'word'].join('')} = 'changed';`
  };
  assert.equal(evaluateFindings([changed])[0].allowed, false);
  assert.equal(evaluateFindings([{ ...changed, file: 'elsewhere.js' }])[0].allowed, false);
  assert.equal(evaluateFindings([{ ...changed, line: changed.line + 1 }])[0].allowed, false);
});

test('altering an approved path and line to a synthetic literal remains blocked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gpir-secret-scan-altered-'));
  try {
    const relative = 'assets/js/gpir-reader-auth.js';
    await mkdir(join(root, 'assets', 'js'), { recursive: true });
    const alteredLine = `const ${['pass', 'word'].join('')} = '${['synthetic', 'literal', 'credential'].join('-')}';`;
    await writeFile(join(root, relative), [...Array(81).fill(''), alteredLine].join('\n'), 'utf8');
    const findings = scanRepository(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, relative);
    assert.equal(findings[0].line, 82);
    assert.equal(findings[0].ruleId, 'GENERIC_PASSWORD_ASSIGNMENT');
    assert.equal(findings[0].allowed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('end-to-end git scan rejects synthetic signatures without exposing values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gpir-secret-scan-'));
  try {
    const signatures = [
      ['AKIA', 'A'.repeat(16)].join(''),
      ['AIza', 'A'.repeat(24)].join(''),
      ['ghp_', 'A'.repeat(24)].join(''),
      ['BEGIN ', 'PRIVATE', ' KEY'].join(''),
      `const ${['pass', 'word'].join('')} = 'synthetic-fixture-only';`,
      `const value = { ${['api', 'key'].join('')}: 'synthetic-fixture-only' };`
    ];
    await mkdir(join(root, '.github'), { recursive: true });
    await writeFile(join(root, '.github', 'synthetic-hidden.txt'), `${signatures[0]}\n`, 'utf8');
    await writeFile(join(root, 'synthetic.txt'), signatures.slice(1).join('\n'), 'utf8');
    const findings = scanRepository(root);
    assert.deepEqual(new Set(findings.map(finding => finding.ruleId)), new Set([
      'AWS_ACCESS_KEY_ID', 'GOOGLE_API_KEY', 'GITHUB_TOKEN', 'PRIVATE_KEY_HEADER',
      'GENERIC_PASSWORD_ASSIGNMENT', 'GENERIC_API_KEY_ASSIGNMENT'
    ]));
    assert.equal(findings.every(finding => !finding.allowed), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository scan accepts only the nine exact reviewed false positives', () => {
  const findings = scanRepository();
  assert.equal(findings.length, 9);
  assert.equal(findings.every(finding => finding.allowed), true);
});
