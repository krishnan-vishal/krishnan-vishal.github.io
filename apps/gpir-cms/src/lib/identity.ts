import { APIError } from 'payload'

export const GPIR_PUBLICATION_ID = /^VK-GPIR-[A-Z0-9]+(?:-[A-Z0-9]+)+$/
export const GPIR_LINEAGE_ID = /^VK-GPIR-L-\d{12}-\d$/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function canonicalPath(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A canonical path is required.')
  let route = value.trim()
  if (!route.startsWith('/') || route.startsWith('//') || /[?#]/.test(route) || route.includes('..')) {
    throw new Error(`Invalid canonical path: ${route || '<empty>'}`)
  }
  route = route.replace(/\/{2,}/g, '/')
  if (!route.endsWith('/')) route += '/'
  if (route === '/') throw new Error('A publication cannot claim the homepage route.')
  return route
}

export function assertImmutableIdentity(data: Record<string, unknown>, original: Record<string, unknown> | undefined) {
  if (!original) return
  for (const field of ['gpirPublicationId', 'editionLineageId', 'supabaseRecordId', 'contentfulEntryId']) {
    if (original[field] != null && data[field] != null && data[field] !== original[field]) {
      throw new APIError(`${field} is immutable after assignment. Use a forward correction and lineage record.`, 409)
    }
  }
}

export type IdentityCandidate = {
  id?: string | number
  gpirPublicationId?: string | null
  supabaseRecordId?: string | null
  contentfulEntryId?: string | null
  canonicalUrlCandidate?: string | null
}

export function identityConflicts(candidate: IdentityCandidate, existing: IdentityCandidate[]): string[] {
  const fields: (keyof IdentityCandidate)[] = [
    'gpirPublicationId', 'supabaseRecordId', 'contentfulEntryId', 'canonicalUrlCandidate',
  ]
  return existing.flatMap((record) => fields
    .filter((field) => candidate[field] != null && record[field] === candidate[field])
    .map((field) => `${String(field)}=${String(candidate[field])} already belongs to ${String(record.id)}`))
}
