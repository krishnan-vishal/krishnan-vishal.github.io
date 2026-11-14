import { createHash } from 'node:crypto'

export function localeValue<T = any>(value: unknown, locale: string): T | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return value as T
  const record = value as Record<string, T>
  if (locale in record) return record[locale]
  const first = Object.values(record)[0]
  return first == null ? null : first
}

export function slugify(value: unknown): string {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function sha256(value: unknown): string {
  const body = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)
  return createHash('sha256').update(body).digest('hex')
}

export function contentfulLinkId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const id = (value as { sys?: { id?: unknown } }).sys?.id
  return typeof id === 'string' && id ? id : null
}

export function normalizeManagementEntry(entry: any, locale: string) {
  const fields = Object.fromEntries(Object.entries(entry?.fields || {}).map(([key, value]) => [key, localeValue(value, locale)]))
  return { entryId: entry?.sys?.id, fields, sys: entry?.sys }
}

export function contentfulErrorMessage(status: number, body: any): string {
  const id = body?.sys?.id || body?.details?.errors?.[0]?.name || 'UNKNOWN'
  if (id === 'OrganizationAccessGrantRequired') {
    return 'Contentful token lacks the required organization access grant. Create or grant a management token for this organization and retry.'
  }
  return `Contentful Management API failed with HTTP ${status} (${id}).`
}
