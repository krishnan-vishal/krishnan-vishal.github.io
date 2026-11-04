import { createReaderSummaryHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'GPIR_SUPABASE_PUBLISHABLE_KEY',
  'GPIR_SUPABASE_SECRET_KEY',
  'GPIR_ALLOWED_ORIGINS',
  'GPIR_PAYMENT_ENVIRONMENT',
  'GPIR_FX_LIVE_ACCEPTANCE_ENABLED',
  'GPIR_FX_LIVE_ACCEPTANCE_USER_ID'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createReaderSummaryHandler({ env }));
