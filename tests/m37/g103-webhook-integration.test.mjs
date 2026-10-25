import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalWebhookHandler } from '../../supabase/functions/gpir-paypal-webhook/handler.mjs';

const base='https://hoewtptllwkcqrgryazu.supabase.co';
const local='66666666-6666-4666-8666-666666666666';
const reader='22222222-2222-4222-8222-222222222222';
const subscription='I-674CH86A89ES';
const txn='7UC82239V8074274K';
const plan='P-SANDBOXPLAN123';
const env={SUPABASE_URL:base,GPIR_SUPABASE_PUBLISHABLE_KEY:'fixture',
 GPIR_SUPABASE_SECRET_KEY:'fixture_secret',PAYPAL_ENVIRONMENT:'sandbox',
 PAYPAL_CLIENT_ID:'fixture',PAYPAL_CLIENT_SECRET:'fixture',PAYPAL_WEBHOOK_ID:'WH-FIXTURE'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
function fixture({signature='SUCCESS',claim='CLAIMED',writer='RECORDED',status='COMPLETED'}={}){
 const event={id:'WH-TESTG103',event_type:'PAYMENT.SALE.COMPLETED',
 create_time:new Date(Date.now()-60000).toISOString(),
 resource:{id:txn,billing_agreement_id:subscription}};
 const calls=[];
 const fetchImpl=async(url,opts={})=>{
  const u=String(url);calls.push({url:u,body:opts.body});
  if(u.endsWith('/v1/oauth2/token'))return json({access_token:'fixture_token'});
  if(u.endsWith('/v1/notifications/verify-webhook-signature'))return json({verification_status:signature});
  if(u.endsWith('/rpc/gpir_claim_paypal_webhook_event_v2'))return json(claim);
  if(u.endsWith('/v1/billing/subscriptions/'+subscription))
   return json({id:subscription,custom_id:local,plan_id:plan,status:'ACTIVE',
    start_time:'2026-10-18T12:00:00Z',billing_info:{next_billing_time:'2026-11-18T12:00:00Z'}});
  if(u.endsWith('/rpc/gpir_get_paypal_subscription_for_webhook_v3'))
   return json([{local_subscription_id:local,user_id:reader,paypal_plan_id:plan,
    paypal_subscription_id:subscription,subscription_status:'ACTIVE'}]);
  if(u.endsWith('/rpc/gpir_subscription_reconciliation_context_v1'))
   return json([{local_subscription_id:local,paypal_plan_id:plan,
    expected_currency:'USD',expected_amount_minor:999}]);
  if(u.includes('/transactions?'))return json({total_pages:1,transactions:[{
   id:txn,status,time:event.create_time,
   amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'9.99'}}}]});
  if(u.endsWith('/rpc/gpir_record_verified_subscription_payment_v1'))return json(writer);
  if(u.endsWith('/rpc/gpir_finalize_paypal_subscription_v2'))return json(true);
  if(u.endsWith('/rpc/gpir_finish_paypal_webhook_event_v2'))return json(true);
  throw Error('Unexpected '+u);
 };
 const headers={'paypal-transmission-id':'fixture','paypal-transmission-time':event.create_time,
  'paypal-cert-url':'https://api-m.sandbox.paypal.com/cert','paypal-auth-algo':'SHA256withRSA',
  'paypal-transmission-sig':'fixture'};
 const request=new Request(base+'/functions/v1/gpir-paypal-webhook',{method:'POST',
  headers,body:JSON.stringify(event)});
 return {calls,request,fetchImpl};
}
async function run(options){
 const f=fixture(options);const response=await createPayPalWebhookHandler({env,
  fetchImpl:f.fetchImpl})(f.request);
 return {status:response.status,body:await response.json(),calls:f.calls};
}
test('signature-verified recurring sale writes evidence and completes event',async()=>{
 const r=await run();assert.equal(r.status,200);
 assert.equal(r.body.status,'RECORDED');
 assert.equal(r.calls.filter(x=>x.url.endsWith('/rpc/gpir_record_verified_subscription_payment_v1')).length,1);
 assert.ok(r.calls.some(x=>x.url.endsWith('/rpc/gpir_finish_paypal_webhook_event_v2')));
});
test('invalid signature does not claim or write',async()=>{
 const r=await run({signature:'FAILURE'});assert.equal(r.status,401);
 assert.equal(r.calls.some(x=>x.url.includes('/rpc/')),false);
});
test('replayed provider event never writes again',async()=>{
 const r=await run({claim:'DUPLICATE'});assert.equal(r.status,200);
 assert.equal(r.calls.some(x=>x.url.includes('/rpc/gpir_record_verified_subscription_payment_v1')),false);
});
test('pending provider transaction cannot write',async()=>{
 const r=await run({status:'PENDING'});assert.equal(r.status,503);
 assert.equal(r.calls.some(x=>x.url.includes('/rpc/gpir_record_verified_subscription_payment_v1')),false);
});
test('writer conflict returns retryable error, not success',async()=>{
 const r=await run({writer:'CONFLICT'});assert.equal(r.status,503);
});
