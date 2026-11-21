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
