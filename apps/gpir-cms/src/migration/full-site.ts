import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../payload.config'

const require = createRequire(import.meta.url)
const site = require('../../../../scripts/m41/site-content.cjs')
const option = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)

async function main() {
  const root = path.resolve(option('site') || '../../.cloudflare-preview-dist')
  const output = path.resolve(option('report') || '../../.migration-data/m41-coverage.json')
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const initialManifest = site.validateManifest(site.inventory(root, sourceCommit))
  const backup = option('backup')
  if (!backup) throw new Error('A complete Contentful backup is required: --backup=PATH')
  const exportRoot = path.resolve(backup)
  const sourceFiles = ['manifest.json', 'entries.json', 'assets.json', 'locales.json', 'contentTypes.json', 'tags.json', 'editorInterfaces.json']
  const archives = await Promise.all(sourceFiles.map(async file => ({ name: file, value: JSON.parse(await readFile(path.join(exportRoot, file), 'utf8')) })))
  const { snapshot: initialSnapshot, ...initialBody } = initialManifest
  const body = { ...initialBody, contentfulExportSha256: site.sha256(site.canonical(archives)) }
  const manifest = site.validateManifest({ ...body, snapshot: site.sha256(site.canonical(body)) })
  const locale = archives.find(item => item.name === 'locales.json')!.value.find((item: any) => item.default)?.code
  const space = process.env.CONTENTFUL_SPACE_ID
  const environment = process.env.CONTENTFUL_ENVIRONMENT
  const token = process.env.CONTENTFUL_DELIVERY_TOKEN
  if (!locale || !space || !environment || !token) throw new Error('Verified Contentful Delivery settings are required; management state cannot prove published bytes.')
  const published = new Map<string, any>()
  const publishedAssets = new Map<string, any>()
  for (let skip = 0; ; ) {
    const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(space)}/environments/${encodeURIComponent(environment)}/entries?limit=100&skip=${skip}&locale=${encodeURIComponent(locale)}`
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'error' })
    if (!response.ok) throw new Error('Cannot verify Contentful published estate.')
    const page: any = await response.json()
    if (!Array.isArray(page.items) || !Number.isInteger(page.total)) throw new Error('Incomplete delivery snapshot.')
    for (const entry of page.items) published.set(entry.sys.id, entry)
    for (const asset of page.includes?.Asset || []) publishedAssets.set(asset.sys.id, asset)
    skip += page.items.length
    if (skip >= page.total) break
    if (!page.items.length || skip > 100000) throw new Error('Delivery pagination incomplete.')
  }
  const payload = await getPayload({ config })
  const client: any = payload
  let created = 0
  let reconciled = 0
  async function immutable(key: string, value: any) {
    const hash = site.sha256(site.canonical(value))
    const existing = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, overrideAccess: true })
    if (existing.totalDocs > 1) throw new Error('Duplicate migration identity.')
    if (existing.docs[0]) {
      if (existing.docs[0].sourceHash !== hash || site.sha256(site.canonical(existing.docs[0].sourcePayload)) !== hash) throw new Error(`Existing Payload content differs: ${key}`)
      reconciled++
      return
    }
    await client.create({ collection: 'editorial-metadata', overrideAccess: true, data: {
      sourceRecordKey: key, sourceHash: hash,
      sourceValidationSummary: 'Byte-preserved migration. Existing publication/source validation is unchanged; this is not a new PASS or release decision.',
      migrationStatus: 'RECONCILED', migrationBatchId: manifest.snapshot, sourcePayload: value,
    } })
    created++
  }
  // Immutable content-addressed objects make retry safe and retain every prior edition.
  // Every published path comes from the existing public-build allowlist, not Git globbing.
  for (const item of manifest.files) {
    const bytes = await readFile(path.join(root, item.path))
    site.verifyBytes(item, bytes)
    await immutable(`m41:blob:${item.sha256}`, { kind: 'site-bytes', encoding: 'base64', body: bytes.toString('base64') })
  }
  // Archive ALL Contentful types/locales/entry states, including unresolved/draft/WARN.
  // These are private records, not a public release queue. Original source IDs survive.
  for (const archive of archives) await immutable(`m41:archive:${manifest.snapshot}:${archive.name}`, { kind: 'contentful-export', ...archive })
  for (const entry of archives.find(item => item.name === 'entries.json')!.value) {
    if (!entry?.sys?.id) throw new Error('Source entry has no identity.')
    await immutable(`m41:entry:${entry.sys.id}:${site.sha256(site.canonical(entry))}`, { kind: 'contentful-entry', source: entry })
  }
  // Published mirrors use Delivery bytes, never unpublished Management revisions.
  // Every source draft is retained alongside the original management archive.
  for (const entry of archives.find(item => item.name === 'entries.json')!.value) {
    const live = published.get(entry.sys.id)
    const draftFields = Object.fromEntries(Object.entries(entry.fields || {}).map(([key, value]: [string, any]) => [key, value?.[locale] ?? null]))
    const value = { kind: 'editorial-entry', entryId: entry.sys.id, contentType: entry.sys.contentType?.sys?.id,
      deliveryIncludes: { Asset: [...publishedAssets.values()] },
      fields: live?.fields || draftFields, pendingSourceDraft: live ? draftFields : null,
      published: Boolean(live), archived: Boolean(entry.sys.archivedVersion), sourceVersion: entry.sys.version, sourceSys: entry.sys }
    const key = `m41:editorial:${entry.sys.id}`
    const existing = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, overrideAccess: true })
    if (existing.totalDocs > 1) throw new Error('Duplicate editorial identity.')
    if (existing.docs[0]) {
      if (site.canonical(existing.docs[0].sourcePayload) !== site.canonical(value)) throw new Error('Payload editorial changes exist; preserve and reconcile instead of overwriting.')
      reconciled++
    } else {
      await client.create({ collection: 'editorial-metadata', overrideAccess: true,
        context: { m41VerifiedDeliveryImport: true }, data: { sourceRecordKey: key, sourcePayload: value,
          sourceValidationSummary: String(value.fields.sourceValidationSummary || 'Preserved source state; no new validation decision.'),
          migrationBatchId: manifest.snapshot, migrationStatus: 'RECONCILED' } })
      created++
    }
  }
  // Manifest is committed last. A partial import cannot become a build source.
  await immutable(`m41:manifest:${manifest.snapshot}`, manifest)
  const report = { status: 'MIGRATED_NOT_CUT_OVER', sourceCommit, snapshot: manifest.snapshot,
    managedFiles: manifest.files.length, protectedEngineFiles: manifest.protectedFiles.length,
    contentfulEntries: archives.find(item => item.name === 'entries.json')!.value.length,
    contentfulAssets: archives.find(item => item.name === 'assets.json')!.value.length,
    created, reconciled, sourceValidationChanged: false, publicSourceSwitched: false }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  process.stdout.write(JSON.stringify(report) + '\n')
  await payload.destroy()
}
main().catch(() => { process.stderr.write('Full-site migration failed; inspect the private execution context. No cutover performed.\n'); process.exitCode = 1 })
