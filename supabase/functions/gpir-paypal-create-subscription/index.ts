import { createPayPalCreateSubscriptionHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'GPIR_SUPABASE_PUBLISHABLE_KEY',
  'GPIR_SUPABASE_SECRET_KEY',
  'GPIR_PAYPAL_ALLOWED_ORIGINS',
  'PAYPAL_ENVIRONMENT',
  'GPIR_PAYPAL_PRODUCTION_ENABLED',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createPayPalCreateSubscriptionHandler({ env }));
