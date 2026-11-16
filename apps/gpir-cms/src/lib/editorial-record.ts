import { researchTypes } from '../release/editorial-source'
import { APIError } from 'payload'
import { roleOf } from './access'
import { sha256 } from '../migration/contentful'
import { stableJson } from '../release/release'

// Existing metadata JSON is versioned by Payload; no production schema changes.
// A published mirror is imported only from the actual Contentful Delivery API.
export function guardEditorialRecord({ data, originalDoc, req }: any) {
  const next = { ...originalDoc, ...data }
  if (String(originalDoc?.sourceRecordKey || '').startsWith('m41:editorial:') && next.sourceRecordKey !== originalDoc.sourceRecordKey) throw new APIError('Editorial source key is immutable.', 409)
  if (!String(next.sourceRecordKey || '').startsWith('m41:editorial:')) return data
  const value = next.sourcePayload
  if (value?.kind !== 'editorial-entry' || !value.entryId || next.sourceRecordKey !== `m41:editorial:${value.entryId}` ||
      !value.fields || typeof value.fields !== 'object') throw new APIError('Invalid editorial identity.', 409)
  if (originalDoc?.sourcePayload?.entryId && originalDoc.sourcePayload.entryId !== value.entryId) throw new APIError('Editorial identity is immutable.', 409)
  for (const field of ['supabaseRecordId', 'gpirPublicationId', 'editionLineageId']) {
    const old = originalDoc?.sourcePayload?.fields?.[field]
    if (old && value.fields[field] !== old) throw new APIError('Editorial governed identity cannot be replaced.', 409)
  }
  if (originalDoc && researchTypes.has(originalDoc.sourcePayload?.fields?.publicationType) && req.user) throw new APIError('Research must be edited in Research Publications; this migrated edition is preserved read-only.', 409)
  if (originalDoc) value.sourceVersion = Number(originalDoc.sourcePayload?.sourceVersion || 1) + 1
  const trustedImport = req.context?.m41VerifiedDeliveryImport === true && !req.user
  if (value.published === true && !trustedImport) {
    if (!['admin', 'reviewer'].includes(roleOf(req.user) || '') || value.fields.validationStatus !== 'PASS') throw new APIError('Publishing requires a reviewer and existing PASS evidence.', 403)
    const oldId = originalDoc?.sourcePayload?.fields?.supabaseRecordId
    const oldGpir = originalDoc?.sourcePayload?.fields?.gpirPublicationId
    if ((oldId && oldId !== value.fields.supabaseRecordId) || (oldGpir && oldGpir !== value.fields.gpirPublicationId)) throw new APIError('Editorial governed identity cannot be replaced.', 409)
  }
  return { ...data, sourceHash: sha256(stableJson(value)) }
}
