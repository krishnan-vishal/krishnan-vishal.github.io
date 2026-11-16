import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { X509Certificate } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { directSupabaseOrigin, parseCliJson, validateHyperdrive } from './hyperdrive-config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js')
const name = 'gpir-payload-cms-m41'
const idPattern = /\b(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\b/i
let stage = 'preflight'
let sensitive = []

function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 60000,
    env: { ...process.env, CI: 'true', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_SANITIZE: 'true', WRANGLER_WRITE_LOGS: 'false' },
  })
  if (result.status !== 0) {
    let output = (result.stderr || result.stdout || 'Cloudflare command failed.').slice(-5000)
    for (const value of sensitive.filter(Boolean).sort((a, b) => b.length - a.length)) {
      output = output.replaceAll(value, '[redacted]')
    }
    output = output.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database URI redacted]')
    throw new Error(output)
  }
  return result.stdout
}

try {
  const configPath = path.join(root, 'wrangler.jsonc')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (config.name !== 'gpir-payload-cms') throw new Error('This setup only supports the isolated CMS Worker.')
  if (!process.argv[2]) throw new Error('Pass the path to the existing database CA certificate.')
  const certPath = path.resolve(process.argv[2])
  const certificate = new X509Certificate(fs.readFileSync(certPath))
  if (!certificate.ca || Date.parse(certificate.validTo) <= Date.now()) throw new Error('A valid, unexpired root CA is required.')
  const origin = directSupabaseOrigin(process.env)
  sensitive = [process.env.PAYLOAD_DATABASE_URI, origin.toString(), origin.password, decodeURIComponent(origin.password),
    process.env.PAYLOAD_SECRET, process.env.GPIR_SUPABASE_SECRET_KEY, process.env.GPIR_RELEASE_SIGNING_SECRET,
    process.env.S3_SECRET_ACCESS_KEY]
  const certificateName = 'gpir-m41-db-ca-' + certificate.fingerprint256.replaceAll(':', '').slice(0, 12).toLowerCase()

  stage = 'find existing Hyperdrive configuration'
  const list = run(['hyperdrive', 'list'])
  const matchingRows = list.split('\n').filter(line => line.split('│').some(cell => cell.trim() === name))
  if (matchingRows.length > 1) throw new Error('Multiple matching Hyperdrive configurations; no resource changed.')
  let hyperdriveId = matchingRows[0]?.match(idPattern)?.[0]
  if (matchingRows.length && !hyperdriveId) throw new Error('Cannot safely identify the existing configuration.')

  stage = 'find or upload trusted CA'
  const certificates = run(['cert', 'list']).split(/\r?\n\s*\r?\n/)
  const matchingCertificates = certificates.filter(block => block.includes('Name: ' + certificateName))
  if (matchingCertificates.length > 1) throw new Error('Multiple matching CA certificates; no certificate uploaded.')
  let caId = matchingCertificates[0]?.match(/ID:\s*([a-f0-9-]+)/i)?.[1]
  if (!caId) {
    const uploaded = run(['cert', 'upload', 'certificate-authority', '--ca-cert', certPath, '--name', certificateName])
    caId = uploaded.match(/ID:\s*([a-f0-9-]+)/i)?.[1]
    if (!caId) throw new Error('Certificate uploaded but its ID could not be read; inspect cert list before retrying.')
  }

  if (!hyperdriveId) {
    stage = 'create verified Hyperdrive connection'
    const created = run(['hyperdrive', 'create', name, '--connection-string', origin.toString(),
      '--ca-certificate-id', caId, '--sslmode', 'verify-full', '--caching-disabled',
      '--origin-connection-limit', '5', '--update-config=false'])
    hyperdriveId = created.match(/config:\s*([a-f0-9-]+)/i)?.[1]
    if (!hyperdriveId) throw new Error('Configuration created but its ID could not be read; inspect hyperdrive list before retrying.')
  }

  stage = 'verify remote TLS policy and origin'
  const remote = parseCliJson(run(['hyperdrive', 'get', hyperdriveId]))
  validateHyperdrive(remote, origin, caId)
  const previous = config.hyperdrive || []
  const existing = previous.find(binding => binding.binding === 'HYPERDRIVE')
  if (existing && existing.id !== hyperdriveId) throw new Error('Existing HYPERDRIVE binding points elsewhere; no config overwritten.')
  config.hyperdrive = [
    ...previous.filter(binding => binding.binding !== 'HYPERDRIVE'),
    { binding: 'HYPERDRIVE', id: hyperdriveId, remote: true },
  ]
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  console.log(JSON.stringify({
    status: 'HYPERDRIVE_CONFIGURED', worker: config.name, hyperdriveId, caId,
    sslmode: 'verify-full', queryCaching: 'disabled', origin: 'Supabase direct',
    next: 'Worker build and admin/login verification; this command does not deploy.',
  }))
} catch (error) {
  console.error(JSON.stringify({ status: 'FAILED', stage, message: error.message }))
  process.exitCode = 1
}
