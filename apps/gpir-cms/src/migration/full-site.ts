import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../payload.config'

const require = createRequire(import.meta.url)
const site = require('../../../../scripts/m41/site-content.cjs')
const checkpoint = require('../../../../scripts/m41/import-checkpoint.cjs')
const option = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const output = path.resolve(option('report') || '../../.migration-data/m41-coverage.json')
const progressFile = path.resolve(option('progress') || path.join(path.dirname(output), 'import-progress.json'))
const cursorFile = path.resolve(option('cursor') || path.join(path.dirname(output), 'import-cursor.json'))
const planFile = path.join(path.dirname(cursorFile), 'import-plan.json')
const deliveryFile = path.join(path.dirname(cursorFile), 'import-delivery-snapshot.json')
const legacyFile = path.join(path.dirname(cursorFile), 'import-legacy-progress.json')
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
let progressState: Record<string, any> = {}
function progress(phase: string, details: Record<string, any> = {}) {
  progressState = { ...progressState, ...details, phase, updatedAt: new Date().toISOString() }
  checkpoint.atomic(progressFile, progressState)
}

async function main() {
  const root = path.resolve(option('site') || '../../.cloudflare-preview-dist')
  const sourceCommit = option('source-commit') || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Invalid pinned source commit.')
  execFileSync('git', ['merge-base', '--is-ancestor', sourceCommit, 'HEAD'])
  const saved = existsSync(cursorFile) ? json(cursorFile) : null
  if (!saved && existsSync(progressFile) && !existsSync(legacyFile)) checkpoint.atomic(legacyFile, json(progressFile))
  const legacy = !saved && existsSync(legacyFile) ? json(legacyFile) : null
  const initialManifest = site.validateManifest(site.inventory(root, sourceCommit))
  const backup = option('backup')
  if (!backup) throw new Error('A complete Contentful backup is required: --backup=PATH')
  const exportRoot = path.resolve(backup)
  const sourceFiles = ['manifest.json', 'entries.json', 'assets.json', 'locales.json', 'contentTypes.json', 'tags.json', 'editorInterfaces.json']
  const archives = await Promise.all(sourceFiles.map(async file => ({ name: file, value: JSON.parse(await readFile(path.join(exportRoot, file), 'utf8')) })))
  const { snapshot: initialSnapshot, ...initialBody } = initialManifest
  const exportHash = site.sha256(site.canonical(archives))
  const body = { ...initialBody, contentfulExportSha256: exportHash }
  const manifest = site.validateManifest({ ...body, snapshot: site.sha256(site.canonical(body)) })
  const locale = archives.find(item => item.name === 'locales.json')!.value.find((item: any) => item.default)?.code
  const entries: any[] = archives.find(item => item.name === 'entries.json')!.value
  const assets: any[] = archives.find(item => item.name === 'assets.json')!.value
  const space = process.env.CONTENTFUL_SPACE_ID
  const environment = process.env.CONTENTFUL_ENVIRONMENT
  const token = process.env.CONTENTFUL_DELIVERY_TOKEN
  if (!locale || !space || !environment || !token) throw new Error('Verified Contentful Delivery settings are required; management state cannot prove published bytes.')

  // Capture published bytes once before remaining database writes. All batches
  // use this same private, checksummed Delivery snapshot, without another export.
  let delivery: any
  if (existsSync(deliveryFile)) {
    const cached = json(deliveryFile)
    delivery = cached.data
    if (cached.digest !== checkpoint.digest(delivery) || delivery.sourceCommit !== sourceCommit || delivery.exportHash !== exportHash ||
        delivery.space !== space || delivery.environment !== environment || delivery.locale !== locale ||
        !Array.isArray(delivery.entries) || !Array.isArray(delivery.assets)) throw new Error('Saved published Delivery snapshot differs; original files preserved.')
  } else {
    const published = new Map<string, any>(), publishedAssets = new Map<string, any>()
    for (let skip = 0; ; ) {
      const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(space)}/environments/${encodeURIComponent(environment)}/entries?limit=100&skip=${skip}&locale=${encodeURIComponent(locale)}`
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error('Cannot verify Contentful published estate.')
      const page: any = await response.json()
      if (!Array.isArray(page.items) || !Number.isInteger(page.total)) throw new Error('Incomplete delivery snapshot.')
      for (const entry of page.items) published.set(entry.sys.id, entry)
      for (const asset of page.includes?.Asset || []) publishedAssets.set(asset.sys.id, asset)
      skip += page.items.length
      if (skip >= page.total) break
      if (!page.items.length || skip > 100000) throw new Error('Delivery pagination incomplete.')
    }
    delivery = { sourceCommit, exportHash, space, environment, locale, entries: [...published.values()], assets: [...publishedAssets.values()] }
    checkpoint.atomic(deliveryFile, { digest: checkpoint.digest(delivery), data: delivery })
  }
  const plan = { schema: 'gpir-import-plan/v1', sourceCommit, snapshot: manifest.snapshot,
    deliveryDigest: checkpoint.digest(delivery), counts: { blobs: manifest.files.length, archives: archives.length,
      entries: entries.length, editorial: entries.length, manifest: 1 } }
  let cursor = checkpoint.initialize(plan, saved, legacy)
  if (existsSync(planFile) && checkpoint.identity(json(planFile)) !== checkpoint.identity(plan)) throw new Error('Import plan changed; original cursor and records preserved.')
  if (!existsSync(planFile)) checkpoint.atomic(planFile, plan)
  if (!saved) checkpoint.atomic(cursorFile, cursor)
  const update = (next: any) => {
    checkpoint.atomic(cursorFile, next)
    cursor = next
    progress(next.phase === 'complete' ? 'MANIFEST_COMMITTED' : 'IMPORTING_' + next.phase.toUpperCase(), {
      sourceCommit, snapshot: manifest.snapshot, totalBlobs: manifest.files.length,
      completedBlobs: next.phase === 'blobs' ? next.index : manifest.files.length,
      nextIndex: next.index, cursorPhase: next.phase, created: next.created, reconciled: next.reconciled, lastKey: next.lastKey
    })
  }
  update(cursor)
  const coverage = () => {
    const report = { status: 'MIGRATED_NOT_CUT_OVER', sourceCommit, snapshot: manifest.snapshot,
      managedFiles: manifest.files.length, protectedEngineFiles: manifest.protectedFiles.length,
      contentfulEntries: entries.length, contentfulAssets: assets.length, created: cursor.created, reconciled: cursor.reconciled,
      sourceValidationChanged: false, publicSourceSwitched: false }
    checkpoint.atomic(output, report)
    progress('COMPLETE', { created: cursor.created, reconciled: cursor.reconciled })
    return report
  }
  if (cursor.phase === 'complete') return { ...coverage(), cleanupStatus: 'NO_DATABASE_SESSION' }

  const published = new Map<string, any>(delivery.entries.map((item: any) => [item.sys.id, item]))
  const payload = await getPayload({ config })
  let result: Record<string, any> = {}
  let cleanupStatus = 'NOT_STARTED'
  try {
    const client: any = payload
    async function immutable(key: string, value: any) {
      const canonical = site.canonical(value)
      const hash = site.sha256(canonical)
      const existing = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, overrideAccess: true })
      if (existing.totalDocs > 1) throw new Error('Duplicate migration identity.')
      if (existing.docs[0]) {
        if (existing.docs[0].sourceHash !== hash || site.sha256(site.canonical(existing.docs[0].sourcePayload)) !== hash) throw new Error('Existing Payload content differs; preserve instead of overwriting.')
        return { disposition: 'reconciled', key, bytes: Buffer.byteLength(canonical) }
      }
      await client.create({ collection: 'editorial-metadata', overrideAccess: true, data: {
        sourceRecordKey: key, sourceHash: hash,
        sourceValidationSummary: 'Byte-preserved migration. Existing publication/source validation is unchanged; this is not a new PASS or release decision.',
        migrationStatus: 'RECONCILED', migrationBatchId: manifest.snapshot, sourcePayload: value
      } })
      return { disposition: 'created', key, bytes: Buffer.byteLength(canonical) }
    }
    async function perform(phase: string, index: number) {
      if (phase === 'blobs') {
        const item = manifest.files[index]
        const bytes = await readFile(path.join(root, item.path))
        site.verifyBytes(item, bytes)
        return immutable(`m41:blob:${item.sha256}`, { kind: 'site-bytes', encoding: 'base64', body: bytes.toString('base64') })
      }
      // Archive ALL source types/locales/draft/WARN states without promotion.
      if (phase === 'archives') return immutable(`m41:archive:${manifest.snapshot}:${archives[index].name}`, { kind: 'contentful-export', ...archives[index] })
      if (phase === 'entries') {
        const entry = entries[index]
        if (!entry?.sys?.id) throw new Error('Source entry has no identity.')
        return immutable(`m41:entry:${entry.sys.id}:${site.sha256(site.canonical(entry))}`, { kind: 'contentful-entry', source: entry })
      }
      if (phase === 'editorial') {
        const entry = entries[index]
        const live = published.get(entry.sys.id)
        const draftFields = Object.fromEntries(Object.entries(entry.fields || {}).map(([key, value]: [string, any]) => [key, value?.[locale] ?? null]))
        const value = { kind: 'editorial-entry', entryId: entry.sys.id, contentType: entry.sys.contentType?.sys?.id,
          deliveryIncludes: { Asset: delivery.assets }, fields: live?.fields || draftFields,
          pendingSourceDraft: live ? draftFields : null, published: Boolean(live), archived: Boolean(entry.sys.archivedVersion),
          sourceVersion: entry.sys.version, sourceSys: entry.sys }
        const key = `m41:editorial:${entry.sys.id}`
        const existing = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, overrideAccess: true })
        if (existing.totalDocs > 1) throw new Error('Duplicate editorial identity.')
        if (existing.docs[0]) {
          if (site.canonical(existing.docs[0].sourcePayload) !== site.canonical(value)) throw new Error('Payload editorial changes exist; preserve instead of overwriting.')
          return { disposition: 'reconciled', key, bytes: Buffer.byteLength(site.canonical(value)) }
        }
        await client.create({ collection: 'editorial-metadata', overrideAccess: true,
          context: { m41VerifiedDeliveryImport: true }, data: { sourceRecordKey: key, sourcePayload: value,
            sourceValidationSummary: String(value.fields.sourceValidationSummary || 'Preserved source state; no new validation decision.'),
            migrationBatchId: manifest.snapshot, migrationStatus: 'RECONCILED' } })
        return { disposition: 'created', key, bytes: Buffer.byteLength(site.canonical(value)) }
      }
      // Manifest is committed last. A partial import cannot become a build source.
      if (phase === 'manifest') return immutable(`m41:manifest:${manifest.snapshot}`, manifest)
      throw new Error('Unknown import phase.')
    }
    const batch = await checkpoint.runBatch(plan, cursor, perform, update)
    cursor = batch.cursor
    if (cursor.phase === 'complete') result = coverage()
    else result = { status: batch.status, phase: cursor.phase, nextIndex: cursor.index,
      created: cursor.created, reconciled: cursor.reconciled, completedBlobs: cursor.phase === 'blobs' ? cursor.index : manifest.files.length }
  } finally {
    // Work is already committed/checkpointed before cleanup. Bound only teardown,
    // never a database write; a real task error still reaches the failure handler.
    const cleanup = await checkpoint.closeBatch(() => payload.destroy())
    cleanupStatus = cleanup.status
    try { progress(progressState.phase || 'BATCH_SHUTDOWN', { cleanupStatus, cleanupErrorCode: cleanup.errorCode || null }) } catch {}
  }
  return { ...result, cleanupStatus }
}
// This file is a standalone migration child, never a Worker runtime module.
// Flush the result and exit after bounded cleanup so library handles cannot keep
// an already-saved batch alive until the parent's five-minute process timeout.
main().then(result => {
  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0))
}).catch((error) => {
  try { progress('FAILED', { errorCode: checkpoint.failureCode(error) }) } catch {}
  process.stderr.write('Content import batch failed; saved progress, cursor and original records are preserved. No cutover performed.\n', () => process.exit(1))
})
