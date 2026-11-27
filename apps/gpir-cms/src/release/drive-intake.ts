import { createHash, timingSafeEqual } from 'node:crypto'
import type { Endpoint } from 'payload'
import { roleOf } from '../lib/access'
import { GPIR_LINEAGE_ID, GPIR_PUBLICATION_ID, UUID } from '../lib/identity'
import { contentfulToLexical } from '../lib/richText'
import { signArtifact } from './release'

export type DriveReview = {
  hash: string
  title: string
  summary: string
  body: string
  chapterSlug: string
  routeSlug: string
  category: string
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
    try {
      const data = await req.formData!()
      const file = data.get('file')
      const raw = data.get('review')
      if (!file || typeof file === 'string' || typeof raw !== 'string' || raw.length > 48_000) return reply({ error: 'INTAKE_INPUT_INVALID' }, 400)
      const review = JSON.parse(raw) as DriveReview
      const expected = signArtifact({ purpose: 'gpir-drive-draft-intake-v1', review }, secret).signature
      if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return reply({ error: 'INTAKE_SIGNATURE_INVALID' }, 403)
      const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
      if (!review || ![review.title, review.summary, review.body, review.category].every(text => typeof text === 'string' && text.trim()) ||
          !slugPattern.test(review.routeSlug) || !slugPattern.test(review.chapterSlug)) return reply({ error: 'INTAKE_REVIEW_INVALID' }, 400)
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
      if ((await lookup()).totalDocs) return reply({ status: 'EXISTING_RECORD' })
      const chapter = await req.payload.find({ ...context, collection: 'chapters', where: { slug: { equals: review.chapterSlug } } })
      if (chapter.totalDocs !== 1) return reply({ error: 'INTAKE_CHAPTER_UNRESOLVED' }, 409)
      const assets = await req.payload.find({ ...context, collection: 'media', where: { sourceSha256: { equals: hash } } })
      const existing = assets.docs[0]
      if (assets.totalDocs > 1) {
        return reply({ error: 'INTAKE_MEDIA_AMBIGUOUS' }, 409)
      }
      const origin = String(process.env.GPIR_CORE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
      const key = process.env.GPIR_CORE_SUPABASE_SECRET_KEY || process.env.GPIR_SUPABASE_SECRET_KEY || ''
      if (!/^https:\/\/[^/]+$/.test(origin) || !key) return reply({ error: 'INTAKE_AUTHORITY_UNAVAILABLE' }, 503)
      const response = await fetch(`${origin}/rest/v1/rpc/gpir_drive_draft_identity`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: (() => {
          const headers = new Headers({ 'content-type': 'application/json' })
          headers.set('apikey', key)
          if (!key.startsWith('sb_secret_')) headers.set('authorization', `Bearer ${key}`)
          return headers
        })(),
        body: JSON.stringify({ p_sha256: hash }),
      })
      if (!response.ok) return reply({ error: 'INTAKE_IDENTITY_REFUSED' }, 503)
      const rows = await response.json() as { id: string; publication_id: string; lineage_id: string }[]
      const identity = Array.isArray(rows) && rows.length === 1 ? rows[0] : null
      if (!identity || !UUID.test(identity.id) || !GPIR_PUBLICATION_ID.test(identity.publication_id) || !GPIR_LINEAGE_ID.test(identity.lineage_id)) {
        return reply({ error: 'INTAKE_IDENTITY_INVALID' }, 409)
      }
      const asset = existing || await req.payload.create({
        ...context, collection: 'media',
        file: { name: `${hash}.${jpg ? 'jpg' : 'png'}`, data: bytes, mimetype: file.type, size: bytes.length },
        data: { alt: review.title, sourceSha256: hash, sourceMetadata: { driveDraft: true } },
      })
      await req.payload.create({ ...context, collection: 'research-publications', draft: true, data: {
        _status: 'draft', validationStatus: 'WARN', accessClass: 'ENTITLED', migrationStatus: 'IMPORTED',
        publicationStatus: 'CURRENT', publicationType: 'Research Publication', slug: review.routeSlug,
        publicationTitle: review.title, gpirPublicationId: identity.publication_id,
        editionLineageId: identity.lineage_id, supabaseRecordId: identity.id,
        canonicalUrlCandidate: route, canonicalUrl: `https://fintechoisis.com${route}`,
        executiveSummary: review.summary,
        editorialBody: contentfulToLexical({ nodeType: 'document', data: {}, content: review.body.split(/\n+/).filter(text => text.trim())
          .map(text => ({ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value: text, marks: [], data: {} }] })) }),
        chapters: [chapter.docs[0].id], dashboardAsset: asset.id, useCasePaymentCategory: review.category,
        sourceHash: hash, sourceLineage: { source: 'google-drive', sha256: hash },
        sourceValidationSummary: 'Source reviewed for draft intake. Publication and access decisions remain pending.',
      } })
      return reply({ status: 'DRAFT_CREATED', publicationId: identity.publication_id }, 201)
    } catch {
      return reply({ error: 'INTAKE_FAILED_RETRY_SAFE' }, 503)
    }
  },
}
