import assert from 'node:assert/strict'
import test from 'node:test'
import type { PayloadRequest } from 'payload'
import { driveIntakeEndpoint, resolveDriveChapter, resolveDriveMedia } from '../src/release/drive-intake'
import { reconcileDriveCandidates } from '../src/release/drive-reconciliation'
import { signArtifact } from '../src/release/release'
import { enforceGovernance } from '../src/collections/ResearchPublications'

test('Drive intake rejects anonymous requests and altered reviewed bytes before touching Payload', async () => {
  const request = (options: Partial<PayloadRequest> = {}) => ({
    headers: new Headers(), ...options,
  } as PayloadRequest)
  assert.equal((await driveIntakeEndpoint.handler(request())).status, 403)
  const previous = process.env.GPIR_RELEASE_SIGNING_SECRET
  const secret = 'fixture-only-release-secret-for-test'
  process.env.GPIR_RELEASE_SIGNING_SECRET = secret
  try {
    const review = { hash: 'a'.repeat(64), title: 'Title', summary: 'Summary', body: 'Body',
      chapterSlug: 'trade-payments', routeSlug: 'example', category: 'B2B',
      menuPath: ['Money Movement', 'Trade', 'B2B'], sourceFileId: 'drive-file-fixture',
      sourceFileName: 'fixture.jpg', reconciliationHash: 'b'.repeat(64) }
    const body = new FormData()
    body.set('review', JSON.stringify(review))
    body.set('file', new Blob([Buffer.from('ffd8ff', 'hex')], { type: 'image/jpeg' }))
    const signature = signArtifact({ purpose: 'gpir-drive-draft-intake-v1', review }, secret).signature
    const result = await driveIntakeEndpoint.handler(request({
      user: { role: 'release-service', collection: 'users', id: 'fixture' } as PayloadRequest['user'],
      headers: new Headers({ 'content-length': '500', 'x-gpir-intake-signature': signature }),
      formData: async () => body,
    }))
    assert.equal(result.status, 409)
    assert.deepEqual(await result.json(), { error: 'INTAKE_HASH_MISMATCH' })
  } finally {
    if (previous === undefined) delete process.env.GPIR_RELEASE_SIGNING_SECRET
    else process.env.GPIR_RELEASE_SIGNING_SECRET = previous
  }
})

test('hash-bound reconciliation admits approved content and separates holds from unmatched images', () => {
  const hashes = ['1', '2', '3'].map(value => value.repeat(64))
  const candidates = hashes.map((hash, index) => ({ id: `drive-file-${index}`, name: `file-${index}.jpg`, mimeType: 'image/jpeg', size: 3, hash }))
  const annotations = [{ id: candidates[0].id, size: 3, mime: 'image/jpeg', editorial: {
    hash: hashes[0], title: 'Approved', summary: 'Summary', body: 'Body', chapterSlug: 'approved-category', routeSlug: 'approved', category: 'C2C',
  } }]
  const rows = [{ reference: 'Approved', menu: ['Money Movement', 'APAC', 'C2C'], categoryStatus: 'New', useCase: 'C2C',
    filename: candidates[0].name, sha256: hashes[0], bytes: 3 },
  { reference: 'Held', menu: ['Home GPIR', 'Discovery', 'Country Intelligence'], categoryStatus: 'New', useCase: 'C2C',
    filename: candidates[1].name, sha256: hashes[1], bytes: 3, note: 'Matrix identifies third-party origin. Verify rights.' }]
  const result = reconcileDriveCandidates(candidates, annotations, rows)
  assert.deepEqual(result.map(item => item.disposition), ['ELIGIBLE', 'HELD_EXCEPTION', 'EXCLUDED_UNMATCHED'])
  assert.equal(result[0].review?.menuPath[2], 'C2C')
  assert.match(result[0].review?.reconciliationHash || '', /^[a-f0-9]{64}$/)
})

test('approved category resolution reuses one existing chapter and creates only a genuinely missing path', async () => {
  const review = { hash: 'a'.repeat(64), title: 'Title', summary: 'Summary', body: 'Body', chapterSlug: 'trade-payments', routeSlug: 'example', category: 'B2B',
    menuPath: ['Money Movement', 'Trade', 'B2B'], sourceFileId: 'drive-file-fixture', sourceFileName: 'fixture.jpg', reconciliationHash: 'b'.repeat(64) }
  let docs: any[] = [{ id: 'existing', slug: 'trade-payments', canonicalUrl: 'https://fintechoisis.com/pages/chapters/trade-payments.html' }]
  let creates = 0
  const req: any = { payload: {
    find: async () => ({ docs, totalDocs: docs.length }),
    create: async ({ data }: any) => { creates++; const created = { id: 'created', ...data }; docs = [created]; return created },
  } }
  assert.equal((await resolveDriveChapter(req, review)).status, 'REUSED')
  docs = []; review.chapterSlug = 'new-approved-category'; review.menuPath[2] = 'New approved category'
  const created = await resolveDriveChapter(req, review)
  assert.equal(created.status, 'CREATED'); assert.equal(creates, 1)
  assert.equal(created.chapter.publicationState, 'CURRENT')
})

test('existing research canonical identity is preserved and unrelated chapter conflicts still fail closed', async () => {
  const slug = 'other-approved-legacy-research'
  const review: any = {
    hash: 'a'.repeat(64), title: 'Dashboard', summary: 'Summary', body: 'Body',
    chapterSlug: slug, routeSlug: 'new-dashboard', category: 'C2C',
    menuPath: ['Money Movement Ecosystem', 'Other legacy research'],
    sourceFileId: 'approved-drive-id', sourceFileName: 'dashboard.jpg',
    reconciliationHash: 'b'.repeat(64),
  }
  const prior = { id: 'existing-chapter', slug,
    canonicalId: 'chapter:VK-GPIR-P-000000000018-2',
    canonicalUrl: `https://fintechoisis.com/${slug}/` }
  let docs: any[] = [prior]
  let created = 0
  const req: any = { payload: {
    find: async () => ({ totalDocs: docs.length, docs }),
    create: async () => { created++; throw new Error('Existing chapter must not be overwritten') },
  } }
  const result = await resolveDriveChapter(req, review)
  assert.equal(result.status, 'REUSED')
  assert.equal(result.chapter, prior)
  assert.equal(created, 0)
  docs = [{ ...prior, canonicalId: 'unrelated:identity' }]
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_CANONICAL_CONFLICT/)
  docs = [{ ...prior, canonicalUrl: 'https://fintechoisis.com/unrelated/' }]
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_CANONICAL_CONFLICT/)
  docs = [prior, { ...prior, id: 'second' }]
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_AMBIGUOUS/)
})

test('verified media is reused only when the source hash resolves to one Payload asset', async () => {
  const asset = { id: 'media-1', sourceSha256: 'a'.repeat(64) }
  const req: any = { payload: { find: async () => ({ totalDocs: 1, docs: [asset] }) } }
  assert.equal(await resolveDriveMedia(req, asset.sourceSha256), asset)
  req.payload.find = async () => ({ totalDocs: 2, docs: [asset, { ...asset, id: 'media-2' }] })
  await assert.rejects(resolveDriveMedia(req, asset.sourceSha256), /INTAKE_MEDIA_AMBIGUOUS/)
})

test('approved Stablecoins mapping reuses its canonical root chapter and refuses alternatives', async () => {
  const chapterSlug = 'stablecoins-cbdcs-tokenized-money-digital-asset-payments-gpir-research-fintechoisis'
  const canonicalUrl = `https://fintechoisis.com/${chapterSlug}/`
  const chapter = { id: 'existing', slug: chapterSlug, canonicalId: 'chapter:VK-GPIR-P-000000000018-2', canonicalUrl }
  const review = {
    hash: 'a'.repeat(64), title: 'Title', summary: 'Summary', body: 'Body', chapterSlug,
    routeSlug: 'example', category: 'C2C', menuPath: ['Money Movement Ecosystem', 'Stable Coin & CBDC'],
    sourceFileId: 'drive-file-fixture', sourceFileName: 'fixture.jpg', reconciliationHash: 'b'.repeat(64),
  }
  let docs = [chapter]
  const req = { payload: {
    find: async ({ where }: any) => {
      assert.deepEqual(where.or, [
        { slug: { equals: chapterSlug } }, { canonicalId: { equals: chapter.canonicalId } },
        { canonicalUrl: { equals: canonicalUrl } },
      ])
      return { docs, totalDocs: docs.length }
    },
    create: async () => assert.fail('Existing chapter mapping cannot create a chapter'),
  } }
  assert.deepEqual(await resolveDriveChapter(req, review), { chapter, status: 'REUSED' })
  docs = [{ ...chapter, canonicalId: 'chapter:VK-GPIR-P-000000000019-9' }]
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_CANONICAL_CONFLICT/)
  docs = [{ ...chapter, canonicalId: 'different-chapter' }]
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_CANONICAL_CONFLICT/)
  docs = [{ ...chapter, canonicalUrl: `https://fintechoisis.com/pages/chapters/${chapterSlug}.html` }]
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_CANONICAL_CONFLICT/)
  docs = [chapter, { ...chapter, id: 'duplicate' }]
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_AMBIGUOUS/)
  docs = []
  await assert.rejects(resolveDriveChapter(req, review), /INTAKE_CHAPTER_CANONICAL_CONFLICT/)
})

test('idempotent retry returns the exact existing publication before allocating another identity or media record', async () => {
  const bytes = Buffer.from('ffd8ff', 'hex')
  const hash = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')
  const review = { hash, title: 'Title', summary: 'Summary', body: 'Body', chapterSlug: 'trade-payments', routeSlug: 'example', category: 'B2B',
    menuPath: ['Money Movement', 'Trade', 'B2B'], sourceFileId: 'drive-file-fixture', sourceFileName: 'fixture.jpg', reconciliationHash: 'b'.repeat(64) }
  const body = new FormData(); body.set('review', JSON.stringify(review)); body.set('file', new Blob([bytes], { type: 'image/jpeg' }))
  const secret = 'fixture-only-release-secret-for-test'
  const prior = process.env.GPIR_RELEASE_SIGNING_SECRET
  const storage = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']
  const oldStorage = Object.fromEntries(storage.map(key => [key, process.env[key]]))
  process.env.GPIR_RELEASE_SIGNING_SECRET = secret; storage.forEach(key => { process.env[key] = 'fixture' })
  try {
    let creates = 0
    const req: any = {
      user: { role: 'release-service', collection: 'users', id: 'fixture' }, formData: async () => body,
      headers: new Headers({ 'content-length': '500', 'x-gpir-intake-signature': signArtifact({ purpose: 'gpir-drive-draft-intake-v1', review }, secret).signature }),
      payload: {
        find: async ({ collection }: any) => collection === 'research-publications'
          ? { totalDocs: 1, docs: [{ sourceHash: hash, canonicalUrlCandidate: '/example/', slug: 'example', publicationTitle: 'Title', gpirPublicationId: 'VK-GPIR-P-1-1' }] }
          : { totalDocs: 0, docs: [] },
        create: async () => { creates++; throw new Error('must not create') },
      },
    }
    const response = await driveIntakeEndpoint.handler(req)
    assert.equal(response.status, 200); assert.equal((await response.json()).status, 'EXISTING_RECORD'); assert.equal(creates, 0)
  } finally {
    if (prior === undefined) delete process.env.GPIR_RELEASE_SIGNING_SECRET; else process.env.GPIR_RELEASE_SIGNING_SECRET = prior
    for (const key of storage) { const old = oldStorage[key]; if (old === undefined) delete process.env[key]; else process.env[key] = old }
  }
})

test('governed automatic publication is restricted to the signed Drive release context and PASS records', async () => {
  const base: any = { data: { _status: 'published', validationStatus: 'PASS', canonicalUrlCandidate: '/approved/' },
    operation: 'create', originalDoc: {}, req: { user: { role: 'release-service' }, context: {} } }
  assert.throws(() => enforceGovernance(base), /reviewer/)
  const approved = await enforceGovernance({ ...base, req: { ...base.req, context: { driveGovernedRelease: true } } }) as any
  assert.equal(approved.canonicalUrl, 'https://fintechoisis.com/approved/')
  assert.throws(() => enforceGovernance({ ...base, data: { ...base.data, validationStatus: 'WARN' },
    req: { ...base.req, context: { driveGovernedRelease: true } } }), /PASS/)
})
