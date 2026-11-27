import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { stableJson, signArtifact } from '../src/release/signing'

test('canonical signing preserves the existing wire format', () => {
  const body = '{"a":{"b":2,"z":1},"z":[3,2]}'
  const value = { z: [3,2], a: { z: 1, b: 2 } }
  const secret = 'test-only-signing-fixture'
  assert.equal(stableJson(value), body)
  assert.deepEqual(signArtifact(value, secret), {
    sha256: createHash('sha256').update(body).digest('hex'),
    signature: createHmac('sha256', secret).update(body).digest('hex'),
  })
})
