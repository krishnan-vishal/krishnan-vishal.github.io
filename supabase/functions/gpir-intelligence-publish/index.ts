import { createPublicationHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CONTENTFUL_SPACE_ID',
  'CONTENTFUL_ENVIRONMENT',
  'CONTENTFUL_DELIVERY_TOKEN'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createPublicationHandler({ env }));
