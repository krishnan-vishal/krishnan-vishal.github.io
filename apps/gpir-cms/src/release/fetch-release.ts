import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function option(name: string) { const prefix = `--${name}=`; return process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length) }

async function main() {
  const base = String(process.env.PAYLOAD_PUBLIC_SERVER_URL || '').replace(/\/$/, '')
  const key = String(process.env.PAYLOAD_RELEASE_API_KEY || '')
  if (!/^https?:\/\//.test(base) || !key) throw new Error('PAYLOAD_PUBLIC_SERVER_URL and PAYLOAD_RELEASE_API_KEY are required.')
  const mode = String(option('mode') || 'PREVIEW').toUpperCase()
  const output = path.resolve(option('output') || '../../.generated/payload')
  const response = await fetch(`${base}/api/release/research-publications`, {
    method: 'POST', headers: { authorization: `users API-Key ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ mode }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Payload release service failed with HTTP ${response.status}: ${body.error || 'UNKNOWN'}`)
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(path.join(output, 'payload-publications.json'), `${JSON.stringify(body.artifact, null, 2)}\n`),
    writeFile(path.join(output, 'release-decisions.json'), `${JSON.stringify(body.decisions, null, 2)}\n`),
    writeFile(path.join(output, 'release-integrity.json'), `${JSON.stringify({ artifactId: body.artifactId, mode: body.mode, integrity: body.integrity }, null, 2)}\n`),
  ])
  process.stdout.write(`${JSON.stringify({ artifactId: body.artifactId, records: body.artifact.recordCount, output })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
