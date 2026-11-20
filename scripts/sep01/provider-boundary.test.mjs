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
