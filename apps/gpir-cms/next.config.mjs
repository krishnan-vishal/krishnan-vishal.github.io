import { withPayload } from '@payloadcms/next/withPayload'

import { fileURLToPath } from 'node:url'

const nextConfig = {
  turbopack: { root: fileURLToPath(new URL('../../', import.meta.url)) },
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
}

export default withPayload(nextConfig)
