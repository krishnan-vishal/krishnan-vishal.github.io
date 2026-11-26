import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { nativeBackupRecords, resolvedEditorialRecords } from '../src/release/editorial-source'
import { guardEditorialRecord } from '../src/lib/editorial-record'
const require = createRequire(import.meta.url)
const { applyResearchEdition, renderFirstResearchEdition, mergeResearchRoutes, mergeFxEditorial } = require('../../../scripts/m41/research-edition.cjs')
const id = 'VK-GPIR-P-000000000001-8'
const uuid = '11111111-1111-4111-8111-111111111111'
const fields = { gpirPublicationId: id, supabaseRecordId: uuid, editionLineageId: 'VK-GPIR-L-000000000001-8', canonicalUrlCandidate: '/research/',
  publicationTitle: 'USD/JPY reviewed edition', publicationType: 'Research Publication', executiveSummary: 'Reviewed public summary',
  publicationStatus: 'CURRENT', validationStatus: 'PASS', editorialBody: { nodeType: 'document', data: {}, content: [{ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', data: {}, value: 'Reviewed body', marks: [] }] }] } }
const mirror = { updatedAt: '2026-11-15', sourcePayload: { entryId: 'source-id', published: true, fields } }
const native = { id: 'native-id', contentfulEntryId: 'source-id', ...fields, migrationStatus: 'MIGRATION_BLOCKED', _status: 'draft', accessClass: 'PUBLIC',
  editorialBody: { root: { type: 'root', version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: 'New native edition', format: 0 }] }] } } }
test('imported drafts preserve delivered edition; reviewed native edits replace the same identity', () => {
  assert.equal(resolvedEditorialRecords([mirror], [native], new Set())[0].fields.publicationTitle, fields.publicationTitle)
  const reviewed = { ...native, migrationStatus: 'EDITORIAL_UPDATE', _status: 'published', publicationTitle: 'Native reviewed title' }
  const result = resolvedEditorialRecords([mirror], [reviewed], new Set(['source-id']))
  assert.equal(result.length, 1)
  assert.equal(result[0].entryId, 'source-id')
  assert.equal(result[0].fields.publicationTitle, 'Native reviewed title')
  assert.deepEqual(resolvedEditorialRecords([mirror], [{ ...native, _status: 'draft' }], new Set(['source-id'])), [])
})
test('research mirrors cannot compete as an editing authority and identity drift fails closed', () => {
  assert.throws(() => guardEditorialRecord({ originalDoc: { sourceRecordKey: 'm41:editorial:source-id', sourcePayload: mirror.sourcePayload }, data: { sourcePayload: { ...mirror.sourcePayload, kind: 'editorial-entry' } }, req: { user: { role: 'reviewer' } } }), /Research Publications/)
  assert.throws(() => resolvedEditorialRecords([mirror], [{ ...native, supabaseRecordId: 'another-id' }], new Set()), /identity mismatch/)
})
test('public native edits change the existing content slot while preserving navigation, scripts, dashboard and footer', () => {
  const original = `<html><head><title>Old</title><script src="ticker.js"></script></head><body><header>Navigation</header><main data-gpir-publication-id="${id}"><section class="gpir-primary-dashboard"><img src="/same-media.svg"></section><p>Old body</p></main><footer>ASK GPIR</footer></body></html>`
  const record = { entryId: 'source-id', fields, presentation: { accessClass: 'PUBLIC' } }
  const decision = { identity: id, supabaseRecordId: uuid, route: '/research/', accessClass: 'PUBLIC', releaseEligible: true }
  const html = applyResearchEdition(original, record, decision).html
  assert.match(html, /Reviewed body/)
  for (const preserved of ['<header>Navigation</header>', '<script src="ticker.js"></script>', '<img src="/same-media.svg">', '<footer>ASK GPIR</footer>']) assert.ok(html.includes(preserved))
  assert.throws(() => applyResearchEdition(original, record, { ...decision, releaseEligible: false }), /authority mismatch/)
  assert.throws(() => applyResearchEdition(original.replace(id, 'another-id'), record, decision), /identity-bound/)
})
test('restricted native release emits the existing reader shell without editorial body', () => {
  const original = `<html><head><title>Old</title><script type="module" src="/assets/js/gpir-protected-publication.mjs"></script></head><body><main data-gpir-publication-id="${id}">Old body</main><footer>Keep</footer></body></html>`
  const record = { entryId: 'source-id', fields, presentation: { accessClass: 'ENTITLED' } }
  const html = applyResearchEdition(original, record, { identity: id, supabaseRecordId: uuid, route: '/research/', accessClass: 'ENTITLED', releaseEligible: true }).html
  assert.doesNotMatch(html, /Reviewed body/)
  assert.match(html, /data-gpir-auth-result="required"/)
  assert.match(html, /<footer>Keep<\/footer>/)
})
test('FX index refreshes only the reviewed publication and preserves other pairs', () => {
  const other = { publicationId: 'other-id', pair: 'EUR/USD', title: 'Other pair' }
  const merged = mergeFxEditorial({ source: 'contentful-published-public', records: [other] }, [{ entryId: 'source-id', fields, presentation: { accessClass: 'PUBLIC' } }])
  assert.equal(merged.records.length, 2)
  assert.ok(merged.records.includes(other))
  assert.ok(merged.records.some((row: any) => row.pair === 'USD/JPY'))
})

test('native BCP keeps the pending draft and delivered published version separately', () => {
  const draft = { ...native, publicationTitle: 'Pending editor draft', validationStatus: 'WARN', _status: 'draft' }
  const published = { ...native, publicationTitle: 'Delivered edition', validationStatus: 'PASS', _status: 'published', migrationStatus: 'RECONCILED' }
  const record = nativeBackupRecords([draft], [published])[0]
  assert.equal(record.sourcePayload.document.publicationTitle, 'Pending editor draft')
  assert.equal(record.sourcePayload.document.validationStatus, 'WARN')
  assert.equal(record.sourcePayload.publishedDocument.publicationTitle, 'Delivered edition')
  assert.equal(record.sourcePayload.publishedDocument.validationStatus, 'PASS')
})

test('first-time research routes are admitted only with approved identity and safe protected shell', () => {
  const record = { entryId: 'source-id', fields, presentation: { accessClass: 'ENTITLED' } }
  const decision = { identity: id, supabaseRecordId: uuid, route: '/research/', accessClass: 'ENTITLED', releaseEligible: true }
  const rendered = renderFirstResearchEdition(record, decision)
  assert.match(rendered.html, /data-gpir-publication-id="VK-GPIR-P-000000000001-8"/)
  assert.match(rendered.html, /gpir-protected-publication\.mjs/)
  assert.doesNotMatch(rendered.html, /Reviewed body/)
  assert.throws(() => renderFirstResearchEdition(record, { ...decision, releaseEligible: false }), /authority mismatch/)
  assert.throws(() => renderFirstResearchEdition({ ...record, fields: { ...fields, validationStatus: 'WARN' } }, decision), /authority mismatch/)

  const existing = { schemaVersion: '1.0.0', deploymentEligible: false, recordCount: 0, routes: [] }
  const routes = mergeResearchRoutes(existing, [record], [decision])
  assert.equal(routes.recordCount, 1)
  assert.equal(existing.routes.length, 0)
  assert.equal(routes.routes[0].route, '/research/')
  assert.equal(routes.routes[0].authAuthority, 'supabase')
  assert.equal(routes.routes[0].controlledValidation, false)
  assert.equal(routes.deploymentEligible, false)
  assert.deepEqual(mergeResearchRoutes(routes, [record], [decision]), routes)
  assert.throws(() => mergeResearchRoutes({ ...routes, routes: [{ ...routes.routes[0], identity: 'different-id' }] }, [record], [decision]), /collision/)
  assert.throws(() => mergeResearchRoutes({ ...routes, routes: [{ ...routes.routes[0], route: '/other/' }] }, [record], [decision]), /collision/)
})
