import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../payload.config'
import { stableJson } from '../release/release'
import { sha256 } from './contentful'

async function main() {
  const file = process.argv[2]
  const expected = process.argv[3]
  if (!file || !/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('Usage: restore-bcp.ts RECOVERED_RECORDS_JSON VERIFIED_RECOVERY_SNAPSHOT')
  const records = JSON.parse(await readFile(file, 'utf8'))
  if (!Array.isArray(records) || sha256(stableJson(records)) !== expected) throw new Error('Recovery root mismatch.')
  for (const record of records) {
    if (!String(record.sourceRecordKey || '').startsWith('m41:') || sha256(stableJson(record.sourcePayload)) !== record.sourceHash) throw new Error('Invalid recovery object.')
  }
  const payload = await getPayload({ config })
  const client: any = payload
  let restored = 0
  let preserved = 0
  // References precede native research. Files are recovered from verified BCP
  // bytes into the existing storage adapter, never from a caller-selected URL.
  const normalize = (doc: any) => {
    const data = { ...doc }
    delete data.createdAt; delete data.updatedAt
    for (const key of ['dashboardAsset', 'editorialMetadata', 'region']) if (data[key] && typeof data[key] === 'object') data[key] = data[key].id
    for (const key of ['regions', 'countries', 'chapters']) if (Array.isArray(data[key])) data[key] = data[key].map((item: any) => typeof item === 'object' ? item.id : item)
    return data
  }
  const references = records.filter((item: any) => item.sourcePayload?.kind === 'payload-reference')
  for (const collection of ['regions', 'countries', 'chapters', 'editorial-metadata', 'media', 'research-publications']) {
    const group = collection === 'research-publications' ? records.filter((item: any) => item.sourcePayload?.kind === 'native-research') : references.filter((item: any) => item.sourcePayload.collection === collection)
    for (const record of group) {
      const original = record.sourcePayload.document
      const data = normalize(original)
      const published = collection === 'research-publications' ? record.sourcePayload.publishedDocument : null
      const existing = await client.find({ collection, where: { id: { equals: original.id } }, limit: 2, depth: 0, overrideAccess: true, ...(collection === 'research-publications' ? { draft: true } : {}) })
      if (existing.totalDocs) {
        if (existing.totalDocs !== 1 || stableJson(normalize(existing.docs[0])) !== stableJson(data)) throw new Error('Recovery target conflicts with existing work; no overwrite performed.')
        preserved++; continue
      }
      let file
      if (collection === 'media') {
        const stored = records.find((item: any) => item.sourcePayload?.kind === 'media-bytes' && item.sourcePayload.mediaId === original.id)?.sourcePayload
        if (!stored) throw new Error('Recovery media bytes missing.')
        const bytes = Buffer.from(stored.body, 'base64')
        if (sha256(bytes) !== stored.sha256 || (original.sourceSha256 && stored.sha256 !== original.sourceSha256)) throw new Error('Recovery media digest mismatch.')
        file = { data: bytes, mimetype: original.mimeType, name: original.filename, size: bytes.length }
      }
      await client.create({ collection, data: published ? normalize(published) : data, ...(file ? { file } : {}),
        ...(collection === 'research-publications' ? { draft: published ? false : original._status !== 'published' } : {}),
        overrideAccess: true, context: { m41VerifiedRecovery: true } })
      if (published && stableJson(normalize(published)) !== stableJson(data)) await client.update({ collection, id: original.id, data, draft: true, overrideAccess: true, context: { m41VerifiedRecovery: true } })
      restored++
    }
  }
  for (const record of records.filter((item: any) => !['native-research', 'payload-reference', 'media-bytes'].includes(item.sourcePayload?.kind))) {
    const existing = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: record.sourceRecordKey } }, limit: 2, depth: 0, overrideAccess: true })
    if (existing.totalDocs > 1) throw new Error('Recovery identity is ambiguous.')
    if (existing.docs[0]) {
      if (stableJson(existing.docs[0].sourcePayload) !== stableJson(record.sourcePayload)) throw new Error('Recovery conflicts with existing editorial work; no overwrite performed.')
      preserved++
      continue
    }
    await client.create({ collection: 'editorial-metadata', overrideAccess: true, context: { m41VerifiedDeliveryImport: true }, data: {
      ...record, sourceValidationSummary: 'Contentful BCP recovery: original validation, publication states and identities retained.', migrationStatus: 'RECONCILED', migrationBatchId: expected,
    } })
    restored++
  }
  console.log(JSON.stringify({ status: 'RESTORED_NOT_RELEASED', recoverySnapshot: expected, restored, preserved }))
  await payload.destroy()
}
main().catch(() => { console.error('BCP restore blocked; existing records preserved. Inspect private execution context.'); process.exitCode = 1 })
