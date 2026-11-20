import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableJobStore} from './durable-job-store.mjs';
test('durable queue is private, idempotent and uses conditional state transition',async()=>{
 const requests=[];
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async(url,opts)=>{
  requests.push({url,opts});return {ok:true,status:200,json:async()=>[{job_id:'j1',status:opts.method==='PATCH'?'CLAIMED':'QUEUED'}]};
 }});
 await store.enqueue({job_id:'j1',idempotency_key:'once',branch:'feature',locked_paths:['a.js'],scope:'dashboard'});
 await store.compareAndSet('j1','QUEUED',{status:'CLAIMED',provider:'gemini'});
 assert.match(requests[0].opts.headers.Prefer,/ignore-duplicates/);
 assert.equal(requests[0].opts.headers.Authorization,'Bearer private-test-key');
 assert.match(requests[1].url,/status=eq.QUEUED/);
 assert.equal(requests[1].opts.method,'PATCH');
});
test('cannot mutate job identity via state transition',async()=>{
 const store=createDurableJobStore({url:'https://example.supabase.co',key:'private-test-key',fetchImpl:async()=>{throw Error('SHOULD_NOT_CALL');}});
 await assert.rejects(()=>store.compareAndSet('j1','QUEUED',{status:'CLAIMED',job_id:'other'}),/INVALID_JOB_TRANSITION/);
});
