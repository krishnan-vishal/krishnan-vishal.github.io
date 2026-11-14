import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const expectedBranch = 'codex/gpir-payload-cms-migration-20261114'
const requiredFiles = [
  '.devcontainer/devcontainer.json',
  '.cline/rules/gpir-migration.md',
  'GPIR_MIGRATION_HANDOVER.md',
  'apps/gpir-cms/package.json',
]

const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
const devcontainer = JSON.parse(await readFile('.devcontainer/devcontainer.json', 'utf8'))
const extensions = devcontainer.customizations?.vscode?.extensions ?? []

const missingFiles = []
for (const file of requiredFiles) {
  try {
    await readFile(file)
  } catch {
    missingFiles.push(file)
  }
}

const providerSecrets = {
  openrouter: Boolean(process.env.OPENROUTER_API_KEY),
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  openai: Boolean(process.env.OPENAI_API_KEY),
  google: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
}

const result = {
  branch,
  expectedBranch,
  branchReady: branch === expectedBranch,
  clineExtensionDeclared: extensions.includes('saoudrizwan.claude-dev'),
  projectRulesPresent: missingFiles.length === 0,
  missingFiles,
  providerSecrets,
  openRouterReady: providerSecrets.openrouter,
  modelSelection: process.env.GPIR_AI_MODEL ? 'owner-configured' : 'select-in-cline',
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

if (!result.branchReady || !result.clineExtensionDeclared || !result.projectRulesPresent) {
  process.exitCode = 1
}
