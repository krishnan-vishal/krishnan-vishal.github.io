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
