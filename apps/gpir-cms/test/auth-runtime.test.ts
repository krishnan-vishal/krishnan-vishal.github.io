import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { authenticateLocalStrategy } from '../node_modules/payload/dist/auth/strategies/local/authenticate.js'
import { generatePasswordSaltHash } from '../node_modules/payload/dist/auth/strategies/local/generatePasswordSaltHash.js'

const password = 'synthetic-auth-test-password-not-a-real-credential'
const generate = async (iterations: 100000 | 600000) => ({ id: 'synthetic-account', ...await generatePasswordSaltHash({
  collection: { slug: 'users' }, isPasswordAuthenticated: true, password,
  req: { payload: { config: { auth: { passwordHashIterations: iterations } } } },
} as unknown as Parameters<typeof generatePasswordSaltHash>[0]) })

test('Payload config explicitly selects its documented production Worker hash setting', async () => {
  assert.match(await readFile('src/payload.config.ts', 'utf8'), /auth:\s*\{\s*passwordHashIterations:\s*100000\s*\}/)
})

test('same password verifies in Node before compatible rehash, and wrong password remains rejected', async () => {
  const old = await generate(600000)
  const oldResult = await authenticateLocalStrategy({ doc: old, password, passwordHashIterations: 100000 })
  assert.ok(oldResult)
  assert.equal(oldResult.shouldUpdatePasswordHash, true)
  const compatible = await generate(100000)
  assert.match(compatible.hash, /^pbkdf2-sha256-100k-v1:/)
  assert.notEqual(compatible.salt, old.salt)
  const result = await authenticateLocalStrategy({ doc: compatible, password, passwordHashIterations: 100000 })
  assert.ok(result)
  assert.equal(result.shouldUpdatePasswordHash, false)
  assert.equal(await authenticateLocalStrategy({ doc: compatible, password: 'wrong-synthetic-value', passwordHashIterations: 100000 }), null)
})

test('production PBKDF2 limit reproduces existing-hash rejection while the supported scheme authenticates', async t => {
  const old = await generate(600000)
  const compatible = await generate(100000)
  const original = crypto.pbkdf2
  t.mock.method(crypto, 'pbkdf2', (...args: Parameters<typeof crypto.pbkdf2>) => {
    if (args[2] > 100000) {
      const error = new Error('PBKDF2 iteration counts above 100000 are not supported')
      error.name = 'NotSupportedError'
      queueMicrotask(() => args[5](error, Buffer.alloc(0)))
      return
    }
    return original(...args)
  })
  await assert.rejects(authenticateLocalStrategy({ doc: old, password, passwordHashIterations: 100000 }), /stored password hash/)
  const result = await authenticateLocalStrategy({ doc: compatible, password, passwordHashIterations: 100000 })
  assert.ok(result)
  assert.equal(result.shouldUpdatePasswordHash, false)
})
