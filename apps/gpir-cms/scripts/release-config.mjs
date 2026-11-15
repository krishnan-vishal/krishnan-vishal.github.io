export const runtimeKeys = [
  'PAYLOAD_SECRET', 'SUPABASE_URL', 'GPIR_SUPABASE_SECRET_KEY', 'GPIR_RELEASE_SIGNING_SECRET',
  'S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
]

export function productionSettings(environment, publicUrl) {
  const url = new URL(publicUrl)
  if (url.protocol !== 'https:' || !/^gpir-payload-cms\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.port) {
    throw new Error('Use only the isolated CMS HTTPS workers.dev origin.')
  }
  const missing = runtimeKeys.filter(key => !environment[key])
  if (missing.length) throw new Error('Missing private runtime settings: ' + missing.join(', '))
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS verification must remain enabled.')
  return { ...Object.fromEntries(runtimeKeys.map(key => [key, environment[key]])), PAYLOAD_PUBLIC_SERVER_URL: url.origin }
}

export function requireSuccessfulCI(runs, sha) {
  const evidence = {}
  for (const name of ['M41 Payload CMS validation', 'GPIR Security and Integrity']) {
    const latest = runs.filter(run => run.head_sha === sha && run.name === name)
      .sort((a, b) => b.id - a.id)[0]
    if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') {
      throw new Error('Current commit CI is not successful: ' + name)
    }
    evidence[name] = latest.id
  }
  return evidence
}
