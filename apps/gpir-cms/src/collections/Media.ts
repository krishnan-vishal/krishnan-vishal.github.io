import type { CollectionConfig } from 'payload'
import { adminOnly, editorialRead, editorialWrite } from '../lib/access'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { useAsTitle: 'filename', defaultColumns: ['filename', 'contentfulAssetId', 'sourceSha256'] },
  access: { create: editorialWrite, read: editorialRead, update: editorialWrite, delete: adminOnly },
  upload: {
    disableLocalStorage: true,
    mimeTypes: ['image/*', 'application/pdf'],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'contentfulAssetId', type: 'text', unique: true, index: true },
    { name: 'sourceSha256', type: 'text', unique: true, index: true },
    { name: 'sourceUrl', type: 'text' },
    { name: 'sourceFilename', type: 'text' },
    { name: 'sourceMetadata', type: 'json' },
  ],
  timestamps: true,
}
