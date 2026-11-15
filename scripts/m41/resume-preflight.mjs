// Executed from the fetched PR #580 source. Resume only the reported, clean,
// pre-production checkpoint; do not reset, stash, create a worktree or delete work.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const repository = process.argv[2] || '/workspaces/m41-pr580-release'
export function eligiblePreflightCheckpoint({ directory, clean, ancestor, report, outputExists }) {
  if (!directory?.startsWith('/workspaces/m41-full-cutover-') || !clean || !ancestor) return false
  if (!report) return !outputExists
  return report.failedStage === 'preflight' && Array.isArray(report.stages) && report.stages.length === 0
}
function git(directory, args, capture = true) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8', ...(capture ? { stdio: ['ignore', 'pipe', 'pipe'] } : { stdio: 'inherit' }) })
  if (result.status !== 0) throw new Error('Git resume operation failed; existing files and stashes were not discarded.')
  return result.stdout || ''
}
async function main() {
try {
  const target = git(repository, ['rev-parse', 'FETCH_HEAD']).trim()
  const blocks = git(repository, ['worktree', 'list', '--porcelain']).trim().split(/\n\n+/)
  const candidates = blocks.flatMap(block => {
    const directory = block.match(/^worktree (.+)$/m)?.[1]
    const sha = block.match(/^HEAD ([a-f0-9]+)$/m)?.[1]
    if (!directory?.startsWith('/workspaces/m41-full-cutover-') || !sha) return []
    const clean = !git(directory, ['status', '--porcelain']).trim()
    const history = spawnSync('git', ['-C', repository, 'merge-base', '--is-ancestor', sha, target])
    const output = path.join(directory, '.migration-data/m41-cutover')
    const reportFile = path.join(output, 'consolidated-report.json')
    const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null
    if (!eligiblePreflightCheckpoint({ directory, clean, ancestor: history.status === 0, report, outputExists: fs.existsSync(output) })) return []
    return [directory]
  }).sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  if (!candidates.length) throw new Error('No unchanged preflight checkpoint found. All existing work was preserved; do not restart the import blindly.')
  const directory = candidates[0]
  console.log('M41: resuming the existing preflight worktree')
  git(directory, ['fetch', 'origin', 'fix/m41-cloudflare-sharp-admin-runtime-20261115'], false)
  git(directory, ['merge', '--ff-only', 'FETCH_HEAD'], false)
  const run = spawnSync(process.execPath, ['scripts/m41/execute-cutover.mjs', '--execute'], { cwd: directory, stdio: 'inherit', env: process.env })
  process.exitCode = run.status ?? 1
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

}
if (process.argv[1] === '-' || (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))) await main()
