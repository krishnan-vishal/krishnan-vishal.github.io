import { createPublicIntelligenceHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createPublicIntelligenceHandler({ env }));
