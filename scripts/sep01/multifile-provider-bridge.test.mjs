import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateMultifileManifest} from './multifile-governance.mjs';
import {createMultifileProviderBridge} from './multifile-provider-bridge.mjs';
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'gpir-bridge-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 mkdirSync(join(root,'docs'));
 writeFileSync(join(root,'docs/a.md'),'first\n');
 writeFileSync(join(root,'docs/b.md'),'second\n');
 git('init','-q');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','baseline');
 const base_sha=git('rev-parse','HEAD'),branch='sep01/jobs/sep01-owner-bridge-test';
 git('checkout','-qb',branch);
 const sha=p=>createHash('sha1').update('blob '+Buffer.byteLength(readFileSync(join(root,p)))+'\0').update(readFileSync(join(root,p))).digest('hex');
 const tree=['docs/a.md','docs/b.md'].map(path=>({type:'blob',path,size:Buffer.byteLength(readFileSync(join(root,path))),sha:sha(path)}));
 const instruction='Improve both documents';
 const plan=validateMultifileManifest({files:tree.map(x=>x.path),tree,baseSha:base_sha,ownerId:'owner',instruction});
 const job_id='sep01-owner-bridge-test';
 const multifile_approval={status:'APPROVED',owner_user_id:'owner',job_id,plan_id:plan.plan_id,base_sha,branch,instruction,locked_paths:tree.map(x=>x.path),single_attempt:true,cost_approved:true,max_provider_requests:3,approved_at:'2026-11-22T08:00:00Z',revision:2,max_cost_usd:0,external_cap_verified:true};
 const job={job_id,revision:2,status:'CLAIMED',owner_user_id:'owner',execution_route:'bounded_multifile_v1',branch,base_sha,plan_id:plan.plan_id,instruction,manifest:plan.manifest,locked_paths:tree.map(x=>x.path),single_attempt:true,cost_approved:true,multifile_approval};
 let currentJob=job;
 const store={
  get:async()=>currentJob,
  compareAndSet:async(id,status,patch)=>{
   if(currentJob.job_id!==id||currentJob.status!==status||currentJob.provider_attempt_reserved)return null;
   currentJob={...currentJob,...patch,revision:currentJob.revision+1};
   return currentJob;
  }
 };
 return {root,git,job,store,close:()=>rmSync(root,{recursive:true,force:true})};
}
test('disabled bridge never touches persistence or a provider',async()=>{
 const f=fixture();let reads=0,calls=0;
 try{
  const bridge=createMultifileProviderBridge({root:f.root,store:{get:async()=>{reads++;return f.job},compareAndSet:async()=>{throw Error('SHOULD_NOT_CAS')}},ownerUserId:'owner',runTests:async()=>{},gemini:{apiKey:'test',model:'gemini-test',fetchImpl:async()=>{calls++;throw Error('SHOULD_NOT_CALL')}}});
  await assert.rejects(bridge(f.job.job_id),/EXECUTION_NOT_ENABLED/);
  assert.equal(reads,0);assert.equal(calls,0);
 }finally{f.close()}
});
test('persisted approval binds both file edits before a local checkpoint',async()=>{
 const f=fixture();let calls=0;
 try{
  const bridge=createMultifileProviderBridge({root:f.root,store:f.store,ownerUserId:'owner',executionEnabled:true,providerSpendCapVerified:true,providerSpendCapUsd:0,runTests:async()=>{},gemini:{apiKey:'test',model:'gemini-test',fetchImpl:async()=>({ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({content:'approved change '+(++calls)+'\n'})}]}}]})})}});
  const result=await bridge(f.job.job_id);
  assert.equal(result.status,'SUCCESS');assert.equal(result.provider_requests,2);
  assert.deepEqual(result.changed_paths,['docs/a.md','docs/b.md']);
  assert.equal(f.git('rev-parse','HEAD^'),f.job.base_sha);
  assert.equal(f.git('status','--porcelain'),'');
 }finally{f.close()}
});
test('missing or forged approval, stale revision, and unauthorized locks fail before charge',async()=>{
 const f=fixture();let calls=0;
 try{
  let active=f.job;
  const bridge=createMultifileProviderBridge({root:f.root,store:{get:async()=>active,compareAndSet:async()=>{throw Error('SHOULD_NOT_CAS')}},ownerUserId:'owner',executionEnabled:true,providerSpendCapVerified:true,providerSpendCapUsd:0,runTests:async()=>{},gemini:{apiKey:'test',model:'gemini-test',fetchImpl:async()=>{calls++;throw Error('SHOULD_NOT_CALL')}}});
  for(const patch of [
   {multifile_approval:null},
   {revision:1},
   {multifile_approval:{...f.job.multifile_approval,plan_id:'f'.repeat(64)}},
   {locked_paths:['docs/a.md','docs/not-approved.md']},
   {status:'QUEUED'}
  ]){
   active={...f.job,...patch};
   await assert.rejects(bridge(f.job.job_id));
  }
  assert.equal(calls,0);
 }finally{f.close()}
});
test('provider fallback stays within a three-call global budget',async()=>{
 const f=fixture();let geminiCalls=0,routerCalls=0;
 try{
  const bridge=createMultifileProviderBridge({root:f.root,store:f.store,ownerUserId:'owner',executionEnabled:true,providerSpendCapVerified:true,providerSpendCapUsd:0,runTests:async()=>{},
   gemini:{apiKey:'test',model:'gemini-test',fetchImpl:async()=>{
    geminiCalls++;
    if(geminiCalls===1)return {ok:false,status:429};
    return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({content:'gemini success\n'})}]}}]})};
   }},
   openrouter:{apiKey:'test',model:'openrouter/test',fetchImpl:async()=>{routerCalls++;return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({content:'openrouter success\n'})}}]})}}}
  });
  const result=await bridge(f.job.job_id);
  assert.equal(result.status,'SUCCESS');assert.equal(result.provider_requests,3);
  assert.equal(routerCalls,1);assert.equal(geminiCalls,2);
 }finally{f.close()}
});

test('provider reservation prevents repeat charges on crash, retry or concurrent attempt',async()=>{
 const f=fixture();let calls=0;
 try{
  const config={root:f.root,store:f.store,ownerUserId:'owner',executionEnabled:true,providerSpendCapVerified:true,providerSpendCapUsd:0,runTests:async()=>{},
   gemini:{apiKey:'test',model:'gemini-test',fetchImpl:async()=>{calls++;throw Error('SIMULATED_PROVIDER_CRASH')}}};
  const bridge=createMultifileProviderBridge(config);
  await assert.rejects(bridge(f.job.job_id),/SIMULATED_PROVIDER_CRASH/);
  assert.equal(calls,1);
  await assert.rejects(bridge(f.job.job_id),/MULTIFILE_PROVIDER_ATTEMPT_ALREADY_CONSUMED/);
  assert.equal(calls,1);
 }finally{f.close()}
});
test('missing atomic reservation fails closed before any paid provider call',async()=>{
 const f=fixture();let calls=0;
 try{
  const bridge=createMultifileProviderBridge({root:f.root,store:{get:async()=>f.job,compareAndSet:async()=>null},ownerUserId:'owner',
   executionEnabled:true,providerSpendCapVerified:true,providerSpendCapUsd:0,runTests:async()=>{},
   gemini:{apiKey:'test',model:'gemini-test',fetchImpl:async()=>{calls++;throw Error('SHOULD_NOT_CALL')}}});
  await assert.rejects(bridge(f.job.job_id),/MULTIFILE_PROVIDER_ATTEMPT_RESERVATION_FAILED/);
  assert.equal(calls,0);
 }finally{f.close()}
});
