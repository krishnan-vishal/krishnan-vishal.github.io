import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicIntelligenceHandler } from '../supabase/functions/gpir-public-intelligence/handler.mjs';

const base = {
  SUPABASE_URL:'https://qlnvhfapctcpzqyuhhth.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'test-only-server-secret'
};
const dimensions = {
  categories:{Payments:3},topics:{payments:3},themes:{},primaryThemes:{},
  regions:{global:3},daily:{},weekly:{},monthly:{},
  dailyThemes:{},weeklyThemes:{},regionThemes:{}
};
const snapshot = {status:'OK',kind:'announcements',total:3,...dimensions,unmapped:0};
const exact = {...snapshot,limit:2,offset:0,hasMore:true,nextOffset:2,records:[{id:'exact'}]};
const page = {status:'OK',kind:'announcements',limit:2,offset:0,hasMore:true,records:[{id:'page'}]};
const url = 'https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=aggregate&limit=2';

function mockFetch(calls,{fresh=true,pageOk=true}={}) {
  return async (address,init) => {
    const rpc = String(address).split('/rpc/')[1];
    calls.push({rpc,body:JSON.parse(init.body)});
    assert.equal(init.headers.get('authorization'),'Bearer test-only-server-secret');
    if (rpc === 'gpir_m40_read_dashboard_snapshot_v1')
      return {ok:true,json:async()=>fresh ? snapshot : null};
    if (rpc === 'gpir_m40_repository_records_v1')
      return {ok:pageOk,json:async()=>page};
    if (rpc === 'gpir_m40_repository_query_v2')
      return {ok:true,json:async()=>({...exact,kind:JSON.parse(init.body).p_kind})};
    throw Error('Unexpected RPC '+rpc);
  };
}

test('snapshot is disabled by default',async()=>{
  const calls=[];
  const handler=createPublicIntelligenceHandler({env:base,fetchImpl:mockFetch(calls)});
  const response=await handler(new Request(url));
  assert.equal(response.status,200);
  assert.deepEqual(calls.map(x=>x.rpc),['gpir_m40_repository_query_v2']);
});

test('fresh unfiltered snapshot combines exact bounded page without changing contract',async()=>{
  const calls=[];
  const handler=createPublicIntelligenceHandler({
    env:{...base,M40_SNAPSHOT_READ_ENABLED:'true'},fetchImpl:mockFetch(calls)
  });
  const response=await handler(new Request(url));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.total,3);
  assert.deepEqual(body.records,[{id:'page'}]);
  assert.equal(body.nextOffset,2);
  assert.deepEqual(calls.map(x=>x.rpc),[
    'gpir_m40_read_dashboard_snapshot_v1','gpir_m40_repository_records_v1'
  ]);
});

test('missing snapshot or failed bounded page falls back to exact RPC',async()=>{
  for(const options of [{fresh:false},{pageOk:false}]) {
    const calls=[];
    const handler=createPublicIntelligenceHandler({
      env:{...base,M40_SNAPSHOT_READ_ENABLED:'true'},fetchImpl:mockFetch(calls,options)
    });
    const response=await handler(new Request(url));
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).records,[{id:'exact'}]);
    assert.equal(calls.at(-1).rpc,'gpir_m40_repository_query_v2');
  }
});

test('filtered requests and statistics bypass snapshot',async()=>{
  for(const suffix of ['&topic=regulatory','&start=2026-11-01T00%3A00%3A00.000Z','&kind=statistics']) {
    const calls=[];
    const handler=createPublicIntelligenceHandler({
      env:{...base,M40_SNAPSHOT_READ_ENABLED:'true'},fetchImpl:mockFetch(calls)
    });
    const response=await handler(new Request(url+suffix));
    assert.equal(response.status,200);
    assert.deepEqual(calls.map(x=>x.rpc),['gpir_m40_repository_query_v2']);
  }
});
