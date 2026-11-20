import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedJobStore} from './shared-job-store.mjs';
import {executeWithFailover} from './provider-boundary.mjs';

function fakeAtomicRpc() {
 const rows=new Map();
 return async (_url,options)=>{
  const p=JSON.parse(options.body),old=rows.get(p.p_job_id);
  if((old?.revision??null)!==p.p_expected_revision || (old&&old.idempotency_key!==p.p_idempotency_key))
   return {ok:false,status:409};
  const saved={...p.p_payload,revision:(old?.revision??0)+1};
  rows.set(p.p_job_id,saved);
  return {ok:true,json:async()=>saved};
 };
}
const providers=[
 {id:'codex',approved:true,healthy:true,tier:'TIER_1',private_environment:true,remaining_quota:1,capabilities:['code'],estimated_cost:1},
 {id:'fallback',approved:true,healthy:true,tier:'TIER_1',private_environment:true,remaining_quota:1,capabilities:['code'],estimated_cost:2}
];
const job={job_id:'sep01-e2e',idempotency_key:'once',branch:'sep01',locked_paths:['src/file.js'],scope:'security',capability:'code',remaining_budget:5,status:'QUEUED'};
test('two runners cannot commit the same revision',async()=>{
 const rpc=fakeAtomicRpc();
 const a=new SharedJobStore({url:'https://example.supabase.co',key:'test-only',fetchImpl:rpc});
 const b=new SharedJobStore({url:'https://example.supabase.co',key:'test-only',fetchImpl:rpc});
 const first=await a.save(job);
 assert.equal(first.revision,1);
 const outcomes=await Promise.allSettled([a.save({...job,status:'CLAIMED'},1),b.save({...job,status:'CLAIMED'},1)]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
});
test('end-to-end simulated 429 resumes only after shared checkpoint persistence',async()=>{
 const rpc=fakeAtomicRpc();
 const store=new SharedJobStore({url:'https://example.supabase.co',key:'test-only',fetchImpl:rpc});
 let revision=null;const calls=[],states=[];
 const result=await executeWithFailover({job,providers,
  persist:async state=>{
   const saved=await store.save(state,revision);
   revision=saved.revision;states.push(saved.status);return saved;
  },
  invoke:async(provider,state)=>{
   calls.push({provider:provider.id,checkpoint:state.checkpoint_commit});
   return provider.id==='codex'
    ? {status:'QUOTA_EXHAUSTED',commit:'a'.repeat(40),step:'durable commit'}
    : {status:'SUCCESS',commit:'b'.repeat(40),step:'verified continuation'};
  }
 });
 assert.deepEqual(calls.map(x=>x.provider),['codex','fallback']);
 assert.equal(calls[1].checkpoint,'a'.repeat(40));
 assert.deepEqual(states,['CLAIMED','CHECKPOINTED','CLAIMED','CHECKPOINTED']);
 assert.equal(result.revision,4);
});
test('bad shared-store authentication fails closed',async()=>{
 const store=new SharedJobStore({url:'https://example.supabase.co',key:'invalid',fetchImpl:async()=>({ok:false,status:403})});
 await assert.rejects(store.save(job),/SHARED_STORE_AUTH_FAILED/);
});
