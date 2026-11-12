import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicIntelligenceHandler } from '../supabase/functions/gpir-public-intelligence/handler.mjs';
import { buildServerAggregateModels } from '../assets/js/smart-presentation.mjs';
import { m40Query } from '../assets/js/smart-intelligence.mjs';

const env = { SUPABASE_URL:'https://qlnvhfapctcpzqyuhhth.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'test-only-server-secret' };
const maps = { categories:{}, topics:{}, themes:{}, primaryThemes:{}, regions:{}, daily:{}, weekly:{}, monthly:{},
  dailyThemes:{}, weeklyThemes:{}, regionThemes:{} };

test('M40 aggregate uses the same v2 RPC contract with inclusive legacy dates converted to exact bounds', async () => {
  let calls = 0;
  const handler = createPublicIntelligenceHandler({env,fetchImpl:async (url,init) => {
    calls++;
    assert.match(url,/\/rpc\/gpir_m40_repository_query_v2$/);
    assert.equal(init.method,'POST');
    assert.equal(init.headers.get('authorization'),'Bearer test-only-server-secret');
    assert.deepEqual(JSON.parse(init.body), {p_kind:'statistics',p_topics:['remittances'],p_themes:null,p_categories:null,
      p_region:'afr',p_query:null,p_start:'2022-01-01T00:00:00.000Z',p_end:'2026-01-01T00:00:00.000Z',p_limit:25,p_offset:50});
    return {ok:true,json:async()=>({status:'OK',kind:'statistics',total:5253,...maps,limit:25,offset:50,
      unmapped:0,hasMore:true,nextOffset:75,records:[{id:'example'}]})};
  }});
  const result=await handler(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=aggregate&kind=statistics&topic=remittances&region=afr&from=2022-01-01&to=2025-12-31&limit=25&offset=50'));
  assert.equal(result.status,200);
  assert.equal((await result.json()).total,5253);
  assert.equal(calls,1);
});

test('browser query emits governed IDs and exact timestamp boundaries', () => {
  const query = m40Query({topics:new Set(['regulatory','cross-border']),themes:new Set(['ai']),geography:'apac'},
    {start:Date.parse('2026-11-11T12:00:00.000Z'),end:Date.parse('2026-11-12T12:00:00.000Z')},
    {view:'cards',limit:10,offset:20});
  assert.equal(query.get('start'),'2026-11-11T12:00:00.000Z');
  assert.equal(query.get('end'),'2026-11-12T12:00:00.000Z');
  assert.deepEqual(query.getAll('topic'),['regulatory','cross-border']);
  assert.deepEqual(query.getAll('theme'),['ai']);
  assert.equal(query.get('region'),'apac');
  assert.equal(query.get('offset'),'20');
});

test('dashboard models use complete server aggregates, never the bounded record page, for totals and charts', () => {
  const current = {total:500, themes:{regulatory:180,'cross-border':120,ai:80,agentic:25},
    primaryThemes:{regulatory:180,'cross-border':120,ai:80,agentic:25,other:95},regions:{apac:200,europe:150,global:150},
    regionThemes:{apac:{regulatory:100,ai:50},europe:{regulatory:60,ai:20}},weeklyThemes:{}};
  const previous = {total:400,themes:{regulatory:140,'cross-border':100,ai:60,agentic:20}};
  const trend = {weeklyThemes:{}};
  const records = [{id:'only-one',title:'Only bounded evidence record',url:'https://example.com/evidence',sourceName:'Source',publishedAt:'2026-11-12T10:00:00.000Z'}];
  const model = buildServerAggregateModels({current,previous,trend,records,now:Date.parse('2026-11-12T12:00:00.000Z')});
  assert.equal(model.kpis.total.value,500);
  assert.equal(model.distribution.unique,500);
  assert.equal(model.regional.total,500);
  assert.equal(model.momentum.find(item=>item.id==='ai').current,80);
  assert.equal(model.events.length,1);
});

test('SQL contract is service-role-only, stable, approved-only and excludes CMS bodies', async () => {
  const sql = await readFile(new URL('../supabase/sql/m40-governed-repository-aggregates-v2.sql', import.meta.url),'utf8');
  assert.match(sql,/publication_status='approved'/);
  assert.match(sql,/source_status='GREEN'/);
  assert.match(sql,/order by published_at desc,id limit p_limit offset p_offset/);
  assert.match(sql,/revoke all on function public\.gpir_m40_repository_query_v2[\s\S]+from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.gpir_m40_repository_query_v2[\s\S]+to service_role/);
  assert.match(sql,/'daily'.*'weekly'.*'monthly'/s);
  assert.doesNotMatch(sql,/contentful|cms_entries|body_html|body_markdown/i);
});

test('M40 rejects invalid filters before calling repository and fails closed on RPC errors', async()=>{
  let called=false;
  const invalid=createPublicIntelligenceHandler({env,fetchImpl:async()=>{called=true;throw Error('should not fetch')}});
  const result=await invalid(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=aggregate&kind=unsafe'));
  assert.equal(result.status,400);
  assert.equal(called,false);
  const unavailable=createPublicIntelligenceHandler({env,fetchImpl:async()=>({ok:false,status:503})});
  const failed=await unavailable(new Request('https://fintechoisis.com/functions/v1/gpir-public-intelligence?view=aggregate'));
  assert.equal(failed.status,503);
  assert.equal((await failed.json()).code,'AGGREGATE_UNAVAILABLE');
});
