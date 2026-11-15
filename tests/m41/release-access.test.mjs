import test from 'node:test'
import assert from 'node:assert/strict'
import { existingCloudflareAccount, existingContentfulDeliveryToken, existingCoreReleaseKey, supabaseProjectBoundaries } from '../../scripts/m41/release-access.mjs'
import { eligiblePreflightCheckpoint } from '../../scripts/m41/resume-preflight.mjs'
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

const cmsEnv = { SUPABASE_URL: 'https://cmsproject.supabase.co', PAYLOAD_DATABASE_URI: 'postgresql://runtime:fixture@db.cmsproject.supabase.co:5432/postgres' }
const publicConfig = "window.GPIR_SUPABASE_PUBLIC_CONFIG = {url:'https://coreproject.supabase.co'}"
test('CMS and GPIR Core projects remain independently pinned without changing private CMS configuration', () => {
  const supplied = { ...cmsEnv }
  const value = supabaseProjectBoundaries(supplied, publicConfig)
  assert.equal(value.cmsProjectRef, 'cmsproject')
  assert.equal(value.coreProjectRef, 'coreproject')
  assert.deepEqual(supplied, cmsEnv)
})
test('CMS URL and database mismatch fail before deployment', () => {
  assert.throws(() => supabaseProjectBoundaries({ ...cmsEnv, PAYLOAD_DATABASE_URI: 'postgresql://runtime:fixture@db.otherproject.supabase.co/postgres' }, publicConfig), /Database host does not match/)
})
test('Core cannot be redirected by the private CMS environment', () => {
  assert.throws(() => supabaseProjectBoundaries({ ...cmsEnv, GPIR_CORE_SUPABASE_URL: 'https://cmsproject.supabase.co' }, publicConfig), /no Core target was redirected/)
  assert.throws(() => supabaseProjectBoundaries(cmsEnv, ''), /exactly one Core/)
})
test('existing release credentials are authenticated against Core using a read-only request', async () => {
  const original = { GPIR_SUPABASE_SECRET_KEY: 'sb_secret_fixture_core' }
  const result = await existingCoreReleaseKey(original, 'https://coreproject.supabase.co', async (url, options) => {
    assert.equal(url, 'https://coreproject.supabase.co/rest/v1/source_registry?select=source_id&limit=1')
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.get('apikey'), original.GPIR_SUPABASE_SECRET_KEY)
    assert.equal(options.headers.has('authorization'), false)
    return Response.json([{ source_id: 'fixture' }])
  })
  assert.equal(result.source, 'GPIR_SUPABASE_SECRET_KEY')
  assert.equal(original.GPIR_CORE_SUPABASE_SECRET_KEY, undefined)
})
test('invalid or wrong-project credentials do not become Core credentials', async () => {
  await assert.rejects(existingCoreReleaseKey({ GPIR_SUPABASE_SECRET_KEY: 'sb_secret_fixture_cms' }, 'https://coreproject.supabase.co', async () => new Response('', { status: 401 })), /No existing private release key/)
  const key = 'header.' + Buffer.from(JSON.stringify({ role: 'service_role', ref: 'cmsproject' })).toString('base64url') + '.fixture'
  await assert.rejects(existingCoreReleaseKey({ GPIR_SUPABASE_SECRET_KEY: key }, 'https://coreproject.supabase.co', () => { throw Error('Must not probe a known wrong-project key') }), /No existing private release key/)
})
test('resume accepts any clean PR ancestor stopped before production, not one hard-coded commit', () => {
  const good = { directory: '/workspaces/m41-full-cutover-fixture', clean: true, ancestor: true, report: { failedStage: 'preflight', stages: [] }, outputExists: true }
  assert.equal(eligiblePreflightCheckpoint(good), true)
  assert.equal(eligiblePreflightCheckpoint({ ...good, report: null, outputExists: false }), true)
  assert.equal(eligiblePreflightCheckpoint({ ...good, clean: false }), false)
  assert.equal(eligiblePreflightCheckpoint({ ...good, ancestor: false }), false)
  assert.equal(eligiblePreflightCheckpoint({ ...good, report: { stages: ['deploy'], failedStage: 'deployment' } }), false)
  assert.equal(eligiblePreflightCheckpoint({ ...good, report: null }), false)
})

test('CMS runtime settings keep separate Core credentials private and exclude raw database configuration', async () => {
  const { productionSettings, runtimeKeys } = await import('../../apps/gpir-cms/scripts/release-config.mjs')
  const supplied = { ...Object.fromEntries(runtimeKeys.map(name => [name, 'fixture-private'])), ...cmsEnv,
    GPIR_CORE_SUPABASE_URL: 'https://coreproject.supabase.co', GPIR_CORE_SUPABASE_SECRET_KEY: 'sb_secret_fixture_core' }
  const settings = productionSettings(supplied, 'https://gpir-payload-cms.fixture.workers.dev')
  assert.equal(settings.SUPABASE_URL, cmsEnv.SUPABASE_URL)
  assert.equal(settings.GPIR_CORE_SUPABASE_URL, 'https://coreproject.supabase.co')
  assert.equal(settings.GPIR_CORE_SUPABASE_SECRET_KEY, 'sb_secret_fixture_core')
  assert.equal('PAYLOAD_DATABASE_URI' in settings, false)
  assert.equal('PAYLOAD_DATABASE_CA_CERT' in settings, false)
})

test('wrong CMS key can reuse an existing Core CLI key without key creation', async () => {
  const remembered = []
  let inventoryReads = 0
  const key = 'header.' + Buffer.from(JSON.stringify({ role: 'service_role', ref: 'coreproject' })).toString('base64url') + '.fixture'
  const result = await existingCoreReleaseKey({ GPIR_SUPABASE_SECRET_KEY: 'invalid-cms-fixture' }, 'https://coreproject.supabase.co', async (url, options) => {
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.get('apikey'), key)
    return Response.json([])
  }, value => remembered.push(value), async ref => {
    inventoryReads++; assert.equal(ref, 'coreproject')
    return [{ name: 'anon', 'api_key': 'fixture-public' }, { name: 'service_role', 'api_key': key }]
  })
  assert.equal(inventoryReads, 1)
  assert.equal(result.source, 'EXISTING_CORE_KEY_READ_ONLY_CLI_LOOKUP')
  assert.ok(remembered.includes(key))
})
test('explicit Core key failure never triggers a different credential lookup', async () => {
  await assert.rejects(existingCoreReleaseKey({ GPIR_CORE_SUPABASE_SECRET_KEY: 'invalid-fixture' }, 'https://coreproject.supabase.co', async () => { throw Error('Unexpected request') }, () => {}, async () => { throw Error('Unexpected key lookup') }), /No existing private release key/)
})


test('missing cutover environment is a provisioning plan rather than a failed existence probe', async () => {
  const { githubEnvironmentPlan } = await import('../../scripts/m41/release-access.mjs')
  const existing = [{ name: 'contentful-production', protection_rules: ['fixture'] }, { name: 'payload-preview' }]
  const before = JSON.stringify(existing)
  assert.deepEqual(githubEnvironmentPlan(existing, { admin: true }).create, ['payload-production-cutover'])
  assert.equal(JSON.stringify(existing), before)
  assert.deepEqual(githubEnvironmentPlan([...existing, { name: 'payload-production-cutover' }], {}).create, [])
})
test('missing cutover environment requires admin and never recreates a missing existing environment', async () => {
  const { githubEnvironmentPlan } = await import('../../scripts/m41/release-access.mjs')
  assert.throws(() => githubEnvironmentPlan([{ name: 'contentful-production' }, { name: 'payload-preview' }], { admin: false }), /administration access/)
  assert.throws(() => githubEnvironmentPlan([{ name: 'payload-preview' }], { admin: true }), /contentful-production is missing/)
  assert.throws(() => githubEnvironmentPlan(null, { admin: true }), /inventory is unavailable/)
})


test('private Supabase failures classify auth, permission, compatibility and network without leaking output', async () => {
  const { privateSupabaseFailure } = await import('../../scripts/m41/release-access.mjs')
  const fixture = 'fixture-sensitive-never-return'
  for (const [stderr, code] of [
    ['Access token not provided. Run supabase login.', 'CLI_AUTHENTICATION'],
    ['HTTP 401 Unauthorized', 'CLI_AUTHENTICATION'],
    ['HTTP 403 Forbidden', 'CLI_PERMISSION'],
    ['unknown flag: --reveal', 'CLI_COMPATIBILITY'],
    ['TLS certificate verification failed', 'CLI_CONNECTION'],
    ['unclassified failure', 'CLI_KEY_LOOKUP_FAILED']
  ]) {
    const result = privateSupabaseFailure({ stderr: stderr + fixture, stdout: fixture })
    assert.equal(result.code, code)
    assert.equal(JSON.stringify(result).includes(fixture), false)
  }
})


test('setup-only environment failure resumes while any later production evidence blocks retry', () => {
  const stage = 'provision the missing GitHub cutover environment without modifying existing protections'
  const good = { directory: '/workspaces/m41-full-cutover-fixture', clean: true, ancestor: true, outputExists: true,
    report: { status: 'BLOCKED_NOT_COMPLETE', failedStage: stage, stages: [stage], contentfulWrites: 0 } }
  assert.equal(eligiblePreflightCheckpoint(good), true)
  assert.equal(eligiblePreflightCheckpoint({ ...good, report: { ...good.report, githubEnvironmentCreated: ['payload-production-cutover'] } }), true)
  for (const key of ['cms', 'coverage', 'researchEdition', 'releaseCommit', 'mergeCommit', 'website', 'live', 'draftWorkflowPaused', 'draftWorkflowWasActive']) {
    assert.equal(eligiblePreflightCheckpoint({ ...good, report: { ...good.report, [key]: false } }), false)
  }
  assert.equal(eligiblePreflightCheckpoint({ ...good, clean: false }), false)
  assert.equal(eligiblePreflightCheckpoint({ ...good, report: { ...good.report, contentfulWrites: 1 } }), false)
  assert.equal(eligiblePreflightCheckpoint({ ...good, report: { ...good.report, stages: [stage, 'deploy'] } }), false)
})
