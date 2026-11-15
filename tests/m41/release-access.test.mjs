import test from 'node:test'
import assert from 'node:assert/strict'
import { existingCloudflareAccount, existingContentfulDeliveryToken } from '../../scripts/m41/release-access.mjs'
const env = { CONTENTFUL_SPACE_ID: 'fixture-space', CONTENTFUL_ENVIRONMENT: 'master', CONTENTFUL_MANAGEMENT_TOKEN: 'fixture-management-value' }
const accountA = 'a'.repeat(32), accountB = 'b'.repeat(32)
const key = (id, accessToken, environment = 'master') => ({ sys: { id }, accessToken, environments: [{ sys: { id: environment } }] })

test('explicit Delivery token is reused without discovery', async () => {
  const value = await existingContentfulDeliveryToken({ ...env, CONTENTFUL_DELIVERY_TOKEN: 'fixture-existing-value' }, () => { throw Error('Unexpected network') })
  assert.equal(value.source, 'EXISTING_ENVIRONMENT')
  assert.equal(value.token, 'fixture-existing-value')
})
test('management discovery reuses an existing key using GET requests only', async () => {
  const calls = [], remembered = []
  const result = await existingContentfulDeliveryToken(env, async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    if (url.includes('api.contentful.com')) {
      assert.equal(options.headers.authorization, 'Bearer fixture-management-value')
      return Response.json({ total: 1, items: [key('original-key', 'fixture-delivery-value')] })
    }
    assert.equal(options.headers.authorization, 'Bearer fixture-delivery-value')
    return Response.json({ total: 0, items: [] })
  }, value => remembered.push(value))
  assert.equal(result.token, 'fixture-delivery-value')
  assert.equal(result.source, 'EXISTING_KEY_READ_ONLY_LOOKUP')
  assert.equal(calls.length, 2)
  assert.ok(remembered.includes(result.token))
})
test('keys scoped to another environment are not probed', async () => {
  const result = await existingContentfulDeliveryToken(env, async (url, options) => {
    if (url.includes('api.contentful.com')) return Response.json({ total: 2, items: [key('wrong', 'fixture-wrong-value', 'staging'), key('right', 'fixture-right-value')] })
    assert.equal(options.headers.authorization, 'Bearer fixture-right-value')
    return Response.json({ total: 0, items: [] })
  })
  assert.equal(result.token, 'fixture-right-value')
})
test('existing key details are read if listing omits the token', async () => {
  const result = await existingContentfulDeliveryToken(env, async url => {
    if (url.includes('/api_keys?')) return Response.json({ total: 1, items: [{ sys: { id: 'original-id' } }] })
    if (url.endsWith('/api_keys/original-id')) return Response.json(key('original-id', 'fixture-detailed-value'))
    return Response.json({ total: 0, items: [] })
  })
  assert.equal(result.token, 'fixture-detailed-value')
})
test('invalid existing keys are skipped without creating replacements', async () => {
  let probes = 0
  const result = await existingContentfulDeliveryToken(env, async (url, options) => {
    assert.equal(options.method, 'GET')
    if (url.includes('api.contentful.com')) return Response.json({ total: 2, items: [key('old', 'fixture-expired-value'), key('live', 'fixture-valid-value')] })
    probes++
    return options.headers.authorization.includes('expired') ? new Response('', { status: 401 }) : Response.json({ total: 0, items: [] })
  })
  assert.equal(probes, 2)
  assert.equal(result.token, 'fixture-valid-value')
})
test('permission refusal fails closed without exposing response bodies', async () => {
  await assert.rejects(existingContentfulDeliveryToken(env, async () => new Response('private-detail', { status: 403 })), error => {
    assert.match(error.message, /HTTP 403/); assert.doesNotMatch(error.message, /private-detail/); return true
  })
})
test('key lookup paginates without accepting incomplete inventory', async () => {
  const result = await existingContentfulDeliveryToken(env, async url => {
    if (url.includes('skip=0')) return Response.json({ total: 2, items: [key('staging', 'fixture-other-value', 'staging')] })
    if (url.includes('skip=1')) return Response.json({ total: 2, items: [key('master', 'fixture-paged-value')] })
    return Response.json({ total: 0, items: [] })
  })
  assert.equal(result.token, 'fixture-paged-value')
  await assert.rejects(existingContentfulDeliveryToken(env, async () => Response.json({ total: 1, items: [] })), /pagination/)
})
test('existing Wrangler account is identified by the verified binding', async () => {
  const result = await existingCloudflareAccount({}, { accounts: [{ id: accountA }] }, async id => id === accountA)
  assert.equal(result.accountId, accountA)
  assert.match(result.source, /WRANGLER_LOGIN/)
})
test('multiple accounts require exactly one verified CMS binding', async () => {
  const identity = { accounts: [{ id: accountA }, { id: accountB }] }
  assert.equal((await existingCloudflareAccount({}, identity, async id => id === accountB)).accountId, accountB)
  await assert.rejects(existingCloudflareAccount({}, identity, async () => true), /exactly one/)
  await assert.rejects(existingCloudflareAccount({}, identity, async () => false), /exactly one/)
})
test('an existing account setting is respected and still verified', async () => {
  const inspected = []
  const result = await existingCloudflareAccount({ CLOUDFLARE_ACCOUNT_ID: accountB }, { accounts: [{ id: accountA }] }, async id => { inspected.push(id); return true })
  assert.deepEqual(inspected, [accountB]); assert.equal(result.accountId, accountB)
})
test('missing or invalid account metadata never causes an account guess', async () => {
  await assert.rejects(existingCloudflareAccount({}, {}, async () => true), /no account was guessed/)
  await assert.rejects(existingCloudflareAccount({ CLOUDFLARE_ACCOUNT_ID: 'invalid' }, {}, async () => true), /no account was guessed/)
})
