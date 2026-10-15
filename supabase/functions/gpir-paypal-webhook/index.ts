import { createPayPalWebhookHandler } from './handler.mjs';

const env = Object.fromEntries([
  'SUPABASE_URL',
  'GPIR_SUPABASE_PUBLISHABLE_KEY',
  'GPIR_SUPABASE_SECRET_KEY',
  'PAYPAL_ENVIRONMENT',
  'GPIR_PAYPAL_PRODUCTION_ENABLED',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID'
].map(name => [name, Deno.env.get(name)]));

Deno.serve(createPayPalWebhookHandler({ env }));
