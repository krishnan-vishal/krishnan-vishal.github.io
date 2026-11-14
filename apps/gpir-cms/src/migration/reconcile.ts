import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../payload.config'
import { classifyContentfulEntries } from './contentful'

function option(name: string) { const prefix = `--${name}=`; return process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length) }
async function json(file: string) { return JSON.parse(await readFile(file, 'utf8')) }

async function main() {
  const backupArg = option('backup')
  if (!backupArg) throw new Error('Usage: npm run contentful:reconcile -- --backup=PATH [--output=PATH]')
  const backup = path.resolve(backupArg)
  const output = path.resolve(option('output') || path.join(backup, 'reconciliation-report.json'))
  const [locales, rawEntries] = await Promise.all([json(path.join(backup, 'locales.json')), json(path.join(backup, 'entries.json'))])
  const locale = locales.find((item: any) => item.default)?.code || locales[0]?.code
  const classified = classifyContentfulEntries(rawEntries, locale)
  const source = classified.research
  const payload = await getPayload({ config })
  const target = await payload.find({ collection: 'research-publications', limit: 1000, depth: 0, overrideAccess: true, draft: true })
  const duplicate = (field: string) => {
    const seen = new Map<string, number>()
    for (const doc of target.docs) if (doc[field]) seen.set(String(doc[field]), (seen.get(String(doc[field])) || 0) + 1)
    return [...seen].filter(([, count]) => count > 1).map(([value, count]) => ({ field, value, count }))
  }
  const byContentful = new Map(target.docs.map((doc: any) => [doc.contentfulEntryId, doc]))
  const missing = source.filter((entry: any) => !byContentful.has(entry.entryId)).map((entry: any) => entry.entryId)
  const mismatched = source.flatMap((entry: any) => {
    const doc: any = byContentful.get(entry.entryId)
    if (!doc) return []
    const fields = ['gpirPublicationId', 'editionLineageId', 'supabaseRecordId', 'canonicalUrlCandidate']
    return fields.filter((field) => doc[field] !== entry.fields[field]).map((field) => ({ entryId: entry.entryId, field, source: entry.fields[field], target: doc[field] }))
  })
  const unresolved = target.docs.filter((doc: any) => doc.migrationStatus !== 'RECONCILED').map((doc: any) => doc.contentfulEntryId || doc.id)
  const duplicates = ['gpirPublicationId', 'supabaseRecordId', 'contentfulEntryId', 'canonicalUrlCandidate'].flatMap(duplicate)
  const report = { generatedAt: new Date().toISOString(), counts: { source: source.length, target: target.totalDocs, classification: classified.counts }, classification: { alerts: classified.alerts.map(e => e.entryId), t3Intelligence: classified.t3Intelligence.map(e => e.entryId), unclassified: classified.unclassified, otherContentTypes: classified.otherContentTypes }, missing, mismatched, duplicates, unresolved,
    status: !classified.unclassified.length && !missing.length && !mismatched.length && !duplicates.length && !unresolved.length && source.length === target.totalDocs ? 'PASS' : 'FAIL' }
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  process.stdout.write(`${JSON.stringify({ report: output, status: report.status, counts: report.counts })}\n`)
  if (report.status !== 'PASS') process.exitCode = 1
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
