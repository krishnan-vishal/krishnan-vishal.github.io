import type { Endpoint } from 'payload'
import { createHash } from 'node:crypto'
import { roleOf } from '../lib/access'
import { signArtifact, stableJson } from './release'

// A single reviewed page, from an immutable Git commit. Never accept HTML or a
// path supplied by the caller; the existing protected CMS engine is unchanged.
const approvedCommit = '2b6e7b129eb73ac5c7b68e0012f0c962c37d1c8b'
const approvedUrl = `https://raw.githubusercontent.com/krishnan-vishal/krishnan-vishal.github.io/${approvedCommit}/pages/intelligence/index.html`
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const canonical = stableJson
const parentSnapshot = 'f24974c8f29952e2e8837ced812cfe3c76c8b4d3d8d22d5bf1c383d229c136a0'
const path = 'pages/intelligence/index.html'

export const observatoryEditionEndpoint: Endpoint = {
  path: '/release/observatory-edition', method: 'post',
  handler: async req => {
    if (!['admin', 'release-service'].includes(roleOf(req.user) || ''))
      return Response.json({ error: 'RELEASE_ROLE_REQUIRED' }, { status: 403 })
    const signingSecret = process.env.GPIR_RELEASE_SIGNING_SECRET || ''
    if (signingSecret.length < 32)
      return Response.json({ error: 'SIGNING_CONFIGURATION_REQUIRED' }, { status: 503 })
    let input: any
    try { input = await req.json!() } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }) }
    if (input?.parentSnapshot !== parentSnapshot || input?.action !== 'prepare')
      return Response.json({ error: 'UNAUTHORIZED_EDITION_INPUT' }, { status: 400 })
    const client: any = req.payload
    const get = async (key: string) => {
      const result = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, req, overrideAccess: true })
      if (result.totalDocs > 1) throw Error('AMBIGUOUS_SNAPSHOT_RECORD')
      return result.docs[0] || null
    }
    try {
      const parentRecord = await get(`m41:manifest:${parentSnapshot}`)
      if (!parentRecord || sha(canonical(parentRecord.sourcePayload)) !== parentRecord.sourceHash)
        throw Error('PARENT_MANIFEST_UNAVAILABLE')
      const parent = parentRecord.sourcePayload
      if (parent.snapshot !== parentSnapshot || parent.schema !== 'gpir-managed-site/v1' ||
          sha(canonical(Object.fromEntries(Object.entries(parent).filter(([key]) => key !== 'snapshot')))) !== parentSnapshot)
        throw Error('PARENT_MANIFEST_INVALID')
      const original = parent.files?.find((item: any) => item.path === path)
      if (!original || parent.files.filter((item: any) => item.path === path).length !== 1)
        throw Error('OBSERVATORY_ROUTE_NOT_MANAGED')
      const response = await fetch(approvedUrl, { redirect: 'error', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw Error('REVIEWED_GITHUB_SOURCE_UNAVAILABLE')
      const bytes = new Uint8Array(await response.arrayBuffer())
      const html = new TextDecoder().decode(bytes)
      if (bytes.length > 500000 || !html.includes('id="ask-gpir-observatory"') ||
          !html.includes('aria-controls="search-overlay"')) throw Error('APPROVED_PAGE_CONTRACT_FAILED')
      const digest = sha(bytes)
      if (digest === original.sha256) throw Error('EDITION_UNCHANGED')
      const updatedFiles = parent.files.map((item: any) => item.path === path ? { ...item, sha256: digest, bytes: bytes.length } : item)
      const { snapshot: _old, ...base } = parent
      const body = { ...base, files: updatedFiles, parentSnapshot }
      const snapshot = sha(canonical(body))
      const manifest = { ...body, snapshot }
      const store = async (key: string, value: any) => {
        const hash = sha(canonical(value))
        const existing = await get(key)
        if (existing) {
          if (existing.sourceHash !== hash || sha(canonical(existing.sourcePayload)) !== hash)
            throw Error('IMMUTABLE_EDITION_CONFLICT')
          return
        }
        await client.create({ collection: 'editorial-metadata', req, overrideAccess: true, data: {
          sourceRecordKey: key, sourceHash: hash, sourcePayload: value,
          migrationStatus: 'RECONCILED', migrationBatchId: snapshot,
          sourceValidationSummary: 'Owner-approved PR #585 Observatory edition; inherited protected engines and other managed bytes unchanged.'
        } })
      }
      await store(`m41:blob:${digest}`, { kind: 'site-bytes', encoding: 'base64', body: Buffer.from(bytes).toString('base64') })
      await store(`m41:manifest:${snapshot}`, manifest)
      return Response.json({ status: 'EDITION_PREPARED_NOT_DEPLOYED', snapshot, parentSnapshot,
        observatoryUpdated: true, managedFiles: manifest.files.length,
        integrity: signArtifact(manifest, signingSecret) }, { headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      console.error('M40 governed Observatory edition refused:', error instanceof Error ? error.message : 'UNKNOWN')
      return Response.json({ error: 'EDITION_PREPARATION_REFUSED' }, { status: 409 })
    }
  },
}
