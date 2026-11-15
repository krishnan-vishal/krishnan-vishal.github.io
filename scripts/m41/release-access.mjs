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
