import test from 'node:test';import assert from 'node:assert/strict';
import {createDurableJobStore} from './durable-job-store.mjs';
test('existing payload queue enqueues idempotently and transitions by revision CAS',async()=>{
 const requests=[];
 const row={job_id:'j1',idempotency_key:'once',revision:1,payload:{branch:'sep01/jobs/j1',locked_paths:['fixture.js'],scope:'dashboard',instruction:'edit fixture',status:'QUEUED'}};
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async(url,opts)=>{
  requests.push({url,opts});
  if(url.includes('/rpc/gpir_sep01_cas_job')){const body=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>({...body.p_payload,revision:2})};}
  return {ok:true,status:200,json:async()=>[row]};
 }});
 await store.enqueue({job_id:'j1',idempotency_key:'once',branch:'sep01/jobs/j1',locked_paths:['fixture.js'],scope:'dashboard',instruction:'edit fixture'});
 const changed=await store.compareAndSet('j1','QUEUED',{status:'CLAIMED',provider:'gemini'});
 assert.equal(changed.status,'CLAIMED');assert.equal(changed.revision,2);
 assert.equal(JSON.parse(requests[0].opts.body).payload.status,'QUEUED');
 assert.match(requests[2].url,/rpc\/gpir_sep01_cas_job/);
 assert.equal(requests[2].opts.method,'POST');
 assert.equal(JSON.parse(requests[2].opts.body).p_expected_revision,1);
 assert.equal(JSON.parse(requests[2].opts.body).p_payload.status,'CLAIMED');
 assert.equal(requests[0].opts.headers.Authorization,'Bearer private-test-key');
});
test('reject unsafe job branch and identity mutation',async()=>{
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async()=>{throw Error('SHOULD_NOT_CALL');}});
 await assert.rejects(()=>store.enqueue({job_id:'j',idempotency_key:'k',branch:'main',locked_paths:['a.js'],instruction:'edit'}),/INVALID_DURABLE_JOB/);
 await assert.rejects(()=>store.compareAndSet('j','QUEUED',{status:'CLAIMED',job_id:'other'}),/INVALID_JOB_TRANSITION/);
});

test('scheduled selection prefers queued work and recovers revisioned paused jobs only',async()=>{
 const paused={job_id:'sep01-owner-existing',idempotency_key:'original',revision:3,payload:{branch:'sep01/jobs/sep01-owner-existing',locked_paths:['docs/report.md'],scope:'development',instruction:'append section',status:'QUOTA_PAUSED'}};
 let mode='queued',queried=[];
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async(url)=>{
  queried.push(url);
  const isQueued=url.includes('status=eq.QUEUED');
  const value=isQueued?(mode==='queued'?[{...paused,revision:1,payload:{...paused.payload,status:'QUEUED'}}]:[]):(mode==='paused'?[paused]:[]);
  return {ok:true,status:200,json:async()=>value};
 }});
 const queue=await store.nextRecoverable();assert.equal(queue.status,'QUEUED');
 assert.equal(queried.length,1);
 mode='paused';queried=[];
 const recovery=await store.nextRecoverable();assert.equal(recovery.job_id,'sep01-owner-existing');assert.equal(recovery.revision,3);
 assert.equal(recovery.status,'QUOTA_PAUSED');assert.equal(queried.length,2);
 mode='none';assert.equal(await store.nextRecoverable(),null);
});
test('never schedule a paused job without an earlier claim or authorized job branch',async()=>{
 const fake={job_id:'bad',idempotency_key:'bad',revision:1,payload:{branch:'main',status:'QUOTA_PAUSED'}};
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async(url)=>({ok:true,status:200,json:async()=>url.includes('status=eq.QUEUED')?[]:[fake]})});
 assert.equal(await store.nextRecoverable(),null);
});
