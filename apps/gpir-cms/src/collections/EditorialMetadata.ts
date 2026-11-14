import type { CollectionConfig } from 'payload'
import { adminOnly, editorialRead, editorialWrite } from '../lib/access'

export const EditorialMetadata: CollectionConfig = {
  slug: 'editorial-metadata',
  admin: { useAsTitle: 'sourceRecordKey' },
  access: { create: editorialWrite, read: editorialRead, update: editorialWrite, delete: adminOnly },
  versions: { maxPerDoc: 100 },
  fields: [
    { name: 'sourceRecordKey', type: 'text', required: true, unique: true, index: true },
    { name: 'contentfulEntryId', type: 'text', unique: true, index: true },
    { name: 'sourceValidationSummary', type: 'textarea', required: true },
    { name: 'legacySourceUrl', type: 'text' },
    { name: 'sourceHash', type: 'text', index: true },
    { name: 'retrievedAt', type: 'date' },
    { name: 'migrationStatus', type: 'text' },
    { name: 'migrationBatchId', type: 'text', index: true },
    { name: 'sourcePayload', type: 'json', admin: { description: 'Original source fields retained for reconciliation.' } },
  ],
  timestamps: true,
}
