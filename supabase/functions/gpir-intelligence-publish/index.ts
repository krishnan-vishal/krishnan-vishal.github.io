import { createPublicationPipeline } from './handler.mjs';
import { createOperationalPublicationHandler } from '../_shared/gpir-operational-graph.ts';
import { createAdaptiveAcquisition } from '../_shared/gpir-adaptive-acquisition.mjs';
import { withSupabase } from 'jsr:@supabase/server@1.9.2';

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

const publicationHandler = createPublicationPipeline({ env, acquisition: createAdaptiveAcquisition() });
const run = createOperationalPublicationHandler(publicationHandler);

// The existing scheduler and history runner use the same service credential as
// the acquisition function. Public or subscriber JWTs cannot trigger a scout.
Deno.serve(withSupabase({ auth: ['secret'] }, req => run(req)));
