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
console.log('G1-R07 PostgreSQL acceptance PASS: concurrent publication, 1 card, 2 sources, T3/ambiguous/duplicate rejected, atomic rollback');
