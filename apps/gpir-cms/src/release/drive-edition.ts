import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Endpoint } from 'payload'
import { roleOf } from '../lib/access'
import { allNative, nativeReady } from './editorial-source'
import { legacyRecord, releaseDecision, signArtifact, stableJson } from './release'

const require = createRequire(import.meta.url)
// The static publication renderer is the existing M41 delivery contract. It is
// bundled into the Worker here; no new runtime service or rendering authority is introduced.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const editions = require('../../../../scripts/m41/research-edition.cjs') as {
  applyResearchEdition: (html: string, record: any, decision: any) => { html: string }
  renderFirstResearchEdition: (record: any, decision: any) => { html: string }
  mergeResearchRoutes: (current: any, records: any[], decisions: any[]) => any
  mergeFxEditorial: (current: any, records: any[]) => any
}

const parentSnapshot = 'f2540980b555942c5807d56bc8370ee2ce48d13dd689bd91a29ca011e84fcfea'
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

export const drivePublicationEditionEndpoint: Endpoint = {
  path: '/release/drive-publication-edition', method: 'post',
  handler: async req => {
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
    if (!['admin', 'release-service'].includes(roleOf(req.user) || '')) return reply({ error: 'RELEASE_ROLE_REQUIRED' }, 403)
    const signingSecret = process.env.GPIR_RELEASE_SIGNING_SECRET || ''
    if (signingSecret.length < 32) return reply({ error: 'SIGNING_CONFIGURATION_REQUIRED' }, 503)
    let input: any
    try { input = await req.json!() } catch { return reply({ error: 'INVALID_JSON' }, 400) }
    if (input?.action !== 'prepare' || input?.parentSnapshot !== parentSnapshot) return reply({ error: 'UNAUTHORIZED_EDITION_INPUT' }, 400)
    const client: any = req.payload
    const get = async (key: string) => {
      const result = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, req, overrideAccess: true })
      if (result.totalDocs > 1) throw Error('AMBIGUOUS_SNAPSHOT_RECORD')
      return result.docs[0] || null
    }
    const readPayload = async (key: string) => {
      const doc = await get(key)
      if (!doc || sha(stableJson(doc.sourcePayload)) !== doc.sourceHash) throw Error('SNAPSHOT_OBJECT_UNAVAILABLE')
      return doc.sourcePayload
    }
    let stage = 'PARENT_LOOKUP'
    try {
      const parent = await readPayload(`m41:manifest:${parentSnapshot}`)
      stage = 'PARENT_VALIDATION'
      const { snapshot: ignored, ...parentBody } = parent
      if (parent.snapshot !== parentSnapshot || parent.schema !== 'gpir-managed-site/v1' || sha(stableJson(parentBody)) !== parentSnapshot ||
          !Array.isArray(parent.files) || !Array.isArray(parent.protectedFiles)) throw Error('PARENT_MANIFEST_INVALID')
      stage = 'PUBLICATION_AUTHORITY'
      const publications = (await allNative(client, req)).filter(nativeReady)
      const drivePublications = publications.filter((publication: any) => publication.sourceLineage?.source === 'google-drive')
      if (drivePublications.length !== 43) throw Error('DRIVE_PUBLICATION_COUNT_MISMATCH')
      const decisions = await Promise.all(drivePublications.map((publication: any) => releaseDecision(publication, process.env)))
      if (decisions.some(decision => !decision.releaseEligible || decision.reviewState !== 'EVIDENCED' || decision.policyStatus !== 'ACTIVE')) throw Error('PUBLICATION_RELEASE_REFUSED')
      const records = drivePublications.map(legacyRecord)
      const replacements = new Map<string, Buffer>()
      stage = 'PUBLICATION_RENDER'
      for (let index = 0; index < records.length; index++) {
        const relative = `${decisions[index].route.replace(/^\/+|\/+$/g, '')}/index.html`
        if (!/^[a-z0-9][a-z0-9/_-]*\/index\.html$/.test(relative) || relative.includes('..')) throw Error('PUBLICATION_ROUTE_INVALID')
        const inherited = parent.files.filter((item: any) => item.path === relative)
        if (inherited.length > 1) throw Error('PUBLICATION_ROUTE_AMBIGUOUS')
        let html: string
        if (inherited.length === 1) {
          const blob = await readPayload(`m41:blob:${inherited[0].sha256}`)
          if (blob.kind !== 'site-bytes' || blob.encoding !== 'base64') throw Error('PARENT_BLOB_INVALID')
          const bytes = Buffer.from(blob.body, 'base64')
          if (bytes.length !== inherited[0].bytes || sha(bytes) !== inherited[0].sha256) throw Error('PARENT_BLOB_INVALID')
          html = editions.applyResearchEdition(bytes.toString('utf8'), records[index], decisions[index]).html
        } else html = editions.renderFirstResearchEdition(records[index], decisions[index]).html
        replacements.set(relative, Buffer.from(html))
      }
      const readJson = async (path: string) => {
        const item = parent.files.filter((candidate: any) => candidate.path === path)
        if (item.length !== 1) throw Error('PARENT_INDEX_INVALID')
        const blob = await readPayload(`m41:blob:${item[0].sha256}`)
        if (blob.kind !== 'site-bytes' || blob.encoding !== 'base64') throw Error('PARENT_INDEX_INVALID')
        const bytes = Buffer.from(blob.body, 'base64')
        if (bytes.length !== item[0].bytes || sha(bytes) !== item[0].sha256) throw Error('PARENT_INDEX_INVALID')
        return JSON.parse(bytes.toString('utf8'))
      }
      stage = 'DISCOVERY_INDEX'
      replacements.set('routes.json', Buffer.from(JSON.stringify(editions.mergeResearchRoutes(await readJson('routes.json'), records, decisions), null, 2) + '\n'))
      replacements.set('assets/data/fx/editorial-public.json', Buffer.from(JSON.stringify(editions.mergeFxEditorial(await readJson('assets/data/fx/editorial-public.json'), records), null, 2) + '\n'))
      const filesByPath = new Map(parent.files.map((item: any) => [item.path, { ...item }]))
      for (const [path, bytes] of replacements) filesByPath.set(path, { path, sha256: sha(bytes), bytes: bytes.length })
      const body = { ...parentBody, files: [...filesByPath.values()].sort((a: any, b: any) => a.path.localeCompare(b.path, 'en')),
        parentSnapshot, contentfulArchiveSnapshot: parent.contentfulArchiveSnapshot || parentSnapshot,
        nativeResearch: records.map(record => ({ entryId: record.entryId, publicationId: record.fields.gpirPublicationId, sha256: sha(stableJson(record)) })) }
      const snapshot = sha(stableJson(body)), manifest = { ...body, snapshot }
      const store = async (key: string, payload: any) => {
        const hash = sha(stableJson(payload)), existing = await get(key)
        if (existing) {
          if (existing.sourceHash !== hash || sha(stableJson(existing.sourcePayload)) !== hash) throw Error('IMMUTABLE_EDITION_CONFLICT')
          return
        }
        await client.create({ collection: 'editorial-metadata', req, overrideAccess: true, data: {
          sourceRecordKey: key, sourceHash: hash, sourcePayload: payload, migrationStatus: 'RECONCILED', migrationBatchId: snapshot,
          sourceValidationSummary: 'PR #724 approved Drive publication edition; 43 hash-bound records, Supabase decisions, protected delivery and inherited engines verified.',
        } })
      }
      stage = 'BLOB_STORE'
      for (const bytes of replacements.values()) {
        const digest = sha(bytes)
        await store(`m41:blob:${digest}`, { kind: 'site-bytes', encoding: 'base64', body: bytes.toString('base64') })
      }
      await store(`m41:research-release:${snapshot}`, { kind: 'native-release-evidence', parentSnapshot, records, decisions })
      stage = 'MANIFEST_STORE'
      await store(`m41:manifest:${snapshot}`, manifest)
      return reply({ status: 'EDITION_PREPARED_NOT_DEPLOYED', snapshot, parentSnapshot, released: records.length,
        managedFiles: manifest.files.length, urls: decisions.map(decision => `https://fintechoisis.com${decision.route}`), integrity: signArtifact(manifest, signingSecret) })
    } catch (error) {
      const approved = new Set(['AMBIGUOUS_SNAPSHOT_RECORD', 'SNAPSHOT_OBJECT_UNAVAILABLE', 'PARENT_MANIFEST_INVALID',
        'DRIVE_PUBLICATION_COUNT_MISMATCH', 'PUBLICATION_RELEASE_REFUSED', 'PUBLICATION_ROUTE_INVALID',
        'PUBLICATION_ROUTE_AMBIGUOUS', 'PARENT_BLOB_INVALID', 'PARENT_INDEX_INVALID', 'IMMUTABLE_EDITION_CONFLICT'])
      const raw = error instanceof Error ? error.message : 'UNKNOWN'
      const reason = approved.has(raw) ? raw : 'INTERNAL_PREPARATION_ERROR'
      console.error('Drive publication edition refused:', reason, 'stage:', stage)
      return reply({ error: 'EDITION_PREPARATION_REFUSED', reason, stage }, 409)
    }
  },
}
