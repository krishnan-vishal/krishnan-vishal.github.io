import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { coreProjectRef, verifyManagementAccess, sealManagementSession, openManagementSession } from '../../scripts/m41/management-session.mjs'

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
const token = 'fixture-existing-management-credential'
const id = crypto.randomUUID()

test('existing management credential travels encrypted and is bound to the recipient/request/Core project', () => {
  const now = Date.now()
  const envelope = sealManagementSession(token, pair.publicKey, id, now)
  assert.equal(JSON.stringify(envelope).includes(token), false)
  assert.equal(openManagementSession(envelope, pair.privateKey, id, now).token, token)
  assert.throws(() => openManagementSession(envelope, pair.privateKey, crypto.randomUUID(), now))
  assert.throws(() => openManagementSession({ ...envelope, coreProjectRef: 'different' }, pair.privateKey, id, now))
  assert.throws(() => openManagementSession(envelope, pair.privateKey, id, now + 61 * 60 * 1000), /stale/)
})

test('tampering with an encrypted handoff is rejected without altering any credential', () => {
  const envelope = sealManagementSession(token, pair.publicKey, id)
  const damaged = Buffer.from(envelope.ciphertext, 'base64'); damaged[0] ^= 1
  assert.throws(() => openManagementSession({ ...envelope, ciphertext: damaged.toString('base64') }, pair.privateKey, id))
  const weak = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  assert.throws(() => sealManagementSession(token, weak.publicKey, id), /3072/)
})

test('management proof uses only read-only Core requests and never returns response bodies or keys', async () => {
  const calls = []
  const result = await verifyManagementAccess(token, async (url, options) => {
    calls.push(url)
    assert.ok(url.startsWith(`https://api.supabase.com/v1/projects/${coreProjectRef}/`))
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    assert.equal(options.headers.authorization, `Bearer ${token}`)
    return new Response('fixture-secret-response-withheld', { status: 200 })
  })
  assert.deepEqual(result, { functionsHTTP: 200, keyInventoryHTTP: 200 })
  assert.equal(calls.length, 2)
  for (const status of [401, 403, 429]) {
    await assert.rejects(verifyManagementAccess(token, async () => new Response('fixture-secret-response-withheld', { status })), error => {
      assert.ok(error.message.includes('HTTP ' + status))
      assert.equal(error.message.includes(token), false)
      assert.equal(error.message.includes('fixture-secret-response'), false)
      return true
    })
  }
})

test('workflow isolates credential repair to owner dispatch and skips CMS builds in repair mode', () => {
  const source = fs.readFileSync(new URL('../../.github/workflows/payload-cms-ci.yml', import.meta.url), 'utf8')
  assert.ok(source.includes("|| 'M41 Payload CMS validation'"))
  assert.match(source, /github.actor == 'krishnan-vishal'/)
  assert.match(source, /github.ref == 'refs\/heads\/fix\/m41-cloudflare-sharp-admin-runtime-20261115'/)
  assert.equal((source.match(/if: github.event_name != 'workflow_dispatch' \|\| inputs.mode == 'VALIDATE'/g) || []).length, 2)
  assert.match(source, /GPIR_SUPABASE_DEPLOY_TOKEN: \$\{\{ secrets.GPIR_SUPABASE_DEPLOY_TOKEN \}\}/)
  assert.match(source, /management-envelope.json/)
  assert.doesNotMatch(source, /path:.*(?:management-session\.json|private\.pem)/)
})
