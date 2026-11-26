import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import { allNative } from '../release/editorial-source'
import { canonicalPath, GPIR_LINEAGE_ID, GPIR_PUBLICATION_ID, UUID } from '../lib/identity'
import { contentfulToLexical } from '../lib/richText'

type Editorial = {
  publicationId: string; lineageId: string; recordId: string; route: string
  title: string; summary: string; body: string; chapterSlug: string
  category: string; region?: string; country?: string; direction?: string
}
type Intake = { id: string; size: number; mime: string; editorial?: Editorial }

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const identity = (value: string) => value.trim().toUpperCase()
const value = (name: string) => {
  const setting = process.env[name]
  if (!setting) throw new Error(`Missing configuration reference: ${name}`)
  return setting
}

async function request(url: string, init: RequestInit, label: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(60000) })
    if (response.ok) return response
    await response.body?.cancel()
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error(`${label} returned HTTP ${response.status}`)
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt))
  }
  throw new Error('Request retries exhausted')
}

async function contentfulInventory(collection: 'entries' | 'assets') {
  const base = `https://api.contentful.com/spaces/${encodeURIComponent(value('CONTENTFUL_SPACE_ID'))}/environments/${encodeURIComponent(value('CONTENTFUL_ENVIRONMENT'))}`
  const headers = { authorization: `Bearer ${value('CONTENTFUL_MANAGEMENT_TOKEN')}` }
  const items: any[] = []
  for (;;) {
    const page = await (await request(`${base}/${collection}?order=sys.createdAt,sys.id&limit=100&skip=${items.length}`, { headers }, 'Contentful inventory')).json()
    if (!Array.isArray(page.items) || !Number.isInteger(page.total)) throw new Error('Invalid Contentful inventory page')
    items.push(...page.items)
    if (items.length === page.total && new Set(items.map(item => item.sys?.id)).size === items.length) return items
    if (!page.items.length || items.length >= page.total) throw new Error('Contentful inventory changed during pagination')
  }
}

async function main() {
  const inventory: Intake[] = JSON.parse(value('GPIR_DRIVE_INTAKE_MANIFEST'))
  if (!Array.isArray(inventory) || inventory.length !== 92 ||
      new Set(inventory.map(item => item.id)).size !== 92 ||
      inventory.some(item => !/^[\w-]{10,}$/.test(item.id) || !Number.isInteger(item.size) ||
        item.size <= 0 || item.size > 20_000_000 || typeof item.mime !== 'string')) {
    throw new Error('Expected the fixed 92-file Drive inventory with unique IDs, sizes and MIME types')
  }
  for (const name of ['PAYLOAD_DATABASE_URI', 'PAYLOAD_SECRET', 'S3_BUCKET', 'S3_ENDPOINT',
    'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) value(name)
  const oauth = await (await request('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: value('GPIR_DRIVE_CLIENT_ID'),
      client_secret: value('GPIR_DRIVE_CLIENT_SECRET'), refresh_token: value('GPIR_DRIVE_REFRESH_TOKEN'),
    }),
  }, 'Drive OAuth')).json()
  if (typeof oauth.access_token !== 'string') throw new Error('Drive OAuth response omitted its access token')
  const headers = { authorization: `Bearer ${oauth.access_token}` }
  const sources = []
  for (const item of inventory) {
    const response = await request(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`, { headers }, 'Drive acquisition')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length !== item.size) throw new Error('Drive file size changed since inventory capture')
    sources.push({ item, bytes, hash: digest(bytes) })
  }

  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  try {
    const [latest, published, media, entries, assets] = await Promise.all([
      allNative(payload, undefined, true), allNative(payload),
      payload.find({ collection: 'media', pagination: false, depth: 0, overrideAccess: true }),
      contentfulInventory('entries'), contentfulInventory('assets'),
    ])
    const hashes = new Set<string>(media.docs.flatMap(doc => doc.sourceSha256 ? [doc.sourceSha256] : []))
    const candidateSizes = new Set(inventory.map(item => item.size))
    const downloadedAssets = new Set<string>()
    for (const asset of assets) {
      for (const file of Object.values(asset.fields?.file || {}) as any[]) {
        if (!file.url || (file.details?.size != null && !candidateSizes.has(file.details.size))) continue
        const url = new URL(file.url.startsWith('//') ? `https:${file.url}` : file.url)
        if (url.protocol !== 'https:' || !['images.ctfassets.net', 'assets.ctfassets.net', 'downloads.ctfassets.net', 'files.ctfassets.net'].includes(url.host)) {
          throw new Error('Contentful comparison asset is outside approved delivery hosts')
        }
        if (downloadedAssets.has(url.href)) continue
        downloadedAssets.add(url.href)
        hashes.add(digest(Buffer.from(await (await request(url.href, {}, 'Contentful asset comparison')).arrayBuffer())))
      }
    }
    const registry = JSON.parse(await readFile('../../assets/data/dashboard-metadata.json', 'utf8'))
    for (const dashboard of registry.records) {
      if (!dashboard.imagePath || !/^assets\/[\w./ -]+$/.test(dashboard.imagePath) || dashboard.imagePath.includes('..')) continue
      const image = await readFile(`../../${dashboard.imagePath}`).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      if (image) hashes.add(digest(image))
    }
    const known = new Map<string, Set<string>>()
    const remember = (key: string, raw: unknown) => {
      if (typeof raw !== 'string' || !raw.trim()) return
      if (!known.has(key)) known.set(key, new Set())
      known.get(key)!.add(identity(raw))
    }
    const fields = ['gpirPublicationId', 'supabaseRecordId', 'canonicalUrlCandidate', 'slug', 'publicationTitle'] as const
    for (const doc of [...latest, ...published]) {
      for (const field of fields) remember(field, doc[field])
      remember('sourceHash', doc.sourceHash)
    }
    for (const entry of entries) {
      for (const field of fields) {
        for (const localized of Object.values(entry.fields?.[field] || {})) remember(field, localized)
      }
    }
    const counts = { acquired: sources.length, duplicateBytes: 0, existingIdentity: 0, held: 0, imported: 0 }
    sources.sort((a, b) => Number(Boolean(b.item.editorial)) - Number(Boolean(a.item.editorial)))
    const seen = new Set<string>()
    for (const { item, bytes, hash } of sources) {
      if (seen.has(hash) || known.get('sourceHash')?.has(identity(hash))) {
        counts.duplicateBytes++
        continue
      }
      seen.add(hash)
      const editorial = item.editorial
      // A media row without a corresponding draft can be a checkpoint from an interrupted write.
      const reusable = media.docs.find(doc => doc.sourceSha256 === hash &&
        (doc.sourceMetadata as { driveId?: string } | null)?.driveId === item.id)
      if (hashes.has(hash) && !reusable) {
        counts.duplicateBytes++
        continue
      }
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }
      const ext = extensions[item.mime]
      if (!editorial || !ext) {
        counts.held++
        continue
      }
      const route = canonicalPath(editorial.route)
      const slug = route.replace(/^\//, '').replace(/\/$/, '')
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
          !GPIR_PUBLICATION_ID.test(editorial.publicationId) || !GPIR_LINEAGE_ID.test(editorial.lineageId) ||
          !UUID.test(editorial.recordId) || ![editorial.title, editorial.summary, editorial.body, editorial.category]
            .every(text => typeof text === 'string' && text.trim())) {
        throw new Error('Invalid editorial identity, canonical route or source text')
      }
      const keys = [editorial.publicationId, editorial.recordId, route, slug, editorial.title]
      if (fields.some((field, index) => known.get(field)?.has(identity(keys[index])))) {
        counts.existingIdentity++
        continue
      }
      const chapter = await payload.find({ collection: 'chapters', where: { slug: { equals: editorial.chapterSlug } },
        limit: 2, depth: 0, overrideAccess: true })
      if (chapter.totalDocs !== 1) throw new Error('Editorial mapping must reference one existing GPIR chapter')
      const asset = reusable || await payload.create({ collection: 'media', overrideAccess: true,
        file: { name: `${hash}.${ext}`, data: bytes, mimetype: item.mime, size: bytes.length },
        data: { alt: editorial.title, sourceSha256: hash, sourceMetadata: { driveId: item.id } } })
      await payload.create({ collection: 'research-publications', draft: true, overrideAccess: true, data: {
        _status: 'draft', validationStatus: 'WARN', accessClass: 'ENTITLED', migrationStatus: 'IMPORTED',
        publicationStatus: 'CURRENT', publicationType: 'Research Publication', slug,
        publicationTitle: editorial.title, gpirPublicationId: editorial.publicationId,
        editionLineageId: editorial.lineageId, supabaseRecordId: editorial.recordId,
        canonicalUrlCandidate: route, canonicalUrl: `https://fintechoisis.com${route}`,
        executiveSummary: editorial.summary,
        editorialBody: contentfulToLexical({ nodeType: 'document', data: {}, content: editorial.body.split(/\n+/).filter(Boolean)
          .map(text => ({ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value: text, marks: [], data: {} }] })) }),
        chapters: [chapter.docs[0].id], dashboardAsset: asset.id,
        useCasePaymentCategory: editorial.category, regionLabel: editorial.region,
        countryMarket: editorial.country, directionScope: editorial.direction,
        sourceHash: hash, sourceLineage: { source: 'google-drive', fileId: item.id },
        sourceValidationSummary: 'Drive bytes were reconciled against existing CMS records. Editorial and release validation are pending.',
      } })
      fields.forEach((field, index) => remember(field, keys[index]))
      counts.imported++
    }
    console.log(JSON.stringify(counts))
  } finally {
    await payload.destroy()
  }
}
main().catch(error => {
  // Provider and database errors can contain private source material.
  const message = String(error?.message || '')
  console.error(/^(Missing configuration reference: [A-Z_]+|(?:Drive OAuth|Drive acquisition|Contentful inventory|Contentful asset comparison) returned HTTP \d{3})$/.test(message)
    ? message : 'Drive editorial intake failed. Existing draft and media identities can be reused on retry.')
  process.exitCode = 1
})
