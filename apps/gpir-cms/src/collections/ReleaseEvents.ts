import type { CollectionConfig } from 'payload'
import { editorialRead, never } from '../lib/access'

export const ReleaseEvents: CollectionConfig = {
  slug: 'release-events',
  admin: { useAsTitle: 'artifactId', defaultColumns: ['artifactId', 'mode', 'recordCount', 'createdAt'] },
  access: { create: never, read: editorialRead, update: never, delete: never },
  fields: [
    { name: 'artifactId', type: 'text', required: true, unique: true, index: true },
    { name: 'mode', type: 'select', required: true, options: ['PREVIEW', 'RELEASE', 'ARCHIVE'] },
    { name: 'recordCount', type: 'number', required: true },
    { name: 'artifactSha256', type: 'text', required: true, unique: true },
    { name: 'signingKeyId', type: 'text', required: true },
    { name: 'actorId', type: 'text', required: true },
    { name: 'summary', type: 'json', required: true },
  ],
  timestamps: true,
}
