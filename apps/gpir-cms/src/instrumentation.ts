/**
 * M41 temporary diagnostic: server-side Next.js request errors.
 *
 * Do not log error messages, request headers, cookies, query strings,
 * environment variables, database URLs, or full stack traces.
 * Remove after Payload Admin's initialization failure is resolved.
 */
export function onRequestError(
  error: unknown,
  request: { path?: string },
  context: { routePath?: string; routerKind?: string },
): void {
  const path = request?.path ?? ''
  const route = context?.routePath ?? ''
  if (!path.startsWith('/admin') && !route.includes('/admin')) return

  const candidate = error && typeof error === 'object'
    ? error as { name?: unknown; digest?: unknown }
    : null
  const name = typeof candidate?.name === 'string'
    && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(candidate.name)
    ? candidate.name
    : 'UnknownError'
  const digest = typeof candidate?.digest === 'string'
    && /^[A-Za-z0-9_-]{1,100}$/.test(candidate.digest)
    ? candidate.digest
    : 'none'

  console.error('[M41_PAYLOAD_ADMIN_SERVER_ERROR]', {
    name,
    digest,
    routerKind: context?.routerKind === 'App Router' ? 'App Router' : 'other',
  })
}
