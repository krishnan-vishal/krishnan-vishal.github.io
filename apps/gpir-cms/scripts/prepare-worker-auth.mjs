import fs from 'node:fs'
import pg from 'pg'
import Enquirer from 'enquirer'
import { getPayload } from 'payload'
import { databasePoolOptions } from '../src/lib/database.ts'

let payload
let client
let credentials
let exitCode = 0
let stage = 'preflight'
try {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this helper interactively in your private Codespace terminal.')
  if (!process.argv[2]) throw new Error('Pass the existing Supabase CA certificate path.')
  process.env.PAYLOAD_DATABASE_CA_CERT = fs.readFileSync(process.argv[2], 'utf8')
  const config = (await import('../src/payload.config.ts')).default
  const resolved = await config
  if (resolved.auth.passwordHashIterations !== 100000) throw new Error('The source must configure the documented Worker password hash setting.')
  console.log('M41: enter your EXISTING Payload editorial login privately below.')
  console.log('The password prompt is masked. Nothing is reset; roles and access rules remain intact.')
  stage = 'private existing-account authentication'
  credentials = await Enquirer.prompt([
    { type: 'input', name: 'email', message: 'Existing Payload email', required: true },
    { type: 'password', name: 'password', message: 'Existing Payload password', required: true },
  ])
  payload = await getPayload({ config })
  const result = await payload.login({
    collection: 'users', data: { email: credentials.email, password: credentials.password },
    overrideAccess: false, depth: 0,
  })
  credentials.password = ''
  if (!['admin', 'editor', 'reviewer'].includes(result.user.role)) throw new Error('The authenticated account does not have an editorial role.')
  stage = 'verify compatible hash after normal Payload login'
  client = new pg.Client(databasePoolOptions({ worker: false, environment: process.env }))
  await client.connect()
  const check = await client.query(
    "SELECT hash LIKE 'pbkdf2-sha256-100k-v1:%' AS compatible FROM payload.users WHERE id = $1",
    [result.user.id],
  )
  if (check.rows[0]?.compatible !== true) throw new Error('Login succeeded but the supported hash was not saved. Deployment was not attempted.')
  if (client.connection.stream.authorized !== true) throw new Error('Certificate validation was not confirmed. Deployment was not attempted.')
  console.log(JSON.stringify({
    status: 'AUTH_CONVERSION_VERIFIED', existingPasswordAccepted: true, passwordUnchanged: true,
    workerPasswordHashIterations: 100000, certificateValidated: true, rolePreserved: true,
    next: 'Run the guarded production release, then verify login at the live CMS origin.',
  }))
} catch (error) {
  exitCode = 1
  console.error(JSON.stringify({ status: 'FAILED', stage, code: error?.name || 'AUTH_COMPATIBILITY_ERROR',
    message: 'Existing-account compatibility preparation did not complete. No password, hash, salt or token was printed; no deployment attempted.' }))
} finally {
  if (credentials) credentials.password = ''
  if (client) await client.end().catch(() => {})
  if (payload) await payload.destroy().catch(() => {})
}
// Payload's adapter keeps a Node pool open. All awaited auth writes and the
// independent verification above have completed; terminate this one-shot CLI.
process.exit(exitCode)
