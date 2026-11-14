import { createHash, createHmac } from 'node:crypto'
import { lexicalToContentful } from '../lib/richText'

export type ReleaseDecision = {
  identity: string
  supabaseRecordId: string
  route: string
  accessClass: 'PUBLIC' | 'AUTHENTICATED' | 'ENTITLED'
  releaseEligible: boolean
  reviewState: string | null
  policyStatus: string | null
}

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stable(value))
}

export function signArtifact(value: unknown, secret: string) {
  const body = stableJson(value)
  return {
    sha256: createHash('sha256').update(body).digest('hex'),
    signature: createHmac('sha256', secret).update(body).digest('hex'),
  }
}

export async function releaseDecision(publication: any, env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<ReleaseDecision> {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = String(env.GPIR_SUPABASE_SECRET_KEY || '')
  if (!/^https:\/\//.test(url) || !key) throw new Error('Supabase release authority is not configured.')
  const headers = new Headers({ 'content-type': 'application/json' })
  headers.set('authorization', `Bearer ${key}`)
  headers.set('apikey', key)
  const response = await fetchImpl(`${url}/rest/v1/rpc/gpir_publication_release_decision`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_publication_id: publication.gpirPublicationId, p_supabase_record_id: publication.supabaseRecordId }),
  })
  if (!response.ok) throw new Error(`Supabase release authority unavailable (HTTP ${response.status}).`)
  const rows = await response.json() as any[]
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Ambiguous release authority for ${publication.gpirPublicationId}.`)
  const decision = rows[0]
  if (!['PUBLIC', 'AUTHENTICATED', 'ENTITLED'].includes(decision.access_class)) throw new Error('Invalid Supabase access classification.')
  if (publication.accessClass && publication.accessClass !== decision.access_class) throw new Error(`Access classification mismatch for ${publication.gpirPublicationId}.`)
  return {
    identity: publication.gpirPublicationId,
    supabaseRecordId: publication.supabaseRecordId,
    route: publication.canonicalUrlCandidate,
    accessClass: decision.access_class,
    releaseEligible: decision.release_eligible === true,
    reviewState: decision.review_state ?? null,
    policyStatus: decision.policy_status ?? null,
  }
}

export function legacyRecord(publication: any) {
  return {
    entryId: publication.contentfulEntryId || String(publication.id),
    fields: {
      gpirPublicationId: publication.gpirPublicationId,
      editionLineageId: publication.editionLineageId,
      supabaseRecordId: publication.supabaseRecordId,
      publicationTitle: publication.publicationTitle,
      slug: publication.slug,
      publicationType: publication.publicationType,
      publicationStatus: publication.publicationStatus,
      canonicalUrlCandidate: publication.canonicalUrlCandidate,
      publicationDate: publication.publicationDate || null,
      dataCutOffDate: publication.dataCutOffDate || null,
      editionLabel: publication.editionLabel || null,
      region: publication.regionLabel || null,
      countryMarket: publication.countryMarket || null,
      directionScope: publication.directionScope || null,
      useCasePaymentCategory: publication.useCasePaymentCategory || null,
      executiveSummary: publication.executiveSummary,
      editorialBody: lexicalToContentful(publication.editorialBody),
      sourceValidationSummary: publication.sourceValidationSummary,
      legacySourceUrl: publication.legacySourceUrl || null,
      migrationStatus: publication.migrationStatus,
      validationStatus: publication.validationStatus,
    },
    presentation: { accessClass: publication.accessClass },
  }
}

export function buildReleaseBundle(publications: any[], decisions: ReleaseDecision[], generatedAt: string) {
  // Never let an ineligible, unmatched, or migration-blocked publication enter a
  // delivery artifact. A decision is valid only for the exact GPIR/Supabase pair.
  if (publications.length !== decisions.length) throw new Error('Release decision count mismatch.')
  const seen = new Set<string>()
  const eligible = publications.filter((publication, index) => {
    const decision = decisions[index]
    if (!decision || decision.identity !== publication.gpirPublicationId ||
        decision.supabaseRecordId !== publication.supabaseRecordId ||
        decision.route !== publication.canonicalUrlCandidate) {
      throw new Error('Release decision identity mismatch.')
    }
    if (seen.has(decision.identity)) throw new Error('Duplicate release decision identity.')
    seen.add(decision.identity)
    return decision.releaseEligible === true &&
      publication.migrationStatus !== 'MIGRATION_BLOCKED' &&
      publication.validationStatus === 'PASS' &&
      publication._status === 'published'
  })
  const records = eligible.map(legacyRecord).sort((a, b) => a.entryId.localeCompare(b.entryId, 'en'))
  return {
    artifact: {
      schemaVersion: '1.0.0',
      source: { mode: 'delivery', host: 'payload', contentType: 'gpirPublication', authority: 'payload-editorial' },
      generatedAt,
      recordCount: records.length,
      records,
    },
    decisions: { schemaVersion: '1.0.0', generatedAt, decisions },
  }
}
