// Access repair only. Never runs migration, deploys, rotates a key or prints a token.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { coreProjectRef, verifyManagementAccess, sealManagementSession, openManagementSession } from './management-session.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, '.migration-data/m41-cutover')
const branch = 'fix/m41-cloudflare-sharp-admin-runtime-20261115'
const repository = 'krishnan-vishal/krishnan-vishal.github.io'
let stage = 'read existing management session'
const sessionFile = path.join(output, 'management-session.json')
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(file + '.tmp', file)
  fs.chmodSync(file, 0o600)
}
function gh(args) {
  const result = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1' } })
  if (result.status !== 0) throw new Error('GitHub access-repair operation failed; command output withheld. Existing work and credentials preserved.')
  return result.stdout
}
async function seal() {
  stage = 'verify existing repository deployment credential'
  const id = process.env.GPIR_RECOVERY_ID
  const publicPEM = Buffer.from(process.env.GPIR_RECOVERY_PUBLIC_KEY || '', 'base64').toString('utf8')
  const token = process.env.GPIR_SUPABASE_DEPLOY_TOKEN
  const access = await verifyManagementAccess(token)
  const envelope = sealManagementSession(token, publicPEM, id)
  const directory = option('output')
  if (!directory || !process.env.RUNNER_TEMP || !path.resolve(directory).startsWith(path.resolve(process.env.RUNNER_TEMP) + path.sep)) throw new Error('Encrypted handoff output must be inside the GitHub temporary workspace.')
  save(path.join(directory, 'management-envelope.json'), envelope)
  console.log(JSON.stringify({ status: 'EXISTING_DEPLOYMENT_CREDENTIAL_VERIFIED_AND_ENCRYPTED', recoveryID: id, coreProjectRef, ...access }))
}
async function repair() {
  if (!process.argv.includes('--repair')) throw new Error('Select access-only --repair or --seal.')
  if (fs.existsSync(sessionFile)) {
    const existing = read(sessionFile)
    if (existing.coreProjectRef !== coreProjectRef) throw new Error('Saved management session targets a different project; preserved unchanged.')
    const access = await verifyManagementAccess(existing.token)
    console.log(JSON.stringify({ status: 'EXISTING_PRIVATE_MANAGEMENT_ACCESS_VERIFIED', coreProjectRef, ...access, migrationExecuted: false }))
    return
  }
  stage = 'verify exact PR checkout'
  const pr = JSON.parse(gh(['pr', 'view', '580', '--repo', repository, '--json', 'headRefName,headRefOid,state']))
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  if (pr.state !== 'OPEN' || pr.headRefName !== branch || pr.headRefOid !== head) throw new Error('Access repair must use the exact existing PR #580 checkout.')
  stage = 'prepare private encrypted handoff'
  const ignored = spawnSync('git', ['check-ignore', '--quiet', '--no-index', '.migration-data/m41-cutover/management-session.json'], { cwd: root })
  if (ignored.status !== 0) throw new Error('Private recovery directory is not ignored by Git; no credential handoff attempted.')
  const marker = path.join(output, 'management-repair-launch.json')
  const previous = fs.existsSync(marker) ? read(marker) : null
  const reuse = previous && ['ACCESS_REPAIR_STARTED_NOT_COMPLETE', 'ENCRYPTED_HANDOFF_READY'].includes(previous.status)
  if (previous?.status === 'ACCESS_REPAIR_JOB_FAILED') throw new Error(`Existing-secret access-repair job failed. Inspect GitHub run ${previous.runID}; no duplicate repair dispatched.`)
  if (reuse && previous.sourceCommit !== head) throw new Error('A previous encrypted request belongs to another source checkpoint; preserve its private key and run evidence.')
  if (reuse && !/^[a-f0-9-]{36}$/i.test(previous.recoveryID || '')) throw new Error('Saved recovery request identity is invalid; no private file accessed.')
  const recoveryID = reuse ? previous.recoveryID : crypto.randomUUID()
  const directory = path.join(output, 'management-recovery', recoveryID)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  let pair
  if (reuse) {
    const privateKey = fs.readFileSync(path.join(directory, 'recipient-private.pem'), 'utf8')
    pair = { privateKey, publicKey: crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) }
  } else {
    pair = crypto.generateKeyPairSync('rsa', { modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
    fs.writeFileSync(path.join(directory, 'recipient-private.pem'), pair.privateKey, { flag: 'wx', mode: 0o600 })
    save(path.join(directory, 'request.json'), { recoveryID, coreProjectRef, createdAt: new Date().toISOString(), sourceCommit: head })
    stage = 'dispatch owner-only access repair'
    gh(['workflow', 'run', 'payload-cms-ci.yml', '--repo', repository, '--ref', branch,
      '-f', 'mode=REPAIR_MANAGEMENT', '-f', `recovery_id=${recoveryID}`,
      '-f', `recipient_public_key=${Buffer.from(pair.publicKey).toString('base64')}`])
    save(marker, { status: 'ACCESS_REPAIR_STARTED_NOT_COMPLETE', recoveryID, directory, sourceCommit: head })
  }
  console.log('M41: existing GitHub deployment credential requested through encrypted handoff; no migration/deployment')
  stage = 'await access-only GitHub job'
  let selected
  let displayedRun = false
  // Run title includes only this random non-secret request ID. Never select a
  // previous workflow run or a differently targeted artifact.
  for (let attempt = 0; attempt < 60; attempt++) {
    const runs = JSON.parse(gh(['run', 'list', '--repo', repository, '--workflow', 'payload-cms-ci.yml', '--event', 'workflow_dispatch', '--branch', branch,
      '--limit', '30', '--json', 'databaseId,displayTitle,headSha,status,conclusion']))
    selected = runs.find(run => run.headSha === head && run.displayTitle.includes(recoveryID))
    if (selected && !displayedRun) {
      console.log(`M41: access-only job https://github.com/${repository}/actions/runs/${selected.databaseId}`)
      displayedRun = true
    }
    if (selected?.status === 'completed') break
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  if (!selected || selected.status !== 'completed') throw new Error('Access-repair job is still pending or awaiting GitHub approval. Request/private key preserved; do not start migration.')
  save(marker, { status: selected.conclusion === 'success' ? 'ENCRYPTED_HANDOFF_READY' : 'ACCESS_REPAIR_JOB_FAILED', recoveryID, directory, runID: selected.databaseId, sourceCommit: head })
  if (selected.conclusion !== 'success') throw new Error(`Existing-secret access-repair job failed. Inspect GitHub run ${selected.databaseId}; no new credential or deployment was made.`)
  stage = 'retrieve encrypted handoff'
  const artifacts = path.join(directory, 'encrypted-artifact')
  gh(['run', 'download', String(selected.databaseId), '--repo', repository, '--name', `m41-management-session-${recoveryID}`, '--dir', artifacts])
  stage = 'decrypt private handoff'
  const envelope = read(path.join(artifacts, 'management-envelope.json'))
  const session = openManagementSession(envelope, pair.privateKey, recoveryID)
  stage = 'verify recovered Core management access'
  const access = await verifyManagementAccess(session.token)
  save(sessionFile, { ...session, source: 'EXISTING_GITHUB_DEPLOY_TOKEN_ENCRYPTED_HANDOFF', runID: selected.databaseId, recoveredAt: new Date().toISOString() })
  save(marker, { status: 'MANAGEMENT_ACCESS_REPAIRED', recoveryID, directory, runID: selected.databaseId, sourceCommit: head, ...access, migrationExecuted: false })
  console.log(JSON.stringify({ status: 'MANAGEMENT_ACCESS_REPAIRED', coreProjectRef, runID: selected.databaseId, ...access, migrationExecuted: false }))
}
try {
  if (process.argv.includes('--seal')) await seal()
  else await repair()
} catch (error) {
  // Never relay native crypto, HTTP or subprocess diagnostics containing tokens.
  const safe = error.message.startsWith('Existing management credential') || error.message.startsWith('Existing repository deployment credential') || error.message.startsWith('Existing-secret access-repair job') || error.message.startsWith('Access-repair job is still pending')
  console.error(JSON.stringify({ status: 'MANAGEMENT_ACCESS_NOT_REPAIRED', stage, message: safe ? error.message : 'Access repair stopped; private request and existing work preserved. No credential values printed and no migration/deployment performed.' }))
  process.exitCode = 1
}
