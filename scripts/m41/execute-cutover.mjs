// Run only in the existing authenticated Codespace. No password conversion,
// schema changes, Contentful deletion, new PR, or weakened TLS is performed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { requireSuccessfulCI, productionSettings } from '../../apps/gpir-cms/scripts/release-config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const app = path.join(root, 'apps/gpir-cms')
const repository = 'krishnan-vishal/krishnan-vishal.github.io'
const branch = 'fix/m41-cloudflare-sharp-admin-runtime-20261115'
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const envFile = option('env') || '/workspaces/m41-payload/apps/gpir-cms/.env'
const caFile = option('ca') || '/workspaces/m41-payload/apps/gpir-cms/prod-ca-2021.crt'
const cmsOrigin = 'https://gpir-payload-cms.krishnanvishal12.workers.dev'
const caId = 'e2ccb563-d674-46e2-92aa-f96417ee9bcc'
const output = path.join(root, '.migration-data/m41-cutover')
let stage = 'preflight'
let temporary
const report = { status: 'NOT_EXECUTED', repository, pr: 580, stages: [], contentfulDeleted: 0, contentfulExistingEntriesModified: 0 }
let sensitive = []
function redact(value) {
  let text = String(value)
  for (const secret of sensitive.filter(value => value.length > 5).sort((a,b) => b.length - a.length)) text = text.replaceAll(secret, '[redacted]')
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database URI redacted]')
}
function run(command, args, { cwd = root, input, environment = process.env, timeout = 30 * 60 * 1000 } = {}) {
  const result = spawnSync(command, args, { cwd, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout,
    env: { ...environment, CI: 'true', NO_COLOR: '1', WRANGLER_LOG_SANITIZE: 'true', WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' } })
  if (result.status !== 0) throw new Error(redact(`${command} failed: ${result.stderr || result.stdout || result.error?.message || 'no details'}`).slice(-5000))
  return result.stdout
}
function step(name) { stage = name; report.stages.push(name); console.log(`M41: ${name}`) }
function gh(args, input) { return run('gh', [...args, '--repo', repository], { input }) }
function api(route, extra = [], input) { return run('gh', ['api', `repos/${repository}/${route}`, ...extra], { input }) }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function jsonFile(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }) }
function wrangler(args) { return run(process.execPath, [path.join(app, 'node_modules/wrangler/bin/wrangler.js'), ...args]) }
function supabase(args) { return run(process.env.GPIR_SUPABASE_CLI || 'supabase', args) }
async function checks(sha) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const runs = JSON.parse(api(`actions/runs?head_sha=${sha}&event=pull_request&per_page=30`)).workflow_runs
    try { return requireSuccessfulCI(runs, sha) } catch (error) {
      if (runs.some(run => run.head_sha === sha && ['M41 Payload CMS validation', 'GPIR Security and Integrity'].includes(run.name) && run.status === 'completed' && run.conclusion !== 'success')) throw error
      if (attempt === 79) throw new Error('Current-head CI did not finish inside the bounded wait.')
      console.log('M41: awaiting current-head checks; production release remains held')
      await new Promise(resolve => setTimeout(resolve, 15000))
    }
  }
}
try {
  if (!fs.existsSync(envFile) || !fs.existsSync(caFile)) throw new Error('Existing private env and CA files must be available in the authenticated Codespace.')
  process.loadEnvFile(envFile)
  process.env.PAYLOAD_DATABASE_CA_CERT = fs.readFileSync(caFile, 'utf8')
  process.env.PAYLOAD_PUBLIC_SERVER_URL = cmsOrigin
  const required = ['PAYLOAD_DATABASE_URI', 'PAYLOAD_SECRET', 'SUPABASE_URL', 'GPIR_SUPABASE_SECRET_KEY', 'GPIR_RELEASE_SIGNING_SECRET',
    'S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT',
    'CONTENTFUL_DELIVERY_TOKEN', 'CONTENTFUL_MANAGEMENT_TOKEN', 'PAYLOAD_RELEASE_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
  const missing = required.filter(name => !process.env[name])
  if (missing.length) throw new Error('Missing settings (all checked before any production change): ' + missing.join(', '))
  sensitive = Object.entries(process.env).filter(([key]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URI/.test(key)).map(([,value]) => value)
  const uri = new URL(process.env.PAYLOAD_DATABASE_URI)
  sensitive.push(uri.password, decodeURIComponent(uri.password))
  productionSettings(process.env, cmsOrigin)
  const project = new URL(process.env.SUPABASE_URL).hostname.split('.')[0]
  if (project !== 'qlnvhfapctcpzqyuhhth') throw new Error('Unexpected Supabase project; no changes made.')
  run('gh', ['auth', 'status'])
  for (const environment of ['contentful-production', 'payload-preview', 'payload-production-cutover']) api(`environments/${environment}`)
  run('git', ['diff', '--quiet', 'HEAD'])
  const unknown = run('git', ['ls-files', '--others', '--exclude-standard']).trim()
  if (unknown) throw new Error('Use a clean isolated checkout; uncommitted/untracked work must be preserved.')
  const sha = run('git', ['rev-parse', 'HEAD']).trim()
  const pr = JSON.parse(gh(['pr', 'view', '580', '--json', 'headRefOid,headRefName,state,isDraft']))
  if (pr.headRefName !== branch || pr.headRefOid !== sha || pr.state !== 'OPEN') throw new Error('The isolated checkout must exactly match open PR #580.')
  report.implementationCommit = sha
  // Install the unchanged lockfile, then verify actual deployment identities.
  run('npm', ['ci'], { cwd: app })
  wrangler(['whoami'])
  const functions = JSON.parse(supabase(['functions', 'list', '--project-ref', project, '--output', 'json']))
  const targets = ['gpir-intelligence-publish', 'gpir-protected-publication'].map(name => {
    const value = functions.find(item => item.slug === name || item.name === name)
    if (!value || typeof value.verify_jwt !== 'boolean') throw new Error('Cannot establish existing JWT policy for ' + name)
    return { name, verifyJwt: value.verify_jwt }
  })
  const identityResponse = await fetch(`${cmsOrigin}/api/users/me`, { headers: { authorization: `users API-Key ${process.env.PAYLOAD_RELEASE_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(20000) })
  const identity = identityResponse.ok ? await identityResponse.json() : null
  if (!['admin', 'release-service'].includes(identity?.user?.role)) throw new Error('Existing Payload API key must authenticate the authorized release role before production changes.')
  const contentfulBase = `/spaces/${encodeURIComponent(process.env.CONTENTFUL_SPACE_ID)}/environments/${encodeURIComponent(process.env.CONTENTFUL_ENVIRONMENT)}`
  for (const [host, name] of [['api.contentful.com', 'CONTENTFUL_MANAGEMENT_TOKEN'], ['cdn.contentful.com', 'CONTENTFUL_DELIVERY_TOKEN']]) {
    const response = await fetch(`https://${host}${contentfulBase}/entries?limit=1`, { headers: { authorization: `Bearer ${process.env[name]}` }, redirect: 'error', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Existing ${name} failed its read-only preflight (HTTP ${response.status}).`)
  }
  report.sourceChecks = await checks(sha)
  if (!process.argv.includes('--execute')) {
    console.log(JSON.stringify({ status: 'PREFLIGHT_READY', sha, targets: targets.map(item => item.name), productionChanged: false }))
    process.exit(0)
  }
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gpir-m41-release-'))
  fs.mkdirSync(output, { recursive: true, mode: 0o700 })
  step('deploy the new CMS endpoints using the existing guarded Worker release')
  run(process.execPath, ['scripts/release-cms.mjs', cmsOrigin, caId], { cwd: app })
  report.cms = readJson(path.join(app, '.wrangler/m41-production-evidence.json'))
  step('export Contentful read-only and import the complete public edition into Payload')
  const backup = path.join(output, 'contentful')
  run(process.execPath, ['--import', 'tsx', 'src/migration/export-contentful.ts', '--exclude-recovery', `--output=${backup}`], { cwd: app })
  run(process.execPath, ['scripts/build-cloudflare-preview.js'], { environment: { ...process.env, GPIR_CONTENT_SOURCE: 'repository' } })
  const migrationReport = path.join(output, 'content-coverage.json')
  run(process.execPath, ['--import', 'tsx', 'src/migration/full-site.ts', `--backup=${backup}`, `--site=${path.join(root, '.cloudflare-preview-dist')}`, `--report=${migrationReport}`], { cwd: app })
  report.coverage = readJson(migrationReport)
  process.env.GPIR_PAYLOAD_SITE_SNAPSHOT = report.coverage.snapshot
  step('prepare reviewer-approved native research as a new immutable Payload edition')
  const editionReport = path.join(output, 'research-edition.json')
  run(process.execPath, ['--import', 'tsx', 'src/migration/prepare-site-release.ts', `--report=${editionReport}`], { cwd: app })
  report.researchEdition = readJson(editionReport)
  process.env.GPIR_PAYLOAD_SITE_SNAPSHOT = report.researchEdition.snapshot
  process.env.GPIR_CONTENT_SOURCE = 'payload'
  step('prove Contentful BCP synchronization and independent byte recovery before switching production')
  const bcpReport = path.join(output, 'bcp-recovery.json')
  run(process.execPath, ['scripts/m41/sync-site-bcp.cjs', bcpReport])
  report.bcp = readJson(bcpReport)
  run(process.execPath, ['scripts/m41/recover-site.cjs', report.bcp.recoverySnapshot, path.join(temporary, 'recovered')])
  report.recovery = readJson(path.join(temporary, 'recovered/recovery-evidence.json'))
  step('configure existing GitHub release and draft environments for Payload primary')
  for (const environment of ['contentful-production', 'payload-preview', 'payload-production-cutover']) {
    const variables = { GPIR_EDITORIAL_SOURCE: 'payload', PAYLOAD_PUBLIC_SERVER_URL: cmsOrigin, GPIR_PAYLOAD_SITE_SNAPSHOT: process.env.GPIR_PAYLOAD_SITE_SNAPSHOT,
      CONTENTFUL_SPACE_ID: process.env.CONTENTFUL_SPACE_ID, CONTENTFUL_ENVIRONMENT: process.env.CONTENTFUL_ENVIRONMENT, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID }
    if (environment === 'payload-production-cutover') variables.PAYLOAD_RELEASE_CUTOVER_ENABLED = 'true'
    for (const [name, value] of Object.entries(variables)) gh(['variable', 'set', name, '--env', environment, '--body', value])
    for (const name of ['PAYLOAD_RELEASE_API_KEY', 'GPIR_RELEASE_SIGNING_SECRET', 'CONTENTFUL_MANAGEMENT_TOKEN', 'CLOUDFLARE_API_TOKEN']) gh(['secret', 'set', name, '--env', environment], process.env[name])
  }
  step('deploy only the two existing editorial consumers, preserving their JWT policies')
  for (const target of targets) supabase(['functions', 'deploy', target.name, '--project-ref', project, '--use-api', ...(target.verifyJwt ? [] : ['--no-verify-jwt'])])
  const secretsFile = path.join(temporary, 'editorial.env')
  fs.writeFileSync(secretsFile, ['GPIR_EDITORIAL_SOURCE=payload', `PAYLOAD_PUBLIC_SERVER_URL=${cmsOrigin}`, `PAYLOAD_RELEASE_API_KEY=${process.env.PAYLOAD_RELEASE_API_KEY}`].join('\n') + '\n', { mode: 0o600 })
  supabase(['secrets', 'set', '--project-ref', project, '--env-file', secretsFile])
  step('commit the permanent source lock to PR #580 only and await its checks')
  const lock = { source: 'payload', snapshot: process.env.GPIR_PAYLOAD_SITE_SNAPSHOT, contentful: 'preserved-bcp', editorialAuthority: 'native-payload-with-preserved-delivered-editions' }
  jsonFile(path.join(root, 'gpir-content-source.json'), lock)
  run('git', ['add', '--', 'gpir-content-source.json'])
  run('git', ['commit', '-m', 'M41: pin verified Payload primary edition; preserve Contentful BCP'])
  const releaseSha = run('git', ['rev-parse', 'HEAD']).trim()
  run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`])
  report.releaseCommit = releaseSha
  report.releaseChecks = await checks(releaseSha)
  step('merge the owner-authorized existing PR without bypassing GitHub controls')
  if (pr.isDraft) gh(['pr', 'ready', '580'])
  const mergeInput = path.join(temporary, 'merge.json')
  jsonFile(mergeInput, { sha: releaseSha, merge_method: 'merge' })
  const merged = JSON.parse(api('pulls/580/merge', ['--method', 'PUT', '--input', mergeInput]))
  if (merged.merged !== true) throw new Error('GitHub did not merge PR #580; no website deployment attempted.')
  report.mergeCommit = merged.sha
  step('build from Payload and deploy through the existing website Worker')
  run(process.execPath, ['scripts/build-cloudflare-preview.js'])
  const deployed = wrangler(['deploy', '--config', 'wrangler.jsonc'])
  report.websiteDeploymentVersion = deployed.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1] || 'NOT_REPORTED'
  step('verify actual live bytes and anonymous entitlement protection')
  const liveReport = path.join(output, 'live-verification.json')
  run(process.execPath, ['scripts/m41/verify-live.cjs', liveReport])
  report.live = readJson(liveReport)
  const denied = await fetch(`${process.env.SUPABASE_URL}/functions/v1/gpir-protected-publication`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicationId: 'VK-GPIR-P-000000000001-8', supabaseRecordId: '8ea94d2b-3254-4ddc-a50a-f10444b252f4' }) })
  if (![401, 403].includes(denied.status)) throw new Error('Anonymous protected-publication request did not fail closed.')
  report.anonymousProtectedHTTP = denied.status
  report.status = 'LIVE_STATIC_CUTOVER_AND_BCP_VERIFIED'
  report.authenticatedReaderAcceptance = 'NOT_CLAIMED_BY_STATIC_BYTE_AND_ANONYMOUS_CHECKS'
  jsonFile(path.join(output, 'consolidated-report.json'), report)
  const current = JSON.parse(gh(['pr', 'view', '580', '--json', 'body'])).body
  const bodyFile = path.join(temporary, 'handover.md')
  fs.writeFileSync(bodyFile, current + '\n\n## Controlled production cutover evidence\n\n```json\n' + JSON.stringify(report, null, 2) + '\n```\n', { mode: 0o600 })
  gh(['pr', 'edit', '580', '--body-file', bodyFile])
  console.log(JSON.stringify(report))
} catch (error) {
  report.status = 'BLOCKED_NOT_COMPLETE'; report.failedStage = stage; report.message = redact(error.message)
  if (fs.existsSync(output)) jsonFile(path.join(output, 'consolidated-report.json'), report)
  console.error(JSON.stringify(report)); process.exitCode = 1
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true })
}
