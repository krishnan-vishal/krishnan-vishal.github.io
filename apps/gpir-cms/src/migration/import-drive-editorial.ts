import { createHash } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { reconcileDriveCandidates, type DriveEditorialAnnotation, type DriveReconciliationRow } from '../release/drive-reconciliation'
import { signArtifact } from '../release/signing'

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

let acquisitionStage = 'CONFIGURATION'

async function main() {
  const origin = new URL(value('PAYLOAD_PUBLIC_SERVER_URL')).origin
  if (origin !== 'https://gpir-payload-cms.krishnanvishal12.workers.dev') throw new Error('Unexpected production Worker origin')
  const authorization = 'users API-Key ' + value('PAYLOAD_RELEASE_API_KEY')
  const signingSecret = value('GPIR_RELEASE_SIGNING_SECRET')
  acquisitionStage = 'DRIVE_OAUTH'
  const oauth = await (await request('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: value('GPIR_DRIVE_CLIENT_ID'),
      client_secret: value('GPIR_DRIVE_CLIENT_SECRET'), refresh_token: value('GPIR_DRIVE_REFRESH_TOKEN'),
    }),
  }, 'Drive OAuth')).json()
  if (typeof oauth.access_token !== 'string') throw new Error('Drive OAuth response omitted its access token')
  const headers = { authorization: `Bearer ${oauth.access_token}` }
  // Confirm GitHub's existing refresh-token exchange grants the intended account,
  // approved OAuth client, and full read access before processing any files.
  // Do not log raw tokens, client identifiers, emails, or Google response bodies.
  acquisitionStage = 'DRIVE_OAUTH_CLIENT_AND_SCOPE'
  const tokenInfo = await (await request(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(oauth.access_token),
    {}, 'Drive token inspection')).json() as {
      azp?: string; aud?: string; audience?: string; issued_to?: string; scope?: string
    }
  const clientId = value('GPIR_DRIVE_CLIENT_ID')
  // Google's current tokeninfo access-token response identifies the authorizing
  // OAuth client via azp; retain issued_to for legacy response compatibility.
  // A token's audience may differ from its authorized presenter.
  const authorizedClient = tokenInfo.azp || tokenInfo.issued_to || tokenInfo.aud || tokenInfo.audience
  if (authorizedClient !== clientId)
    throw new Error('DRIVE_OAUTH_CLIENT_MISMATCH')
  const grantedScopes = new Set(String(tokenInfo.scope || '').split(/\s+/).filter(Boolean))
  if (!['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive']
    .some(scope => grantedScopes.has(scope)))
    throw new Error('DRIVE_OAUTH_SCOPE_INSUFFICIENT')
  acquisitionStage = 'DRIVE_OAUTH_ACCOUNT'
  const driveAbout = await (await request(
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    { headers }, 'Drive account lookup')).json() as { user?: { emailAddress?: string } }
  if (driveAbout.user?.emailAddress?.toLowerCase() !== 'krishnanvishal12@gmail.com')
    throw new Error('DRIVE_OAUTH_ACCOUNT_MISMATCH')
  console.log('GPIR Drive OAuth: approved account, client and read scope verified')
  const folderId = value('GPIR_DRIVE_INTAKE_FOLDER_ID')
  const mappingFolderId = value('GPIR_DRIVE_MAPPING_FOLDER_ID')
  if (folderId !== '11eN-u0tg56eiSCiomPHhKFtutJdkOQ2i' || mappingFolderId !== '1l8fcr5-L7GSZ-4z9IGuO5XD9PPccn0mq') throw new Error('Unapproved Drive folder')
  acquisitionStage = 'DRIVE_FOLDER_INVENTORY'
  const [listed, mappingFiles] = await Promise.all([listDriveFolder(folderId, headers), listDriveFolder(mappingFolderId, headers)])
  // The two immutable owner-reviewed mapping identities are the release authority.
  // Do not depend on Drive's optional/custom MIME classification or a complete folder listing.
  const requiredMappings = [
    { name: 'GPIR-approved-dashboard-editorial-draft.json', label: 'editorial', id: '17PHvVrDmExMjdOf5qJkQkud0BRixMSev', sha256: '8e5f9bf128dced29f67569e83b53ef6f572593ed696bb4389d52aa9e0f57bed7' },
    { name: 'GPIR-approved-dashboard-reconciliation.json', label: 'reconciliation', id: '1SFbiVNi87_OLTNFoxciZ6QXI1xZayz3c', sha256: '0f9c604f5cba2f4f3e96cd020ae79dfa8371564091ba5fb8cf5774521dee2f98' },
  ] as const
  const mappingValues = new Map<string, any>()
  for (const mapping of requiredMappings) {
    // When listed entries are present, refuse shadow/duplicate files rather than guessing.
    const sameName = mappingFiles.filter(file => file.name === mapping.name)
    if (sameName.some(file => file.id !== mapping.id) || sameName.length > 1)
      throw new Error('Approved Drive mapping identity is ambiguous')
    const metadata = await (await request(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(mapping.id)}?fields=id,name,mimeType,size,parents,trashed&supportsAllDrives=true`,
      { headers }, 'Drive mapping metadata')).json()
    const size = Number(metadata.size)
    if (metadata.id !== mapping.id || metadata.name !== mapping.name ||
        metadata.trashed === true || !Array.isArray(metadata.parents) ||
        !metadata.parents.includes(mappingFolderId) ||
        !Number.isSafeInteger(size) || size < 1 || size > 100_000)
      throw new Error('Approved Drive mapping identity or parent mismatch')
    const bytes = await driveBytes(mapping.id, headers, 'Drive mapping acquisition')
    if (bytes.length !== size || digest(bytes) !== mapping.sha256)
      throw new Error('Approved Drive mapping content changed')
    const document = JSON.parse(bytes.toString('utf8'))
    if (!Array.isArray(document)) throw new Error('Invalid approved Drive mapping documents')
    mappingValues.set(mapping.label, document)
  }
  const annotations = mappingValues.get('editorial') as DriveEditorialAnnotation[]
  const reconciliation = mappingValues.get('reconciliation') as DriveReconciliationRow[]
  if (!Array.isArray(annotations) || !Array.isArray(reconciliation)) throw new Error('Invalid approved Drive mapping documents')

  acquisitionStage = 'DRIVE_IMAGE_ACQUISITION'
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
  acquisitionStage = 'DRIVE_RECONCILIATION'
  const reconciled = reconcileDriveCandidates(sources.map(source => ({
    id: source.file.id, name: source.file.name, mimeType: source.file.mimeType, size: source.size, hash: source.hash,
  })), annotations, reconciliation)
  const byId = new Map(sources.map(source => [source.file.id, source]))

  acquisitionStage = 'EXISTING_PUBLICATION_INVENTORY'
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
  acquisitionStage = 'PAYLOAD_PUBLICATION'
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
  acquisitionStage = 'EDITION_PREPARATION'
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
  // Emit a bounded release stage and a safe, allowlisted reason; never log OAuth,
  // access tokens, API keys, request bodies, folder contents or arbitrary exceptions.
  const approved = /^(Missing configuration reference: [A-Z_]+|(?:Drive OAuth|Approved Drive folder inventory|Drive acquisition|Drive mapping acquisition|Drive mapping metadata|Drive token inspection|Drive account lookup|Contentful inventory|Payload publication intake|Payload inventory|Payload edition preparation) returned HTTP (?:400|401|403|404|409|413|415|429|500|502|503|504)|Drive OAuth response omitted its access token|DRIVE_OAUTH_(?:CLIENT_MISMATCH|SCOPE_INSUFFICIENT|ACCOUNT_MISMATCH)|Invalid approved Drive folder inventory|Approved Drive folder exceeded intake safety limit|Approved Drive mappings are missing or ambiguous|Drive mapping changed during acquisition|Approved Drive mapping identity is ambiguous|Approved Drive mapping identity or parent mismatch|Approved Drive mapping content changed|Invalid approved Drive mapping documents|DRIVE_RECONCILIATION_(?:INVALID|DUPLICATED|ROW_MISMATCH)|DRIVE_EDITORIAL_ANNOTATION_MISMATCH|Published identity collision in approved Drive batch|Approved Drive batch count contract failed)$/
  console.error('Drive editorial publication failed at ' + acquisitionStage + ': ' +
    (approved.test(message) ? message : 'UNCLASSIFIED_FAILURE'))
  process.exitCode = 1
})
