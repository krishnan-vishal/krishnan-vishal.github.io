import test from 'node:test';
import assert from 'node:assert/strict';
import { eventIdentity } from '../supabase/functions/_shared/gpir-event-identity.mjs';
import { normalizeRepositoryRows } from '../supabase/functions/gpir-public-intelligence/handler.mjs';
const validation={sourcePublishedAt:'2026-10-31T09:00:00Z',relevanceTerms:['payments','remittance']};
test('same event reported by different source URLs shares event identity',async()=>{
 const a=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'LAUNCH',source_id:'A'},validation);
 const b=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'LAUNCH',source_id:'B'},validation);
 assert.equal(a.p_event_key,b.p_event_key);
});
test('different date and event type never collide',async()=>{
 const a=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'LAUNCH',source_id:'A'},validation);
 const b=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'ANNOUNCEMENT',source_id:'A'},validation);
 const c=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'LAUNCH',source_id:'A'},{...validation,sourcePublishedAt:'2026-11-01T09:00:00Z'});
 assert.notEqual(a.p_event_key,b.p_event_key);assert.notEqual(a.p_event_key,c.p_event_key);
});
test('missing evidence does not produce event identity',async()=>{
 await assert.rejects(()=>eventIdentity({title:'Short'},validation),/G1_R07_EVENT_IDENTITY_REVIEW/);
});
test('public feed exposes verified links only and preserves archived lifecycle',()=>{
 const announcement={id:'a',source_id:'A',title:'Regional payments network launches interoperability',
 summary_narration:'Verified payments and remittance infrastructure announcement across several regions.',
 canonical_url:'https://bank.example/news',published_at:'2026-10-31T09:00:00Z',ticker_eligible:true,
 topic_headers:['Payments'],publication_status:'approved'};
 const data=normalizeRepositoryRows({announcements:[announcement],sources:[{source_id:'A',source_status:'GREEN',source_name:'Bank',official_url:'https://bank.example'}],
 events:[{id:'e',announcement_id:'a',keywords:['payments'],outcome_status:'PENDING',geography:'UNSPECIFIED'}],
 eventSources:[{event_id:'e',source_id:'A',canonical_url:'https://bank.example/news',source_published_at:'2026-10-31T09:00:00Z'},
 {event_id:'e',source_id:'A',canonical_url:'https://attacker.example/false',source_published_at:'2026-10-31T09:00:00Z'}],
 now:Date.parse('2026-11-02T09:00:00Z')});
 assert.equal(data.length,1);assert.equal(data[0].sources.length,1);
 assert.equal(data[0].displayLifecycleStatus,'ARCHIVED');assert.equal(data[0].outcomeStatus,'PENDING');
});
