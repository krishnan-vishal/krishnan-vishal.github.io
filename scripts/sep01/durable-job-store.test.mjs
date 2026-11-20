import test from 'node:test';import assert from 'node:assert/strict';
import {createDurableJobStore} from './durable-job-store.mjs';
test('existing payload queue enqueues idempotently and transitions by revision CAS',async()=>{
 const requests=[];
 const row={job_id:'j1',idempotency_key:'once',revision:0,payload:{branch:'sep01/jobs/j1',locked_paths:['fixture.js'],scope:'dashboard',instruction:'edit fixture',status:'QUEUED'}};
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async(url,opts)=>{
  requests.push({url,opts});
  if(opts.method==='PATCH'){const body=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>[{...row,...body}]};}
  return {ok:true,status:200,json:async()=>[row]};
 }});
 await store.enqueue({job_id:'j1',idempotency_key:'once',branch:'sep01/jobs/j1',locked_paths:['fixture.js'],scope:'dashboard',instruction:'edit fixture'});
 const changed=await store.compareAndSet('j1','QUEUED',{status:'CLAIMED',provider:'gemini'});
 assert.equal(changed.status,'CLAIMED');assert.equal(changed.revision,1);
 assert.equal(JSON.parse(requests[0].opts.body).payload.status,'QUEUED');
 assert.match(requests[2].url,/revision=eq.0/);
 assert.equal(requests[2].opts.method,'PATCH');
 assert.equal(requests[0].opts.headers.Authorization,'Bearer private-test-key');
});
test('reject unsafe job branch and identity mutation',async()=>{
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async()=>{throw Error('SHOULD_NOT_CALL');}});
 await assert.rejects(()=>store.enqueue({job_id:'j',idempotency_key:'k',branch:'main',locked_paths:['a.js'],instruction:'edit'}),/INVALID_DURABLE_JOB/);
 await assert.rejects(()=>store.compareAndSet('j','QUEUED',{status:'CLAIMED',job_id:'other'}),/INVALID_JOB_TRANSITION/);
});
