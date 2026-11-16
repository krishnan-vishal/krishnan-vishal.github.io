import assert from 'node:assert/strict'
import test from 'node:test'
import { databasePoolOptions } from '../src/lib/database'

test('Worker fails closed without Hyperdrive even when direct credentials exist', () => {
  assert.throws(() => databasePoolOptions({
    worker: true,
    environment: { PAYLOAD_DATABASE_URI: 'postgresql://user:secret@db.example.com/postgres' },
  }), /HYPERDRIVE binding/)
})

test('Worker uses only its Hyperdrive transport and never passes the origin CA to workerd', () => {
  const pool = databasePoolOptions({
    worker: true,
    environment: { PAYLOAD_DATABASE_URI: 'postgresql://user:secret@db.example.com/postgres', PAYLOAD_DATABASE_CA_CERT: 'origin CA' },
    hyperdrive: { connectionString: 'postgresql://binding:private@hyperdrive.internal:5432/postgres' },
  })
  assert.equal(pool.connectionString, 'postgresql://binding:private@hyperdrive.internal:5432/postgres')
  assert.equal('ssl' in pool, false)
  assert.equal(pool.maxUses, 1)
})

test('Node remote connections verify TLS and URI flags cannot override the trusted CA', () => {
  const pool = databasePoolOptions({
    worker: false,
    environment: {
      PAYLOAD_DATABASE_URI: 'postgresql://user:secret@db.example.com/postgres?sslmode=no-verify&sslrootcert=untrusted&application_name=m41',
      PAYLOAD_DATABASE_CA_CERT: 'first\\nsecond',
    },
  })
  assert.deepEqual(pool.ssl, { rejectUnauthorized: true, ca: 'first\nsecond' })
  assert.equal(new URL(pool.connectionString).searchParams.has('sslmode'), false)
  assert.equal(new URL(pool.connectionString).searchParams.has('sslrootcert'), false)
  assert.equal(new URL(pool.connectionString).searchParams.get('application_name'), 'm41')
})

test('Node remote connections without a custom CA still require certificate validation', () => {
  const pool = databasePoolOptions({ worker: false, environment: { PAYLOAD_DATABASE_URI: 'postgresql://user:secret@db.example.com/postgres' } })
  assert.deepEqual(pool.ssl, { rejectUnauthorized: true })
})

test('localhost build placeholders remain buildable without a real database', () => {
  const pool = databasePoolOptions({ worker: false, environment: { PAYLOAD_DATABASE_URI: 'postgresql://build:build@localhost:5432/postgres' } })
  assert.equal('ssl' in pool, false)
})
