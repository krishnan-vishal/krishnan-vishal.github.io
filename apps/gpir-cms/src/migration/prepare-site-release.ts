import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../payload.config'
import { allNative, nativeReady } from '../release/editorial-source'
import { legacyRecord, releaseDecision } from '../release/release'
const require = createRequire(import.meta.url)
const site = require('../../../../scripts/m41/site-content.cjs')
const editions = require('../../../../scripts/m41/research-edition.cjs')
const checkpoint = require('../../../../scripts/m41/import-checkpoint.cjs')
const option = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)

async function main() {
  const parent = option('snapshot') || process.env.GPIR_PAYLOAD_SITE_SNAPSHOT
  if (!/^[a-f0-9]{64}$/.test(parent || '')) throw new Error('An exact parent Payload snapshot is required.')
  const payload = await getPayload({ config })
  const client: any = payload
  const root = await mkdtemp(path.join(tmpdir(), 'gpir-payload-edition-'))
  try {
    const read = async (key: string) => {
      const result = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, depth: 0, limit: 2, overrideAccess: true })
      if (result.docs.length !== 1 || result.totalDocs !== 1) throw new Error('Missing or ambiguous snapshot object.')
      const doc = result.docs[0]
      if (site.sha256(site.canonical(doc.sourcePayload)) !== doc.sourceHash) throw new Error('Snapshot source object changed.')
      return doc.sourcePayload
    }
    const original = site.validateManifest(await read(`m41:manifest:${parent}`))
    for (const item of original.files) {
      const value = await read(`m41:blob:${item.sha256}`)
      const bytes = Buffer.from(value.body, 'base64')
      site.verifyBytes(item, bytes)
      const target = path.join(root, item.path)
      await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes)
    }
    const released: any[] = []
    const decisions: any[] = []
    for (const publication of (await allNative(client)).filter(nativeReady)) {
      const decision = await releaseDecision(publication, process.env)
      // A current authority refusal must be resolved before producing an edition,
      // rather than releasing the record or disguising refusal as an empty estate.
      if (!decision.releaseEligible) throw new Error('Supabase withheld a reviewed research record; no new edition committed.')
      const record = legacyRecord(publication)
      const relative = site.safePath(`${decision.route.replace(/^\/+|\/+$/g, '')}/index.html`)
      const file = path.join(root, relative)
      // Existing pages retain their identity-bound shell; first-time pages
      // require the same native PASS and Supabase release authority as edits.
      const inParent = original.files.some((item: any) => item.path === relative)
      let priorHtml: string | null = null
      try { priorHtml = await readFile(file, 'utf8') }
      catch (error: any) { if (error.code !== 'ENOENT') throw error }
      if (inParent !== (priorHtml !== null)) throw new Error('Inherited research route integrity mismatch.')
      const rendered = priorHtml === null
        ? editions.renderFirstResearchEdition(record, decision)
        : editions.applyResearchEdition(priorHtml, record, decision)
      if (priorHtml === null) await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, rendered.html)
      released.push(record); decisions.push(decision)
    }
    // M40: carry the owner-reviewed Observatory page into a new immutable edition.
    // Never copy other working-tree files or alter the inherited engine inventory.
    const approvedObservatory = path.resolve(process.cwd(), '../../pages/intelligence/index.html')
    const approvedBytes = await readFile(approvedObservatory)
    const approvedHtml = approvedBytes.toString('utf8')
    if (!approvedHtml.includes('id="ask-gpir-observatory"') || !approvedHtml.includes('aria-controls="search-overlay"')) {
      throw new Error('Reviewed Observatory ASK GPIR source is missing or incompatible.')
    }
    const originalObservatory = original.files.find((item: any) => item.path === 'pages/intelligence/index.html')
    if (!originalObservatory) throw new Error('Parent edition lacks the Observatory managed route.')
    const observatoryChanged = site.sha256(approvedBytes) !== originalObservatory.sha256
    if (observatoryChanged) await writeFile(path.join(root, 'pages/intelligence/index.html'), approvedBytes)
    if (!released.length && !observatoryChanged) {
      const output = path.resolve(option('report') || '../../.migration-data/m41-research-release.json')
      await mkdir(path.dirname(output), { recursive: true })
      const report = { status: 'UNCHANGED_NO_REVIEWED_RESEARCH', snapshot: parent, released: 0 }
      await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
      console.log(JSON.stringify(report))
      return
    }
    if (released.length) {
    const routesFile = path.join(root, 'routes.json')
    const routes = editions.mergeResearchRoutes(JSON.parse(await readFile(routesFile, 'utf8')), released, decisions)
    // Only approved identities enter Search/ASK public route metadata; protected
    // editorial bytes remain behind the existing Supabase reader boundary.
    await writeFile(routesFile, JSON.stringify(routes, null, 2) + '\n')
    const fx = path.join(root, 'assets/data/fx/editorial-public.json')
    await writeFile(fx, JSON.stringify(editions.mergeFxEditorial(JSON.parse(await readFile(fx, 'utf8')), released), null, 2) + '\n')
    }
    // Engines are not stored/copied in the CMS edition; keep their prior manifest
    // evidence and let the website build preserve the current Git-controlled code.
    const inventory = site.inventory(root, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim())
    const { snapshot: unused, ...base } = inventory
    const body = { ...base, protectedFiles: original.protectedFiles, parentSnapshot: parent,
      contentfulArchiveSnapshot: original.contentfulArchiveSnapshot || parent,
      nativeResearch: released.map(record => ({ entryId: record.entryId, publicationId: record.fields.gpirPublicationId, sha256: site.sha256(site.canonical(record)) })) }
    const manifest = site.validateManifest({ ...body, snapshot: site.sha256(site.canonical(body)) })
    const store = async (key: string, value: any) => {
      const hash = site.sha256(site.canonical(value))
      const result = await client.find({ collection: 'editorial-metadata', where: { sourceRecordKey: { equals: key } }, limit: 2, depth: 0, overrideAccess: true })
      if (result.totalDocs > 1) throw new Error('Ambiguous edition identity.')
      if (result.docs[0]) {
        if (result.docs[0].sourceHash !== hash) throw new Error('Existing edition object conflicts.')
        return
      }
      await client.create({ collection: 'editorial-metadata', overrideAccess: true, data: {
        sourceRecordKey: key, sourceHash: hash, sourcePayload: value, migrationStatus: 'RECONCILED', migrationBatchId: manifest.snapshot,
        sourceValidationSummary: 'Reviewer-approved native Payload edition; fresh per-record Supabase decisions retained; inherited public routes and engine code preserved.' } })
    }
    for (const item of manifest.files) await store(`m41:blob:${item.sha256}`, { kind: 'site-bytes', encoding: 'base64', body: (await readFile(path.join(root, item.path))).toString('base64') })
    await store(`m41:research-release:${manifest.snapshot}`, { kind: 'native-release-evidence', parentSnapshot: parent, records: released, decisions })
    await store(`m41:manifest:${manifest.snapshot}`, manifest)
    const output = path.resolve(option('report') || '../../.migration-data/m41-research-release.json')
    await mkdir(path.dirname(output), { recursive: true })
    const report = { status: 'EDITION_PREPARED_NOT_DEPLOYED', snapshot: manifest.snapshot, parentSnapshot: parent, released: released.length, observatoryUpdated: observatoryChanged, managedFiles: manifest.files.length }
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    console.log(JSON.stringify(report))
  } finally {
    const cleanup = await checkpoint.closeBatch(async () => {
      await rm(root, { recursive: true, force: true })
      await payload.destroy()
    })
    if (cleanup.status !== 'CLOSED') console.log(JSON.stringify({ stage: 'standalone-edition-shutdown', cleanupStatus: cleanup.status, errorCode: cleanup.errorCode || null }))
  }
}
// Only this standalone child exits; Worker endpoints and release checks are unchanged.
main().then(() => { process.stdout.write('', () => process.exit(0)) }).catch(() => {
  process.stderr.write('Native research edition blocked. No deployment performed; existing edition and validation states preserved.\n', () => process.exit(1))
})

