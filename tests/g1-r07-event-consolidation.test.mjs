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
test('same topic persists across milestone and date',async()=>{
 const a=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'LAUNCH',source_id:'A'},validation);
 const b=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'ANNOUNCEMENT',source_id:'A'},validation);
 const c=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'LAUNCH',source_id:'A'},{...validation,sourcePublishedAt:'2026-11-01T09:00:00Z'});
 assert.equal(a.p_event_key,b.p_event_key);assert.equal(a.p_event_key,c.p_event_key);
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
 topics:[{id:'e',announcement_id:'a',keywords:['payments'],outcome_status:'PENDING',geography:'UNSPECIFIED'}],
 developments:[{id:'d',topic_id:'e',event_type:'LAUNCH',effective_date:'2026-10-31',summary:'Validated payments and remittance interoperability initiative published with detailed evidence and implementation milestones.',outcome_status:'PENDING'}],
 topicSources:[{topic_id:'e',development_id:'d',source_id:'A',canonical_url:'https://bank.example/news',source_published_at:'2026-10-31T09:00:00Z'},
 {topic_id:'e',development_id:'d',source_id:'A',canonical_url:'https://attacker.example/false',source_published_at:'2026-10-31T09:00:00Z'}],
 now:Date.parse('2026-11-02T09:00:00Z')});
 assert.equal(data.length,1);assert.equal(data[0].sources.length,1);
 assert.equal(data[0].displayLifecycleStatus,'ARCHIVED');assert.equal(data[0].outcomeStatus,'PENDING');
 assert.equal(data[0].developments.length,1);
});

test('unapproved T3 source remains REVIEW before repository publication',async()=>{
 const {processCandidate}=await import('../supabase/functions/gpir-intelligence-publish/handler.mjs');
 let published=false;let recorded=null;
 const candidate={id:'00000000-0000-4000-8000-000000000001',source_id:'T3',canonical_url:'https://example.org/notice',
   title:'Regional payments interoperability initiative announced',published_at:'2026-10-31T09:00:00Z',confidence_score:99};
 const repo={start:async()=>{},source:async()=>({source_id:'T3',source_name:'Example',source_status:'GREEN',trust_tier:'T3',official_url:'https://example.org'}),
   record:async(_c,v)=>{recorded=v},duplicate:async()=>false,publish:async()=>{published=true}};
 const result=await processCandidate({candidate,repository:repo,fetchImpl:async()=>new Response('<html><body>Insufficient evidence</body></html>',{
   status:200,headers:{'content-type':'text/html'}})});
 assert.equal(result.decision,'REVIEW');assert.equal(published,false);assert.equal(recorded.decision,'REVIEW');
});

test('multiple publishing entities appear on one topic card with separately dated developments',()=>{
 const announcements=[{id:'a',source_id:'A',title:'Regional payments interoperability initiative announced',
 summary_narration:'A verified cross-border payments initiative with published implementation details and regulatory commentary.',
 canonical_url:'https://bank.example/notice',published_at:'2026-10-31T09:00:00Z',ticker_eligible:true,
 topic_headers:['Payments'],publication_status:'approved'}];
 const sources=[{source_id:'A',source_name:'Central Bank',source_status:'GREEN',official_url:'https://bank.example'},
 {source_id:'B',source_name:'Payments Association',source_status:'GREEN',official_url:'https://association.example'}];
 const topics=[{id:'t',announcement_id:'a',keywords:['cross-border'],outcome_status:'ANNOUNCED',geography:'APAC'}];
 const developments=[{id:'d1',topic_id:'t',event_type:'ANNOUNCEMENT',effective_date:'2026-10-31',
 summary:'The central bank announced the regional payments initiative, identifying its participants and a proposed timeline for operational rollout.',outcome_status:'ANNOUNCED'},
 {id:'d2',topic_id:'t',event_type:'CONFIRMATION',effective_date:'2026-11-01',
 summary:'The payments association confirmed additional implementation details about the same regional payments initiative, with source-specific dates and scope.',outcome_status:'CONFIRMED'}];
 const topicSources=[{topic_id:'t',development_id:'d1',source_id:'A',canonical_url:'https://bank.example/notice',source_published_at:'2026-10-31T09:00:00Z'},
 {topic_id:'t',development_id:'d2',source_id:'B',canonical_url:'https://association.example/confirmation',source_published_at:'2026-11-01T09:00:00Z'}];
 const result=normalizeRepositoryRows({announcements,sources,topics,developments,topicSources,now:Date.parse('2026-11-02T09:00:00Z')});
 assert.equal(result.length,1);assert.equal(result[0].sources.length,2);
 assert.equal(result[0].developments.length,2);
 assert.match(result[0].summary,/central bank announced/);
 assert.match(result[0].summary,/payments association confirmed/);
});

test('SQL release gate enforces service-role access, T3 exclusion and fail-closed topic matching',async()=>{
 const {readFile}=await import('node:fs/promises');
 const sql=await readFile(new URL('../supabase/migrations/20261101000000_g1_r07_event_consolidation.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/revoke all on public\.gpir_intelligence_topics/);
 assert.match(sql,/when 'T1' then 70 when 'T1\.5' then 80 when 'T2' then 90 else null/);
 assert.match(sql,/G1_R07_TOPIC_MATCH_REVIEW_REQUIRED/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/G1_R07_INVALID_EVIDENCE/);
 assert.match(sql,/public\.gpir_publish_validated_candidate/);
});
test('different reporting headline cannot automatically claim the same topic key',async()=>{
 const a=await eventIdentity({title:'Regional payments network launches interoperability',event_type:'LAUNCH',source_id:'A'},validation);
 const b=await eventIdentity({title:'Central bank unveils cross-border payment connectivity',event_type:'LAUNCH',source_id:'B'},validation);
 assert.notEqual(a.p_event_key,b.p_event_key);
});

test('verified subject alias groups differently worded reports; unverified alias cannot',async()=>{
 const a=await eventIdentity({title:'Regional payments network launches interoperability',source_id:'A'},validation);
 const alias={verified:true,subject:'Regional payments network launches interoperability',
 evidenceUrls:['https://central.example/notice','https://association.example/report']};
 const b=await eventIdentity({title:'Central bank unveils cross-border payment connectivity',source_id:'B'},
 {...validation,verifiedTopicIdentity:alias});
 const unverified=await eventIdentity({title:'Central bank unveils cross-border payment connectivity',source_id:'B'},
 {...validation,verifiedTopicIdentity:{...alias,verified:false}});
 assert.equal(a.p_event_key,b.p_event_key);
 assert.notEqual(a.p_event_key,unverified.p_event_key);
});
