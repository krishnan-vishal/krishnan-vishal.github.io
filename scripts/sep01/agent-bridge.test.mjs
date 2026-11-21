import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIDGE_PROVIDERS,createAgentBridge} from './agent-bridge.mjs';
const job={scope:'fixture',sensitivity_tier:'PUBLIC',instruction:'Update the fixture',locked_paths:['scripts/sep01/acceptance-fixture.txt']};
const path=job.locked_paths[0];
for(const provider of BRIDGE_PROVIDERS){
 test(provider+' refuses unverified execution',()=>{
  assert.throws(()=>createAgentBridge({provider,enabled:true,authenticated:false,capabilities:['bounded-text-edit'],invoke:async()=>({status:'EDIT',content:'x'})}),/NOT_READY/);
 });
 test(provider+' permits only authenticated bounded text edit',async()=>{
  const run=createAgentBridge({provider,enabled:true,authenticated:true,capabilities:['bounded-text-edit'],invoke:async()=>({status:'EDIT',content:'STATE: CHECKPOINT_VERIFIED'})});
  assert.deepEqual(await run({job,path,content:'STATE: PENDING'}),{status:'EDIT',content:'STATE: CHECKPOINT_VERIFIED'});
  await assert.rejects(()=>run({job:{...job,scope:'secrets'},path,content:'x'}),/SENSITIVE/);
  await assert.rejects(()=>run({job,path:'../escape',content:'x'}),/INPUT_REJECTED/);
 });
 test(provider+' only propagates bounded retryable failures',async()=>{
  const run=createAgentBridge({provider,enabled:true,authenticated:true,capabilities:['bounded-text-edit'],invoke:async()=>({status:'QUOTA_EXHAUSTED',content:'untrusted'})});
  assert.deepEqual(await run({job,path,content:'x'}),{status:'QUOTA_EXHAUSTED',provider});
 });
}
