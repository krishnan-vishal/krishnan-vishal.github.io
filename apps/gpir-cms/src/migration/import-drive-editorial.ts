import { createHash } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { reconcileDriveCandidates, type DriveEditorialAnnotation, type DriveReconciliationRow } from '../release/drive-reconciliation'
import { signArtifact } from '../release/release'

type DriveFile = { id: string; name: string; mimeType: string; size: string }
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const identity = (input: string) => input.trim().toUpperCase()
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
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) throw new Error(`${label} returned HTTP ${response.status}`)
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt))
  }
  throw new Error('Request retries exhausted')
}

async function listDriveFolder(folderId: string, headers: Record<string, string>) {
  const listed: DriveFile[] = []
  let pageToken = ''
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`)
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size)')
    url.searchParams.set('pageSize', '1000')
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('includeItemsFromAllDrives', 'true')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const page = await (await request(url.href, { headers }, 'Approved Drive folder inventory')).json()
    if (!Array.isArray(page.files) || (page.nextPageToken != null && typeof page.nextPageToken !== 'string')) throw new Error('Invalid approved Drive folder inventory')
    listed.push(...page.files)
    pageToken = page.nextPageToken || ''
    if (listed.length > 250) throw new Error('Approved Drive folder exceeded intake safety limit')
  } while (pageToken)
  return listed
}

async function driveBytes(id: string, headers: Record<string, string>, label = 'Drive acquisition') {
  const response = await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers }, label)
  return Buffer.from(await response.arrayBuffer())
}

async function contentfulInventory(collection: 'entries') {
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
  const folderId = value('GPIR_DRIVE_INTAKE_FOLDER_ID')
  const mappingFolderId = value('GPIR_DRIVE_MAPPING_FOLDER_ID')
  if (folderId !== '11eN-u0tg56eiSCiomPHhKFtutJdkOQ2i' || mappingFolderId !== '1l8fcr5-L7GSZ-4z9IGuO5XD9PPccn0mq') throw new Error('Unapproved Drive folder')
  const [listed, mappingFiles] = await Promise.all([listDriveFolder(folderId, headers), listDriveFolder(mappingFolderId, headers)])
  const requiredMappings = new Map([
    ['GPIR-approved-dashboard-editorial-draft.json', 'editorial'],
    ['GPIR-approved-dashboard-reconciliation.json', 'reconciliation'],
  ])
  const selected = mappingFiles.filter(file => requiredMappings.has(file.name))
  if (selected.length !== 2 || new Set(selected.map(file => file.name)).size !== 2 || selected.some(file => file.mimeType !== 'application/json')) throw new Error('Approved Drive mappings are missing or ambiguous')
  const mappingValues = new Map<string, any>()
  for (const file of selected) {
    const bytes = await driveBytes(file.id, headers, 'Drive mapping acquisition')
    if (bytes.length !== Number(file.size) || bytes.length > 100_000) throw new Error('Drive mapping changed during acquisition')
    mappingValues.set(requiredMappings.get(file.name)!, JSON.parse(bytes.toString('utf8')))
  }
  const annotations = mappingValues.get('editorial') as DriveEditorialAnnotation[]
  const reconciliation = mappingValues.get('reconciliation') as DriveReconciliationRow[]
  if (!Array.isArray(annotations) || !Array.isArray(reconciliation)) throw new Error('Invalid approved Drive mapping documents')

  const candidateFiles = listed.filter(file => ['image/jpeg', 'image/png'].includes(file.mimeType))
  const sources = []
  for (const file of candidateFiles) {
    const size = Number(file.size)
    if (!/^[\w-]{10,}$/.test(file.id) || !Number.isSafeInteger(size) || size < 1 || size > 20_000_000) throw new Error('Invalid approved Drive image metadata')
    const bytes = await driveBytes(file.id, headers)
    if (bytes.length !== size) throw new Error('Drive file size changed since inventory capture')
    sources.push({ file, bytes, hash: digest(bytes), size })
  }
  if (!sources.length || new Set(sources.map(source => source.file.id)).size !== sources.length) throw new Error('Empty or duplicated approved Drive image inventory')
  const reconciled = reconcileDriveCandidates(sources.map(source => ({
    id: source.file.id, name: source.file.name, mimeType: source.file.mimeType, size: source.size, hash: source.hash,
  })), annotations, reconciliation)
  const byId = new Map(sources.map(source => [source.file.id, source]))

  const [estate, entries] = await Promise.all([
    (await request(origin + '/api/release/editorial-entries', {
      method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export' }),
    }, 'Payload inventory')).json(), contentfulInventory('entries'),
  ])
  if (!Array.isArray(estate.records)) throw new Error('Invalid Payload estate')
  const published: { hash: string | null; title: string | null; route: string | null; source: string }[] = []
  for (const row of estate.records) {
    const source = row.sourcePayload
    for (const doc of [source?.document, source?.publishedDocument, source?.fields]) {
      if (doc?.publicationTitle || doc?.canonicalUrlCandidate || doc?.sourceHash) published.push({
        hash: typeof doc.sourceHash === 'string' ? doc.sourceHash : null,
        title: typeof doc.publicationTitle === 'string' ? identity(doc.publicationTitle) : null,
        route: typeof doc.canonicalUrlCandidate === 'string' ? identity(doc.canonicalUrlCandidate) : null,
        source: 'payload',
      })
    }
  }
  for (const item of entries) {
    const titles = Object.values(item.fields?.publicationTitle || {}).filter(value => typeof value === 'string') as string[]
    const routes = Object.values(item.fields?.canonicalUrlCandidate || {}).filter(value => typeof value === 'string') as string[]
    if (titles.length === 1 || routes.length === 1) published.push({ hash: null,
      title: titles.length === 1 ? identity(titles[0]) : null, route: routes.length === 1 ? identity(routes[0]) : null, source: 'contentful-bcp' })
  }
  const evidence: any = {
    status: 'DRIVE_PUBLICATION_BATCH_RECONCILED', generatedAt: new Date().toISOString(),
    source: { imageFolderId: folderId, mappingFolderId, acquired: sources.length, approvedRows: reconciliation.length, annotations: annotations.length },
    counts: { eligible: 0, published: 0, existing: 0, held: 0, unmatched: 0, duplicate: 0,
      categoriesCreated: 0, categoriesReused: 0, mediaCreated: 0, mediaReused: 0 }, records: [] as any[],
  }
  const categoryOutcomes = new Map<string, 'CREATED' | 'REUSED'>()
  for (const item of reconciled) {
    if (item.disposition !== 'ELIGIBLE') {
      if (item.disposition === 'HELD_EXCEPTION') evidence.counts.held++
      else evidence.counts.unmatched++
      evidence.records.push({ fileId: item.candidate.id, filename: item.candidate.name, sha256: item.candidate.hash,
        disposition: item.disposition, reason: item.reason })
      continue
    }
    evidence.counts.eligible++
    const review = item.review!, source = byId.get(item.candidate.id)!
    const title = identity(review.title), route = identity('/' + review.routeSlug + '/')
    const collisions = published.filter(row => row.hash === source.hash || row.title === title || row.route === route)
    if (collisions.length) {
      const exact = collisions.filter(row => (row.hash == null || row.hash === source.hash) && row.title === title && row.route === route)
      if (!exact.length || collisions.some(row => row.title !== title || row.route !== route || (row.hash != null && row.hash !== source.hash))) {
        throw new Error('Published identity collision in approved Drive batch')
      }
      evidence.counts.duplicate++
      evidence.records.push({ fileId: source.file.id, filename: source.file.name, sha256: source.hash,
        disposition: 'EXCLUDED_PUBLISHED_DUPLICATE', route: '/' + review.routeSlug + '/', sources: [...new Set(exact.map(row => row.source))] })
      continue
    }
    const form = new FormData()
    form.set('review', JSON.stringify(review))
    form.set('file', new Blob([new Uint8Array(source.bytes)], { type: source.file.mimeType }), source.file.name)
    const signature = signArtifact({ purpose: 'gpir-drive-draft-intake-v1', review }, signingSecret).signature
    const response = await request(origin + '/api/release/drive-draft-intake', {
      method: 'POST', headers: { authorization, 'x-gpir-intake-signature': signature }, body: form,
    }, 'Payload publication intake')
    const outcome = await response.json() as any
    if (!['PUBLICATION_CREATED', 'EXISTING_RECORD'].includes(outcome.status)) throw new Error('Unrecognized Worker intake response')
    if (outcome.status === 'PUBLICATION_CREATED') {
      evidence.counts.published++
      const previous = categoryOutcomes.get(review.chapterSlug)
      categoryOutcomes.set(review.chapterSlug, previous === 'CREATED' || outcome.category === 'CREATED' ? 'CREATED' : 'REUSED')
      evidence.counts[outcome.media === 'CREATED' ? 'mediaCreated' : 'mediaReused']++
    } else evidence.counts.existing++
    evidence.records.push({ fileId: source.file.id, filename: source.file.name, sha256: source.hash,
      disposition: outcome.status, publicationId: outcome.publicationId, route: outcome.route,
      category: outcome.category || null, media: outcome.media || null })
  }
  evidence.counts.categoriesCreated = [...categoryOutcomes.values()].filter(status => status === 'CREATED').length
  evidence.counts.categoriesReused = [...categoryOutcomes.values()].filter(status => status === 'REUSED').length
  evidence.categories = [...categoryOutcomes].sort(([a], [b]) => a.localeCompare(b)).map(([slug, status]) => ({ slug, status }))
  if (evidence.counts.eligible !== 43 || evidence.counts.held !== 2 || evidence.counts.unmatched !== 3 ||
      evidence.counts.published + evidence.counts.existing + evidence.counts.duplicate !== 43) throw new Error('Approved Drive batch count contract failed')
  const edition = await (await request(origin + '/api/release/drive-publication-edition', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'prepare', parentSnapshot: value('GPIR_PAYLOAD_SITE_SNAPSHOT') }),
  }, 'Payload edition preparation')).json()
  if (edition.status !== 'EDITION_PREPARED_NOT_DEPLOYED' || !/^[a-f0-9]{64}$/.test(edition.snapshot || '')) throw new Error('Payload edition was not prepared')
  evidence.edition = edition
  const output = path.resolve(process.env.GPIR_DRIVE_PUBLICATION_REPORT || '../../.migration-data/drive-publication-report.json')
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 })
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `snapshot=${edition.snapshot}\npublished=${evidence.counts.published}\nexisting=${evidence.counts.existing}\ncategories_created=${evidence.counts.categoriesCreated}\ncategories_reused=${evidence.counts.categoriesReused}\n`)
  console.log(JSON.stringify({ status: evidence.status, ...evidence.counts, snapshot: edition.snapshot }))
}

main().catch(error => {
  const message = String(error?.message || '')
  console.error(/^(Missing configuration reference: [A-Z_]+|(?:Drive OAuth|Drive acquisition|Drive mapping acquisition|Contentful inventory|Contentful asset comparison|Payload publication intake|Payload inventory|Payload edition preparation) returned HTTP \d{3})$/.test(message)
    ? message : 'Drive editorial publication failed.')
  process.exitCode = 1
})
