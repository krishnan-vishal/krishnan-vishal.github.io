import test from 'node:test';import assert from 'node:assert/strict';
import {createDurableWorker} from './durable-worker.mjs';
const sha='a'.repeat(40);
const base={job_id:'j',idempotency_key:'k',branch:'feat/a',locked_paths:['fixture.js'],scope:'dashboard',status:'QUEUED'};
function fixture(initial=base){
 let row={...initial},calls=[];
 const store={get:async()=>row,compareAndSet:async(id,expected,patch)=>{calls.push([expected,patch.status]);if(row.status!==expected)return null;row={...row,...patch};return row;}};
 return {store,calls,get:()=>row};
}
test('one claim and verified checkpoint are durably persisted',async()=>{
 const f=fixture();const worker=createDurableWorker({store:f.store,execute:async()=>({status:'SUCCESS',commit:sha,step:'verified'}),verifyCheckpoint:async commit=>commit===sha});
 const result=await worker('j');assert.equal(result.status,'CHECKPOINTED');assert.equal(f.get().checkpoint_commit,sha);assert.deepEqual(f.calls.map(x=>x[0]),['QUEUED','CLAIMED']);
});
test('unverified checkpoint cannot be resumed or executed',async()=>{
 const f=fixture({...base,status:'QUOTA_PAUSED',checkpoint_commit:sha});let executed=false;
 const worker=createDurableWorker({store:f.store,execute:async()=>{executed=true;},verifyCheckpoint:async()=>false});
 assert.equal((await worker('j')).status,'BLOCKED');assert.equal(executed,false);assert.equal(f.calls.length,0);
});
test('provider overload pauses without committing unverified work',async()=>{
 const f=fixture();const worker=createDurableWorker({store:f.store,execute:async()=>({status:'PROVIDER_BUSY'}),verifyCheckpoint:async()=>true});
 assert.equal((await worker('j')).status,'QUOTA_PAUSED');assert.equal(f.get().checkpoint_commit,undefined);
});
test('already claimed jobs are not executed twice',async()=>{
 const f=fixture({...base,status:'CLAIMED'});let called=false;
 const worker=createDurableWorker({store:f.store,execute:async()=>{called=true;},verifyCheckpoint:async()=>true});
 assert.equal((await worker('j')).status,'BLOCKED');assert.equal(called,false);
});
test('fresh runner returns a verified checkpoint without repeating execution',async()=>{
 const f=fixture({...base,status:'CHECKPOINTED',checkpoint_commit:sha,last_safe_step:'pushed'});let called=false;
 const worker=createDurableWorker({store:f.store,execute:async()=>{called=true;},verifyCheckpoint:async commit=>commit===sha});
 const result=await worker('j');
 assert.equal(result.status,'RECOVERED_CHECKPOINT');assert.equal(result.job.checkpoint_commit,sha);assert.equal(called,false);assert.equal(f.calls.length,0);
});
test('fresh runner reconciles a pushed checkpoint after a claimed-state interruption',async()=>{
 const f=fixture({...base,status:'CLAIMED'});let called=false;
 const worker=createDurableWorker({store:f.store,execute:async()=>{called=true;},verifyCheckpoint:async commit=>commit===sha,recoverCheckpoint:async()=>({commit:sha,step:'remote verified'})});
 const result=await worker('j');
 assert.equal(result.status,'RECOVERED_CHECKPOINT');assert.equal(f.get().status,'CHECKPOINTED');assert.equal(f.get().checkpoint_commit,sha);assert.equal(called,false);assert.deepEqual(f.calls.map(x=>x[0]),['CLAIMED']);
});

test('checkpoint receipt persists the successful provider and bounded attempts', async()=>{
 const f=fixture();
 const attempts=[{provider:'gemini',status:'QUOTA_EXHAUSTED'},{provider:'openrouter',status:'EDIT'}];
 const worker=createDurableWorker({store:f.store,execute:async()=>({status:'SUCCESS',commit:sha,provider:'openrouter',model_attempts:attempts}),verifyCheckpoint:async commit=>commit===sha});
 const result=await worker('j');
 assert.equal(result.job.provider,'openrouter');
 assert.deepEqual(result.job.model_attempts,attempts);
});

test('one-shot fixture provider failure is terminal and cannot be scheduled again',async()=>{
 const f=fixture({...base,scope:'fixture'});
 let calls=0;
 const worker=createDurableWorker({store:f.store,execute:async()=>{calls++;return {status:'QUOTA_EXHAUSTED',model_attempts:[{provider:'gemini',status:'QUOTA_EXHAUSTED'},{provider:'openrouter',status:'QUOTA_EXHAUSTED'}]};},verifyCheckpoint:async()=>false});
 const result=await worker('j');
 assert.equal(result.status,'BLOCKED');
 assert.equal(f.get().status,'BLOCKED');
 assert.equal(f.get().reason,'QUOTA_EXHAUSTED');
 assert.equal(calls,1);
 assert.equal((await worker('j')).status,'UNCHANGED');
 assert.equal(calls,1);
});
test('previously paused fixture is terminalized without another provider call even before gateway deployment',async()=>{
 const f=fixture({...base,scope:'fixture',status:'QUOTA_PAUSED'});
 let calls=0;
 const worker=createDurableWorker({store:f.store,execute:async()=>{calls++;},verifyCheckpoint:async()=>false});
 assert.equal((await worker('j')).status,'BLOCKED');
 assert.equal(f.get().status,'BLOCKED');
 assert.equal(f.get().reason,'SINGLE_ATTEMPT_ALREADY_USED');
 assert.equal(calls,0);
});
test('one-shot fixture transport exception cannot enter the scheduled paused queue',async()=>{
 const f=fixture({...base,scope:'fixture'});
 const worker=createDurableWorker({store:f.store,execute:async()=>{throw Error('PROVIDER_TRANSPORT_FAILURE');},verifyCheckpoint:async()=>false});
 await assert.rejects(()=>worker('j'),/PROVIDER_TRANSPORT_FAILURE/);
 assert.equal(f.get().status,'BLOCKED');
 assert.equal(f.get().reason,'EXECUTION_ERROR');
});
test('ordinary development job remains eligible for established paused recovery',async()=>{
 const f=fixture({...base,scope:'development',single_attempt:false});
 const worker=createDurableWorker({store:f.store,execute:async()=>({status:'PROVIDER_BUSY'}),verifyCheckpoint:async()=>false});
 assert.equal((await worker('j')).status,'QUOTA_PAUSED');
 assert.equal(f.get().status,'QUOTA_PAUSED');
});
