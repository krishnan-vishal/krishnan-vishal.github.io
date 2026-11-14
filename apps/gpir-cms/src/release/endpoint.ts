import { randomUUID } from 'node:crypto'
import type { Endpoint } from 'payload'
import { roleOf } from '../lib/access'
import { buildReleaseBundle, releaseDecision, signArtifact } from './release'

export const releaseEndpoint: Endpoint = {
  path: '/release/research-publications',
  method: 'post',
  handler: async (req) => {
    const role = roleOf(req.user)
    if (!role) return Response.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 })
    let input: { mode?: string; publicationIds?: string[] } = {}
    if (typeof req.json !== 'function') return Response.json({ error: 'INVALID_JSON' }, { status: 400 })
    try { input = await req.json() } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }) }
    const mode = String(input.mode || 'PREVIEW').toUpperCase()
    if (!['PREVIEW', 'RELEASE', 'ARCHIVE'].includes(mode)) return Response.json({ error: 'INVALID_MODE' }, { status: 400 })
    if (mode !== 'PREVIEW' && !['admin', 'release-service'].includes(role)) return Response.json({ error: 'RELEASE_ROLE_REQUIRED' }, { status: 403 })
    const where: any = {
      and: [
        { _status: { equals: 'published' } },
        { validationStatus: { equals: 'PASS' } },
        { migrationStatus: { not_equals: 'MIGRATION_BLOCKED' } },
      ],
    }
    if (Array.isArray(input.publicationIds) && input.publicationIds.length) {
      where.and.push({ gpirPublicationId: { in: input.publicationIds.slice(0, 1000) } })
    }
    if (mode === 'ARCHIVE') where.and.push({ publicationStatus: { in: ['HISTORICAL', 'ARCHIVED'] } })
    const result = await req.payload.find({ collection: 'research-publications', where, limit: 1000, depth: 1, req, overrideAccess: false })
    // An unavailable or ambiguous Supabase authority must never yield an artifact.
    let decisions
    try {
      decisions = await Promise.all(result.docs.map((publication) => releaseDecision(publication, process.env)))
    } catch {
      return Response.json({ error: 'RELEASE_AUTHORITY_UNAVAILABLE' }, { status: 503 })
    }
    const generatedAt = new Date().toISOString()
    const bundle = buildReleaseBundle(result.docs, decisions, generatedAt)
    const secret = String(process.env.GPIR_RELEASE_SIGNING_SECRET || '')
    if (secret.length < 32) return Response.json({ error: 'RELEASE_SIGNING_CONFIGURATION_REQUIRED' }, { status: 503 })
    const signed = signArtifact(bundle, secret)
    const artifactId = randomUUID()
    await req.payload.create({
      collection: 'release-events',
      overrideAccess: true,
      data: {
        artifactId,
        mode,
        recordCount: bundle.artifact.recordCount,
        artifactSha256: signed.sha256,
        signingKeyId: 'GPIR_RELEASE_SIGNING_SECRET',
        actorId: String((req.user as { id?: unknown }).id || 'unknown'),
        summary: { eligible: decisions.filter((item) => item.releaseEligible).length, withheld: decisions.filter((item) => !item.releaseEligible).length },
      } as any,
    })
    return Response.json({ artifactId, mode, ...bundle, integrity: signed })
  },
}
