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
  for (const record of records) {
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
