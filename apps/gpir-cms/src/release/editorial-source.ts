import { legacyRecord, stableJson } from './release'
import { sha256 } from '../migration/contentful'

export const researchTypes = new Set(['Research Publication', 'Research Chapter', 'Country Intelligence', 'Regional Directory'])
export const nativeReady = (doc: any) => doc._status === 'published' && doc.validationStatus === 'PASS' && doc.migrationStatus !== 'MIGRATION_BLOCKED'

export async function allNative(client: any, req?: any, draft = false) {
  const docs: any[] = []
  for (let page = 1; page <= 100; page++) {
    const result = await client.find({ collection: 'research-publications', page, limit: 100, depth: 1, draft, overrideAccess: true, ...(req ? { req } : {}), sort: 'id' })
    docs.push(...result.docs)
    if (!result.hasNextPage) return docs
  }
  throw new Error('Native research pagination incomplete.')
}

export function resolvedEditorialRecords(mirrors: any[], native: any[], adopted: Set<string>) {
  const records = new Map<string, any>()
  for (const mirror of mirrors) {
    const value = mirror.sourcePayload
    if (value?.published === true) records.set(value.entryId, { entryId: value.entryId, updatedAt: mirror.updatedAt, fields: value.fields, includes: value.deliveryIncludes || {} })
  }
  for (const doc of native) {
    const id = doc.contentfulEntryId || String(doc.id)
    const prior = records.get(id)
    if (prior) {
      for (const field of ['gpirPublicationId', 'supabaseRecordId', 'editionLineageId', 'canonicalUrlCandidate']) {
        if (prior.fields[field] && doc[field] !== prior.fields[field]) throw new Error('Native/migrated research identity mismatch.')
      }
    }
    // Imported draft/WARN remains a draft. A reviewed native record takes over
    // this exact identity; unpublishing it never resurrects its migrated edition.
    if (nativeReady(doc)) {
      const record = legacyRecord(doc)
      records.set(id, { ...record, updatedAt: doc.updatedAt, includes: prior?.includes || {} })
    } else if (adopted.has(id) || doc.migrationStatus !== 'MIGRATION_BLOCKED') records.delete(id)
  }
  return [...records.values()]
}

export function nativeBackupRecords(docs: any[], published: any[] = []) {
  return docs.map(doc => {
    const sourcePayload = { kind: 'native-research', document: doc, publishedDocument: published.find(item => item.id === doc.id && item._status === 'published') || null }
    return { sourceRecordKey: `m41:native:${doc.id}`, sourcePayload, sourceHash: sha256(stableJson(sourcePayload)) }
  })
}

export async function recordNativeAdoption({ doc, req }: any) {
  if (!nativeReady(doc)) return doc
  const id = doc.contentfulEntryId || String(doc.id)
  const sourceRecordKey = `m41:adopted:${id}`
  const existing = await req.payload.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: sourceRecordKey } }, limit: 2, depth: 0, req, overrideAccess: true })
  if (existing.totalDocs > 1) throw new Error('Ambiguous native adoption.')
  if (!existing.totalDocs) {
    const sourcePayload = { kind: 'native-adoption', entryId: id, nativeId: doc.id, publicationId: doc.gpirPublicationId, supabaseRecordId: doc.supabaseRecordId }
    await req.payload.create({ collection: 'editorial-metadata', req, overrideAccess: true, data: { sourceRecordKey, sourcePayload,
      sourceHash: sha256(stableJson(sourcePayload)), sourceValidationSummary: 'Native Payload reviewer-approved record is the sole editing authority. Original migrated edition remains preserved.', migrationStatus: 'RECONCILED' } })
  }
  return doc
}

export async function referenceBackupRecords(client: any, req: any) {
  const records: any[] = []
  for (const collection of ['regions', 'countries', 'chapters', 'media', 'editorial-metadata']) {
    for (let page = 1; ; page++) {
      const result = await client.find({ collection, page, limit: 100, depth: 0, req, overrideAccess: true, sort: 'id' })
      for (const doc of result.docs) {
        // Preserve the original exclusion without relying on adapter-specific negative string filters.
        if (collection === 'editorial-metadata' && String(doc.sourceRecordKey || '').includes('m41:')) continue
        const sourcePayload = { kind: 'payload-reference', collection, document: doc }
        records.push({ sourceRecordKey: `m41:reference:${collection}:${doc.id}`, sourcePayload, sourceHash: sha256(stableJson(sourcePayload)) })
      }
      if (!result.hasNextPage) break
      if (page >= 1000) throw new Error('Reference backup pagination incomplete.')
    }
  }
  return records
}
