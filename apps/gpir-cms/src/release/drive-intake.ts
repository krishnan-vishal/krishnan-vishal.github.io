import { createHash, timingSafeEqual } from 'node:crypto'
import type { Endpoint } from 'payload'
import { roleOf } from '../lib/access'
import { GPIR_LINEAGE_ID, GPIR_PUBLICATION_ID, UUID } from '../lib/identity'
import { contentfulToLexical } from '../lib/richText'
import { releaseDecision, signArtifact } from './release'

export type DriveReview = {
  hash: string
  title: string
  summary: string
  body: string
  chapterSlug: string
  routeSlug: string
  category: string
  menuPath: string[]
  sourceFileId: string
  sourceFileName: string
  reconciliationHash: string
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const hashPattern = /^[a-f0-9]{64}$/

// Cloudflare Workers rejects fetch redirect:'error' before dispatch. Use 'manual'\n// to prevent following redirected authority requests and reject non-2xx responses.\nfunction authorityHeaders(key: string, extra: Record<string, string> = {}) {
  const headers = new Headers(extra)
  headers.set('apikey', key)
  if (!key.startsWith('sb_secret_')) headers.set('authorization', `Bearer ${key}`)
  return headers
}

export async function resolveDriveChapter(req: any, review: DriveReview) {
  const canonicalUrl = `https://fintechoisis.com/pages/chapters/${review.chapterSlug}.html`
  const context = { req, overrideAccess: true, depth: 0 as const, limit: 2 as const }
  const find = () => req.payload.find({ ...context, collection: 'chapters', where: { or: [
    { slug: { equals: review.chapterSlug } }, { canonicalId: { equals: review.chapterSlug } },
    { canonicalUrl: { equals: canonicalUrl } },
  ] } })
  let result = await find()
  if (result.totalDocs > 1) throw new Error('INTAKE_CHAPTER_AMBIGUOUS')
  if (result.totalDocs === 1) {
    const chapter = result.docs[0]
    if (chapter.slug !== review.chapterSlug || chapter.canonicalUrl !== canonicalUrl) throw new Error('INTAKE_CHAPTER_CANONICAL_CONFLICT')
    return { chapter, status: 'REUSED' as const }
  }
  if (review.menuPath.length === 2) throw new Error('INTAKE_CHAPTER_CANONICAL_CONFLICT')
  try {
    const chapter = await req.payload.create({ ...context, collection: 'chapters', data: {
      canonicalId: review.chapterSlug,
      slug: review.chapterSlug,
      title: review.menuPath[review.menuPath.length - 1],
      canonicalUrl,
      publicationState: 'CURRENT',
      sourceModel: {
        driveDistribution: {
          menuPath: review.menuPath,
          reconciliationHash: review.reconciliationHash,
          approvedAt: '2026-11-27',
        },
      },
    } })
    return { chapter, status: 'CREATED' as const }
  } catch {
    result = await find()
    if (result.totalDocs === 1) {
      const chapter = result.docs[0]
      if (chapter.slug !== review.chapterSlug || chapter.canonicalUrl !== canonicalUrl) throw new Error('INTAKE_CHAPTER_CANONICAL_CONFLICT')
      return { chapter, status: 'REUSED' as const }
    }
    throw new Error(result.totalDocs > 1 ? 'INTAKE_CHAPTER_AMBIGUOUS' : 'INTAKE_CHAPTER_CREATE_FAILED')
  }
}

export async function resolveDriveMedia(req: any, hash: string) {
  const assets = await req.payload.find({ req, overrideAccess: true, depth: 0, limit: 2,
    collection: 'media', where: { sourceSha256: { equals: hash } } })
  if (assets.totalDocs > 1) throw new Error('INTAKE_MEDIA_AMBIGUOUS')
  return assets.docs[0] || null
}

export async function ensureDriveAccessPolicy(
  origin: string,
  key: string,
  identity: { id: string; publication_id: string },
  fetchImpl: typeof fetch = fetch,
) {
  const query = new URLSearchParams({
    select: 'supabase_record_id,publication_id,access_class,status,classification_source,review_state',
    supabase_record_id: `eq.${identity.id}`,
  })
  const url = `${origin}/rest/v1/gpir_publication_access_policies?${query}`
  const read = async () => {
    const response = await fetchImpl(url, { headers: authorityHeaders(key), redirect: 'manual', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('INTAKE_POLICY_UNAVAILABLE')
    const rows = await response.json() as any[]
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('INTAKE_POLICY_AMBIGUOUS')
    return rows[0] || null
  }
  const existing = await read()
  if (!existing) {
    const response = await fetchImpl(`${origin}/rest/v1/gpir_publication_access_policies`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: authorityHeaders(key, { 'content-type': 'application/json', prefer: 'return=minimal' }),
      body: JSON.stringify({
        supabase_record_id: identity.id,
        publication_id: identity.publication_id,
        access_class: 'ENTITLED',
        status: 'ACTIVE',
        classification_source: 'M45_DRIVE_APPROVED_HASH_BOUND_2026_11_27',
        review_state: 'EVIDENCED',
      }),
    })
    if (!response.ok && response.status !== 409) throw new Error('INTAKE_POLICY_REFUSED')
  }
  const verified = await read()
  if (!verified || verified.publication_id !== identity.publication_id || verified.access_class !== 'ENTITLED' ||
      verified.status !== 'ACTIVE' || verified.review_state !== 'EVIDENCED' ||
      verified.classification_source !== 'M45_DRIVE_APPROVED_HASH_BOUND_2026_11_27') {
    throw new Error('INTAKE_POLICY_CONFLICT')
  }
  return verified
}
export const driveIntakeEndpoint: Endpoint = {
  path: '/release/drive-draft-intake',
  method: 'post',
  handler: async req => {
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
    if (!['admin', 'release-service'].includes(roleOf(req.user) || '')) return reply({ error: 'SERVICE_ROLE_REQUIRED' }, 403)
    const secret = process.env.GPIR_RELEASE_SIGNING_SECRET || ''
    const signature = req.headers.get('x-gpir-intake-signature') || ''
    const total = Number(req.headers.get('content-length'))
    if (secret.length < 32 || !/^[a-f0-9]{64}$/.test(signature)) return reply({ error: 'INTAKE_SIGNATURE_REQUIRED' }, 403)
    if (!Number.isSafeInteger(total) || total < 1 || total > 20_100_000) return reply({ error: 'INTAKE_SIZE_INVALID' }, 413)
    let failureStage = 'REQUEST_PARSE'
    try {
      const data = await req.formData!()
      const file = data.get('file')
      const raw = data.get('review')
      if (!file || typeof file === 'string' || typeof raw !== 'string' || raw.length > 48_000) return reply({ error: 'INTAKE_INPUT_INVALID' }, 400)
      const review = JSON.parse(raw) as DriveReview
      const expected = signArtifact({ purpose: 'gpir-drive-draft-intake-v1', review }, secret).signature
      if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return reply({ error: 'INTAKE_SIGNATURE_INVALID' }, 403)
      if (!review || ![review.title, review.summary, review.body, review.category].every(text => typeof text === 'string' && text.trim()) ||
          !slugPattern.test(review.routeSlug) || !slugPattern.test(review.chapterSlug) ||
          !hashPattern.test(review.reconciliationHash) || !/^[\w-]{10,}$/.test(review.sourceFileId) ||
          typeof review.sourceFileName !== 'string' || !review.sourceFileName.trim() ||
          !Array.isArray(review.menuPath) || ![2, 3].includes(review.menuPath.length) ||
          review.menuPath.some(item => typeof item !== 'string' || !item.trim())) return reply({ error: 'INTAKE_REVIEW_INVALID' }, 400)
      const bytes = Buffer.from(await file.arrayBuffer())
      const hash = createHash('sha256').update(bytes).digest('hex')
      if (review.hash !== hash) return reply({ error: 'INTAKE_HASH_MISMATCH' }, 409)
      const jpg = file.type === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
      const png = file.type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      if (!jpg && !png) return reply({ error: 'INTAKE_FORMAT_HELD' }, 415)
      if (!['S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].every(key => process.env[key])) {
        return reply({ error: 'INTAKE_STORAGE_UNAVAILABLE' }, 503)
      }
      const route = `/${review.routeSlug}/`
      const context = { req, overrideAccess: true, depth: 0 as const, limit: 2 as const }
      const lookup = () => req.payload.find({ ...context, collection: 'research-publications', draft: true,
        where: { or: [{ sourceHash: { equals: hash } }, { canonicalUrlCandidate: { equals: route } },
          { slug: { equals: review.routeSlug } }, { publicationTitle: { equals: review.title } }] } })
      failureStage = 'PUBLICATION_LOOKUP'
      const matched = await lookup()
      if (matched.totalDocs) {
        const exact = matched.docs.filter((doc: any) => doc.sourceHash === hash && doc.canonicalUrlCandidate === route &&
          doc.slug === review.routeSlug && doc.publicationTitle === review.title)
        if (matched.totalDocs !== 1 || exact.length !== 1) return reply({ error: 'INTAKE_PUBLICATION_COLLISION' }, 409)
        return reply({ status: 'EXISTING_RECORD', publicationId: exact[0].gpirPublicationId, route, categorySlug: review.chapterSlug })
      }
      failureStage = 'MEDIA_LOOKUP'
      const existing = await resolveDriveMedia(req, hash)
      failureStage = 'CHAPTER_RESOLUTION'
      const resolvedChapter = await resolveDriveChapter(req, review)
      const origin = String(process.env.GPIR_CORE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
      const key = process.env.GPIR_CORE_SUPABASE_SECRET_KEY || process.env.GPIR_SUPABASE_SECRET_KEY || ''
      if (!/^https:\/\/[^/]+$/.test(origin) || !key) return reply({ error: 'INTAKE_AUTHORITY_UNAVAILABLE' }, 503)
      failureStage = 'IDENTITY_REQUEST'
      const response = await fetch(`${origin}/rest/v1/rpc/gpir_drive_draft_identity`, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
        headers: authorityHeaders(key, { 'content-type': 'application/json' }),
        body: JSON.stringify({ p_sha256: hash }),
      })
      if (!response.ok) return reply({ error: 'INTAKE_IDENTITY_REFUSED' }, 503)
      failureStage = 'IDENTITY_RESPONSE'
      const rows = await response.json() as { id: string; publication_id: string; lineage_id: string }[]
      const identity = Array.isArray(rows) && rows.length === 1 ? rows[0] : null
      if (!identity || !UUID.test(identity.id) || !GPIR_PUBLICATION_ID.test(identity.publication_id) || !GPIR_LINEAGE_ID.test(identity.lineage_id)) {
        return reply({ error: 'INTAKE_IDENTITY_INVALID' }, 409)
      }
      failureStage = 'ACCESS_POLICY'
      await ensureDriveAccessPolicy(origin, key, identity)
      failureStage = 'RELEASE_DECISION'
      const decision = await releaseDecision({
        gpirPublicationId: identity.publication_id,
        supabaseRecordId: identity.id,
        canonicalUrlCandidate: route,
        accessClass: 'ENTITLED',
      }, process.env)
      if (!decision.releaseEligible || decision.reviewState !== 'EVIDENCED' || decision.policyStatus !== 'ACTIVE') {
        return reply({ error: 'INTAKE_RELEASE_REFUSED' }, 409)
      }
      failureStage = 'MEDIA_CREATE'
      const asset = existing || await req.payload.create({
        ...context, collection: 'media',
        file: { name: `${hash}.${jpg ? 'jpg' : 'png'}`, data: bytes, mimetype: file.type, size: bytes.length },
        data: { alt: review.title, sourceSha256: hash,
          sourceUrl: `https://gpir-payload-cms.krishnanvishal12.workers.dev/api/media/file/${hash}.${jpg ? 'jpg' : 'png'}`,
          sourceFilename: review.sourceFileName, sourceMetadata: {
          source: 'google-drive', sourceFileId: review.sourceFileId, sourceFileName: review.sourceFileName,
          reconciliationHash: review.reconciliationHash,
        } },
      })
      failureStage = 'PUBLICATION_CREATE'
      const publication = await req.payload.create({ ...context, collection: 'research-publications', draft: false,
        context: { driveGovernedRelease: true }, data: {
        _status: 'published', validationStatus: 'PASS', accessClass: 'ENTITLED', migrationStatus: 'RECONCILED',
        publicationStatus: 'CURRENT', publicationType: 'Research Publication', slug: review.routeSlug,
        publicationTitle: review.title, gpirPublicationId: identity.publication_id,
        editionLineageId: identity.lineage_id, supabaseRecordId: identity.id,
        canonicalUrlCandidate: route, canonicalUrl: `https://fintechoisis.com${route}`,
        executiveSummary: review.summary,
        editorialBody: contentfulToLexical({ nodeType: 'document', data: {}, content: review.body.split(/\n+/).filter(text => text.trim())
          .map(text => ({ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value: text, marks: [], data: {} }] })) }),
        chapters: [resolvedChapter.chapter.id], dashboardAsset: asset.id, useCasePaymentCategory: review.category,
        sourceHash: hash, sourceLineage: { source: 'google-drive', sha256: hash,
          sourceFileId: review.sourceFileId, sourceFileName: review.sourceFileName,
          menuPath: review.menuPath, reconciliationHash: review.reconciliationHash },
        sourceValidationSummary: 'PASS: owner-approved distribution matrix and editorial annotation matched the acquired Drive bytes by SHA-256; Supabase identity, evidenced ENTITLED policy, and release authority verified before publication.',
      } })
      return reply({ status: 'PUBLICATION_CREATED', publicationId: identity.publication_id, route,
        category: resolvedChapter.status, categorySlug: review.chapterSlug,
        media: existing ? 'REUSED' : 'CREATED', payloadId: publication.id }, 201)
    } catch (error) {
      const approved = new Set(['INTAKE_CHAPTER_AMBIGUOUS', 'INTAKE_CHAPTER_CREATE_FAILED', 'INTAKE_CHAPTER_CANONICAL_CONFLICT', 'INTAKE_POLICY_UNAVAILABLE',
        'INTAKE_POLICY_AMBIGUOUS', 'INTAKE_POLICY_REFUSED', 'INTAKE_POLICY_CONFLICT', 'INTAKE_MEDIA_AMBIGUOUS'])
      // Never expose exception messages, SQL, credentials, provider response bodies or file content.
      // One of these fixed codes identifies only the existing failing intake operation.
      const reason = error instanceof Error && approved.has(error.message) ? error.message : `INTAKE_FAILED_${failureStage}`
      return reply({ error: reason }, reason.startsWith('INTAKE_FAILED_') ? 503 : 409)
    }
  },
}
