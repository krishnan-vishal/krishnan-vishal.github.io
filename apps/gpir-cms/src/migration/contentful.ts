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

/** Classify by exported editorial metadata, never by a Contentful entry-ID prefix. */
export function classifyContentfulEntries(rawEntries: any[], locale: string) {
  const researchTypes = new Set(['Research Publication', 'Research Chapter', 'Country Intelligence', 'Regional Directory'])
  const alertTypes = new Set(['Global Alert', 'Global Alerts', 'Global Announcement', 'Global Announcements', 'T3 Alert', 'T3 Announcement'])
  const research: ReturnType<typeof normalizeManagementEntry>[] = []
  const alerts: ReturnType<typeof normalizeManagementEntry>[] = []
  const t3Intelligence: ReturnType<typeof normalizeManagementEntry>[] = []
  const otherContentTypes: { entryId: string; contentType: string }[] = []
  const unclassified: { entryId: string; publicationType: unknown; contentType: string; reason: string }[] = []
  for (const raw of rawEntries) {
    const entryId = String(raw?.sys?.id || '')
    const contentType = String(raw?.sys?.contentType?.sys?.id || '')
    if (contentType !== 'gpirPublication') {
      otherContentTypes.push({ entryId, contentType })
      continue
    }
    const entry = normalizeManagementEntry(raw, locale)
    const type = String(entry.fields.publicationType || '').trim()
    if (researchTypes.has(type)) {
      if (typeof entry.fields.canonicalUrlCandidate !== 'string' || !entry.fields.canonicalUrlCandidate.trim()) {
        unclassified.push({ entryId, publicationType: type, contentType, reason: 'Research publication lacks canonical path' })
      } else research.push(entry)
    } else if (alertTypes.has(type)) {
      alerts.push(entry)
    } else if (
      entryId.startsWith('gpir-t3-') &&
      (type === '' || type === 'Market Intelligence') &&
      typeof entry.fields.legacySourceUrl === 'string' &&
      entry.fields.legacySourceUrl.trim() &&
      typeof entry.fields.sourceValidationSummary === 'string' &&
      entry.fields.sourceValidationSummary.trim() &&
      typeof entry.fields.supabaseRecordId === 'string' &&
      entry.fields.supabaseRecordId.trim() &&
      !entry.fields.canonicalUrlCandidate &&
      !entry.fields.gpirPublicationId &&
      !entry.fields.editionLineageId
    ) {
      // Preserved source intelligence; not asserted to be an approved/published Global Alert.
      t3Intelligence.push(entry)
    } else {
      unclassified.push({ entryId, publicationType: type || null, contentType, reason: 'No recognized publicationType in exported metadata' })
    }
  }
  return { research, alerts, t3Intelligence, otherContentTypes, unclassified, counts: {
    total: rawEntries.length, research: research.length, alerts: alerts.length, t3Intelligence: t3Intelligence.length,
    otherContentTypes: otherContentTypes.length, unclassified: unclassified.length,
  } }
}
