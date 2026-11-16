import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Release helper is a native Node module.
import { productionSettings, requireSuccessfulCI, runtimeKeys } from '../scripts/release-config.mjs'

test('production settings exclude raw database credentials and reject website/custom-domain targets', () => {
  const environment = { ...Object.fromEntries(runtimeKeys.map((key: string) => [key, 'private-value'])), PAYLOAD_DATABASE_URI: 'postgresql://user:secret@db.example.com/postgres' }
  const settings = productionSettings(environment, 'https://gpir-payload-cms.example.workers.dev')
  assert.equal(settings.PAYLOAD_PUBLIC_SERVER_URL, 'https://gpir-payload-cms.example.workers.dev')
  assert.equal('PAYLOAD_DATABASE_URI' in settings, false)
  assert.equal('PAYLOAD_DATABASE_CA_CERT' in settings, false)
  assert.throws(() => productionSettings(environment, 'https://fintechoisis.com'))
  assert.throws(() => productionSettings(environment, 'http://gpir-payload-cms.example.workers.dev'))
  assert.throws(() => productionSettings({ ...environment, NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 'https://gpir-payload-cms.example.workers.dev'))
})

test('release requires both successful current-commit workflows and rejects stale success', () => {
  const names = ['M41 Payload CMS validation', 'GPIR Security and Integrity']
  const runs = names.map((name, i) => ({ id: i + 1, name, head_sha: 'current', status: 'completed', conclusion: 'success' }))
  assert.equal(Object.keys(requireSuccessfulCI(runs, 'current')).length, 2)
  assert.throws(() => requireSuccessfulCI(runs, 'different'))
  assert.throws(() => requireSuccessfulCI([...runs, { ...runs[0], id: 3, conclusion: 'failure' }], 'current'))
})
