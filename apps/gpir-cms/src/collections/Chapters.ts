import type { CollectionConfig } from 'payload'
import { adminOnly, editorialRead, editorialWrite } from '../lib/access'

export const Chapters: CollectionConfig = {
  slug: 'chapters',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'canonicalId', 'publicationState'] },
  access: { create: editorialWrite, read: editorialRead, update: editorialWrite, delete: adminOnly },
  versions: { maxPerDoc: 100 },
  fields: [
    { name: 'canonicalId', type: 'text', required: true, unique: true, index: true },
    { name: 'contentfulSourceId', type: 'text', unique: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'canonicalUrl', type: 'text', required: true, unique: true },
    { name: 'publicationState', type: 'select', required: true, defaultValue: 'DRAFT', options: ['DRAFT', 'CURRENT', 'HISTORICAL', 'ARCHIVED'] },
    { name: 'parentPublicationId', type: 'text', index: true, admin: { description: 'Canonical GPIR identity; resolved to a publication during pass two.' } },
    { name: 'sourceModel', type: 'json' },
  ],
  timestamps: true,
}
