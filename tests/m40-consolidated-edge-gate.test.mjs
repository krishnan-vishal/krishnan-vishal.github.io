import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicIntelligenceHandler } from '../supabase/functions/gpir-public-intelligence/handler.mjs';
const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-only',M40_SNAPSHOT_READ_ENABLED:'true'};
const objects=Object.fromEntries(['categories','topics','themes','primaryThemes','regions','daily','weekly','monthly','dailyThemes','weeklyThemes','regionThemes'].map(k=>[k,{}]));
const summary={status:'OK',kind:'announcements',total:2,...objects};
const page={status:'OK',kind:'announcements',records:[{id:'a'}],limit:1,offset:0,hasMore:true};
const exact={...summary,...page};
const respond=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
function setup(behavior={}){
 const calls=[];
 const fetchImpl=async (url,opts)=>{
   const name=String(url).split('/').pop();calls.push({name,opts});
   if(behavior[name] instanceof Error)throw behavior[name];
   if(behavior[name]===false)return respond({},503);
   return respond(behavior[name]??(name==='gpir_m40_read_dashboard_snapshot_v1'?summary:name==='gpir_m40_repository_records_v1'?page:exact));
 };
 const handler=createPublicIntelligenceHandler({env,fetchImpl,now:()=>Date.parse('2026-11-13T00:00:00Z')});
 const get=async qs=>handler(new Request('https://fintechoisis.com/api?'+qs));
 return {calls,get};
}
test('unfiltered aggregate uses snapshot, bounded records, and private no-store',async()=>{
 const x=setup();const res=await x.get('view=aggregate&kind=announcements&limit=1');
 assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store, max-age=0');
 assert.deepEqual(x.calls.map(c=>c.name),['gpir_m40_read_dashboard_snapshot_v1','gpir_m40_repository_records_v1']);
 assert.equal((await res.json()).total,2);
 assert.equal(x.calls[0].opts.headers.get('authorization'),'Bearer test-server-only');
});
test('filters, cards and history never use snapshot',async()=>{
 for(const qs of ['view=aggregate&topic=regulatory','view=aggregate&region=apac','view=aggregate&start=2026-11-01T00:00:00.000Z','view=cards','view=history-records']){
  const x=setup();await x.get(qs);
  assert.ok(!x.calls.some(c=>c.name==='gpir_m40_read_dashboard_snapshot_v1'),qs);
 }
});
test('missing, malformed or failing snapshot falls back to exact governed RPC',async()=>{
 for(const bad of [false,new Error('network'),{status:'OK',kind:'announcements',total:2}]){
  const x=setup({gpir_m40_read_dashboard_snapshot_v1:bad});
  const res=await x.get('view=aggregate&limit=1');
  assert.equal(res.status,200);
  assert.equal(x.calls.at(-1).name,'gpir_m40_repository_query_v2');
  assert.equal(res.headers.get('cache-control'),'private, no-store, max-age=0');
 }
});
test('failed bounded records falls back to exact; exact failure returns 503',async()=>{
 const x=setup({gpir_m40_repository_records_v1:false});assert.equal((await x.get('view=aggregate&limit=1')).status,200);
 assert.equal(x.calls.at(-1).name,'gpir_m40_repository_query_v2');
 const y=setup({gpir_m40_read_dashboard_snapshot_v1:false,gpir_m40_repository_query_v2:false});
 assert.equal((await y.get('view=aggregate&limit=1')).status,503);
});
test('invalid request fails before any privileged RPC',async()=>{
 const x=setup();const res=await x.get('view=aggregate&topic=%3Cscript%3E');
 assert.equal(res.status,400);assert.equal(x.calls.length,0);
});
