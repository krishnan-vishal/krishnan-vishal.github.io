import { createPublicIntelligenceHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
].map(name => [name, Deno.env.get(name)]));

// M40 controlled activation: snapshot reads are eligible only for unfiltered aggregates.
Deno.serve(createPublicIntelligenceHandler({ env: { ...env, M40_SNAPSHOT_READ_ENABLED: 'true' } }));
