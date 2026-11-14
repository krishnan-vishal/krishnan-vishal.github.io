import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../payload.config'
import { canonicalPath, identityConflicts } from '../lib/identity'
import { collectContentfulLinks, contentfulToLexical } from '../lib/richText'
import { classifyContentfulEntries, contentfulLinkId, sha256, slugify } from './contentful'
import { releaseDecision } from '../release/release'

type State = { pass1: string[]; pass2: string[]; media: string[] }
const defaultState: State = { pass1: [], pass2: [], media: [] }

function option(name: string) {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length)
}

async function readJson(file: string) { return JSON.parse(await readFile(file, 'utf8')) }
async function save(file: string, value: unknown) {
  const temporary = `${file}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, file)
}
async function loadState(file: string): Promise<State> { try { return { ...defaultState, ...await readJson(file) } } catch { return structuredClone(defaultState) } }

async function main() {
  const backupArg = option('backup')
  if (!backupArg) throw new Error('Usage: npm run contentful:import -- --backup=PATH')
  const backup = path.resolve(backupArg)
  const [manifest, locales, rawEntries, rawAssets] = await Promise.all([
    readJson(path.join(backup, 'manifest.json')), readJson(path.join(backup, 'locales.json')),
    readJson(path.join(backup, 'entries.json')), readJson(path.join(backup, 'assets.json')),
  ])
  const locale = locales.find((item: any) => item.default)?.code || locales[0]?.code
  if (!locale) throw new Error('Contentful export has no locale.')
  const classified = classifyContentfulEntries(rawEntries, locale)
  process.stdout.write(`CONTENTFUL_CLASSIFICATION ${JSON.stringify({ counts: classified.counts, alerts: classified.alerts.map(e => e.entryId), t3Intelligence: classified.t3Intelligence.map(e => e.entryId), unclassified: classified.unclassified, otherContentTypes: classified.otherContentTypes })}\n`)
  if (classified.unclassified.length) throw new Error('Contentful classification blocked: unclassified entries require governed review.')
  const entries = classified.research
  const stateFile = path.resolve(option('checkpoint') || path.join(backup, 'import-checkpoint.json'))
  const state = await loadState(stateFile)
  const payload = await getPayload({ config })

  const referenceIds = new Map<string, string | number>()
  async function reference(collection: 'regions' | 'countries' | 'chapters' | 'editorial-metadata', key: string, data: any) {
    const field = collection === 'editorial-metadata' ? 'sourceRecordKey' : 'canonicalId'
    const existing = await payload.find({ collection, where: { [field]: { equals: key } }, limit: 2, overrideAccess: true })
    if (existing.totalDocs > 1) throw new Error(`Duplicate ${collection} identity ${key}.`)
    const doc = existing.docs[0] || await payload.create({ collection, data, overrideAccess: true })
    referenceIds.set(`${collection}:${key}`, doc.id)
    return doc
  }

  // Pass one: media and independent reference records, then identity-safe draft publications.
  for (const asset of rawAssets) {
    const assetId = asset.sys?.id
    if (!assetId || state.media.includes(assetId)) continue
    const mediaFile = manifest.media.find((item: any) => item.assetId === assetId && item.locale === locale)
    if (mediaFile) {
      const existing = await payload.find({ collection: 'media', where: { contentfulAssetId: { equals: assetId } }, limit: 2, overrideAccess: true })
      if (!existing.totalDocs) {
        await payload.create({ collection: 'media', overrideAccess: true, filePath: path.join(backup, mediaFile.relativePath), data: {
          alt: asset.fields?.description?.[locale] || asset.fields?.title?.[locale] || mediaFile.filename,
          contentfulAssetId: assetId, sourceSha256: mediaFile.sha256, sourceUrl: asset.fields?.file?.[locale]?.url,
          sourceFilename: mediaFile.filename, sourceMetadata: asset,
        } as any })
      }
    }
    state.media.push(assetId); await save(stateFile, state)
  }

  for (const entry of entries) {
    if (state.pass1.includes(entry.entryId)) continue
    const fields = entry.fields
    const publicationId = String(fields.gpirPublicationId || '').trim()
    const regionName = String(fields.region || '').trim()
    const countryName = String(fields.countryMarket || '').trim()
    const route = canonicalPath(fields.canonicalUrlCandidate)
    if (regionName) await reference('regions', `region:${slugify(regionName)}`, { canonicalId: `region:${slugify(regionName)}`, name: regionName, slug: slugify(regionName), status: 'ACTIVE', sourceModel: { source: 'contentful', value: regionName } })
    if (countryName) {
      const region = regionName ? referenceIds.get(`regions:region:${slugify(regionName)}`) : null
      if (!region) throw new Error(`Country ${countryName} has no resolvable region.`)
      await reference('countries', `country:${slugify(countryName)}`, { canonicalId: `country:${slugify(countryName)}`, name: countryName, slug: slugify(countryName), region, status: 'ACTIVE', sourceModel: { source: 'contentful', value: countryName } })
    }
    if (fields.publicationType === 'Research Chapter') await reference('chapters', `chapter:${publicationId}`, {
      canonicalId: `chapter:${publicationId}`, contentfulSourceId: entry.entryId, title: fields.publicationTitle,
      slug: fields.slug || slugify(fields.publicationTitle), canonicalUrl: `https://fintechoisis.com${route}`,
      publicationState: fields.publicationStatus || 'DRAFT', parentPublicationId: publicationId, sourceModel: entry,
    })
    const metadata = await reference('editorial-metadata', `contentful:${entry.entryId}`, {
      sourceRecordKey: `contentful:${entry.entryId}`, contentfulEntryId: entry.entryId,
      sourceValidationSummary: fields.sourceValidationSummary || 'Migration source validation unavailable.',
    })
    const existing = await payload.find({ collection: 'research-publications', where: { or: [
      { gpirPublicationId: { equals: publicationId } }, { contentfulEntryId: { equals: entry.entryId } },
      { supabaseRecordId: { equals: fields.supabaseRecordId } }, { canonicalUrlCandidate: { equals: route } },
    ] }, limit: 10, overrideAccess: true })
    const conflicts = identityConflicts({ gpirPublicationId: publicationId, contentfulEntryId: entry.entryId,
      supabaseRecordId: fields.supabaseRecordId, canonicalUrlCandidate: route }, existing.docs as any)
    if (existing.totalDocs > 1 || (existing.docs[0] && existing.docs[0].gpirPublicationId !== publicationId)) {
      throw new Error(`Publication identity conflict for ${entry.entryId}: ${conflicts.join('; ')}`)
    }
    if (!existing.totalDocs) {
      const decision = await releaseDecision({ gpirPublicationId: publicationId, supabaseRecordId: fields.supabaseRecordId,
        canonicalUrlCandidate: route }, process.env)
      await payload.create({ collection: 'research-publications', draft: true, overrideAccess: true, data: {
        _status: 'draft', gpirPublicationId: publicationId, editionLineageId: fields.editionLineageId,
        supabaseRecordId: fields.supabaseRecordId, contentfulEntryId: entry.entryId,
        publicationStatus: fields.publicationStatus || 'HISTORICAL', accessClass: decision.accessClass,
        validationStatus: fields.validationStatus || 'WARN', migrationStatus: 'IMPORTED',
        publicationTitle: fields.publicationTitle, slug: fields.slug || slugify(fields.publicationTitle),
        publicationType: fields.publicationType, canonicalUrlCandidate: route, canonicalUrl: `https://fintechoisis.com${route}`,
        publicationDate: fields.publicationDate || null, dataCutOffDate: fields.dataCutOffDate || null,
        editionLabel: fields.editionLabel || null, executiveSummary: fields.executiveSummary,
        editorialBody: contentfulToLexical({ nodeType: 'document', data: {}, content: [] }),
        contentfulSourceBody: fields.editorialBody, regionLabel: regionName || null,
        countryMarket: countryName || null, directionScope: fields.directionScope || null,
        useCasePaymentCategory: fields.useCasePaymentCategory || null, editorialMetadata: metadata.id,
        legacySourceUrl: fields.legacySourceUrl || null, sourceValidationSummary: fields.sourceValidationSummary,
        sourceHash: sha256(entry), sourceLineage: { source: 'contentful', entryId: entry.entryId, sys: entry.sys },
        contentfulSourceRecord: entry,
      } as any })
    }
    state.pass1.push(entry.entryId); await save(stateFile, state)
  }

  // Pass two: resolve relationships only after every target identity exists.
  for (const entry of entries) {
    if (state.pass2.includes(entry.entryId)) continue
    const fields = entry.fields
    const publication = (await payload.find({ collection: 'research-publications', where: { contentfulEntryId: { equals: entry.entryId } }, limit: 1, overrideAccess: true })).docs[0]
    if (!publication) throw new Error(`Pass-two publication missing for ${entry.entryId}.`)
    const regionId = fields.region ? referenceIds.get(`regions:region:${slugify(fields.region)}`) : null
    const countryId = fields.countryMarket ? referenceIds.get(`countries:country:${slugify(fields.countryMarket)}`) : null
    const chapterId = fields.publicationType === 'Research Chapter' ? referenceIds.get(`chapters:chapter:${fields.gpirPublicationId}`) : null
    const assetId = contentfulLinkId(fields.dashboardAsset)
    const media = assetId ? (await payload.find({ collection: 'media', where: { contentfulAssetId: { equals: assetId } }, limit: 1, overrideAccess: true })).docs[0] : null
    const links = collectContentfulLinks(fields.editorialBody)
    const resolvedLinks = new Map<string, { relationTo: string; value: string | number }>()
    for (const link of links) {
      if (link.kind === 'Asset') {
        const target = (await payload.find({ collection: 'media', where: { contentfulAssetId: { equals: link.id } }, limit: 2, overrideAccess: true })).docs
        if (target.length === 1) resolvedLinks.set(`Asset:${link.id}`, { relationTo: 'media', value: target[0].id })
      } else {
        const target = (await payload.find({ collection: 'research-publications', where: { contentfulEntryId: { equals: link.id } }, limit: 2, overrideAccess: true, draft: true })).docs
        if (target.length === 1) resolvedLinks.set(`Entry:${link.id}`, { relationTo: 'research-publications', value: target[0].id })
      }
    }
    const unresolved: string[] = []
    const editorialBody = contentfulToLexical(fields.editorialBody,
      (kind, id) => resolvedLinks.get(`${kind}:${id}`) || null,
      (kind, id) => unresolved.push(`${kind}:${id}`))
    if (unresolved.length) throw new Error(`Unresolved Rich Text links for ${entry.entryId}: ${[...new Set(unresolved)].join(', ')}`)
    await payload.update({ collection: 'research-publications', id: publication.id, draft: true, overrideAccess: true, data: {
      regions: regionId ? [regionId] : [], countries: countryId ? [countryId] : [], chapters: chapterId ? [chapterId] : [],
      dashboardAsset: media?.id || null, editorialBody, migrationStatus: 'RECONCILED',
    } as any })
    state.pass2.push(entry.entryId); await save(stateFile, state)
  }
  process.stdout.write(`${JSON.stringify({ source: entries.length, classification: classified.counts, pass1: state.pass1.length, pass2: state.pass2.length, media: state.media.length })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
