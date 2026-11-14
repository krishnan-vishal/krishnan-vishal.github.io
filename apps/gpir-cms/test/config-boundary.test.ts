import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

test('Postgres stays in the isolated schema and automatic pushes stay disabled', async () => {
  const source = await readFile(path.resolve('src/payload.config.ts'), 'utf8')
  assert.match(source, /schemaName:\s*['"]payload['"]/)
  assert.match(source, /push:\s*false/)
  assert.doesNotMatch(source, /prodMigrations/)
})

test('Supabase migration grants Payload no application-schema authority', async () => {
  const migration = await readFile(path.resolve('../../supabase/migrations/20261114020220_gpir_payload_schema_isolation.sql'), 'utf8')
  assert.match(migration, /create schema if not exists payload authorization gpir_payload_migrator/i)
  assert.match(migration, /revoke all on schema public from gpir_payload_migrator, gpir_payload_runtime/i)
  assert.match(migration, /revoke all on all tables in schema public from gpir_payload_migrator, gpir_payload_runtime/i)
  assert.doesNotMatch(migration, /grant\s+.*service_role\s+to\s+gpir_payload/i)
})
