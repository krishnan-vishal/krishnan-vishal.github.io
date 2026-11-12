import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicIntelligenceHandler } from '../supabase/functions/gpir-public-intelligence/handler.mjs';

const env = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only-server-secret'};
test('Smart Card API sends exact multi-topic filters, timestamp bounds and bounded pagination to RPC',async()=>{
  let calls=0;
  const handler=createPublicIntelligenceHandler({env,fetchImpl:async(url,init)=>{
    calls++;
    assert.match(url,/\/rpc\/gpir_m40_repository_query_v2$/);
    assert.equal(init.headers.get('authorization'),'Bearer test-only-server-secret');
    assert.deepEqual(JSON.parse(init.body),{
      p_kind:'announcements',p_topics:['Regulation','REGULATION'],p_region:null,
      p_start:'2026-11-11T12:00:00.000Z',p_end:'2026-11-12T12:00:00.000Z',
      p_limit:10,p_offset:10
    });
    return {ok:true,json:async()=>({status:'OK',kind:'announcements',total:27,
      themes:{Regulation:27},regions:{APAC:27},daily:{},limit:10,offset:10,records:[{id:'evidence-11'}]})};
  }});
  const url='https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards&kind=announcements&topic=Regulation&topic=REGULATION&start=2026-11-11T12%3A00%3A00.000Z&end=2026-11-12T12%3A00%3A00.000Z&limit=10&offset=10';
  const res=await handler(new Request(url));
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.total,27);
  assert.equal(body.records.length,1);
  assert.equal(calls,1);
});
test('Smart Card API rejects invalid time bounds and topic cardinality before DB call',async()=>{
  let called=false;
  const handler=createPublicIntelligenceHandler({env,fetchImpl:async()=>{called=true;throw Error('unexpected')}});
  const bad=await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards&start=2026-11-12T12%3A00%3A00.000Z&end=2026-11-11T12%3A00%3A00.000Z'));
  assert.equal(bad.status,400);
  assert.equal(called,false);
});
test('Smart Card API fails closed when exact aggregate RPC fails',async()=>{
  const handler=createPublicIntelligenceHandler({env,fetchImpl:async()=>({ok:false,status:503})});
  const res=await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards'));
  assert.equal(res.status,503);
  assert.equal((await res.json()).code,'CARDS_UNAVAILABLE');
});
