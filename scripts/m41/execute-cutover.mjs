// Run only in the existing authenticated Codespace. No password conversion,
// schema changes, Contentful deletion, new PR, or weakened TLS is performed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { existingCloudflareAccount, existingContentfulDeliveryToken, existingCoreReleaseKey, supabaseProjectBoundaries, githubEnvironmentPlan, privateSupabaseFailure, verifiedNextBuildChanges, verifiedCMSCheckpoint } from './release-access.mjs'
import { directSupabaseOrigin, parseCliJson, validateHyperdrive } from '../../apps/gpir-cms/scripts/hyperdrive-config.mjs'
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
const resumeCMSVersion = option('resume-after-cms')
let stage = 'preflight'
let temporary
const report = { status: 'NOT_EXECUTED', repository, pr: 580, stages: [], contentfulDeleted: 0, contentfulExistingEntriesModified: 0, contentfulWrites: 0 }
let sensitive = []
function redact(value) {
  let text = String(value)
  for (const secret of sensitive.filter(value => value.length > 5).sort((a,b) => b.length - a.length)) text = text.replaceAll(secret, '[redacted]')
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database URI redacted]')
}
function run(command, args, { cwd = root, input, environment = process.env, timeout = 30 * 60 * 1000, privateOutput = false } = {}) {
  const result = spawnSync(command, args, { cwd, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout,
    env: { ...environment, CI: 'true', NO_COLOR: '1', WRANGLER_LOG_SANITIZE: 'true', WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' } })
  if (result.status !== 0 && privateOutput) {
    const failure = privateSupabaseFailure(result)
    throw Object.assign(new Error(failure.message), { code: failure.code })
  }
  if (result.status !== 0) throw new Error(redact(`${command} failed: ${result.stderr || result.stdout || result.error?.message || 'no details'}`).slice(-5000))
  return result.stdout
}
function step(name) {
  stage = name; report.stages.push(name)
  if (fs.existsSync(output)) jsonFile(path.join(output, 'consolidated-report.json'), { ...report, status: 'IN_PROGRESS', currentStage: name })
  console.log(`M41: ${name}`)
}
function gh(args, input) { return run('gh', [...args, '--repo', repository], { input }) }
function api(route, extra = [], input) { return run('gh', ['api', `repos/${repository}/${route}`, ...extra], { input }) }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function jsonFile(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }) }
function wrangler(args, environment = process.env) { return run(process.execPath, [path.join(app, 'node_modules/wrangler/bin/wrangler.js'), ...args], { environment }) }
let supabaseInvocation
let supabaseEnvironment
function supabase(args, options = {}) {
  if (!supabaseInvocation) {
    if (process.env.GPIR_SUPABASE_CLI) supabaseInvocation = [process.env.GPIR_SUPABASE_CLI]
    else {
      const available = spawnSync('supabase', ['--version'], { encoding: 'utf8', timeout: 20000 })
      if (available.error?.code === 'ENOENT') supabaseInvocation = ['npx', '--yes', 'supabase@2.121.0']
      else if (available.status === 0 && /\b2\.121\.0\b/.test(available.stdout || '')) supabaseInvocation = ['supabase']
      else if (available.status === 0) supabaseInvocation = ['npx', '--yes', 'supabase@2.121.0']
      else throw new Error('Existing Supabase CLI could not start; no deployment attempted.')
    }
  }
  const invoke = environment => run(supabaseInvocation[0], [...supabaseInvocation.slice(1), ...args], { ...options, environment })
  try { return invoke(supabaseEnvironment || process.env) } catch (error) {
    if (error.code !== 'CLI_AUTHENTICATION' || supabaseEnvironment || !process.env.SUPABASE_ACCESS_TOKEN) throw error
    // An expired env PAT must not shadow an existing authenticated CLI login.
    const storedLogin = { ...process.env }
    delete storedLogin.SUPABASE_ACCESS_TOKEN
    const result = invoke(storedLogin)
    supabaseEnvironment = storedLogin
    report.supabaseManagementAuthentication = 'EXISTING_STORED_CLI_LOGIN'
    return result
  }
}
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
    'CONTENTFUL_MANAGEMENT_TOKEN', 'PAYLOAD_RELEASE_API_KEY']
  const missing = required.filter(name => !process.env[name])
  if (missing.length) throw new Error('Missing settings (all checked before any production change): ' + missing.join(', '))
  sensitive = Object.entries(process.env).filter(([key]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URI/.test(key)).map(([,value]) => value)
  const uri = new URL(process.env.PAYLOAD_DATABASE_URI)
  sensitive.push(uri.password, decodeURIComponent(uri.password))
  productionSettings(process.env, cmsOrigin)
  const boundaries = supabaseProjectBoundaries(process.env, fs.readFileSync(path.join(root, 'assets/js/gpir-supabase-public-config.js'), 'utf8'))
  // CMS/Storage keep their private project. The public website remains the
  // authority for Core functions, publication decisions and entitlements.
  const project = boundaries.coreProjectRef
  const coreURL = boundaries.coreSupabaseURL
  process.env.GPIR_CORE_SUPABASE_URL = coreURL
  report.projects = boundaries
  console.log(`M41: CMS connection ${boundaries.cmsProjectRef}; unchanged GPIR Core target ${project}`)
  run('gh', ['auth', 'status'])
  let githubRepository, environmentInventory
  try {
    githubRepository = JSON.parse(run('gh', ['api', `repos/${repository}`]))
    environmentInventory = JSON.parse(api('environments?per_page=100'))
  } catch {
    throw new Error('GitHub preflight could not read repository metadata or GET /repos/' + repository + '/environments. Check the existing gh session repository access; no production changes performed.')
  }
  if (!Array.isArray(environmentInventory.environments) || environmentInventory.total_count > environmentInventory.environments.length) throw new Error('GitHub environment inventory is incomplete; no release configuration changed.')
  const environmentPlan = githubEnvironmentPlan(environmentInventory.environments, githubRepository.permissions)
  report.githubEnvironmentPlan = environmentPlan
  console.log('M41: GitHub environment inventory verified; missing release environments: ' + (environmentPlan.create.join(', ') || 'none'))
  if (resumeCMSVersion) {
    run('git', ['diff', '--quiet', '--cached'])
    run('git', ['diff', '--quiet', 'HEAD', '--', '.', ':(exclude)apps/gpir-cms/next-env.d.ts', ':(exclude)apps/gpir-cms/tsconfig.json'])
    const read = file => fs.readFileSync(path.join(root, 'apps/gpir-cms', file), 'utf8')
    const original = file => run('git', ['show', `HEAD:apps/gpir-cms/${file}`])
    verifiedNextBuildChanges({ next: original('next-env.d.ts'), config: original('tsconfig.json') },
      { next: read('next-env.d.ts'), config: read('tsconfig.json') })
  } else run('git', ['diff', '--quiet', 'HEAD'])
  const unknown = run('git', ['ls-files', '--others', '--exclude-standard']).trim()
  if (unknown) throw new Error('Use a clean isolated checkout; uncommitted/untracked work must be preserved.')
  const sha = run('git', ['rev-parse', 'HEAD']).trim()
  const pr = JSON.parse(gh(['pr', 'view', '580', '--json', 'headRefOid,headRefName,state,isDraft,baseRefOid']))
  if (pr.headRefName !== branch || pr.headRefOid !== sha || pr.state !== 'OPEN') throw new Error('The isolated checkout must exactly match open PR #580.')
  report.implementationCommit = sha
  report.previousRepositoryCommit = pr.baseRefOid
  // Install the unchanged lockfile, then verify actual deployment identities.
  if (resumeCMSVersion) {
    for (const file of ['node_modules/wrangler/bin/wrangler.js', 'node_modules/tsx/package.json', 'node_modules/payload/package.json']) {
      if (!fs.existsSync(path.join(app, file))) throw new Error('Existing deployment dependencies are missing; no automatic reinstall during checkpoint continuation.')
    }
  } else run('npm', ['ci'], { cwd: app })
  const identity = parseCliJson(wrangler(['whoami', '--json']))
  const binding = readJson(path.join(app, 'wrangler.jsonc')).hyperdrive.find(item => item.binding === 'HYPERDRIVE')
  const account = await existingCloudflareAccount(process.env, identity, async accountId => {
    try {
      const configured = parseCliJson(wrangler(['hyperdrive', 'get', binding.id], { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId }))
      validateHyperdrive(configured, directSupabaseOrigin(process.env), caId)
      return true
    } catch { return false }
  })
  process.env.CLOUDFLARE_ACCOUNT_ID = account.accountId
  report.cloudflareAccount = account
  report.cloudflareAuthentication = process.env.CLOUDFLARE_API_TOKEN ? 'EXISTING_API_TOKEN' : 'EXISTING_WRANGLER_SESSION'
  const delivery = await existingContentfulDeliveryToken(process.env, fetch, value => sensitive.push(value))
  process.env.CONTENTFUL_DELIVERY_TOKEN = delivery.token
  report.contentfulDeliveryAccess = delivery.source
  const coreAccess = await existingCoreReleaseKey(process.env, coreURL, fetch, value => sensitive.push(value), coreRef => {
    const raw = supabase(['projects', 'api-keys', '--project-ref', coreRef, '--reveal', '--output', 'json'], { privateOutput: true })
    let keys
    try { keys = JSON.parse(raw) } catch { throw new Error('Existing Core key inventory was unreadable; response withheld.') }
    if (Array.isArray(keys)) for (const item of keys) if (typeof item['api_key'] === 'string') sensitive.push(item['api_key'])
    return keys
  })
  process.env.GPIR_CORE_SUPABASE_SECRET_KEY = coreAccess.key
  report.coreReleaseAccess = coreAccess.source
  const functions = JSON.parse(supabase(['functions', 'list', '--project-ref', project, '--output', 'json']))
  const targets = ['gpir-intelligence-publish', 'gpir-protected-publication'].map(name => {
    const value = functions.find(item => item.slug === name || item.name === name)
    if (!value || typeof value.verify_jwt !== 'boolean') throw new Error('Cannot establish existing JWT policy for ' + name)
    return { name, verifyJwt: value.verify_jwt }
  })
  const identityResponse = await fetch(`${cmsOrigin}/api/users/me`, { headers: { authorization: `users API-Key ${process.env.PAYLOAD_RELEASE_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(20000) })
  const cmsIdentity = identityResponse.ok ? await identityResponse.json() : null
  if (!['admin', 'release-service'].includes(cmsIdentity?.user?.role)) throw new Error('Existing Payload API key must authenticate the authorized release role before production changes.')
  const contentfulBase = `/spaces/${encodeURIComponent(process.env.CONTENTFUL_SPACE_ID)}/environments/${encodeURIComponent(process.env.CONTENTFUL_ENVIRONMENT)}`
  for (const [host, name] of [['api.contentful.com', 'CONTENTFUL_MANAGEMENT_TOKEN'], ['cdn.contentful.com', 'CONTENTFUL_DELIVERY_TOKEN']]) {
    const response = await fetch(`https://${host}${contentfulBase}/entries?limit=1`, { headers: { authorization: `Bearer ${process.env[name]}` }, redirect: 'error', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Existing ${name} failed its read-only preflight (HTTP ${response.status}).`)
  }
  let priorReport
  if (resumeCMSVersion) {
    const saved = path.join(output, 'consolidated-report.json')
    priorReport = readJson(saved)
    const evidence = readJson(path.join(app, '.wrangler/m41-production-evidence.json'))
    run('git', ['merge-base', '--is-ancestor', evidence.sha, sha])
    // Reuse only a deployment whose entire CMS runtime source is unchanged.
    run('git', ['diff', '--quiet', evidence.sha, sha, '--', 'apps/gpir-cms'])
    const laterFiles = ['contentful', 'content-coverage.json', 'research-edition.json', 'live-verification.json']
      .filter(file => fs.existsSync(path.join(output, file)))
    const active = parseCliJson(wrangler(['deployments', 'status', '--name', 'gpir-payload-cms', '--json']))
    verifiedCMSCheckpoint({ evidence, deployedSHA: evidence.sha, expectedVersion: resumeCMSVersion,
      origin: cmsOrigin, bindingId: binding.id, caId, deployment: active, prior: priorReport, laterFiles })
    const disk = fs.statfsSync(root)
    if (Number(disk.bavail) * Number(disk.bsize) < 1024 ** 3) throw new Error('Less than 1 GiB workspace capacity remains; preserve files and free only reviewed disposable build output before import.')
    report.cms = evidence
    report.resume = { mode: 'AFTER_VERIFIED_CMS_DEPLOYMENT', reusedCMSVersion: resumeCMSVersion,
      deployedSource: evidence.sha, generatedNextFilesPreserved: true, priorStatus: priorReport.status,
      priorFailedStage: priorReport.failedStage }
  }
  report.sourceChecks = await checks(sha)
  if (!process.argv.includes('--execute')) {
    console.log(JSON.stringify({ status: 'PREFLIGHT_READY', sha, targets: targets.map(item => item.name), productionChanged: false }))
    process.exit(0)
  }
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gpir-m41-release-'))
  if (resumeCMSVersion) {
    // Keep the older failed report and local generated diff as private recovery evidence.
    const archive = path.join(output, 'checkpoints', String(Date.now()))
    jsonFile(path.join(archive, 'previous-report.json'), priorReport)
    fs.writeFileSync(path.join(archive, 'next-build.patch'), run('git', ['diff', '--', 'apps/gpir-cms/next-env.d.ts', 'apps/gpir-cms/tsconfig.json']), { mode: 0o600 })
  }
  fs.mkdirSync(output, { recursive: true, mode: 0o700 })
  if (environmentPlan.create.length) {
    step('provision the missing GitHub cutover environment without modifying existing protections')
    for (const environment of environmentPlan.create) {
      const fresh = JSON.parse(api('environments?per_page=100'))
      if (!Array.isArray(fresh.environments) || fresh.total_count > fresh.environments.length) throw new Error('GitHub environment recheck was incomplete; no environment PUT performed.')
      if (fresh.environments.some(item => item.name === environment)) continue
      let created
      try { created = JSON.parse(api(`environments/${environment}`, ['--method', 'PUT', '--input', '-'], '{}')) } catch {
        throw new Error('GitHub could not provision payload-production-cutover using the current credential. Repository admin metadata does not prove token administration permission. Authenticate gh through the owner browser login with repo/workflow access, select that session instead of the Codespaces integration token, then resume this setup-only checkpoint. No CMS deployment or content migration started.')
      }
      if (created.name !== environment) throw new Error('GitHub did not confirm the expected cutover environment.')
      report.githubEnvironmentCreated = [...(report.githubEnvironmentCreated || []), environment]
    }
  }
  step('pause the existing editorial draft writer during the primary-source switch')
  const draftWorkflow = 'm40-contentful-editorial-draft-handoff.yml'
  const priorWorkflow = JSON.parse(api(`actions/workflows/${draftWorkflow}`))
  report.draftWorkflowWasActive = priorWorkflow.state === 'active' ||
    (resumeCMSVersion && process.argv.includes('--restore-draft-writer') && priorWorkflow.state === 'disabled_manually')
  if (!['active', 'disabled_manually'].includes(priorWorkflow.state)) throw new Error('Editorial draft workflow has an unexpected state; its original lifecycle must be reconciled.')
  report.restoreDraftWriterAuthorized = process.argv.includes('--restore-draft-writer')
  if (report.draftWorkflowWasActive) gh(['workflow', 'disable', draftWorkflow])
  const pendingDrafts = JSON.parse(api(`actions/workflows/${draftWorkflow}/runs?per_page=30`)).workflow_runs || []
  for (const run of pendingDrafts.filter(item => ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(item.status))) gh(['run', 'cancel', String(run.id)])
  report.draftWorkflowPaused = true
  step('deploy the new CMS endpoints using the existing guarded Worker release')
  if (resumeCMSVersion) console.log('M41: verified existing CMS deployment reused; no install, build or CMS redeployment')
  else {
    run(process.execPath, ['scripts/release-cms.mjs', cmsOrigin, caId], { cwd: app })
    report.cms = readJson(path.join(app, '.wrangler/m41-production-evidence.json'))
  }
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
  report.recovery = { mode: 'EXISTING_CONTENTFUL_READ_ONLY_BASELINE', contentfulExport: backup,
    previousPayloadSnapshot: report.coverage.snapshot, previousRepositoryCommit: report.previousRepositoryCommit, currentPayloadSnapshot: process.env.GPIR_PAYLOAD_SITE_SNAPSHOT,
    bcpSynchronization: 'DEFERRED_NOT_A_CUTOVER_GATE', contentfulWrites: 0 }
  step('configure existing GitHub release and draft environments for Payload primary')
  for (const environment of ['contentful-production', 'payload-preview', 'payload-production-cutover']) {
    const variables = { GPIR_CONTENTFUL_READ_ONLY: 'true', GPIR_EDITORIAL_SOURCE: 'payload', PAYLOAD_PUBLIC_SERVER_URL: cmsOrigin, GPIR_PAYLOAD_SITE_SNAPSHOT: process.env.GPIR_PAYLOAD_SITE_SNAPSHOT,
      CONTENTFUL_SPACE_ID: process.env.CONTENTFUL_SPACE_ID, CONTENTFUL_ENVIRONMENT: process.env.CONTENTFUL_ENVIRONMENT, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID }
    if (environment === 'payload-production-cutover') variables.PAYLOAD_RELEASE_CUTOVER_ENABLED = 'true'
    for (const [name, value] of Object.entries(variables)) gh(['variable', 'set', name, '--env', environment, '--body', value])
    const secretNames = environment === 'contentful-production' ? ['PAYLOAD_RELEASE_API_KEY'] : ['PAYLOAD_RELEASE_API_KEY', 'GPIR_RELEASE_SIGNING_SECRET', ...(process.env.CLOUDFLARE_API_TOKEN ? ['CLOUDFLARE_API_TOKEN'] : [])]
    for (const name of secretNames) gh(['secret', 'set', name, '--env', environment], process.env[name])
  }
  report.futureCloudflareWorkflowCredential = process.env.CLOUDFLARE_API_TOKEN ? 'EXISTING_API_TOKEN_CONFIGURED' : 'EXISTING_GITHUB_SECRET_UNCHANGED; WRANGLER_OAUTH_NOT_EXPORTED'
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
  if (report.draftWorkflowWasActive) gh(['workflow', 'enable', draftWorkflow])
  report.draftWorkflowPaused = !report.draftWorkflowWasActive
  step('build from Payload and deploy through the existing website Worker')
  run(process.execPath, ['scripts/build-cloudflare-preview.js'])
  const deployed = wrangler(['deploy', '--config', 'wrangler.jsonc'])
  report.websiteDeploymentVersion = deployed.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1] || 'NOT_REPORTED'
  step('verify actual live bytes and anonymous entitlement protection')
  const liveReport = path.join(output, 'live-verification.json')
  run(process.execPath, ['scripts/m41/verify-live.cjs', liveReport])
  report.live = readJson(liveReport)
  const denied = await fetch(`${coreURL}/functions/v1/gpir-protected-publication`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicationId: 'VK-GPIR-P-000000000001-8', supabaseRecordId: '8ea94d2b-3254-4ddc-a50a-f10444b252f4' }) })
  if (![401, 403].includes(denied.status)) throw new Error('Anonymous protected-publication request did not fail closed.')
  report.anonymousProtectedHTTP = denied.status
  report.status = 'LIVE_STATIC_CUTOVER_VERIFIED_CONTENTFUL_UNCHANGED'
  report.authenticatedReaderAcceptance = 'NOT_PERFORMED_NO_EXISTING_PRIVATE_READER_SESSION'
  if (process.env.GPIR_ACCEPTANCE_READER_TOKEN) {
    const publicationId = process.env.GPIR_ACCEPTANCE_PUBLICATION_ID || 'VK-GPIR-P-000000000001-8'
    const supabaseRecordId = process.env.GPIR_ACCEPTANCE_RECORD_ID || '8ea94d2b-3254-4ddc-a50a-f10444b252f4'
    const protectedRead = await fetch(`${coreURL}/functions/v1/gpir-protected-publication`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${process.env.GPIR_ACCEPTANCE_READER_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ publicationId, supabaseRecordId }) })
    const delivered = await protectedRead.json().catch(() => ({}))
    report.authenticatedReaderHTTP = protectedRead.status
    report.protectedEditorialSource = protectedRead.headers.get('x-gpir-editorial-source')
    report.authenticatedReaderAcceptance = protectedRead.ok && delivered.status === 'ALLOW' &&
      delivered.publication?.identity === publicationId && delivered.publication?.supabaseRecordId === supabaseRecordId &&
      report.protectedEditorialSource === 'payload' ? 'LIVE_PAYLOAD_PROTECTED_READ_VERIFIED' : 'NOT_ACCEPTED_EXISTING_SESSION_OR_ENTITLEMENT_OR_SOURCE'
  }
  jsonFile(path.join(output, 'consolidated-report.json'), report)
  const current = JSON.parse(gh(['pr', 'view', '580', '--json', 'body'])).body
  const bodyFile = path.join(temporary, 'handover.md')
  fs.writeFileSync(bodyFile, current + '\n\n## Controlled production cutover evidence\n\n```json\n' + JSON.stringify(report, null, 2) + '\n```\n', { mode: 0o600 })
  gh(['pr', 'edit', '580', '--body-file', bodyFile])
  console.log(JSON.stringify(report))
} catch (error) {
  report.status = 'BLOCKED_NOT_COMPLETE'; report.failedStage = stage; report.message = redact(error.message)
  if (fs.existsSync(output)) jsonFile(path.join(output, resumeCMSVersion && stage === 'preflight' ? 'resume-preflight-failure.json' : 'consolidated-report.json'), report)
  console.error(JSON.stringify(report)); process.exitCode = 1
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true })
}

