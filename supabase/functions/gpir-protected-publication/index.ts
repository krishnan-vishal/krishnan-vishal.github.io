import { createProtectedPublicationHandler } from './handler.mjs';

const env = Object.fromEntries([
  'GPIR_EDITORIAL_SOURCE',
  'PAYLOAD_PUBLIC_SERVER_URL',
  'PAYLOAD_RELEASE_API_KEY',
  'SUPABASE_URL',
  'GPIR_SUPABASE_PUBLISHABLE_KEY',
  'CONTENTFUL_SPACE_ID',
  'CONTENTFUL_ENVIRONMENT',
  'CONTENTFUL_DELIVERY_TOKEN'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createProtectedPublicationHandler({ env }));

