import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReleaseBundle, legacyRecord, releaseDecision, signArtifact } from '../src/release/release'

const publication = {
  id: 'doc-1', contentfulEntryId: 'entry-1', gpirPublicationId: 'VK-GPIR-P-000000000001-8',
  editionLineageId: 'VK-GPIR-L-000000000001-0', supabaseRecordId: '11111111-1111-4111-8111-111111111111',
  publicationTitle: 'Research', slug: 'research', publicationType: 'Research Publication', publicationStatus: 'CURRENT',
  canonicalUrlCandidate: '/research/', executiveSummary: 'Summary', editorialBody: { root: { children: [] } },
  sourceValidationSummary: 'PASS', validationStatus: 'PASS', migrationStatus: 'RECONCILED', accessClass: 'ENTITLED', _status: 'published',
}

test('release records preserve production adapter identities and remain Supabase-gated', () => {
  const record = legacyRecord(publication)
  assert.equal(record.entryId, 'entry-1')
  assert.equal(record.fields.gpirPublicationId, publication.gpirPublicationId)
  assert.equal(record.presentation.accessClass, 'ENTITLED')
  const bundle = buildReleaseBundle([publication], [{ identity: publication.gpirPublicationId, supabaseRecordId: publication.supabaseRecordId,
    route: '/research/', accessClass: 'ENTITLED', releaseEligible: false, reviewState: 'OWNER_REVIEW', policyStatus: 'ACTIVE' }], '2026-11-14T00:00:00.000Z')
  assert.equal(bundle.artifact.recordCount, 0)
  assert.equal(bundle.artifact.records.length, 0)
  assert.equal(bundle.decisions.decisions[0].releaseEligible, false)
})

test('release signatures are deterministic and cover the complete bundle', () => {
  const secret = 'x'.repeat(32)
  const first = signArtifact({ b: 2, a: 1 }, secret)
  const second = signArtifact({ a: 1, b: 2 }, secret)
  assert.deepEqual(first, second)
  assert.notEqual(first.sha256, signArtifact({ a: 1, b: 3 }, secret).sha256)
})

test('every release decision is bound to the exact GPIR and Supabase identity pair', async () => {
  let requestBody: any
  const decision = await releaseDecision(publication, {
    SUPABASE_URL: 'https://project.supabase.co', GPIR_SUPABASE_SECRET_KEY: 'server-secret',
  }, async (_url, init) => {
    requestBody = JSON.parse(String(init?.body))
    return new Response(JSON.stringify([{ access_class: 'ENTITLED', release_eligible: true, review_state: 'EVIDENCED', policy_status: 'ACTIVE' }]), { status: 200 })
  })
  assert.deepEqual(requestBody, { p_publication_id: publication.gpirPublicationId, p_supabase_record_id: publication.supabaseRecordId })
  assert.equal(decision.releaseEligible, true)
  assert.equal(decision.accessClass, 'ENTITLED')
})

test('release fails closed when Supabase authority is unavailable', async () => {
  await assert.rejects(() => releaseDecision(publication, {
    SUPABASE_URL: 'https://project.supabase.co', GPIR_SUPABASE_SECRET_KEY: 'server-secret',
  }, async () => new Response('{}', { status: 503 })), /authority unavailable/)
})

test('only an eligible, approved, unblocked publication enters the delivery artifact', () => {
  const decision = { identity: publication.gpirPublicationId, supabaseRecordId: publication.supabaseRecordId,
    route: publication.canonicalUrlCandidate, accessClass: 'ENTITLED' as const,
    releaseEligible: true, reviewState: 'EVIDENCED', policyStatus: 'ACTIVE' }
  assert.equal(buildReleaseBundle([publication], [decision], '2026-11-14').artifact.recordCount, 1)
  for (const changed of [
    { migrationStatus: 'MIGRATION_BLOCKED' },
    { validationStatus: 'WARN' },
    { _status: 'draft' },
  ]) {
    assert.equal(buildReleaseBundle([{ ...publication, ...changed }], [decision], '2026-11-14').artifact.recordCount, 0)
  }
})

test('release artifact rejects missing, duplicate, or mismatched Supabase decisions', () => {
  const decision = { identity: publication.gpirPublicationId, supabaseRecordId: publication.supabaseRecordId,
    route: publication.canonicalUrlCandidate, accessClass: 'ENTITLED' as const,
    releaseEligible: true, reviewState: 'EVIDENCED', policyStatus: 'ACTIVE' }
  assert.throws(() => buildReleaseBundle([publication], [], '2026-11-14'), /count mismatch/)
  assert.throws(() => buildReleaseBundle([publication], [{ ...decision, identity: 'other' }], '2026-11-14'), /identity mismatch/)
  assert.throws(() => buildReleaseBundle([publication, publication], [decision, decision], '2026-11-14'), /Duplicate/)
})

test('release authority rejects HTTP 404 and access-class mismatches', async () => {
  const env = { SUPABASE_URL: 'https://project.supabase.co', GPIR_SUPABASE_SECRET_KEY: 'server-secret' }
  await assert.rejects(() => releaseDecision(publication, env,
    async () => new Response('{}', { status: 404 })), /HTTP 404/)
  await assert.rejects(() => releaseDecision(publication, env,
    async () => new Response(JSON.stringify([{ access_class: 'PUBLIC', release_eligible: true }]), { status: 200 })),
  /Access classification mismatch/)
})

test('new Supabase secret keys use apikey without JWT authorization', async () => {
  let headers: Headers | undefined
  await releaseDecision(publication, {
    SUPABASE_URL: 'https://project.supabase.co', GPIR_SUPABASE_SECRET_KEY: 'sb_secret_test_value',
  }, async (_url, init) => {
    headers = new Headers(init?.headers)
    return new Response(JSON.stringify([{ access_class: 'ENTITLED', release_eligible: false,
      review_state: 'OWNER_REVIEW', policy_status: 'ACTIVE' }]), { status: 200 })
  })
  assert.equal(headers?.get('apikey'), 'sb_secret_test_value')
  assert.equal(headers?.has('authorization'), false)
})

test('legacy Supabase JWT credentials retain authorization header', async () => {
  let headers: Headers | undefined
  await releaseDecision(publication, {
    SUPABASE_URL: 'https://project.supabase.co', GPIR_SUPABASE_SECRET_KEY: 'legacy-service-jwt',
  }, async (_url, init) => {
    headers = new Headers(init?.headers)
    return new Response(JSON.stringify([{ access_class: 'ENTITLED', release_eligible: false,
      review_state: 'OWNER_REVIEW', policy_status: 'ACTIVE' }]), { status: 200 })
  })
  assert.equal(headers?.get('authorization'), 'Bearer legacy-service-jwt')
})
