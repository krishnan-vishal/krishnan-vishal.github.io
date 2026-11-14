import type { CollectionConfig } from 'payload'
import { adminOnly, editorialRead, editorialWrite } from '../lib/access'

export const Regions: CollectionConfig = {
  slug: 'regions',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'canonicalId', 'status'] },
  access: { create: editorialWrite, read: editorialRead, update: editorialWrite, delete: adminOnly },
  fields: [
    { name: 'canonicalId', type: 'text', required: true, unique: true, index: true },
    { name: 'contentfulSourceId', type: 'text', unique: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'canonicalUrl', type: 'text' },
    { name: 'status', type: 'select', required: true, defaultValue: 'ACTIVE', options: ['ACTIVE', 'BUILDING', 'HISTORICAL'] },
    { name: 'sourceModel', type: 'json', admin: { description: 'Lossless source metadata retained for lineage.' } },
  ],
  timestamps: true,
}
