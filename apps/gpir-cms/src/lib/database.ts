import { getCloudflareContext } from '@opennextjs/cloudflare'
import { Socket } from 'node:net'
import type { PoolConfig } from 'pg'

type DatabaseEnvironment = Record<string, string | undefined>
type HyperdriveBinding = { connectionString: string }

// Hyperdrive verifies the origin CA and hostname using its verify-full config.
// The binding's private transport must not be replaced with a public DB URI.
export function databasePoolOptions(options: {
  worker: boolean
  environment: DatabaseEnvironment
  hyperdrive?: HyperdriveBinding
}): PoolConfig & { connectionString: string; maxUses: number; connectionTimeoutMillis: number } {
  const common = { maxUses: 1, connectionTimeoutMillis: 15000 }
  if (options.worker) {
    if (!options.hyperdrive?.connectionString) {
      throw new Error('M41 CMS requires the HYPERDRIVE binding; direct Worker database fallback is prohibited.')
    }
    return {
      ...common,
      connectionString: options.hyperdrive.connectionString,
      // Use Workers' supported Node socket lifecycle instead of pg-cloudflare
      // 1.4.1's clean-end read rejection. Hyperdrive still verifies origin TLS.
      stream: () => new Socket(),
    }
  }

  const uri = new URL(options.environment.PAYLOAD_DATABASE_URI || '')
  if (!['postgres:', 'postgresql:'].includes(uri.protocol)) {
    throw new Error('M41 CMS requires a PostgreSQL database URI.')
  }
  // pg connection-string SSL options can replace the explicit TLS object.
  for (const key of [...uri.searchParams.keys()]) {
    if (key.startsWith('ssl')) uri.searchParams.delete(key)
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)
  const ca = options.environment.PAYLOAD_DATABASE_CA_CERT?.replace(/\\n/g, '\n')
  return {
    ...common,
    connectionString: uri.toString(),
    ...(!local ? { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } } : {}),
  }
}

export function cmsDatabasePool() {
  const worker = typeof navigator === 'object' && navigator.userAgent === 'Cloudflare-Workers'
  const hyperdrive = worker
    ? (getCloudflareContext().env as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE
    : undefined
  return databasePoolOptions({ worker, environment: process.env, hyperdrive })
}
