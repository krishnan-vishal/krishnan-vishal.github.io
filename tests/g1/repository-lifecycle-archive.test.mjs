import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicIntelligenceHandler } from '../../supabase/functions/gpir-public-intelligence/handler.mjs';

const now=Date.parse('2026-11-02T12:00:00Z');
const source={source_id:'S1',source_name:'Official Payments Authority',official_url:'https://payments.example',source_status:'GREEN'};
const make=(id,hours)=>({id,source_id:'S1',title:'Verified cross-border payment settlement development',summary_narration:'A verified official source describes an international payment settlement development with documented evidence and participant requirements.',canonical_url:'https://payments.example/news/'+id,published_at:new Date(now-hours*3600000).toISOString(),ticker_eligible:true,topic_headers:['CROSS_BORDER_PAYMENTS'],publication_status:'approved'});
const rows={announcements:[make('recent',2),make('archived',48),make('old',40*24)],sources:[source]};
const handler=createPublicIntelligenceHandler({env:{},now:()=>now,loadRows:async()=>rows});
async function get(query=''){const response=await handler(new Request('https://example.test/?'+query));return {status:response.status,body:await response.json()};}
test('recent scope preserves 15-day window and 12-hour LIVE state',async()=>{const {body}=await get();assert.equal(body.windowDays,15);assert.equal(body.total,2);assert.equal(body.records[0].displayLifecycleStatus,'LIVE');assert.equal(body.records[1].displayLifecycleStatus,'ARCHIVED');});
test('historical scope retains older approved records',async()=>{const {body}=await get('scope=history');assert.equal(body.windowDays,null);assert.equal(body.total,3);assert.equal(body.records[2].displayLifecycleStatus,'ARCHIVED');});
test('date year and lifecycle filters work for historical records',async()=>{const day=new Date(now-48*3600000).toISOString().slice(0,10);const a=await get('scope=history&date='+day+'&lifecycle=ARCHIVED');assert.equal(a.body.total,1);const b=await get('scope=history&year=2026');assert.equal(b.body.total,3);});
test('source card links retain original verified URL',async()=>{const {body}=await get();assert.equal(body.records[0].sources[0].url,'https://payments.example/news/recent');assert.ok(body.records[0].sources.length<=4);});
test('invalid date and lifecycle are rejected',async()=>{assert.equal((await get('date=tomorrow')).status,400);assert.equal((await get('lifecycle=OTHER')).status,400);});
