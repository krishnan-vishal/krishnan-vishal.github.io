import type { Endpoint } from 'payload'
import { roleOf } from '../lib/access'
import { signArtifact } from './release'

// Explicit immutable snapshot selection: never "latest", never a draft-query fallback.
export const siteReleaseEndpoint: Endpoint = {
  path: '/release/managed-site', method: 'post',
  handler: async req => {
    if (!['admin', 'release-service'].includes(roleOf(req.user) || '')) return Response.json({ error: 'RELEASE_ROLE_REQUIRED' }, { status: 403 })
    let input: any
    try { input = await req.json!() } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }) }
    if (!/^[a-f0-9]{64}$/.test(input?.snapshot || '')) return Response.json({ error: 'INVALID_SNAPSHOT' }, { status: 400 })
    const result = await req.payload.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: `m41:manifest:${input.snapshot}` } }, limit: 2, depth: 0, overrideAccess: false, req })
    if (result.docs.length !== 1) return Response.json({ error: 'SNAPSHOT_NOT_FOUND' }, { status: 404 })
    const manifest = result.docs[0].sourcePayload
    const secret = process.env.GPIR_RELEASE_SIGNING_SECRET || ''
    if (secret.length < 32) return Response.json({ error: 'SIGNING_CONFIGURATION_REQUIRED' }, { status: 503 })
    return Response.json({ manifest, integrity: signArtifact(manifest, secret) }, { headers: { 'cache-control': 'no-store' } })
  },
}
