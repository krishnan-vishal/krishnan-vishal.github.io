import { createOnetimeCreateOrderHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'GPIR_SUPABASE_PUBLISHABLE_KEY',
  'GPIR_SUPABASE_SECRET_KEY',
  'GPIR_ONETIME_ALLOWED_ORIGINS',
  'ONETIME_CHECKOUT_ENABLED',
  'PAYPAL_ENVIRONMENT',
  'PAYPAL_ENV',
  'PAYPAL_BASE_URL',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'GPIR_M37_TEST_READER_UUID',
  'GPIR_M37_USD1_TEST_ENABLED'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createOnetimeCreateOrderHandler({ env }));
