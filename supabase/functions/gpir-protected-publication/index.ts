import { createProtectedPublicationHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'GPIR_SUPABASE_PUBLISHABLE_KEY',
  'CONTENTFUL_SPACE_ID',
  'CONTENTFUL_ENVIRONMENT',
  'CONTENTFUL_DELIVERY_TOKEN'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createProtectedPublicationHandler({ env }));

