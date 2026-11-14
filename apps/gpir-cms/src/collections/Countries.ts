import type { CollectionConfig } from 'payload'
import { adminOnly, editorialRead, editorialWrite } from '../lib/access'

export const Countries: CollectionConfig = {
  slug: 'countries',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'iso2', 'region', 'status'] },
  access: { create: editorialWrite, read: editorialRead, update: editorialWrite, delete: adminOnly },
  fields: [
    { name: 'canonicalId', type: 'text', required: true, unique: true, index: true },
    { name: 'contentfulSourceId', type: 'text', unique: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'iso2', type: 'text', unique: true, index: true },
    { name: 'iso3', type: 'text', unique: true, index: true },
    { name: 'region', type: 'relationship', relationTo: 'regions', required: true, index: true },
    { name: 'canonicalUrl', type: 'text' },
    { name: 'status', type: 'select', required: true, defaultValue: 'COMING_SOON', options: ['ACTIVE', 'BUILDING', 'COMING_SOON', 'HISTORICAL'] },
    { name: 'sourceModel', type: 'json', admin: { description: 'Lossless repository/Contentful source metadata.' } },
  ],
  timestamps: true,
}
