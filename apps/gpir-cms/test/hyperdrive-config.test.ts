import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node setup helper is also exercised directly by the CLI.
import { directSupabaseOrigin, parseCliJson, validateHyperdrive } from '../scripts/hyperdrive-config.mjs'

test('Hyperdrive uses the same project, database and runtime login at the direct endpoint', () => {
  const uri = directSupabaseOrigin({
    SUPABASE_URL: 'https://projectref.supabase.co',
    PAYLOAD_DATABASE_URI: 'postgresql://cms_runtime.projectref:p%40ss@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require',
  })
  assert.equal(uri.hostname, 'db.projectref.supabase.co')
  assert.equal(uri.username, 'cms_runtime')
  assert.equal(decodeURIComponent(uri.password), 'p@ss')
  assert.equal(uri.search, '')
})

test('Provisioning rejects mismatched projects without including credentials in the error', () => {
  assert.throws(() => directSupabaseOrigin({
    SUPABASE_URL: 'https://projectref.supabase.co',
    PAYLOAD_DATABASE_URI: 'postgresql://cms_runtime.other:secret@aws-0-region.pooler.supabase.com/postgres',
  }), /^Error: Pooler login does not match/)
})

test('Existing Hyperdrive must enforce hostname validation, the selected CA and fresh reads', () => {
  const origin = new URL('postgresql://cms_runtime:secret@db.projectref.supabase.co:5432/postgres')
  const config = {
    origin: { host: origin.hostname, port: 5432, user: 'cms_runtime', database: 'postgres' },
    mtls: { sslmode: 'verify-full', ca_certificate_id: 'trusted-ca' },
    caching: { disabled: true },
  }
  assert.doesNotThrow(() => validateHyperdrive(config, origin, 'trusted-ca'))
  assert.throws(() => validateHyperdrive({ ...config, mtls: { ...config.mtls, sslmode: 'require' } }, origin, 'trusted-ca'))
  assert.throws(() => validateHyperdrive({ ...config, caching: { disabled: false } }, origin, 'trusted-ca'))
  assert.throws(() => validateHyperdrive(config, origin, 'different-ca'))
})

test('Wrangler JSON metadata can be read without printing database details', () => {
  assert.deepEqual(parseCliJson('Wrangler banner\n{"id":"resource-id"}\n'), { id: 'resource-id' })
})
