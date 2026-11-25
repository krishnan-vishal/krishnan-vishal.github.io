import type { Endpoint } from 'payload'
import { allNative, nativeBackupRecords, referenceBackupRecords, resolvedEditorialRecords } from './editorial-source'
import { roleOf } from '../lib/access'

export const editorialEndpoint: Endpoint = {
  path: '/release/editorial-entries', method: 'post',
  handler: async req => {
    if (!['admin', 'release-service'].includes(roleOf(req.user) || '')) return Response.json({ error: 'SERVICE_ROLE_REQUIRED' }, { status: 403 })
    let input: any
    try { input = await req.json!() } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }) }
    const action = input.action || 'published'
    if (action === 'classify-money-movement-markets') {
      if (typeof input.apply !== 'boolean') return Response.json({ error: 'INVALID_MODE' }, { status: 400 })
      const groups = {
        'Global B2B Payments (SME & Trade)': ['trade-payments', 'education-payments'],
        'Global B2C & C2B Payments': ['marketplace-ecommerce', 'gig-economy-creator-payments', 'healthcare-payments'],
        'Bill Payments': ['bill-payments'],
        'High-Risk Payments': ['gaming-payments', 'betting-payments', 'adult-content-payments'],
        'Regional Structure': ['government-payments', 'travel-payments'],
      }
      const plan: any[] = [], missing: string[] = []
      for (const [category, slugs] of Object.entries(groups)) for (const slug of slugs) {
        const result = await req.payload.find({ collection: 'chapters', where: { slug: { equals: slug } }, limit: 2, depth: 0, req, overrideAccess: false })
        if (result.totalDocs > 1) return Response.json({ error: 'AMBIGUOUS_CHAPTER', slug }, { status: 409 })
        const doc = result.docs[0]
        if (!doc) { missing.push(slug); continue }
        const previous = doc.sourceModel
        if (previous != null && (typeof previous !== 'object' || Array.isArray(previous))) return Response.json({ error: 'INVALID_METADATA', slug }, { status: 409 })
        plan.push({ id: doc.id, slug, category, sourceModel: { ...(previous || {}), moneyMovementMarkets: { category, homepageResearchDesk: false } } })
      }
      const matched = plan.map(({ slug, category }) => ({ slug, category }))
      if (missing.length) return Response.json({ matched, missing, error: 'UNRESOLVED_CHAPTERS' }, { status: 409 })
      if (!input.apply) return Response.json({ matched, missing, status: 'PAYLOAD_CLASSIFICATION_DRY_RUN_VERIFIED' })
      // Only fixed server-owned slugs and metadata are writable by this action.
      for (const item of plan) {
        await req.payload.update({ collection: 'chapters', id: item.id, data: { sourceModel: item.sourceModel }, req, overrideAccess: true })
        const verified = await req.payload.findByID({ collection: 'chapters', id: item.id, depth: 0, req, overrideAccess: false })
        const actual = verified.sourceModel as any
        if (actual?.moneyMovementMarkets?.category !== item.category || actual.moneyMovementMarkets.homepageResearchDesk !== false) throw new Error('Chapter read-back failed')
      }
      return Response.json({ matched, missing, status: 'PAYLOAD_CLASSIFICATION_VERIFIED' })
    }
    if (!['published', 'publication', 'export', 'entry', 'search', 'create', 'update'].includes(action)) return Response.json({ error: 'INVALID_ACTION' }, { status: 400 })
    const client: any = req.payload
    const namespace = { sourceRecordKey: { contains: 'm41:editorial:' } }
    // Payload JSON fields are not portable nested-query targets in SQL adapters.
    // Query the indexed namespace and filter the small paginated estate in memory.
    const docs: any[] = []
    let page = 1
    for (;;) {
      const result = await client.find({ collection: 'editorial-metadata', where: namespace, limit: 100, page, depth: 0, req, overrideAccess: false, sort: 'sourceRecordKey' })
      docs.push(...result.docs)
      if (!result.hasNextPage) break
      if (++page > 100) return Response.json({ error: 'EDITORIAL_LIMIT_EXCEEDED' }, { status: 503 })
    }
    const values = docs.filter(doc => doc.sourcePayload?.kind === 'editorial-entry')
    if (['published', 'publication', 'export'].includes(action)) {
      const native = await allNative(client, req)
      const adoption: any = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { contains: 'm41:adopted:' } }, limit: 10000, depth: 0, req, overrideAccess: false })
      if (adoption.hasNextPage) throw new Error('Native adoption inventory incomplete.')
      if (action === 'export') return Response.json({ records: [...values, ...adoption.docs].map(doc => ({ sourceRecordKey: doc.sourceRecordKey, sourceHash: doc.sourceHash, sourcePayload: doc.sourcePayload })).concat(nativeBackupRecords(await allNative(client, req, true), native), await referenceBackupRecords(client, req)) })
      const items = resolvedEditorialRecords(values, native, new Set(adoption.docs.map((doc: any) => doc.sourcePayload.entryId)))
      if (action === 'published') return Response.json({ items })
      if (typeof input.publicationId !== 'string' || typeof input.supabaseRecordId !== 'string') return Response.json({ error: 'INVALID_IDENTITY' }, { status: 400 })
      const matched = items.filter(item => item.fields.gpirPublicationId === input.publicationId)
      if (matched.some(item => item.fields.supabaseRecordId !== input.supabaseRecordId)) return Response.json({ error: 'CONTENT_IDENTITY_MISMATCH' }, { status: 409 })
      const assets = matched.flatMap(item => item.includes?.Asset || [])
      return Response.json({ items: matched.map(item => ({ sys: { id: item.entryId }, fields: item.fields })), includes: { Asset: assets } })
    }
    const own = values.find(doc => doc.sourcePayload.entryId === input.id)
    const legacy = (doc: any) => doc ? { sys: { id: doc.sourcePayload.entryId, version: doc.sourcePayload.sourceVersion || 1,
      ...(doc.sourcePayload.published ? { publishedVersion: doc.sourcePayload.sourceVersion || 1 } : {}),
      ...(doc.sourcePayload.archived ? { archivedVersion: doc.sourcePayload.sourceVersion || 1 } : {}) },
      fields: Object.fromEntries(Object.entries(doc.sourcePayload.fields).map(([key, value]) => [key, { 'en-US': value }])) } : null
    if (action === 'entry') return Response.json({ entry: legacy(own) })
    if (action === 'search') {
      if (!['supabaseRecordId', 'legacySourceUrl'].includes(input.field)) return Response.json({ error: 'INVALID_FIELD' }, { status: 400 })
      return Response.json({ items: values.filter(doc => doc.sourcePayload.fields[input.field] === input.value).map(legacy) })
    }
    // This machine route can only create/refresh untouched DRAFTS. A machine
    // cannot set PASS, a governed publication ID, or any published version.
    if (!/^gpir-t3-[a-f0-9-]{36}$/i.test(input.id || '')) return Response.json({ error: 'INVALID_DRAFT_ID' }, { status: 400 })
    const allowed = new Set(['supabaseRecordId', 'legacySourceUrl', 'publicationTitle', 'publicationDate', 'sourceValidationSummary', 'region', 'countryMarket'])
    const fields = Object.fromEntries(Object.entries(input.fields || {}).map(([key, value]: [string, any]) => [key, value?.['en-US']]))
    if (!Object.keys(fields).length || Object.keys(fields).some(key => !allowed.has(key)) || input.id !== `gpir-t3-${fields.supabaseRecordId}`) return Response.json({ error: 'UNSAFE_DRAFT_FIELDS' }, { status: 400 })
    if (own && (action === 'create' || own.sourcePayload.published || own.sourcePayload.archived || own.sourcePayload.sourceVersion !== 1)) return Response.json({ entry: { conflict: true } })
    const data = { sourceRecordKey: `m41:editorial:${input.id}`, sourceValidationSummary: String(fields.sourceValidationSummary || 'Draft pending editorial review.'),
      sourcePayload: { kind: 'editorial-entry', entryId: input.id, contentType: 'gpirPublication', fields, published: false, sourceVersion: own ? 2 : 1 } }
    // Explicit override is restricted to these bounded draft fields. Approval hook
    // still runs and role is retained in the request; publishing is impossible here.
    const saved = own ? await client.update({ collection: 'editorial-metadata', id: own.id, data, req, overrideAccess: true }) : await client.create({ collection: 'editorial-metadata', data, req, overrideAccess: true })
    return Response.json({ entry: legacy(saved) })
  },
}
