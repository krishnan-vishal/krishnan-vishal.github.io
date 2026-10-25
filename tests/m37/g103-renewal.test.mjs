import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSubscriptionSale } from '../../supabase/functions/gpir-paypal-webhook/recurring-sale.mjs';

const base = 'https://hoewtptllwkcqrgryazu.supabase.co';
const reader = '22222222-2222-4222-8222-222222222222';
const local = '66666666-6666-4666-8666-666666666666';
const sub = 'I-674CH86A89ES';
const txn = '7UC82239V8074274K';
const plan = 'P-SANDBOXPLAN123';
const config = { SUPABASE_URL:base, GPIR_SUPABASE_SECRET_KEY:'fixture',
 PAYMENT_ENVIRONMENT:'SANDBOX', PAYPAL_BASE_URL:'https://api-m.sandbox.paypal.com' };
const json = (data,status=200) => new Response(JSON.stringify(data),{status});
function fixture({ status='COMPLETED', amount='9.99', currency='USD',
 writer='RECORDED', pages=1, providerPlan=plan, owner=reader,
 lookupStatus=200, contextLocal=local, nextBilling=true, finalized=true }={}) {
 const calls=[];
 const event={ id:'WH-TESTG103',event_type:'PAYMENT.SALE.COMPLETED',
  create_time:new Date(Date.now()-60000).toISOString(),
  resource:{id:txn,billing_agreement_id:sub} };
 const fetchImpl=async (url,options={})=>{
  const u=String(url); calls.push({url:u,body:options.body});
  if(u.endsWith('/v1/billing/subscriptions/'+sub))return json({
   id:sub,custom_id:local,plan_id:providerPlan,status:'ACTIVE',
   start_time:'2026-10-18T12:00:00Z',billing_info:nextBilling?{
    next_billing_time:'2026-11-18T12:00:00Z'}:{}});
  if(u.endsWith('/rpc/gpir_get_paypal_subscription_for_webhook_v3'))
   return json([{local_subscription_id:local,paypal_plan_id:plan,
    paypal_subscription_id:sub,subscription_status:'ACTIVE',user_id:owner}]);
  if(u.endsWith('/rpc/gpir_subscription_reconciliation_context_v1'))
   return lookupStatus===200?json([{local_subscription_id:contextLocal,paypal_plan_id:plan,
    expected_currency:'USD',expected_amount_minor:999}]):json({code:'PGRST202'},lookupStatus);
  if(u.includes('/transactions?'))return json({total_pages:pages,transactions:[{
   id:txn,status,time:event.create_time,amount_with_breakdown:{
    gross_amount:{currency_code:currency,value:amount}}}]});
  if(u.endsWith('/rpc/gpir_record_verified_subscription_payment_v1'))return json(writer);
  if(u.endsWith('/rpc/gpir_finalize_paypal_subscription_v2'))return json(finalized);
  throw Error('Unexpected request '+u);
 };
 return {event,calls,fetchImpl};
}
async function run(options){
 const f=fixture(options);
 const result=await reconcileSubscriptionSale({event:f.event,config,
  accessToken:'fixture',fetchImpl:f.fetchImpl});
 return {...f,result,write:f.calls.find(x=>x.url.endsWith('/rpc/gpir_record_verified_subscription_payment_v1'))};
}
test('verified renewal recorded with provider event identity',async()=>{
 const r=await run();assert.deepEqual(r.result,{ok:true,status:'RECORDED'});
 assert.equal(JSON.parse(r.write.body).p_provider_event_id,r.event.id);
 assert.equal(JSON.parse(r.write.body).p_reader_user_id,reader);
 assert.ok(r.calls.some(x=>x.url.endsWith('/rpc/gpir_finalize_paypal_subscription_v2')));
});
test('idempotent duplicate is acknowledged without second charge',async()=>{
 const r=await run({writer:'DUPLICATE'});
 assert.deepEqual(r.result,{ok:true,status:'DUPLICATE'});
});
for(const [name,options] of [
 ['pending payment',{status:'PENDING'}],['amount mismatch',{amount:'1.00'}],
 ['currency mismatch',{currency:'EUR'}],['wrong plan',{providerPlan:'P-OTHERPLAN123'}],
 ['wrong owner context',{contextLocal:'77777777-7777-4777-8777-777777777777'}],
 ['missing context RPC',{lookupStatus:404}],
 ['unresolved pagination',{pages:2}],['writer conflict',{writer:'CONFLICT'}],
 ['missing next billing period',{nextBilling:false}],
 ['period reconciliation failure',{finalized:false}]
])test(name+' fails closed',async()=>{
 const r=await run(options);assert.equal(r.result.ok,false);
 if(!['writer conflict','period reconciliation failure'].includes(name))
  assert.equal(r.write,undefined);
});
