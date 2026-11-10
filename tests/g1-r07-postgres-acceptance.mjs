import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const env={...process.env,PGPASSWORD:'postgres'};
const run=sql=>execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',sql],{env,encoding:'utf8'});
const file=p=>execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-f',p],{env,encoding:'utf8'});
file('tests/fixtures/g1-r07-postgres-schema.sql');
const base=readFileSync('supabase/migrations/20261031134116_g1_automated_intelligence_publication.sql','utf8').split('-- The existing Vault key')[0];
run(base);
file('supabase/migrations/20261101000000_g1_r07_event_consolidation.sql');
file('supabase/migrations/20261108140000_m39_t3_editorial_publication.sql');
file('supabase/migrations/20261109020000_m39_t3_automatic_publication.sql');
const ids=['00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000104'];
run(`insert into source_registry(source_id,source_name,official_url,trust_tier,source_status) values
('A','Source A','https://a.example','T1','GREEN'),
('B','Source B','https://b.example','T2','GREEN'),
('C','Source C','https://c.example','T3','GREEN');
insert into intelligence_candidates(id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status)
values
('${ids[0]}','A','https://a.example/1','Regional payments network launches interoperability',now()-interval '1 hour','Payments','LAUNCH',99,'PENDING'),
('${ids[1]}','B','https://b.example/2','Regional payments network launches interoperability',now()-interval '1 hour','Payments','UPDATE',99,'PENDING'),
('${ids[2]}','C','https://c.example/3','Regional payments network launches interoperability',now()-interval '1 hour','Payments','UPDATE',99,'PENDING'),
('${ids[3]}','B','https://b.example/4','Different payments network announces new rail',now()-interval '1 hour','Payments','UPDATE',99,'PENDING');`);
const key='a'.repeat(64);
const summary='The independently verified source describes an interoperability initiative and the supporting payments infrastructure, including a documented cross-border settlement milestone and confirmed implementation details.';
const payload=JSON.stringify({source_verified:true,canonical_verified:true,timestamp_verified:true,content_verified:true,relevance_verified:true,summary_grounded:true,evidence_excerpt:'Verified publication text'});
function call(id,fingerprint,subject='regional payments network launches interoperability',k=key){
return `select public.gpir_publish_consolidated_candidate('${id}','${summary}',now()-interval '1 hour','${fingerprint}','${payload}'::jsonb,'${k}','A','LAUNCH','${subject}',current_date,'UNSPECIFIED',array['payments'],'PENDING');`;
}
const concurrent=(sql)=>new Promise(resolve=>{const child=spawn('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',sql],{env});let stderr='';child.stderr.on('data',b=>stderr+=b);child.on('close',code=>resolve({code,stderr}));});
const results=await Promise.all([concurrent(call(ids[0],'1'.repeat(64))),concurrent(call(ids[1],'2'.repeat(64)))]);
assert.deepEqual(results.map(r=>r.code),[0,0],JSON.stringify(results));
assert.equal(Number(run('select count(*) from gpir_intelligence_topics')),1);
assert.equal(Number(run('select count(*) from gpir_intelligence_developments')),2);
assert.equal(Number(run('select count(*) from gpir_intelligence_topic_sources')),2);
assert.equal(Number(run('select count(*) from global_announcements')),1);
assert.equal(Number(run("select count(distinct source_id) from gpir_intelligence_topic_sources")),2);
async function mustFail(sql,reason){
 const result=await concurrent(sql);assert.notEqual(result.code,0,reason);assert.match(result.stderr,/G1_R07_|G1_/);
}
await mustFail(call(ids[2],'3'.repeat(64)),'T3 cannot publish');
await mustFail(call(ids[3],'4'.repeat(64),'different payments network announces new rail'),'ambiguous topic cannot attach');
await mustFail(call(ids[0],'1'.repeat(64)),'same candidate cannot republish');
assert.equal(Number(run('select count(*) from gpir_intelligence_developments')),2,'failed calls must roll back');
assert.equal(Number(run('select count(*) from global_announcements')),1,'failed calls must not publish');
// M39 T3 editorial route: only a T3 candidate bound to a verified Contentful approval can publish.
const editorialPayload=(id,url,extra={})=>JSON.stringify({source_verified:true,canonical_verified:true,timestamp_verified:true,content_verified:true,relevance_verified:true,summary_grounded:true,evidence_excerpt:'Verified public source evidence.',editorial_verified:true,editorial_entry_id:'entry-1',editorial_publication_id:'VK-GPIR-MEDIA-000001',editorial_supabase_record_id:id,editorial_source_url:url,...extra});
const editorialCall=(id,fingerprint,payloadJson,subject='regional payments network launches interoperability')=>`select public.gpir_publish_t3_editorial_candidate('${id}','${summary}',now()-interval '1 hour','${fingerprint}','${payloadJson}'::jsonb,'${key}','C','UPDATE','${subject}',current_date,'Global',array['payments'],'PENDING');`;
await mustFail(call(ids[2],'5'.repeat(64)),'T3 still cannot use the automated route');
await mustFail(editorialCall(ids[2],'5'.repeat(64),editorialPayload(ids[2],'https://c.example/3',{editorial_verified:false})),'editorial flag required');
await mustFail(editorialCall(ids[2],'5'.repeat(64),editorialPayload(ids[2],'https://c.example/other')),'editorial URL must match candidate');
await mustFail(editorialCall(ids[2],'5'.repeat(64),editorialPayload(ids[0],'https://c.example/3')),'editorial record id must match candidate');
await mustFail(editorialCall(ids[0],'5'.repeat(64),editorialPayload(ids[0],'https://a.example/1')),'T1 cannot use the editorial route');
assert.equal(Number(run('select count(*) from gpir_intelligence_developments')),2,'rejected editorial calls must roll back');
const attached=await concurrent(editorialCall(ids[2],'5'.repeat(64),editorialPayload(ids[2],'https://c.example/3')));
assert.equal(attached.code,0,attached.stderr);
assert.equal(Number(run('select count(*) from global_announcements')),1,'identical subject attaches, no second card');
assert.equal(Number(run("select count(*) from gpir_intelligence_topic_sources where source_id='C'")),1);
assert.equal(run("select decision||':'||reason_code from intelligence_publication_audits where candidate_id='"+ids[2]+"'").trim(),'DUPLICATE:G1_T3_EDITORIAL_VALIDATED_SOURCE_ATTACHED');
run(`insert into intelligence_candidates(id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status)
values('00000000-0000-4000-8000-000000000105','C','https://c.example/5','Unique media payments initiative announced for regional settlement',now()-interval '2 hours','Payments','UPDATE',40,'REVIEW');`);
const newCard=await concurrent(editorialCall('00000000-0000-4000-8000-000000000105','6'.repeat(64),editorialPayload('00000000-0000-4000-8000-000000000105','https://c.example/5'),'unique media payments initiative announced for regional settlement').replace(`'${key}'`,`'${'b'.repeat(64)}'`));
assert.equal(newCard.code,0,newCard.stderr);
assert.equal(run("select ticker_eligible||':'||publication_status||':'||(published_at<=now()) from global_announcements where canonical_url='https://c.example/5'").trim(),'true:approved:true');
await mustFail(editorialCall('00000000-0000-4000-8000-000000000105','6'.repeat(64),editorialPayload('00000000-0000-4000-8000-000000000105','https://c.example/5'),'unique media payments initiative announced for regional settlement').replace(`'${key}'`,`'${'b'.repeat(64)}'`),'editorial publication cannot repeat');
// M39 T3 automatic route: a verified, high-confidence, official-domain T3 candidate publishes without Contentful.
run(`insert into source_registry(source_id,source_name,official_url,trust_tier,source_status) values
('D','Source D','https://d.example','T3','GREEN'),('E','Source E','https://e.example','T3','AMBER');
insert into intelligence_candidates(id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status) values
('00000000-0000-4000-8000-000000000201','D','https://d.example/news/1','Automatic media payments initiative announced for regional rails',now()-interval '1 hour','Payments','UPDATE',96,'PENDING'),
('00000000-0000-4000-8000-000000000202','D','https://d.example/news/2','Low confidence media payments initiative announced',now()-interval '1 hour','Payments','UPDATE',80,'PENDING'),
('00000000-0000-4000-8000-000000000203','D','https://evil.example/news/3','Foreign domain media payments initiative announced',now()-interval '1 hour','Payments','UPDATE',99,'PENDING'),
('00000000-0000-4000-8000-000000000204','E','https://e.example/news/4','Unverified source media payments initiative announced',now()-interval '1 hour','Payments','UPDATE',99,'PENDING'),
('00000000-0000-4000-8000-000000000205','D','https://d.example.evil.example/news/5','Lookalike domain media payments initiative announced',now()-interval '1 hour','Payments','UPDATE',99,'PENDING');`);
const autoPayload=(extra={})=>JSON.stringify({source_verified:true,canonical_verified:true,timestamp_verified:true,content_verified:true,relevance_verified:true,summary_grounded:true,evidence_excerpt:'Verified public source evidence.',t3_auto_verified:true,...extra});
const autoCall=(id,fingerprint,payloadJson,subject,k)=>`select public.gpir_publish_t3_automatic_candidate('${id}','${summary}',now()-interval '1 hour','${fingerprint}','${payloadJson}'::jsonb,'${k}','D','UPDATE','${subject}',current_date,'Global',array['payments'],'PENDING');`;
const autoSubject='automatic media payments initiative announced for regional rails';
const autoKey='c'.repeat(64);
const autoId='00000000-0000-4000-8000-000000000201';
await mustFail(autoCall(autoId,'7'.repeat(64),autoPayload({t3_auto_verified:false}),autoSubject,autoKey),'automatic flag required');
await mustFail(autoCall(autoId,'7'.repeat(64),editorialPayload(autoId,'https://d.example/news/1',{t3_auto_verified:undefined}),autoSubject,autoKey),'editorial evidence is not automatic evidence');
await mustFail(autoCall('00000000-0000-4000-8000-000000000202','8'.repeat(64),autoPayload(),'low confidence media payments initiative announced','d'.repeat(64)),'low confidence cannot publish automatically');
await mustFail(autoCall('00000000-0000-4000-8000-000000000203','9'.repeat(64),autoPayload(),'foreign domain media payments initiative announced','e'.repeat(64)),'canonical host must match the official domain');
await mustFail(autoCall('00000000-0000-4000-8000-000000000205','9'.repeat(64),autoPayload(),'lookalike domain media payments initiative announced','e'.repeat(64)),'lookalike host must not match');
await mustFail(autoCall('00000000-0000-4000-8000-000000000204','9'.repeat(64),autoPayload(),'unverified source media payments initiative announced','f'.repeat(64)),'non-GREEN source cannot publish');
await mustFail(autoCall(ids[0],'9'.repeat(64),autoPayload(),'regional payments network launches interoperability',key),'T1 cannot use the automatic T3 route');
await mustFail(`select public.gpir_publish_consolidated_candidate('${autoId}','${summary}',now()-interval '1 hour','${'7'.repeat(64)}','${autoPayload()}'::jsonb,'${autoKey}','D','UPDATE','${autoSubject}',current_date,'Global',array['payments'],'PENDING');`,'the T1/T1.5/T2 route still rejects T3');
assert.equal(Number(run('select count(*) from global_announcements')),2,'rejected automatic calls must not publish');
const autoPublished=await concurrent(autoCall(autoId,'7'.repeat(64),autoPayload(),autoSubject,autoKey));
assert.equal(autoPublished.code,0,autoPublished.stderr);
assert.equal(run("select ticker_eligible||':'||publication_status from global_announcements where canonical_url='https://d.example/news/1'").trim(),'true:approved');
assert.equal(run("select decision||':'||reason_code from intelligence_publication_audits where candidate_id='"+autoId+"'").trim(),'PUBLISHED:T3_AUTOMATIC_PUBLICATION');
assert.equal(Number(run("select count(*) from gpir_intelligence_topic_sources where source_id='D'")),1,'repository evidence recorded');
await mustFail(autoCall(autoId,'7'.repeat(64),autoPayload(),autoSubject,autoKey),'automatic publication cannot repeat');
assert.equal(Number(run('select count(*) from global_announcements')),3,'exactly one new announcement');
// Backfill/expiry: an article validated after its 12-hour window is archived with its original time and never live.
run(`insert into intelligence_candidates(id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status) values
('00000000-0000-4000-8000-000000000206','D','https://d.example/news/6','Expired media payments initiative archived after validation window',now()-interval '14 hours','Payments','UPDATE',96,'REVIEW');`);
const expiredCall=autoCall('00000000-0000-4000-8000-000000000206','a'.repeat(64),autoPayload(),'expired media payments initiative archived after validation window','1'.repeat(64)).replace("now()-interval '1 hour'","now()-interval '14 hours'");
const expiredPublished=await concurrent(expiredCall);
assert.equal(expiredPublished.code,0,expiredPublished.stderr);
assert.equal(run("select ticker_eligible||':'||publication_status||':'||(published_at<now()-interval '13 hours') from global_announcements where canonical_url='https://d.example/news/6'").trim(),'false:approved:true','expired article is retained, approved, original-time and not ticker eligible');
assert.equal(run("select candidate_status||':'||ticker_eligible from intelligence_candidates where id='00000000-0000-4000-8000-000000000206'").trim(),'APPROVED:false');
const autoRoles=run("select has_function_privilege('anon','public.gpir_publish_t3_automatic_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)','execute')||':'||has_function_privilege('authenticated','public.gpir_publish_t3_automatic_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)','execute')").trim();
assert.equal(autoRoles,'false:false','automatic T3 publication must not be executable by anon or authenticated');
file('supabase/migrations/20261110030000_m40_revoke_legacy_publication_rpcs.sql');
const legacyFunctions=[
 'public.gpir_publish_validated_candidate(uuid,text,timestamptz,text,jsonb)',
 'public.gpir_publish_consolidated_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)',
 'public.gpir_publish_t3_automatic_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)'
];
for(const fn of legacyFunctions)
 for(const role of ['anon','authenticated','service_role'])
  assert.equal(run(`select has_function_privilege('${role}','${fn}','execute')`).trim(),'f',`${role} cannot execute ${fn}`);
const deniedCalls=[
 `select public.gpir_publish_validated_candidate('${ids[0]}','${summary}',now(),'${'1'.repeat(64)}','${payload}'::jsonb)`,
 call(ids[0],'1'.repeat(64)),
 autoCall(autoId,'7'.repeat(64),autoPayload(),autoSubject,autoKey)
];
for(const sql of deniedCalls){
 const result=await concurrent(`set role service_role; ${sql}`);
 assert.notEqual(result.code,0,'legacy RPC must reject the service role');
 assert.match(result.stderr,/permission denied for function/);
}
assert.equal(run("select has_function_privilege('service_role','public.gpir_publish_t3_editorial_candidate(uuid,text,timestamptz,text,jsonb,text,text,text,text,date,text,text[],text)','execute')").trim(),'t');
assert.equal(Number(run('select count(*) from global_announcements')),4,'permission checks must not modify published history');
console.log('G1-R07 PostgreSQL acceptance PASS: legacy behavior tested before migration; service role denied legacy RPCs afterwards; editorial RPC grant retained');
