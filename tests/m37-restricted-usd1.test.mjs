import test from 'node:test';
import assert from 'node:assert/strict';
import { preparedOrder, verifiedCapture } from '../supabase/functions/_shared/gpir-onetime-production.mjs';
import { validInput } from '../supabase/functions/gpir-onetime-create-order/handler.mjs';

const id='11111111-1111-4111-8111-111111111111';
const row={local_order_id:id,offer_id:'00000000-0000-4000-8000-000000000100',
  pass_id:'GPIR_PREMIUM_LIBRARY_30D',publication_id:'PREMIUM_LIBRARY',
  supabase_record_id:null,display_name:'Restricted test',currency:'USD',
  expected_amount_minor:100,access_duration_days:30,
  paypal_order_id:null,provider_request_id:'gpir-m37-'+id,
  sku:'GPIR_PREMIUM_LIBRARY_30D'};
test('restricted USD1 order is rejected by ordinary validation',()=>{
  assert.equal(preparedOrder([row]),null);
});
test('explicit restricted USD1 order is accepted with immutable amount',()=>{
  const local=preparedOrder([row],{restrictedTest:true});
  assert.equal(local.amount,'1.00');
  assert.equal(local.expectedAmountMinor,100);
  assert.equal(local.durationDays,30);
});
test('restricted flag cannot authorize a non-USD or altered amount',()=>{
  assert.equal(preparedOrder([{...row,currency:'EUR'}],{restrictedTest:true}),null);
  assert.equal(preparedOrder([{...row,expected_amount_minor:101}],{restrictedTest:true}),null);
});
test('request validation requires a valid pass and UUID',()=>{
  assert.ok(validInput({passId:'GPIR_PREMIUM_LIBRARY_30D',currency:'USD',requestId:id,restrictedTest:true}));
  assert.equal(validInput({passId:'GPIR_PREMIUM_LIBRARY_30D',currency:'USD',requestId:'bad',restrictedTest:true}),false);
});
test('capture must match stored USD1 amount and order',()=>{
  const local={...preparedOrder([row],{restrictedTest:true}),paypal_order_id:'ORDER12345'};
  const provider={id:'ORDER12345',status:'COMPLETED',purchase_units:[{
    custom_id:id,payments:{captures:[{id:'CAPTURE12345',status:'COMPLETED',
      amount:{currency_code:'USD',value:'1.00'}}]}}]};
  assert.equal(verifiedCapture(provider,local).amountMinor,100);
  assert.equal(verifiedCapture({...provider,purchase_units:[{...provider.purchase_units[0],
    payments:{captures:[{...provider.purchase_units[0].payments.captures[0],
      amount:{currency_code:'USD',value:'9.99'}}]}}]},local),null);
});
