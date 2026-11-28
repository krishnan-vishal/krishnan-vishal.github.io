import type { Endpoint } from 'payload'
import { createHash } from 'node:crypto'
import { stableJson } from './release'
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
      const inventory: any[] = []
      for (let page = 1; ; page++) {
        const result = await req.payload.find({ collection: 'chapters', page, limit: 100, depth: 0, req, overrideAccess: true, sort: 'id' })
        inventory.push(...result.docs)
        if (!result.hasNextPage) break
        if (page >= 1000) return Response.json({ error: 'CHAPTER_INVENTORY_INCOMPLETE' }, { status: 409 })
      }
      const canonicalPath = (value: unknown) => {
        if (typeof value !== 'string') return ''
        try {
          const url = new URL(value, 'https://fintechoisis.com')
          if (url.origin !== 'https://fintechoisis.com') return ''
          return url.pathname.replace(/\/$/, '')
        } catch { return '' }
      }
      const snapshot = 'f2540980b555942c5807d56bc8370ee2ce48d13dd689bd91a29ca011e84fcfea'
      const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
      const lookup = async (key: string) => {
        const result = await req.payload.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, req, overrideAccess: true })
        const record = result.docs[0]
        if (result.docs.length !== 1 || hash(stableJson(record.sourcePayload)) !== record.sourceHash) throw Error('MANAGED_RECORD_INTEGRITY_FAILED')
        return record.sourcePayload as any
      }
      const manifest = await lookup('m41:manifest:' + snapshot)
      const { snapshot: manifestId, ...manifestBody } = manifest
      if (manifestId !== snapshot || manifest.schema !== 'gpir-managed-site/v1' || hash(stableJson(manifestBody)) !== snapshot)
        return Response.json({ error: 'MANAGED_SNAPSHOT_INTEGRITY_FAILED' }, { status: 409 })
      const managed: any[] = []
      const plan: any[] = [], missing: string[] = []
      for (const [category, slugs] of Object.entries(groups)) for (const slug of slugs) {
        const expectedPath = '/pages/chapters/' + slug + '.html'
        const candidates = inventory.filter(doc => doc.slug === slug || doc.canonicalId === slug || canonicalPath(doc.canonicalUrl) === expectedPath)
        if (candidates.length > 1) return Response.json({ error: 'AMBIGUOUS_CHAPTER', slug }, { status: 409 })
        const doc = candidates[0]
        if (doc && doc.canonicalUrl && canonicalPath(doc.canonicalUrl) !== expectedPath) return Response.json({ error: 'CHAPTER_CANONICAL_URL_MISMATCH', slug }, { status: 409 })
        if (!doc) {
          const files = manifest.files.filter((file: any) => file.path === expectedPath.slice(1))
          if (files.length === 1 && /^[a-f0-9]{64}$/.test(files[0].sha256)) {
            const file = files[0]
            const blob = await lookup('m41:blob:' + file.sha256)
            if (blob.kind !== 'site-bytes' || blob.encoding !== 'base64' || typeof blob.body !== 'string')
              return Response.json({ error: 'MANAGED_CHAPTER_BLOB_INVALID', slug }, { status: 409 })
            const bytes = Buffer.from(blob.body, 'base64')
            if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes)
              return Response.json({ error: 'MANAGED_CHAPTER_HASH_MISMATCH', slug }, { status: 409 })
            if (slug !== 'adult-content-payments') {
              const reference = { slug, category, canonicalUrl: 'https://fintechoisis.com' + expectedPath, sha256: file.sha256 }
              managed.push(reference)
              plan.push({ slug, category, reference, sourceModel: { managedSnapshot: snapshot, managedPath: file.path, managedSha256: file.sha256, moneyMovementMarkets: { category, homepageResearchDesk: false } } })
              continue
            }
          }
          missing.push(slug); continue
        }
        const previous = doc.sourceModel
        if (previous != null && (typeof previous !== 'object' || Array.isArray(previous))) return Response.json({ error: 'INVALID_METADATA', slug }, { status: 409 })
        plan.push({ id: doc.id, slug, category, sourceModel: { ...(previous || {}), moneyMovementMarkets: { category, homepageResearchDesk: false } } })
      }
      const matched = plan.map(({ slug, category }) => ({ slug, category }))
      if (missing.some(slug => slug !== 'adult-content-payments') || plan.length < 10) return Response.json({ matched, missing, managed, error: 'UNRESOLVED_EXISTING_CHAPTERS' }, { status: 409 })
      if (!input.apply) return Response.json({ matched, missing, managed, status: 'PAYLOAD_CLASSIFICATION_DRY_RUN_VERIFIED' })
      // Only fixed server-owned slugs and metadata are writable by this action.
      for (const item of plan) {
        if (item.reference) {
          const existing = await req.payload.find({ collection: 'chapters', where: { or: [{ slug: { equals: item.slug } }, { canonicalId: { equals: item.slug } }, { canonicalUrl: { equals: item.reference.canonicalUrl } }] }, limit: 2, depth: 0, req, overrideAccess: true })
          if (existing.totalDocs !== 0) return Response.json({ error: 'CHAPTER_INVENTORY_CHANGED', slug: item.slug }, { status: 409 })
          const created = await req.payload.create({ collection: 'chapters', data: { canonicalId: item.slug, slug: item.slug, title: item.slug.split('-').map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '), canonicalUrl: item.reference.canonicalUrl, publicationState: 'DRAFT', sourceModel: item.sourceModel }, req, overrideAccess: true })
          item.id = created.id
        } else {
          await req.payload.update({ collection: 'chapters', id: item.id, data: { sourceModel: item.sourceModel }, req, overrideAccess: true })
        }
        const verified = await req.payload.findByID({ collection: 'chapters', id: item.id, depth: 0, req, overrideAccess: false })
        const actual = verified.sourceModel as any
        if (actual?.moneyMovementMarkets?.category !== item.category || actual.moneyMovementMarkets.homepageResearchDesk !== false) throw new Error('Chapter read-back failed')
      }
      return Response.json({ matched, missing, managed, status: 'PAYLOAD_CLASSIFICATION_VERIFIED' })
    }
    if (!['published', 'publication', 'export', 'identity-inventory', 'entry', 'search', 'create', 'update'].includes(action)) return Response.json({ error: 'INVALID_ACTION' }, { status: 400 })
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
    if (action === 'identity-inventory') {
      // The governed Drive import needs only duplicate identities. Never run the
      // heavyweight full backup/export or enumerate reference/asset records.
      const records: { sourceHash: string | null; publicationTitle: string | null; canonicalUrlCandidate: string | null }[] = []
      const add = (doc: any) => {
        if (!doc || typeof doc !== 'object') return
        const sourceHash = typeof doc.sourceHash === 'string' ? doc.sourceHash : null
        const publicationTitle = typeof doc.publicationTitle === 'string' ? doc.publicationTitle : null
        const canonicalUrlCandidate = typeof doc.canonicalUrlCandidate === 'string' ? doc.canonicalUrlCandidate : null
        if (sourceHash || publicationTitle || canonicalUrlCandidate) records.push({ sourceHash, publicationTitle, canonicalUrlCandidate })
      }
      for (const doc of values) add(doc.sourcePayload?.fields)
      // Include both published and latest native versions to preserve the
      // existing conservative duplicate protection on drafts and published work.
      for (const draft of [false, true]) {
        for (let page = 1; page <= 100; page++) {
          const result = await client.find({
            collection: 'research-publications', page, limit: 100, depth: 0, draft,
            req, overrideAccess: true, sort: 'id',
          })
          for (const doc of result.docs) add(doc)
          if (!result.hasNextPage) break
          if (page === 100) return Response.json({ error: 'IDENTITY_INVENTORY_INCOMPLETE' }, { status: 503 })
        }
      }
      return Response.json({ records }, { headers: { 'cache-control': 'no-store' } })
    }
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
