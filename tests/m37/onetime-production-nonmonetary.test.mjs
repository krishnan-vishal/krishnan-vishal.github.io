import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onetimeConfiguration, allowedOrigins, normalizedOffer, verifiedCapture }
  from '../../supabase/functions/_shared/gpir-onetime-production.mjs';
import { isSupportedCurrency, formatPayPalAmount, parsePayPalAmount }
  from '../../supabase/functions/_shared/gpir-onetime-currency.mjs';
import { createOnetimeCreateOrderHandler }
  from '../../supabase/functions/gpir-onetime-create-order/handler.mjs';

const env = {
  SUPABASE_URL: 'https://qlnvhfapctcpzqyuhhth.supabase.co',
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  GPIR_SUPABASE_SECRET_KEY: 'sb_secret_test',
  GPIR_ONETIME_ALLOWED_ORIGINS: 'https://fintechoisis.com',
  ONETIME_CHECKOUT_ENABLED: 'true',
  PAYPAL_ENVIRONMENT: 'live',
  PAYPAL_BASE_URL: 'https://api-m.paypal.com',
  PAYPAL_CLIENT_ID: 'test-client',
  PAYPAL_CLIENT_SECRET: 'test-secret'
};
const currencies = ['USD','EUR','GBP','SGD','AUD','CAD'];
test('six approved currencies and exact prices only', () => {
  assert.deepEqual(currencies.filter(isSupportedCurrency), currencies);
  assert.equal(isSupportedCurrency('JPY'), false);
  for (const currency of currencies) {
    assert.equal(formatPayPalAmount(currency, 999), '9.99');
    assert.equal(parsePayPalAmount(currency, '9.99'), 999);
  }
});
test('production config is fail closed for disabled, sandbox, wrong project, wrong PayPal base', () => {
  assert.equal(onetimeConfiguration({...env,ONETIME_CHECKOUT_ENABLED:'false'}), null);
  assert.equal(onetimeConfiguration({...env,PAYPAL_ENVIRONMENT:'sandbox'}), null);
  assert.equal(onetimeConfiguration({...env,SUPABASE_URL:'https://hoewtptllwkcqrgryazu.supabase.co'}), null);
  assert.equal(onetimeConfiguration({...env,PAYPAL_BASE_URL:'https://api-m.sandbox.paypal.com'}), null);
  assert.equal(onetimeConfiguration(env)?.PAYMENT_ENVIRONMENT,'LIVE');
});
test('allowed browser origins do not include sandbox preview', () => {
  const origins=allowedOrigins(env);
  assert.equal(origins.has('https://fintechoisis.com'),true);
  assert.equal(origins.has('https://gpir-m37-sandbox-checkout-20261026.amusedhill18.chatgpt.site'),false);
});
test('non-Premium and unapproved currency offers rejected', () => {
  const row={offer_id:'123e4567-e89b-42d3-a456-426614174000',
    pass_id:'GPIR_PREMIUM_LIBRARY_30D',publication_id:'PREMIUM_LIBRARY',
    supabase_record_id:null,display_name:'GPIR Premium Library',currency:'USD',
    unit_amount_minor:999,access_duration_days:30};
  assert.equal(normalizedOffer(row)?.amount,'9.99');
  assert.equal(normalizedOffer({...row,currency:'JPY'}),null);
  assert.equal(normalizedOffer({...row,publication_id:'OTHER'}),null);
  assert.equal(normalizedOffer({...row,unit_amount_minor:1000}),null);
  assert.equal(normalizedOffer({...row,access_duration_days:31}),null);
});
test('payment capture must match currency, amount, order and COMPLETED', () => {
  const local={paypal_order_id:'ORDER-12345678',local_order_id:'123e4567-e89b-42d3-a456-426614174000',currency:'EUR',expected_amount_minor:999};
  const order={id:local.paypal_order_id,status:'COMPLETED',purchase_units:[{custom_id:local.local_order_id,payments:{captures:[{id:'CAPTURE-12345678',status:'COMPLETED',amount:{currency_code:'EUR',value:'9.99'}}]}}]};
  assert.ok(verifiedCapture(order,local));
  assert.equal(verifiedCapture({...order,status:'APPROVED'},local),null);
  assert.equal(verifiedCapture({...order,purchase_units:[{...order.purchase_units[0],payments:{captures:[{...order.purchase_units[0].payments.captures[0],amount:{currency_code:'EUR',value:'8.99'}}]}}]},local),null);
});
test('disabled checkout cannot create an order or call PayPal',async()=>{
  let calls=0;
  const handler=createOnetimeCreateOrderHandler({env:{...env,ONETIME_CHECKOUT_ENABLED:'false'},fetchImpl:()=>{calls++;throw Error('unexpected external call')}});
  const response=await handler(new Request('https://example.test/',{method:'GET',headers:{origin:'https://fintechoisis.com'}}));
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'ONETIME_CHECKOUT_DISABLED');
  assert.equal(calls,0);
});

test('repository release contract keeps all six Production offers disabled and one grant per order', () => {
  const manifest = JSON.parse(fs.readFileSync(
    'release/m37/six-currency-offers.production.json', 'utf8'));
  assert.equal(manifest.activation, 'DISABLED');
  assert.deepEqual(manifest.offers.map(offer => offer.currency), currencies);
  assert.ok(manifest.offers.every(offer => offer.amountMinor === 999 &&
    offer.displayAmount === '9.99' && offer.enabledForPayment === false));
  const catalog = fs.readFileSync(
    'supabase/migrations/20261027000100_m37_six_currency_disabled_catalog.sql', 'utf8');
  const evidence = fs.readFileSync(
    'supabase/migrations/20261027000200_m37_production_disabled_payment_evidence_foundation.sql',
    'utf8');
  assert.match(catalog, /onetime_status text NOT NULL DEFAULT 'DISABLED'/);
  assert.match(catalog, /CHECK \(onetime_amount_minor=999\)/);
  assert.match(catalog, /CHECK \(onetime_duration_days=30\)/);
  assert.match(evidence, /source_order_id uuid NOT NULL UNIQUE/);
  assert.match(evidence, /paypal_capture_id text UNIQUE/);
  assert.match(evidence, /provider_event_id text NOT NULL UNIQUE/);
});
