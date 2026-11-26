import assert from 'node:assert/strict'
import test from 'node:test'
import type { PayloadRequest } from 'payload'
import { driveIntakeEndpoint } from '../src/release/drive-intake'
import { signArtifact } from '../src/release/release'

test('Drive intake rejects anonymous requests and altered reviewed bytes before touching Payload', async () => {
  const request = (options: Partial<PayloadRequest> = {}) => ({
    headers: new Headers(), ...options,
  } as PayloadRequest)
  assert.equal((await driveIntakeEndpoint.handler(request())).status, 403)
  const previous = process.env.GPIR_RELEASE_SIGNING_SECRET
  const secret = 'fixture-only-release-secret-for-test'
  process.env.GPIR_RELEASE_SIGNING_SECRET = secret
  try {
    const review = { hash: 'a'.repeat(64), title: 'Title', summary: 'Summary', body: 'Body',
      chapterSlug: 'trade-payments', routeSlug: 'example', category: 'B2B' }
    const body = new FormData()
    body.set('review', JSON.stringify(review))
    body.set('file', new Blob([Buffer.from('ffd8ff', 'hex')], { type: 'image/jpeg' }))
    const signature = signArtifact({ purpose: 'gpir-drive-draft-intake-v1', review }, secret).signature
    const result = await driveIntakeEndpoint.handler(request({
      user: { role: 'release-service' } as PayloadRequest['user'],
      headers: new Headers({ 'content-length': '500', 'x-gpir-intake-signature': signature }),
      formData: async () => body,
    }))
    assert.equal(result.status, 409)
    assert.deepEqual(await result.json(), { error: 'INTAKE_HASH_MISMATCH' })
  } finally {
    if (previous === undefined) delete process.env.GPIR_RELEASE_SIGNING_SECRET
    else process.env.GPIR_RELEASE_SIGNING_SECRET = previous
  }
})
