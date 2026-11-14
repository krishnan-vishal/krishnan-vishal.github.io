import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { Chapters } from './collections/Chapters'
import { Countries } from './collections/Countries'
import { EditorialMetadata } from './collections/EditorialMetadata'
import { Media } from './collections/Media'
import { Regions } from './collections/Regions'
import { ReleaseEvents } from './collections/ReleaseEvents'
import { ResearchPublications } from './collections/ResearchPublications'
import { Users } from './collections/Users'
import { releaseEndpoint } from './release/endpoint'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const storageConfigured = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']
  .every((name) => Boolean(process.env[name]))

export default buildConfig({
  admin: { user: Users.slug, meta: { titleSuffix: '— GPIR Editorial' } },
  collections: [Users, Regions, Countries, Chapters, EditorialMetadata, Media, ResearchPublications, ReleaseEvents],
  editor: lexicalEditor(),
  endpoints: [releaseEndpoint],
  secret: process.env.PAYLOAD_SECRET || '',
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
  cors: [process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'],
  csrf: [process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000'],
  db: postgresAdapter({
    pool: { connectionString: process.env.PAYLOAD_DATABASE_URI || '' },
    schemaName: 'payload',
    idType: 'uuid',
    push: false,
    disableCreateDatabase: true,
    migrationDir: path.resolve(dirname, 'migrations'),
    blocksAsJSON: true,
  }),
  plugins: [
    s3Storage({
      enabled: storageConfigured,
      collections: { media: { prefix: 'payload-media' } },
      bucket: process.env.S3_BUCKET || 'gpir-payload-media',
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'local',
        forcePathStyle: true,
        credentials: storageConfigured ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
        } : undefined,
      },
    }),
  ],
  sharp,
  typescript: { outputFile: path.resolve(dirname, '../payload-types.ts') },
})
