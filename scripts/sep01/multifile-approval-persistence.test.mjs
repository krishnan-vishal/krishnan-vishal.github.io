import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMultifileManifest} from './multifile-governance.mjs';
import {createMultifileApprovalPersistence} from './multifile-approval-persistence.mjs';
const tree=['docs/a.md','docs/b.md'].map(path=>({path,type:'blob',size:8,sha:'b'.repeat(40)}));
const plan=validateMultifileManifest({files:tree.map(x=>x.path),tree,baseSha:'a'.repeat(40),instruction:'Improve both documents',ownerId:'owner'});
function fixture(){
 const records=new Map();let saves=0;
 const store={
  save:async(job,expected)=>{assert.equal(expected,null);saves++;if(records.has(job.job_id))throw Error('STALE_REVISION_OR_IDEMPOTENCY_CONFLICT');const row={...job,revision:1};records.set(job.job_id,row);return row;},
  get:async id=>records.get(id)||null,
  compareAndSet:async(id,status,patch)=>{
   const old=records.get(id);if(old?.status!==status)return null;
   if(patch.status==='CLAIMED'){
    for(const [otherId,record] of records){
     if(otherId!==id&&record.status==='CLAIMED'&&record.locked_paths.some(path=>old.locked_paths.includes(path)))throw Error('WRITER_LOCK_CONFLICT');
    }
   }
   const next={...old,...patch,revision:old.revision+1};records.set(id,next);return next;
  }
 };
 return {store,records,get saves(){return saves}};
}
test('persisted plan to owner-approved CAS to locked claim, without dispatch',async()=>{
 const f=fixture(),p=createMultifileApprovalPersistence({store:f.store,ownerUserId:'owner'});
 const jobId='sep01-owner-approval-test';
 const staged=await p.stage({actor:'owner',jobId,plan,instruction:'Improve both documents',branch:'sep01/jobs/'+jobId});
 assert.equal(staged.status,'PLANNED');assert.equal(staged.cost_approved,false);
 const approved=await p.approve({actor:'owner',jobId,planId:plan.plan_id,confirmation:'AUTHORIZE_ONE_MULTIFILE_JOB',maxProviderRequests:2,maxCostUsd:0,externalCapVerified:true});
 assert.equal(approved.status,'APPROVED');assert.equal(approved.multifile_approval.status,'APPROVED');
 const queued=await p.queueApproved({actor:'owner',jobId,confirmation:'AUTHORIZE_ONE_MULTIFILE_DISPATCH',executionReleased:true});assert.equal(queued.status,'QUEUED');
 const claimed=await f.store.compareAndSet(jobId,'QUEUED',{status:'CLAIMED'});
 assert.equal(claimed.multifile_approval.plan_id,plan.plan_id);assert.equal(f.saves,1);
});
test('owner mismatch, absent confirmed cost cap, stale plan and repeated approval fail closed',async()=>{
 const f=fixture(),p=createMultifileApprovalPersistence({store:f.store,ownerUserId:'owner'});
 const jobId='sep01-owner-rejection-test';
 await assert.rejects(p.stage({actor:'other',jobId,plan,instruction:'Improve both documents',branch:'sep01/jobs/'+jobId}),/OWNER_AUTH_REQUIRED/);
 await p.stage({actor:'owner',jobId,plan,instruction:'Improve both documents',branch:'sep01/jobs/'+jobId});
 const input={actor:'owner',jobId,planId:plan.plan_id,confirmation:'AUTHORIZE_ONE_MULTIFILE_JOB',maxProviderRequests:2,maxCostUsd:0,externalCapVerified:true};
 await assert.rejects(p.approve({...input,actor:'other'}),/OWNER_AUTH_REQUIRED/);
 await assert.rejects(p.approve({...input,externalCapVerified:false}),/EXPLICIT_APPROVAL_REQUIRED/);
 await assert.rejects(p.approve({...input,planId:'f'.repeat(64)}),/APPROVAL_STALE/);
 await assert.rejects(p.approve({...input,maxCostUsd:1}),/EXPLICIT_APPROVAL_REQUIRED/);
 await p.approve(input);
 await assert.rejects(p.approve(input),/APPROVAL_STALE/);
});
test('same-file concurrent claims conflict via existing CAS contract',async()=>{
 const f=fixture(),p=createMultifileApprovalPersistence({store:f.store,ownerUserId:'owner'});
 for(const jobId of ['sep01-owner-lock-one','sep01-owner-lock-two']){
  await p.stage({actor:'owner',jobId,plan,instruction:'Improve both documents',branch:'sep01/jobs/'+jobId});
  await p.approve({actor:'owner',jobId,planId:plan.plan_id,confirmation:'AUTHORIZE_ONE_MULTIFILE_JOB',maxProviderRequests:2,maxCostUsd:0,externalCapVerified:true});
 }
 for(const jobId of ['sep01-owner-lock-one','sep01-owner-lock-two'])await p.queueApproved({actor:'owner',jobId,confirmation:'AUTHORIZE_ONE_MULTIFILE_DISPATCH',executionReleased:true});
 await f.store.compareAndSet('sep01-owner-lock-one','QUEUED',{status:'CLAIMED'});
 await assert.rejects(f.store.compareAndSet('sep01-owner-lock-two','QUEUED',{status:'CLAIMED'}),/WRITER_LOCK_CONFLICT/);
});
