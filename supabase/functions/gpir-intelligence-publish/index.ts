import { createPublicationHandler } from './handler.mjs';
import { createOperationalPublicationHandler } from '../_shared/gpir-operational-graph.ts';

const env = Object.fromEntries([
  'GPIR_EDITORIAL_SOURCE',
  'PAYLOAD_PUBLIC_SERVER_URL',
  'PAYLOAD_RELEASE_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CONTENTFUL_SPACE_ID',
  'CONTENTFUL_ENVIRONMENT',
  'CONTENTFUL_DELIVERY_TOKEN'
].map(name => [name, Deno.env.get(name)]));

const publicationHandler = createPublicationHandler({ env });

Deno.serve(createOperationalPublicationHandler(publicationHandler));
