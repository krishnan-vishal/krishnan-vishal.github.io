import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicIntelligenceHandler } from '../supabase/functions/gpir-public-intelligence/handler.mjs';

const env = { SUPABASE_URL:'https://exampleexampleexampl.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'test-only-server-secret' };
const emptyMaps = {
  categories:{}, topics:{}, themes:{}, primaryThemes:{}, regions:{}, daily:{}, weekly:{}, monthly:{},
  dailyThemes:{}, weeklyThemes:{}, regionThemes:{}
};
const payload = (overrides = {}) => ({ status:'OK', kind:'announcements', total:0, ...emptyMaps,
  unmapped:0, limit:10, offset:0, hasMore:false, nextOffset:null, records:[], ...overrides });

test('Smart Card API sends exact multi-topic, theme, geography, 24-hour bounds and pagination to RPC', async () => {
  let calls = 0;
  const handler = createPublicIntelligenceHandler({ env, fetchImpl:async (url, init) => {
    calls++;
    assert.match(url,/\/rpc\/gpir_m40_repository_query_v2$/);
    assert.equal(init.headers.get('authorization'),'Bearer test-only-server-secret');
    assert.deepEqual(JSON.parse(init.body), {
      p_kind:'announcements', p_topics:['regulatory','cross-border'], p_themes:['ai'], p_categories:null,
      p_region:'apac', p_query:null, p_start:'2026-11-11T12:00:00.000Z', p_end:'2026-11-12T12:00:00.000Z',
      p_limit:10, p_offset:10
    });
    return { ok:true, json:async () => payload({ total:27, themes:{ai:12}, regions:{apac:27},
      limit:10, offset:10, hasMore:true, nextOffset:20, records:[{id:'evidence-11'}] }) };
  }});
  const url = 'https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards&kind=announcements' +
    '&topic=regulatory&topic=cross-border&theme=ai&region=apac' +
    '&start=2026-11-11T12%3A00%3A00.000Z&end=2026-11-12T12%3A00%3A00.000Z&limit=10&offset=10';
  const res = await handler(new Request(url));
  assert.equal(res.status,200);
  const body = await res.json();
  assert.equal(body.total,27);
  assert.equal(body.records.length,1);
  assert.equal(body.nextOffset,20);
  assert.equal(calls,1);
});

test('Smart Card API preserves first, middle, final and empty server pagination metadata', async () => {
  const pages = [
    payload({ total:21, hasMore:true, nextOffset:10, records:Array.from({length:10},(_,i)=>({id:`id-${i}`})) }),
    payload({ total:21, offset:10, hasMore:true, nextOffset:20, records:Array.from({length:10},(_,i)=>({id:`id-${i+10}`})) }),
    payload({ total:21, offset:20, records:[{id:'id-20'}] }),
    payload({ limit:10, offset:30 })
  ];
  let index = 0;
  const handler = createPublicIntelligenceHandler({ env, fetchImpl:async () => ({ok:true,json:async()=>pages[index++]}) });
  const received = [];
  for (const offset of [0,10,20,30]) {
    const res = await handler(new Request(`https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards&limit=10&offset=${offset}`));
    assert.equal(res.status,200);
    received.push(...(await res.json()).records.map(record => record.id));
  }
  assert.equal(new Set(received).size,21);
  assert.equal(received.length,21);
});

test('Smart Card API rejects invalid bounds, taxonomy, theme and region before DB call', async () => {
  let called = false;
  const handler = createPublicIntelligenceHandler({ env, fetchImpl:async () => { called=true; throw Error('unexpected'); } });
  const invalid = [
    'start=2026-11-12T12%3A00%3A00.000Z&end=2026-11-11T12%3A00%3A00.000Z',
    'topic=not-a-governed-topic', 'theme=not-a-theme', 'region=not-a-region'
  ];
  for (const query of invalid) {
    const res = await handler(new Request(`https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards&${query}`));
    assert.equal(res.status,400);
  }
  assert.equal(called,false);
});

test('anonymous and authenticated requests receive approved public payloads while RPC uses only the server key', async () => {
  const inbound = [null, 'Bearer reader-session-token'];
  for (const authorization of inbound) {
    const handler = createPublicIntelligenceHandler({ env, fetchImpl:async (_url, init) => {
      assert.equal(init.headers.get('authorization'),'Bearer test-only-server-secret');
      assert.notEqual(init.headers.get('authorization'),authorization);
      return {ok:true,json:async()=>payload()};
    }});
    const headers = authorization ? {authorization} : {};
    const res = await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards',{headers}));
    assert.equal(res.status,200);
  }
});

test('Smart Card API fails closed when exact aggregate RPC fails', async () => {
  const handler=createPublicIntelligenceHandler({env,fetchImpl:async()=>({ok:false,status:503})});
  const res=await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=cards'));
  assert.equal(res.status,503);
  assert.equal((await res.json()).code,'CARDS_UNAVAILABLE');
});
