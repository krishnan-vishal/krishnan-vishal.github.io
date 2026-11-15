import { directSupabaseOrigin } from '../../apps/gpir-cms/scripts/hyperdrive-config.mjs'
// Resolve existing access only. No credential creation, rotation, logging or writes.
export async function existingContentfulDeliveryToken(env, fetchImpl = fetch, remember = () => {}) {
  if (env.CONTENTFUL_DELIVERY_TOKEN) {
    remember(env.CONTENTFUL_DELIVERY_TOKEN)
    return { token: env.CONTENTFUL_DELIVERY_TOKEN, source: 'EXISTING_ENVIRONMENT' }
  }
  const space = encodeURIComponent(env.CONTENTFUL_SPACE_ID || '')
  const environment = String(env.CONTENTFUL_ENVIRONMENT || '')
  const management = env.CONTENTFUL_MANAGEMENT_TOKEN
  if (!space || !environment || !management) throw new Error('Existing Contentful space, environment and management access are required.')
  const root = `https://api.contentful.com/spaces/${space}/api_keys`
  async function read(url) {
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${management}` } })
    if (!response.ok) throw new Error(`Existing Contentful key lookup denied (HTTP ${response.status}); no key was created or changed.`)
    try { return await response.json() } catch { throw new Error('Existing Contentful key inventory returned invalid JSON; response details withheld.') }
  }
  for (let skip = 0, pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = await read(`${root}?limit=100&skip=${skip}`)
    if (!Array.isArray(page.items) || !Number.isInteger(page.total)) throw new Error('Existing Contentful key inventory is incomplete.')
    // Register every returned credential before any later operation can fail.
    for (const key of page.items) if (typeof key.accessToken === 'string') remember(key.accessToken)
    for (const listed of page.items) {
      const key = listed.accessToken ? listed : await read(`${root}/${encodeURIComponent(listed.sys?.id || '')}`)
      if (typeof key.accessToken !== 'string' || !key.accessToken) continue
      remember(key.accessToken)
      const scopes = Array.isArray(key.environments) ? key.environments.map(item => item.sys?.id) : []
      if (scopes.length && !scopes.includes(environment)) continue
      const url = `https://cdn.contentful.com/spaces/${space}/environments/${encodeURIComponent(environment)}/entries?limit=1`
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${key.accessToken}` } })
      if (!response.ok) continue
      const body = await response.json().catch(() => null)
      if (Array.isArray(body?.items) && Number.isInteger(body.total)) return { token: key.accessToken, source: 'EXISTING_KEY_READ_ONLY_LOOKUP' }
    }
    skip += page.items.length
    if (skip >= page.total) break
    if (!page.items.length) throw new Error('Existing Contentful key pagination stopped early.')
  }
  throw new Error('No existing Delivery key could read the selected Contentful environment. No key was created or modified.')
}

export async function existingCloudflareAccount(env, identity, inspectAccount) {
  const configured = env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID
  const listed = Array.isArray(identity?.accounts) ? identity.accounts.map(item => item.id) : []
  const candidates = configured ? [configured] : [...new Set(listed)]
  if (!candidates.length || candidates.some(id => !/^[a-f0-9]{32}$/i.test(id))) throw new Error('Wrangler login did not provide a usable account; no account was guessed.')
  const matches = []
  for (const id of candidates) if (await inspectAccount(id)) matches.push(id)
  if (matches.length !== 1) throw new Error('The existing verified CMS Hyperdrive binding must identify exactly one Cloudflare account.')
  return { accountId: matches[0], source: configured ? 'EXISTING_ACCOUNT_SETTING' : 'EXISTING_WRANGLER_LOGIN_AND_VERIFIED_BINDING' }
}

export function supabaseProjectBoundaries(env, browserConfiguration) {
  function origin(value, label) {
    let url
    try { url = new URL(value) } catch { throw new Error(`${label} must be an existing HTTPS Supabase project URL.`) }
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') throw new Error(`${label} must be an existing HTTPS Supabase project origin.`)
    return url.origin
  }
  const urls = [...String(browserConfiguration).matchAll(/\burl\s*:\s*['"](https:\/\/[a-z0-9]+\.supabase\.co\/?)[\'"]/g)].map(item => origin(item[1], 'Public GPIR Core'))
  if (new Set(urls).size !== 1) throw new Error('The committed public GPIR configuration must identify exactly one Core project.')
  const coreSupabaseURL = urls[0]
  const cmsSupabaseURL = origin(env.SUPABASE_URL, 'Private CMS')
  directSupabaseOrigin({ ...env, SUPABASE_URL: cmsSupabaseURL })
  if (env.GPIR_CORE_SUPABASE_URL && origin(env.GPIR_CORE_SUPABASE_URL, 'Explicit Core') !== coreSupabaseURL) throw new Error('The Core override differs from the unchanged public website; no Core target was redirected.')
  return { cmsProjectRef: new URL(cmsSupabaseURL).hostname.split('.')[0], cmsSupabaseURL,
    coreProjectRef: new URL(coreSupabaseURL).hostname.split('.')[0], coreSupabaseURL }
}

export async function existingCoreReleaseKey(env, coreURL, fetchImpl = fetch, remember = () => {}, readExistingKeys) {
  const names = env.GPIR_CORE_SUPABASE_SECRET_KEY ? ['GPIR_CORE_SUPABASE_SECRET_KEY'] : ['GPIR_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']
  const seen = new Set()
  const coreRef = new URL(coreURL).hostname.split('.')[0]
  for (const name of names) {
    const value = env[name]
    if (!value || seen.has(value)) continue
    seen.add(value); remember(value)
    const modern = value.startsWith('sb_secret_')
    if (!modern) {
      let claims
      try { claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')) } catch { continue }
      if (claims.role !== 'service_role' || (claims.ref && claims.ref !== coreRef)) continue
    }
    const headers = new Headers()
    headers.set('apikey', value)
    if (!modern) headers.set('authorization', `Bearer ${value}`)
    const response = await fetchImpl(`${coreURL}/rest/v1/source_registry?select=source_id&limit=1`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers })
    if ([401, 403].includes(response.status)) continue
    if (!response.ok) throw new Error(`The existing GPIR Core release authority is unavailable (HTTP ${response.status}); no deployment performed.`)
    if (Array.isArray(await response.json().catch(() => null))) return { key: value, source: name }
  }
  if (readExistingKeys && !env.GPIR_CORE_SUPABASE_SECRET_KEY) {
    const keys = await readExistingKeys(coreRef)
    if (!Array.isArray(keys)) throw new Error('Existing Core key inventory was incomplete; no deployment performed.')
    for (const item of keys) if (typeof item.api_key === 'string') remember(item.api_key)
    for (const item of keys) {
      if (!['service_role', 'secret'].includes(item.name) && item.type !== 'secret') continue
      if (typeof item.api_key !== 'string' || !item.api_key) continue
      try {
        const result = await existingCoreReleaseKey({ GPIR_CORE_SUPABASE_SECRET_KEY: item.api_key }, coreURL, fetchImpl, remember)
        return { ...result, source: 'EXISTING_CORE_KEY_READ_ONLY_CLI_LOOKUP' }
      } catch { /* Try another existing key, without returning credential details. */ }
    }
  }
  throw new Error(`No existing private release key authenticated the unchanged GPIR Core project ${coreRef}. CMS credentials were not substituted and no key was created.`)
}
