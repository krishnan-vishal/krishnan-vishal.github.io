import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { DriveReview } from '../release/drive-intake'
import { signArtifact } from '../release/release'

type Intake = { id: string; size: number; mime: string; editorial?: DriveReview }

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
  const origin = new URL(value('PAYLOAD_PUBLIC_SERVER_URL')).origin
  if (origin !== 'https://gpir-payload-cms.krishnanvishal12.workers.dev') throw new Error('Unexpected production Worker origin')
  const authorization = 'users API-Key ' + value('PAYLOAD_RELEASE_API_KEY')
  const signingSecret = value('GPIR_RELEASE_SIGNING_SECRET')
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

  const [estate, entries, assets] = await Promise.all([
    (await request(origin + '/api/release/editorial-entries', {
      method: 'POST', headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'export' }),
    }, 'Payload inventory')).json(),
    contentfulInventory('entries'), contentfulInventory('assets'),
  ])
  if (!Array.isArray(estate.records)) throw new Error('Invalid Payload estate')
  const hashes = new Set<string>()
  const titles = new Set<string>()
  const routes = new Set<string>()
  for (const row of estate.records) {
    const source = row.sourcePayload
    for (const doc of [source?.document, source?.publishedDocument, source?.fields]) {
      if (doc?.publicationTitle) titles.add(identity(doc.publicationTitle))
      if (doc?.canonicalUrlCandidate) routes.add(identity(doc.canonicalUrlCandidate))
      if (doc?.sourceHash) hashes.add(doc.sourceHash)
      if (doc?.sourceSha256 && !doc.sourceMetadata?.driveDraft) hashes.add(doc.sourceSha256)
    }
  }
  for (const item of entries) {
    for (const title of Object.values(item.fields?.publicationTitle || {})) if (typeof title === 'string') titles.add(identity(title))
    for (const route of Object.values(item.fields?.canonicalUrlCandidate || {})) if (typeof route === 'string') routes.add(identity(route))
  }
  const candidateSizes = new Set(inventory.map(item => item.size))
  const downloaded = new Set<string>()
  for (const asset of assets) {
    for (const file of Object.values(asset.fields?.file || {}) as any[]) {
      if (!file.url || (file.details?.size != null && !candidateSizes.has(file.details.size))) continue
      const url = new URL(file.url.startsWith('//') ? 'https:' + file.url : file.url)
      if (url.protocol !== 'https:' || !['images.ctfassets.net', 'assets.ctfassets.net', 'downloads.ctfassets.net', 'files.ctfassets.net'].includes(url.host)) {
        throw new Error('Unexpected Contentful asset host')
      }
      if (downloaded.has(url.href)) continue
      downloaded.add(url.href)
      hashes.add(digest(Buffer.from(await (await request(url.href, {}, 'Contentful asset comparison')).arrayBuffer())))
    }
  }
  const registry = JSON.parse(await readFile('../../assets/data/dashboard-metadata.json', 'utf8'))
  for (const dashboard of registry.records) {
    if (typeof dashboard.imagePath !== 'string' || !/^assets\/[\w./ -]+$/.test(dashboard.imagePath) || dashboard.imagePath.includes('..')) continue
    const image = await readFile('../../' + dashboard.imagePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
    if (image) hashes.add(digest(image))
  }
  const counts = { acquired: sources.length, excluded: 0, held: 0, drafts: 0 }
  sources.sort((a, b) => Number(Boolean(b.item.editorial)) - Number(Boolean(a.item.editorial)))
  for (const { item, bytes, hash } of sources) {
    if (hashes.has(hash)) { counts.excluded++; continue }
    hashes.add(hash)
    const review = item.editorial
    if (!review || review.hash !== hash || !['image/png', 'image/jpeg'].includes(item.mime)) {
      counts.held++; continue
    }
    if (titles.has(identity(review.title)) || routes.has(identity('/' + review.routeSlug + '/'))) {
      counts.excluded++; continue
    }
    const form = new FormData()
    form.set('review', JSON.stringify(review))
    form.set('file', new Blob([new Uint8Array(bytes)], { type: item.mime }), 'dashboard')
    const signature = signArtifact({ purpose: 'gpir-drive-draft-intake-v1', review }, signingSecret).signature
    const response = await request(origin + '/api/release/drive-draft-intake', {
      method: 'POST', headers: { authorization, 'x-gpir-intake-signature': signature }, body: form,
    }, 'Payload draft intake')
    const outcome = await response.json() as { status: string }
    if (outcome.status === 'DRAFT_CREATED') counts.drafts++
    else if (['EXISTING_RECORD', 'EXISTING_MEDIA'].includes(outcome.status)) counts.excluded++
    else throw new Error('Unrecognized Worker intake response')
  }
  console.log(JSON.stringify(counts))
}
main().catch(error => {
  const message = String(error?.message || '')
  console.error(/^(Missing configuration reference: [A-Z_]+|(?:Drive OAuth|Drive acquisition|Contentful inventory|Contentful asset comparison|Payload draft intake|Payload inventory) returned HTTP \d{3})$/.test(message)
    ? message : 'Drive editorial intake failed.')
  process.exitCode = 1
})
