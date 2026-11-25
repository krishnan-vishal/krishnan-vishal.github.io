import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const site = require('../../../scripts/m41/site-content.cjs')
const bcp = require('../../../scripts/m41/contentful-bcp.cjs')
const delivery = require('../../../scripts/m41/payload-site.cjs')
const commit = 'a'.repeat(40)
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gpir-m41-'))
  for (const file of ['index.html', '404.html', 'reader/sign-in/index.html', 'pages/intelligence/index.html', 'assets/js/script.js']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), file.endsWith('.js') ? 'engine' : `<main>${file}</main>`)
  }
  mkdirSync(path.join(root, 'assets/data'), { recursive: true })
  return root
}
test('inventory migrates website/media/editorial dependencies and protects engines', () => {
  for (const file of ['index.html', 'assets/logo.svg', 'assets/data/fx/editorial-public.json']) assert.equal(site.managed(file), true)
  for (const file of ['assets/js/announcements.js', 'assets/css/header.css', 'assets/data/announcements.json', 'assets/data/fx/current.json']) assert.equal(site.managed(file), false)
})
test('manifest rejects corruption, duplicate paths and traversal', () => {
  const root = fixture()
  try {
    const manifest = site.inventory(root, commit)
    assert.equal(site.validateManifest(manifest), manifest)
    assert.throws(() => site.validateManifest({ ...manifest, snapshot: 'b'.repeat(64) }), /hash/)
    for (const file of ['../private', '/etc/passwd', 'x/../private', 'x\\private', 'x//private']) assert.throws(() => site.safePath(file), /Unsafe/)
    const { snapshot, ...body } = { ...manifest, files: [...manifest.files, manifest.files[0]] }
    assert.throws(() => site.validateManifest({ ...body, snapshot: site.sha256(site.canonical(body)) }), /Duplicate/)
    assert.throws(() => site.verifyBytes(manifest.files[0], Buffer.from('changed')), /mismatch/)
  } finally { rmSync(root, { recursive: true }) }
})
test('Contentful recovery preserves WARN drafts, IDs, locales and binary bytes; rejects corruption', () => {
  const records = [{ sys: { id: 'retained-id' }, fields: { validationStatus: { 'en-US': 'WARN' }, publicationStatus: { 'en-US': 'DRAFT' } } }, { body: Buffer.from([0,255,11,8]).toString('base64') }]
  const packed = bcp.pack(records)
  const index = { digest: packed.digest, chunks: packed.chunks.map((chunk: any) => chunk.id) }
  const chunks = new Map(packed.chunks.map((chunk: any) => [chunk.id, chunk.body]))
  assert.deepEqual(bcp.unpack(index, chunks), records)
  assert.throws(() => bcp.unpack(index, new Map()), /missing/)
  assert.throws(() => bcp.unpack({ ...index, digest: '0'.repeat(64) }, chunks), /digest/)
})
test('Payload build reads all content and preserves the engine', async () => {
  const root = fixture()
  try {
    const manifest = site.inventory(root, commit)
    const env = { PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.example', PAYLOAD_RELEASE_API_KEY: 'test-key', GPIR_RELEASE_SIGNING_SECRET: 'test-signing-material-for-manifest-check', GPIR_PAYLOAD_SITE_SNAPSHOT: manifest.snapshot }
    const fetchImpl = async (url: string, options: any) => {
      assert.equal(options.redirect, 'error')
      if (url.includes('/release/managed-site')) return Response.json({ manifest, integrity: {
        signature: createHmac('sha256', env.GPIR_RELEASE_SIGNING_SECRET).update(site.canonical(manifest)).digest('hex'), sha256: site.sha256(site.canonical(manifest)) } })
      const key = new URL(url).searchParams.get('where[sourceRecordKey][equals]')!
      const file = manifest.files.find((item: any) => key.endsWith(item.sha256))
      const sourcePayload = { kind: 'site-bytes', encoding: 'base64', body: readFileSync(path.join(root, file.path)).toString('base64') }
      return Response.json({ totalDocs: 1, docs: [{ sourcePayload, sourceHash: site.sha256(site.canonical(sourcePayload)) }] })
    }
    const result = await delivery.materialize(root, env, fetchImpl)
    assert.equal(result.managedFiles, manifest.files.length)
    assert.equal(readFileSync(path.join(root, 'assets/js/script.js'), 'utf8'), 'engine')
    assert.equal(JSON.parse(readFileSync(path.join(root, 'assets/data/cms-source.json'), 'utf8')).source, 'payload')
  } finally { rmSync(root, { recursive: true }) }
})
test('Payload source fails closed on missing source, invalid signature and insecure configuration', async () => {
  const env = { PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.example', PAYLOAD_RELEASE_API_KEY: 'test-key', GPIR_RELEASE_SIGNING_SECRET: 'test-signing-material-for-manifest-check', GPIR_PAYLOAD_SITE_SNAPSHOT: '0'.repeat(64) }
  assert.throws(() => delivery.configuration({ ...env, PAYLOAD_PUBLIC_SERVER_URL: 'http://cms.example' }), /HTTPS/)
  await assert.rejects(delivery.client(env, async () => new Response('', { status: 503 })), /503/)
  await assert.rejects(delivery.client(env, async () => Response.json({ manifest: {}, integrity: {} })), /signature/)
})

test('BCP sync is idempotent and verifies recovery by reading Contentful', async () => {
  const entries = new Map<string, any>()
  let writes = 0
  const env = { GPIR_CONTENTFUL_BCP_WRITES_AUTHORIZED: 'true', CONTENTFUL_SPACE_ID: 'test-space', CONTENTFUL_ENVIRONMENT: 'test', CONTENTFUL_MANAGEMENT_TOKEN: 'test-management' }
  const fake = async (url: string, options: any) => {
    const route = new URL(url).pathname.split('/environments/test')[1]
    if (route === '/locales') return Response.json({ items: [{ default: true, code: 'en-US' }] })
    if (route.startsWith('/content_types/')) return Response.json({ sys: { version: 2, publishedVersion: 1 }, fields: [{ id: 'digest', type: 'Symbol' }, { id: 'body', type: 'Text' }] })
    if (route === '/entries') {
      const ids = new URL(url).searchParams.get('sys.id[in]')!.split(',')
      const items = ids.filter(id => entries.has('/entries/' + id)).map(id => {
        const entry = entries.get('/entries/' + id)
        return { ...entry, sys: { ...entry.sys, id } }
      })
      return Response.json({ items, total: items.length })
    }
    if (options.method === 'GET') return entries.has(route) ? Response.json(entries.get(route)) : new Response('', { status: 404 })
    assert.equal(options.method, 'PUT')
    assert.match(route, /^\/entries\/[a-f0-9]{64}$/)
    writes++
    const value = { ...JSON.parse(options.body), sys: { contentType: { sys: { id: 'gpirPayloadRecoveryV1' } } } }
    entries.set(route, value)
    return Response.json(value)
  }
  const records = [{ validationStatus: 'WARN', published: false }]
  const snapshot = site.sha256(site.canonical(records))
  assert.deepEqual(await bcp.sync(records, snapshot, env, fake), records)
  const initial = writes
  assert.ok(initial >= 3, 'chunk, index and root must be written')
  assert.equal(entries.size, initial, 'recovery IDs must be distinct')
  assert.deepEqual(await bcp.sync(records, snapshot, env, fake), records)
  assert.equal(writes, initial)
})

test('Contentful BCP writes are denied by default before any network request', async () => {
  let calls = 0
  await assert.rejects(bcp.sync([], '0'.repeat(64), {}, async () => { calls++; return Response.json({}) }), /read-only/)
  assert.equal(calls, 0)
})

test('BCP ambiguous PUT recovery is bounded and never overwrites conflicting objects', async () => {
  const env = { CONTENTFUL_SPACE_ID: 'test', CONTENTFUL_ENVIRONMENT: 'test', CONTENTFUL_MANAGEMENT_TOKEN: 'test' }
  for (const mode of ['committed', 'transient', 'persistent', 'conflict', 'invalid', 'network']) {
    let writes = 0, reads = 0
    const delays: number[] = []
    let entry: any = null
    const fake = async (_url: string, options: any) => {
      if (options.method === 'GET') {
        reads++
        return entry ? Response.json(entry) : new Response('', { status: 404 })
      }
      writes++
      const value = { ...JSON.parse(options.body), sys: { contentType: { sys: { id: 'gpirPayloadRecoveryV1' } } } }
      if (mode === 'invalid') return new Response('', { status: 400 })
      if (mode === 'conflict') entry = { ...value, fields: {} }
      if (mode === 'committed') entry = value
      if (mode === 'network' && writes === 1) { entry = value; throw new TypeError('network failure') }
      if (mode === 'transient' && writes === 2) { entry = value; return Response.json(value) }
      return new Response('', { status: 500 })
    }
    const remote = bcp.management(env, fake, async (ms: number) => { delays.push(ms) })
    const operation = remote.store('a'.repeat(64), 'immutable bytes', 'en-US')
    if (mode === 'persistent') await assert.rejects(operation, /HTTP 500/)
    else if (mode === 'conflict') await assert.rejects(operation, /conflicts/)
    else if (mode === 'invalid') await assert.rejects(operation, /HTTP 400/)
    else await operation
    assert.equal(writes, mode === 'persistent' ? 3 : mode === 'transient' ? 2 : 1, mode)
    assert.equal(reads, mode === 'persistent' ? 4 : mode === 'invalid' ? 1 : 2, mode)
    assert.deepEqual(delays, mode === 'persistent' ? [1000, 2000] : mode === 'transient' ? [1000] : [], mode)
  }
})

test('bounded BCP batches preserve order and stop after a failed batch', async () => {
  let active = 0, peak = 0
  const result = await bcp.boundedMap([1,2,3,4,5,6,7], 3, async (value: number) => {
    active++; peak = Math.max(peak, active)
    await Promise.resolve()
    active--; return value * 2
  })
  assert.deepEqual(result, [2,4,6,8,10,12,14])
  assert.equal(peak, 3)
  const started: number[] = []
  await assert.rejects(bcp.boundedMap([1,2,3,4,5], 2, async (value: number) => {
    started.push(value)
    if (value === 2) throw new Error('stop')
  }), /stop/)
  assert.deepEqual(started, [1,2])
})


test('incremental BCP retains verified migration baseline and recovers only new or revised records', async () => {
  const entries = new Map<string, any>()
  let writes = 0
  const env = { GPIR_CONTENTFUL_BCP_WRITES_AUTHORIZED: 'true', CONTENTFUL_SPACE_ID: 'test-space',
    CONTENTFUL_ENVIRONMENT: 'test', CONTENTFUL_MANAGEMENT_TOKEN: 'test-management' }
  const fake = async (url: string, options: any) => {
    const route = new URL(url).pathname.split('/environments/test')[1]
    if (route === '/locales') return Response.json({ items: [{ default: true, code: 'en-US' }] })
    if (route.startsWith('/content_types/')) return Response.json({ sys: { version: 2, publishedVersion: 1 },
      fields: [{ id: 'digest', type: 'Symbol' }, { id: 'body', type: 'Text' }] })
    if (route === '/entries') {
      const ids = new URL(url).searchParams.get('sys.id[in]')!.split(',')
      const items = ids.filter(id => entries.has('/entries/' + id)).map(id => ({
        ...entries.get('/entries/' + id),
        sys: { ...entries.get('/entries/' + id).sys, id },
      }))
      return Response.json({ items, total: items.length })
    }
    if (options.method === 'GET') return entries.has(route) ?
      Response.json(entries.get(route)) : new Response('', { status: 404 })
    assert.equal(options.method, 'PUT')
    assert.ok(!entries.has(route), 'immutable objects must never be overwritten')
    const value = { ...JSON.parse(options.body), sys: { contentType: { sys: { id: 'gpirPayloadRecoveryV1' } } } }
    entries.set(route, value)
    writes++
    return Response.json(value)
  }
  const original = [
    { sourceRecordKey: 'm41:one', sourceHash: 'a', sourcePayload: { content: 'original' } },
    { sourceRecordKey: 'm41:two', sourceHash: 'b', sourcePayload: { content: 'original 2' } },
  ]
  const base = { snapshot: site.sha256(site.canonical(original)), records: original.length,
    verifiedAt: '2026-11-25T08:12:53.739Z' }
  assert.deepEqual(await bcp.sync(original, base.snapshot, env, fake), original)
  const originalEntries = new Map(entries)
  const baselineResult = await bcp.incrementalSync(original, base.snapshot, env, base, fake)
  assert.deepEqual([baselineResult.changed, baselineResult.unchanged], [0, 2])
  const checkpointWrites = writes
  assert.ok(checkpointWrites > originalEntries.size, 'bootstrap baseline index once')
  const revised = [
    original[0],
    { sourceRecordKey: 'm41:two', sourceHash: 'c', sourcePayload: { content: 'revision' } },
    { sourceRecordKey: 'm41:three', sourceHash: 'd', sourcePayload: { content: 'new publication' } },
  ]
  const revisedSnapshot = site.sha256(site.canonical(revised))
  const delta = await bcp.incrementalSync(revised, revisedSnapshot, env, base, fake)
  assert.deepEqual([delta.changed, delta.unchanged], [2, 1])
  assert.deepEqual(await bcp.recoverIncremental(revisedSnapshot, env, fake), revised)
  assert.deepEqual(await bcp.recover(base.snapshot, env, fake), original)
  const deltaWrites = writes
  assert.equal((await bcp.incrementalSync(revised, revisedSnapshot, env, base, fake)).reused, true)
  assert.equal(writes, deltaWrites, 'unchanged schedule creates no recovery objects')
  for (const [key, value] of originalEntries) assert.deepEqual(entries.get(key), value)
  const reduced = [original[0]]
  const reducedHash = site.sha256(site.canonical(reduced))
  await bcp.incrementalSync(reduced, reducedHash, env, base, fake)
  assert.deepEqual(await bcp.recoverIncremental(reducedHash, env, fake), reduced)
  const ambiguous = [{ sourceRecordKey: 'duplicate' }, { sourceRecordKey: 'duplicate' }]
  await assert.rejects(bcp.incrementalSync(ambiguous, site.sha256(site.canonical(ambiguous)), env, base, fake),
    /unique bounded source record keys/)
})
