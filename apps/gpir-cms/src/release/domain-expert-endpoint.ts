import type { Endpoint } from 'payload'
import { roleOf } from '../lib/access'
import { expertError } from '../lib/domain-expert.mjs'

const deliveryFields = [
  'name', 'sortKey', 'title', 'employer', 'jurisdiction', 'summary', 'regions',
  'industries', 'topics', 'career', 'qualifications', 'contribution', 'recognition',
  'corrections', 'officialBio', 'checkedAt', 'linkedin', 'portrait',
] as const

export const domainExpertEndpoint: Endpoint = {
  path: '/release/domain-expert',
  method: 'post',
  handler: async (req) => {
    const reply = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
    const role = roleOf(req.user)
    if (role !== 'admin') return reply({ error: 'ADMIN_REQUIRED' }, 403)

    let id
    try { id = (await req.json?.())?.id } catch { return reply({ error: 'INVALID_JSON' }, 400) }
    if (typeof id !== 'string' || !/^gpir-expert:[0-9a-f]{32}$/.test(id)) return reply({ error: 'INVALID_ID' }, 400)

    try {
      const { docs } = await req.payload.find({
        collection: 'editorial-metadata', where: { sourceRecordKey: { equals: id } },
        limit: 1, depth: 0, req, overrideAccess: false,
      })
      const record = docs[0]
      const profile = record?.sourcePayload as Record<string, any> | undefined
      if (!profile) return reply({ error: 'EXPERT_NOT_FOUND' }, 404)
      if (!['PUBLIC', 'ARCHIVED'].includes(profile.state) || expertError(id, profile, role))
        return reply({ error: 'EXPERT_RELEASE_BLOCKED' }, 409)
      const published = profile.state === 'PUBLIC'
      const projected = published ? Object.fromEntries(deliveryFields.map(field => [field, profile[field]])) : null
      const base = (process.env.GPIR_CORE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
      const key = process.env.GPIR_CORE_SUPABASE_SECRET_KEY || process.env.GPIR_SUPABASE_SECRET_KEY
      if (!/^https:\/\/[^/]+\.supabase\.co$/.test(base) || !key) throw Error('Missing Core authority')
      const headers = new Headers({ 'content-type': 'application/json' })
      headers.set('apikey', key)
      if (!key.startsWith('sb_secret_')) headers.set('authorization', 'Bearer ' + key)
      const response = await fetch(base + '/rest/v1/rpc/gpir_sync_domain_expert', {
        method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          p_id: id, p_revision: record.updatedAt, p_profile: projected,
          p_release_through: published ? profile.review.releaseThrough : null,
        }),
      })
      if (!response.ok) throw Error('Core sync failed')
      if (await response.json() !== true) return reply({ error: 'STALE_OR_CONFLICTING_REVISION' }, 409)
      return reply({ id, state: profile.state, revision: record.updatedAt })
    } catch {
      return reply({ error: 'EXPERT_RELEASE_UNAVAILABLE' }, 503)
    }
  },
}
