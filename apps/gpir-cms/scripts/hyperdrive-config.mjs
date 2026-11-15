export function directSupabaseOrigin(environment) {
  const project = new URL(environment.SUPABASE_URL)
  if (!/^[a-z0-9]+\.supabase\.co$/.test(project.hostname)) {
    throw new Error('Use the existing project SUPABASE_URL, not a custom API domain.')
  }
  const ref = project.hostname.split('.')[0]
  const uri = new URL(environment.PAYLOAD_DATABASE_URI)
  if (!['postgres:', 'postgresql:'].includes(uri.protocol)) throw new Error('PostgreSQL URI required.')
  if (!uri.password || !uri.username) throw new Error('Database login credentials are missing.')
  const directHost = 'db.' + ref + '.supabase.co'
  if (uri.hostname.endsWith('.pooler.supabase.com')) {
    const user = decodeURIComponent(uri.username)
    const suffix = '.' + ref
    if (!user.endsWith(suffix)) throw new Error('Pooler login does not match the configured Supabase project.')
    uri.username = encodeURIComponent(user.slice(0, -suffix.length))
    uri.hostname = directHost
    uri.port = '5432'
  } else if (uri.hostname !== directHost) {
    throw new Error('Database host does not match the configured Supabase project.')
  }
  if (uri.port && uri.port !== '5432') throw new Error('Use the Supabase direct PostgreSQL port.')
  if (uri.pathname !== '/postgres') throw new Error('Unexpected database name; review before provisioning.')
  uri.search = ''
  uri.hash = ''
  return uri
}

export function parseCliJson(output) {
  for (let i = output.indexOf('{'); i !== -1; i = output.indexOf('{', i + 1)) {
    try { return JSON.parse(output.slice(i).trim()) } catch {}
  }
  throw new Error('Could not parse the Cloudflare configuration response.')
}

export function validateHyperdrive(config, origin, caId) {
  const sameOrigin = config.origin?.host === origin.hostname &&
    Number(config.origin?.port) === Number(origin.port || 5432) &&
    config.origin?.user === decodeURIComponent(origin.username) &&
    config.origin?.database === origin.pathname.slice(1)
  if (!sameOrigin || config.mtls?.sslmode !== 'verify-full' ||
      config.mtls?.ca_certificate_id !== caId || config.caching?.disabled !== true) {
    throw new Error('Hyperdrive must match the existing database, trusted CA, verify-full and disabled caching.')
  }
}
