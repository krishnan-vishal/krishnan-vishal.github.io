import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { adminOnly, editorialWrite, releaseRead, reviewerFieldWrite, roleOf } from '../lib/access'
import { assertImmutableIdentity, canonicalPath, GPIR_LINEAGE_ID, GPIR_PUBLICATION_ID, UUID } from '../lib/identity'

const enforceGovernance: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  const next = { ...data }
  if (next.canonicalUrlCandidate) {
    next.canonicalUrlCandidate = canonicalPath(next.canonicalUrlCandidate)
    next.canonicalUrl = `https://fintechoisis.com${next.canonicalUrlCandidate}`
  }
  if (operation === 'update') assertImmutableIdentity(next, originalDoc as Record<string, unknown>)
  if (next._status === 'published') {
    if (!['admin', 'reviewer'].includes(roleOf(req.user) || '')) {
      throw new APIError('Only a reviewer can approve a Payload publication version.', 403)
    }
    if (next.validationStatus !== 'PASS') {
      throw new APIError('Only PASS records can be approved. This does not release them publicly.', 409)
    }
  }
  return next
}

export const ResearchPublications: CollectionConfig = {
  slug: 'research-publications',
  admin: {
    useAsTitle: 'publicationTitle',
    defaultColumns: ['publicationTitle', 'gpirPublicationId', 'publicationStatus', 'validationStatus', '_status'],
    description: 'Payload approval is editorial only. Public release requires the authorized release service and Supabase decision.',
  },
  access: { create: editorialWrite, read: releaseRead, update: editorialWrite, delete: adminOnly, readVersions: releaseRead },
  versions: { maxPerDoc: 100, drafts: { validate: true } },
  hooks: { beforeChange: [enforceGovernance] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Identity and lifecycle',
          fields: [
            { name: 'gpirPublicationId', type: 'text', required: true, unique: true, index: true, validate: (value: unknown) => GPIR_PUBLICATION_ID.test(String(value || '')) || 'Invalid GPIR publication identifier.' },
            { name: 'editionLineageId', type: 'text', required: true, index: true, validate: (value: unknown) => GPIR_LINEAGE_ID.test(String(value || '')) || 'Invalid GPIR edition lineage identifier.' },
            { name: 'supabaseRecordId', type: 'text', required: true, unique: true, index: true, validate: (value: unknown) => UUID.test(String(value || '')) || 'Invalid Supabase identity UUID.' },
            { name: 'contentfulEntryId', type: 'text', unique: true, index: true, admin: { description: 'Preserved source identifier; never reused for a different publication.' } },
            { name: 'publicationStatus', type: 'select', required: true, defaultValue: 'CURRENT', options: ['CURRENT', 'HISTORICAL', 'ARCHIVED'], access: { update: reviewerFieldWrite } },
            { name: 'accessClass', type: 'select', required: true, options: ['PUBLIC', 'AUTHENTICATED', 'ENTITLED'], admin: { description: 'Mirrors Supabase for review only. Supabase is authoritative at release/read time.' } },
            { name: 'validationStatus', type: 'select', required: true, defaultValue: 'WARN', options: ['PASS', 'WARN', 'FAIL'], access: { update: reviewerFieldWrite } },
            { name: 'migrationStatus', type: 'select', required: true, defaultValue: 'IMPORTED', options: ['IMPORTED', 'RECONCILED', 'EDITORIAL_UPDATE', 'MIGRATION_BLOCKED'] },
          ],
        },
        {
          label: 'Publication',
          fields: [
            { name: 'publicationTitle', type: 'text', required: true },
            { name: 'slug', type: 'text', required: true, unique: true, index: true },
            { name: 'publicationType', type: 'select', required: true, options: ['Research Publication', 'Research Chapter', 'Country Intelligence', 'Regional Directory'] },
            { name: 'canonicalUrlCandidate', type: 'text', required: true, unique: true, index: true },
            { name: 'canonicalUrl', type: 'text', required: true, unique: true, admin: { readOnly: true } },
            { name: 'publicationDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
            { name: 'dataCutOffDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
            { name: 'editionLabel', type: 'text' },
            { name: 'executiveSummary', type: 'textarea', required: true },
            { name: 'editorialBody', type: 'richText', required: true },
            { name: 'contentfulSourceBody', type: 'json', admin: { hidden: true }, access: { update: reviewerFieldWrite } },
          ],
        },
        {
          label: 'Classification',
          fields: [
            { name: 'regionLabel', type: 'text' },
            { name: 'countryMarket', type: 'text' },
            { name: 'directionScope', type: 'text' },
            { name: 'useCasePaymentCategory', type: 'text' },
            { name: 'regions', type: 'relationship', relationTo: 'regions', hasMany: true },
            { name: 'countries', type: 'relationship', relationTo: 'countries', hasMany: true },
            { name: 'chapters', type: 'relationship', relationTo: 'chapters', hasMany: true },
            { name: 'dashboardAsset', type: 'upload', relationTo: 'media' },
            { name: 'editorialMetadata', type: 'relationship', relationTo: 'editorial-metadata' },
          ],
        },
        {
          label: 'Provenance',
          fields: [
            { name: 'legacySourceUrl', type: 'text' },
            { name: 'sourceValidationSummary', type: 'textarea', required: true },
            { name: 'sourceHash', type: 'text', index: true },
            { name: 'sourceLineage', type: 'json', required: true, defaultValue: {} },
            { name: 'contentfulSourceRecord', type: 'json', admin: { hidden: true } },
          ],
        },
      ],
    },
  ],
  timestamps: true,
}
