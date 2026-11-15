import test from 'node:test'
import assert from 'node:assert/strict'
import { guardEditorialRecord } from '../src/lib/editorial-record'
import { editorialEndpoint } from '../src/release/editorial-endpoint'
// @ts-ignore Existing shared engine is intentionally framework independent.
import { contentfulEditorialConfig, fetchPublishedEditorialEntries } from '../../../supabase/functions/_shared/gpir-contentful-editorial.mjs'
const entry = { kind: 'editorial-entry', entryId: 'source-id', fields: { validationStatus: 'WARN' }, published: true }
test('machine/editor cannot approve a draft or relabel WARN; reviewer requires PASS', () => {
  for (const role of ['editor', 'release-service', 'reviewer']) assert.throws(() => guardEditorialRecord({ data: { sourceRecordKey: 'm41:editorial:source-id', sourcePayload: entry }, req: { user: { role } } }), /reviewer|PASS/)
  const approved = guardEditorialRecord({ data: { sourceRecordKey: 'm41:editorial:source-id', sourcePayload: { ...entry, fields: { validationStatus: 'PASS' } } }, req: { user: { role: 'reviewer' } } })
  assert.match(approved.sourceHash, /^[a-f0-9]{64}$/)
})
test('verified delivery import retains source WARN without fabricating PASS', () => {
  const value = guardEditorialRecord({ data: { sourceRecordKey: 'm41:editorial:source-id', sourcePayload: entry }, req: { context: { m41VerifiedDeliveryImport: true } } })
  assert.equal(value.sourcePayload.fields.validationStatus, 'WARN')
})
test('Payload is the sole selected editorial source; no Contentful fallback on failure', async () => {
  const config = contentfulEditorialConfig({ GPIR_EDITORIAL_SOURCE: 'payload', PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.example', PAYLOAD_RELEASE_API_KEY: 'test-key', CONTENTFUL_SPACE_ID: 'bcp', CONTENTFUL_ENVIRONMENT: 'master', CONTENTFUL_DELIVERY_TOKEN: 'bcp-token' })
  const urls: string[] = []
  await assert.rejects(fetchPublishedEditorialEntries({ config, fetchImpl: async (url: string) => { urls.push(url); return new Response('', { status: 503 }) } }), /PAYLOAD_EDITORIAL_HTTP_503/)
  assert.deepEqual(urls, ['https://cms.example/api/release/editorial-entries'])
})
test('machine endpoint rejects non-draft approval fields', async () => {
  const req: any = { user: { role: 'release-service' }, json: async () => ({ action: 'create', id: 'gpir-t3-11111111-1111-4111-8111-111111111111', fields: { supabaseRecordId: { 'en-US': '11111111-1111-4111-8111-111111111111' }, validationStatus: { 'en-US': 'PASS' } } }), payload: { find: async () => ({ docs: [], hasNextPage: false }) } }
  const response = await editorialEndpoint.handler(req)
  assert.equal(response.status, 400)
})
