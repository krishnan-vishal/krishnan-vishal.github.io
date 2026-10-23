import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalVerifySubscriptionHandler } from '../../supabase/functions/gpir-paypal-verify-subscription/handler.mjs';
const base = 'https://hoewtptllwkcqrgryazu.supabase.co';
const user = '22222222-2222-4222-8222-222222222222';
const local = '66666666-6666-4666-8666-666666666666';
const subscription = 'I-674CH86A89ES';
const txn = '7UC82239V8074274K';
const env = { SUPABASE_URL: base, GPIR_SUPABASE_PUBLISHABLE_KEY: 'fixture',
 GPIR_SUPABASE_SECRET_KEY: 'fixture_secret', GPIR_PAYPAL_ALLOWED_ORIGINS: 'https://fintechoisis.com',
 PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_CLIENT_ID: 'fixture', PAYPAL_CLIENT_SECRET: 'fixture' };
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const payment = { id: txn, status: 'COMPLETED', time: '2026-10-18T12:46:46Z',
 amount_with_breakdown: { gross_amount: { currency_code: 'USD', value: '9.99' } } };
function fixture({ payments=[payment], owner=user, writer='RECORDED', contextAmount=999 }={}) {
 const calls=[];
 const fetchImpl=async (url, options={})=>{
  const value=String(url);calls.push({value,options});
  if(value.endsWith('/auth/v1/user'))return json({id:owner});
  if(value.endsWith('/rpc/gpir_get_paypal_subscription_v2'))return owner===user?
   json([{local_subscription_id:local,paypal_subscription_id:subscription,paypal_plan_id:'P-SANDBOXPLAN123',subscription_status:'ACTIVE'}]):json([]);
  if(value.endsWith('/v1/oauth2/token'))return json({access_token:'fixture_token'});
  if(value.endsWith('/v1/billing/subscriptions/'+subscription))return json({
   id:subscription,custom_id:local,plan_id:'P-SANDBOXPLAN123',status:'ACTIVE',
   start_time:'2026-10-18T12:46:00Z',billing_info:{next_billing_time:'2026-11-18T12:46:00Z'}});
  if(value.endsWith('/rpc/gpir_finalize_paypal_subscription_v2'))return json(true);
  if(value.endsWith('/rpc/gpir_subscription_reconciliation_context_v1'))
   return json([{local_subscription_id:local,paypal_plan_id:'P-SANDBOXPLAN123',
    expected_currency:'USD',expected_amount_minor:contextAmount}]);
  if(value.includes('/transactions?'))return json({transactions:payments,total_pages:1});
  if(value.endsWith('/rpc/gpir_record_verified_subscription_payment_v1'))return json(writer);
  throw Error('Unexpected request '+value);
 };
 return {calls,fetchImpl};
}
async function invoke(options) {
 const f=fixture(options);
 const request=new Request(base+'/functions/v1/gpir-paypal-verify-subscription',{method:'POST',
  headers:{origin:'https://fintechoisis.com',authorization:'Bearer fixture',
   'content-type':'application/json'},body:JSON.stringify({subscriptionId:subscription})});
 const response=await createPayPalVerifySubscriptionHandler({env,fetchImpl:f.fetchImpl})(request);
 return {status:response.status,body:await response.json(),calls:f.calls};
}
test('provider-completed payment reaches server-only writer once',async()=>{
 const r=await invoke();
 assert.equal(r.status,200);assert.equal(r.body.paymentConfirmed,true);
 const call=r.calls.find(x=>x.value.endsWith('/rpc/gpir_record_verified_subscription_payment_v1'));
 assert.ok(call);
 const body=JSON.parse(call.options.body);
 assert.equal(body.p_paypal_transaction_id,txn);
 assert.equal(body.p_gross_amount_minor,999);
 assert.equal(body.p_reader_user_id,user);
});
test('idempotent writer duplicate remains confirmed',async()=>{
 const r=await invoke({writer:'DUPLICATE'});
 assert.equal(r.body.paymentConfirmed,true);
});
for(const [label,options] of [
 ['missing payment',{payments:[]}],
 ['wrong amount',{payments:[{...payment,amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'1.00'}}}]}],
 ['wrong currency',{payments:[{...payment,amount_with_breakdown:{gross_amount:{currency_code:'EUR',value:'9.99'}}}]}],
 ['pending payment',{payments:[{...payment,status:'PENDING'}]}],
 ['wrong plan amount',{contextAmount:1000}]
])test(label+' cannot write evidence',async()=>{
 const r=await invoke(options);
 assert.equal(r.body.paymentConfirmed,false);
 assert.equal(r.calls.some(x=>x.value.endsWith('/rpc/gpir_record_verified_subscription_payment_v1')),false);
});
test('another reader cannot reconcile subscription',async()=>{
 const r=await invoke({owner:'33333333-3333-4333-8333-333333333333'});
 assert.equal(r.status,404);
 assert.equal(r.calls.some(x=>x.value.includes('/transactions?')),false);
});
test('writer rejection fails closed',async()=>{
 const r=await invoke({writer:'REJECTED'});
 assert.equal(r.status,503);
 assert.equal(r.body.code,'PAYMENT_LEDGER_RECONCILIATION_FAILED');
});
