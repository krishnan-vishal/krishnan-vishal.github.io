import { withPayload } from '@payloadcms/next/withPayload'

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
}

export default withPayload(nextConfig)
