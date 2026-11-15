import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { productionSettings, requireSuccessfulCI, runtimeKeys } from './release-config.mjs'
import { directSupabaseOrigin, parseCliJson, validateHyperdrive } from './hyperdrive-config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js')
const repository = 'krishnan-vishal/krishnan-vishal.github.io'
let stage = 'preflight'
let deployed = false
let temporaryDirectory
let sha
let deploymentVersion
let publicUrl
const sensitive = runtimeKeys.map(key => process.env[key]).filter(Boolean)
if (process.env.PAYLOAD_DATABASE_URI) {
  sensitive.push(process.env.PAYLOAD_DATABASE_URI)
  try {
    const uri = new URL(process.env.PAYLOAD_DATABASE_URI)
    sensitive.push(uri.password, decodeURIComponent(uri.password))
  } catch {}
}

function redact(value) {
  let output = String(value)
  for (const secret of sensitive.filter(Boolean).sort((a, b) => b.length - a.length)) output = output.replaceAll(secret, '[redacted]')
  return output.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database URI redacted]')
}

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 20 * 60 * 1000,
    env: { ...environment, CI: 'true', NO_COLOR: '1', WRANGLER_LOG_SANITIZE: 'true',
      WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' },
  })
  if (result.status !== 0) throw new Error(redact((result.stderr || '') + '\n' + (result.stdout || '')).slice(-7000))
  return result.stdout
}

function cloudflare(args) { return run(process.execPath, [wrangler, ...args]) }
function progress(next) { stage = next; console.log('M41: ' + next) }

try {
  const settings = productionSettings(process.env, process.argv[2])
  publicUrl = settings.PAYLOAD_PUBLIC_SERVER_URL
  const expectedCaId = process.argv[3]
  if (!/^[a-f0-9-]{36}$/i.test(expectedCaId || '')) throw new Error('Pass the verified Hyperdrive CA ID as the second argument.')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'))
  const binding = config.hyperdrive?.find(item => item.binding === 'HYPERDRIVE')
  if (config.name !== 'gpir-payload-cms' || config.routes?.length || config.route ||
      binding?.remote !== true || binding.localConnectionString) {
    throw new Error('Release must target only the isolated CMS Worker and its remote Hyperdrive binding.')
  }
  sha = run('git', ['rev-parse', 'HEAD']).trim()
  run('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'scripts', 'test', 'package.json', 'package-lock.json', 'wrangler.jsonc', 'next.config.mjs', 'open-next.config.ts'])

  progress('verify current-commit GitHub checks')
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'GPIR-M41-release', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  const checks = await fetch('https://api.github.com/repos/' + repository + '/actions/runs?head_sha=' + sha + '&event=pull_request&per_page=30', { headers, signal: AbortSignal.timeout(20000) })
  if (!checks.ok) throw new Error('GitHub check lookup failed with HTTP ' + checks.status + '; no deployment attempted.')
  const workflows = requireSuccessfulCI((await checks.json()).workflow_runs || [], sha)

  progress('verify Hyperdrive origin and certificate policy')
  const remote = parseCliJson(cloudflare(['hyperdrive', 'get', binding.id]))
  validateHyperdrive(remote, directSupabaseOrigin(process.env), expectedCaId)

  progress('run tests, TypeScript and dependency audit')
  run('npm', ['test'])
  run('npm', ['run', 'typecheck'])
  const auditResult = spawnSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 60000 })
  const audit = JSON.parse(auditResult.stdout || '{}').metadata?.vulnerabilities
  if (!audit || audit.high || audit.critical) throw new Error('Dependency audit failed or high/critical findings remain; no deployment attempted.')

  progress('build isolated CMS Worker')
  const buildEnvironment = { ...process.env }
  for (const key of runtimeKeys) delete buildEnvironment[key]
  delete buildEnvironment.PAYLOAD_DATABASE_CA_CERT
  buildEnvironment.PAYLOAD_DATABASE_URI = 'postgresql://build_only:build_only@localhost:5432/postgres'
  buildEnvironment.PAYLOAD_SECRET = 'build-only-placeholder-not-a-production-secret'
  buildEnvironment.PAYLOAD_PUBLIC_SERVER_URL = publicUrl
  run('npm', ['run', 'build:worker'], buildEnvironment)
  if (!fs.existsSync(path.join(root, '.open-next/worker.js')) || !fs.existsSync(path.join(root, '.open-next/assets'))) {
    throw new Error('Worker entrypoint or assets are missing.')
  }

  progress('prepare private production settings and deployment dry run')
  fs.mkdirSync(path.join(root, '.wrangler'), { recursive: true })
  temporaryDirectory = fs.mkdtempSync(path.join(root, '.wrangler/m41-release-'))
  const secretsFile = path.join(temporaryDirectory, 'secrets.json')
  fs.writeFileSync(secretsFile, JSON.stringify(settings), { mode: 0o600 })
  const deployArguments = ['deploy', '--config', 'wrangler.jsonc', '--name', 'gpir-payload-cms',
    '--secrets-file', secretsFile, '--tag', sha.slice(0, 12), '--message', 'M41 PR #580 ' + sha]
  cloudflare([...deployArguments, '--dry-run'])

  progress('deploy CMS Worker with private settings')
  const output = cloudflare(deployArguments)
  deployed = true
  deploymentVersion = output.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1]
  const deployedUrl = output.match(/https:\/\/gpir-payload-cms\.[a-z0-9-]+\.workers\.dev/)?.[0]
  if (deployedUrl !== publicUrl) throw new Error('Deployment URL differs from the configured CMS origin. Review the account before continuing. Returned origin: ' + (deployedUrl || 'unavailable'))

  progress('verify live admin and anonymous access')
  let admin
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      admin = await fetch(publicUrl + '/admin/login', { signal: AbortSignal.timeout(20000) })
      if (admin.ok) break
    } catch (error) { if (attempt === 2) throw error }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 3000))
  }
  if (!admin?.ok || new URL(admin.url).origin !== publicUrl) throw new Error('Live CMS login page did not return HTTP 200 from the expected origin.')
  const html = await admin.text()
  if (!/Payload/i.test(html) || !/password/i.test(html)) throw new Error('Live response did not contain the CMS login form.')
  const me = await fetch(publicUrl + '/api/users/me', { signal: AbortSignal.timeout(20000) })
  if (!me.ok || (await me.json()).user !== null) throw new Error('Anonymous user/session check did not pass.')
  const evidence = {
    status: 'DEPLOYED_LIVE_LOGIN_VERIFIED', editorialLiveLogin: 'PENDING_OWNER_VERIFICATION',
    sha, deploymentVersion: deploymentVersion || 'not reported by CLI', publicUrl, adminUrl: publicUrl + '/admin',
    adminHTTP: admin.status, anonymousUser: null, audit, workflows,
    hyperdriveId: binding.id, caId: expectedCaId, sslmode: 'verify-full', queryCaching: 'disabled',
  }
  fs.writeFileSync(path.join(root, '.wrangler/m41-production-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence))
} catch (error) {
  console.error(JSON.stringify({ status: 'FAILED', stage, deployed, sha, deploymentVersion, publicUrl, message: redact(error.message) }))
  process.exitCode = 1
} finally {
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}
