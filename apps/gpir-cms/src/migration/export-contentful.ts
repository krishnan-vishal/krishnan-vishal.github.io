import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { contentfulErrorMessage, localeValue, sha256 } from './contentful'

type ExportCheckpoint = { downloadedAssetFiles: string[] }

function option(name: string) {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length)
}

async function privateDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700).catch(() => undefined)
}

async function privateJson(file: string, value: unknown) {
  await privateDirectory(path.dirname(file))
  const temporary = `${file}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, file)
  await chmod(file, 0o600).catch(() => undefined)
}

async function checkpoint(file: string): Promise<ExportCheckpoint> {
  try { return JSON.parse(await readFile(file, 'utf8')) }
  catch { return { downloadedAssetFiles: [] } }
}

async function main() {
  const space = String(process.env.CONTENTFUL_SPACE_ID || '')
  const environment = String(process.env.CONTENTFUL_ENVIRONMENT || '')
  const token = String(process.env.CONTENTFUL_MANAGEMENT_TOKEN || '')
  if (!space || !environment || !token) throw new Error('CONTENTFUL_SPACE_ID, CONTENTFUL_ENVIRONMENT and CONTENTFUL_MANAGEMENT_TOKEN are required.')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const root = path.resolve(option('output') || process.env.CONTENTFUL_BACKUP_DIR || `../../.migration-data/contentful/${stamp}`)
  const stateFile = path.join(root, 'export-checkpoint.json')
  await privateDirectory(root)
  const base = `https://api.contentful.com/spaces/${encodeURIComponent(space)}/environments/${encodeURIComponent(environment)}`
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.contentful.management.v1+json' }
  async function request(url: string) {
    const response = await fetch(url, { headers })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(contentfulErrorMessage(response.status, body))
    return body
  }
  async function all(endpoint: string) {
    const items: any[] = []
    let skip = 0
    let total = 0
    do {
      const separator = endpoint.includes('?') ? '&' : '?'
      const page = await request(`${base}/${endpoint}${separator}limit=1000&skip=${skip}`)
      if (!Array.isArray(page.items) || !Number.isInteger(page.total)) throw new Error(`Malformed Contentful ${endpoint} response.`)
      items.push(...page.items)
      total = page.total
      skip = items.length
      if (!page.items.length && skip < total) throw new Error(`Contentful ${endpoint} pagination stopped early.`)
    } while (skip < total)
    return items
  }

  const [contentTypes, locales, entries, assets, tags] = await Promise.all([
    all('content_types'), all('locales'), all('entries'), all('assets'), all('tags'),
  ])
  const editorInterfaces = []
  for (const model of contentTypes) {
    editorInterfaces.push(await request(`${base}/content_types/${encodeURIComponent(model.sys.id)}/editor_interface`))
  }
  const files = { contentTypes, editorInterfaces, locales, entries, assets, tags }
  for (const [name, value] of Object.entries(files)) await privateJson(path.join(root, `${name}.json`), value)

  const state = await checkpoint(stateFile)
  const completed = new Set(state.downloadedAssetFiles)
  const media: any[] = []
  for (const asset of assets) {
    for (const locale of locales.map((item: any) => item.code)) {
      const file = localeValue<any>(asset.fields?.file, locale)
      if (!file?.url) continue
      const filename = path.basename(String(file.fileName || `${asset.sys.id}-${locale}`)).replace(/[^A-Za-z0-9._-]/g, '_')
      const key = `${asset.sys.id}/${locale}/${filename}`
      const destination = path.join(root, 'media', asset.sys.id, locale, filename)
      await privateDirectory(path.dirname(destination))
      if (!completed.has(key)) {
        const response = await fetch(String(file.url).startsWith('//') ? `https:${file.url}` : file.url)
        if (!response.ok) throw new Error(`Contentful asset ${asset.sys.id} download failed with HTTP ${response.status}.`)
        const buffer = Buffer.from(await response.arrayBuffer())
        await writeFile(destination, buffer, { mode: 0o600 })
        completed.add(key)
        await privateJson(stateFile, { downloadedAssetFiles: [...completed].sort() })
      }
      const bytes = await readFile(destination)
      media.push({ assetId: asset.sys.id, locale, filename, relativePath: path.relative(root, destination).replace(/\\/g, '/'), sha256: sha256(bytes), bytes: bytes.length })
    }
  }
  const manifest = {
    schemaVersion: '1.0.0', exportedAt: new Date().toISOString(), source: { space, environment },
    counts: { contentTypes: contentTypes.length, entries: entries.length, assets: assets.length, mediaFiles: media.length, locales: locales.length },
    files: Object.fromEntries(await Promise.all(Object.keys(files).map(async (name) => [name, sha256(await readFile(path.join(root, `${name}.json`)))]))),
    media,
  }
  await privateJson(path.join(root, 'manifest.json'), manifest)
  process.stdout.write(`${JSON.stringify({ backup: root, counts: manifest.counts })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
