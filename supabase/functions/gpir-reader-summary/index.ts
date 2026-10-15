import { createReaderSummaryHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'GPIR_SUPABASE_PUBLISHABLE_KEY',
  'GPIR_SUPABASE_SECRET_KEY',
  'GPIR_ALLOWED_ORIGINS',
  'GPIR_PAYMENT_ENVIRONMENT'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createReaderSummaryHandler({ env }));
