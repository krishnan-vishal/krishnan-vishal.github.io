import test from 'node:test';
import assert from 'node:assert/strict';
import {executeWithFailover} from './provider-boundary.mjs';
const providers=[{id:'codex',approved:true,healthy:true,tier:'TIER_1',private_environment:true,remaining_quota:1,capabilities:['code'],estimated_cost:1},{id:'fallback',approved:true,healthy:true,tier:'TIER_1',private_environment:true,remaining_quota:1,capabilities:['code'],estimated_cost:2}];
const job={job_id:'handoff',idempotency_key:'once',branch:'sep01',locked_paths:['test.js'],scope:'security',capability:'code',remaining_budget:5,status:'QUEUED'};
test('simulated 429 before a checkpoint pauses without duplicate provider invocation',async()=>{
 const calls=[],persisted=[];
 const state=await executeWithFailover({job,providers,invoke:async p=>{calls.push(p.id);return {status:'QUOTA_EXHAUSTED'};},persist:async s=>{persisted.push(s.status);return s;}});
 assert.deepEqual(calls,['codex']);
 assert.equal(state.status,'QUOTA_PAUSED');
 assert.deepEqual(persisted,['CLAIMED','QUOTA_PAUSED']);
});
test('successful approved provider persists verified commit',async()=>{
 const calls=[];
 const state=await executeWithFailover({job,providers,invoke:async p=>{calls.push(p.id);return {status:'SUCCESS',commit:'a'.repeat(40),step:'verified'};},persist:async s=>s});
 assert.equal(state.status,'CHECKPOINTED');assert.deepEqual(calls,['codex']);
});

test('429 with durable checkpoint safely hands off exactly once',async()=>{
 const calls=[],states=[];
 const result=await executeWithFailover({
  job,providers,
  invoke:async (provider,state)=>{
   calls.push({id:provider.id,checkpoint:state.checkpoint_commit});
   return provider.id==='codex'
    ? {status:'QUOTA_EXHAUSTED',commit:'c'.repeat(40),step:'safe git commit'}
    : {status:'SUCCESS',commit:'d'.repeat(40),step:'reviewed result'};
  },
  persist:async state=>{states.push(state.status);return state;}
 });
 assert.deepEqual(calls.map(x=>x.id),['codex','fallback']);
 assert.equal(calls[1].checkpoint,'c'.repeat(40));
 assert.deepEqual(states,['CLAIMED','CHECKPOINTED','CLAIMED','CHECKPOINTED']);
 assert.equal(result.checkpoint_commit,'d'.repeat(40));
});
test('failed checkpoint persistence prevents fallback invocation',async()=>{
 const calls=[];
 await assert.rejects(executeWithFailover({
  job,providers,
  invoke:async p=>{calls.push(p.id);return {status:'QUOTA_EXHAUSTED',commit:'e'.repeat(40),step:'safe'};},
  persist:async s=>{if(s.status==='CHECKPOINTED')throw Error('PERSISTENCE_DOWN');return s;}
 }),/PERSISTENCE_DOWN/);
 assert.deepEqual(calls,['codex']);
});

test('temporary outage after durable checkpoint switches to approved fallback',async()=>{
 const calls=[];
 const result=await executeWithFailover({job,providers,invoke:async p=>{
  calls.push(p.id);
  return p.id==='codex'
   ? {status:'TEMPORARILY_UNAVAILABLE',commit:'a'.repeat(40),step:'verified checkpoint'}
   : {status:'SUCCESS',commit:'b'.repeat(40),step:'verified fallback'};
 },persist:async state=>state});
 assert.deepEqual(calls,['codex','fallback']);
 assert.equal(result.checkpoint_commit,'b'.repeat(40));
});
test('rate limit without checkpoint pauses safely',async()=>{
 const calls=[];
 const result=await executeWithFailover({job,providers,invoke:async p=>{calls.push(p.id);return {status:'RATE_LIMITED'};},persist:async s=>s});
 assert.deepEqual(calls,['codex']);
 assert.equal(result.status,'QUOTA_PAUSED');
});
test('authentication failure blocks and never switches provider',async()=>{
 const calls=[];
 const result=await executeWithFailover({job,providers,invoke:async p=>{calls.push(p.id);return {status:'AUTH_FAILED'};},persist:async s=>s});
 assert.deepEqual(calls,['codex']);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'AUTH_FAILED');
});
