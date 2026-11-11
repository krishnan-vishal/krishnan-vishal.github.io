import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicIntelligenceHandler } from '../supabase/functions/gpir-public-intelligence/handler.mjs';

const env = { SUPABASE_URL:'https://qlnvhfapctcpzqyuhhth.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'test-only-server-secret' };
test('M40 aggregate delegates exact totals and pagination to existing server-side RPC', async () => {
  let calls = 0;
  const handler = createPublicIntelligenceHandler({env,fetchImpl:async (url,init) => {
    calls++;
    assert.match(url,/\/rpc\/gpir_m40_repository_query$/);
    assert.equal(init.method,'POST');
    assert.equal(init.headers.get('authorization'),'Bearer test-only-server-secret');
    const body=JSON.parse(init.body);
    assert.deepEqual(body,{p_kind:'statistics',p_topic:'Remittances & Diaspora',
      p_region:'Sub-Saharan Africa',p_from:'2022-01-01',p_to:'2025-12-31',p_limit:25,p_offset:50});
    return {ok:true,json:async()=>({status:'OK',kind:'statistics',total:5253,
      themes:{'Remittances & Diaspora':5253},regions:{'Sub-Saharan Africa':5253},
      daily:{},limit:25,offset:50,records:[{id:'example'}]})};
  }});
  const result=await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=aggregate&kind=statistics&topic=Remittances%20%26%20Diaspora&region=Sub-Saharan%20Africa&from=2022-01-01&to=2025-12-31&limit=25&offset=50'));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.total,5253);
  assert.equal(data.records.length,1);
  assert.equal(calls,1);
});
test('M40 rejects invalid filters before calling repository', async()=>{
  let called=false;
  const handler=createPublicIntelligenceHandler({env,fetchImpl:async()=>{called=true;throw Error('should not fetch')}});
  const result=await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=aggregate&kind=unsafe'));
  assert.equal(result.status,400);assert.equal(called,false);
});
test('M40 fails closed on RPC failure; never substitutes partial client counts',async()=>{
  const handler=createPublicIntelligenceHandler({env,fetchImpl:async()=>({ok:false,status:503})});
  const result=await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=aggregate'));
  assert.equal(result.status,503);assert.equal((await result.json()).code,'AGGREGATE_UNAVAILABLE');
});
