// Stage 3 owner approval persistence: reuse existing service-role Supabase CAS and writer locks.
// No HTTP endpoint or queue scheduler is activated by this module.
const validId=/^sep01-owner-[a-z0-9-]{6,60}$/;
const validBranch=/^sep01\/jobs\/[a-zA-Z0-9._-]+$/;
export function createMultifileApprovalPersistence({store,ownerUserId,maximumApprovedCostUsd=0}={}){
 if(!store||typeof store.save!=='function'||typeof store.get!=='function'||typeof store.compareAndSet!=='function'||!ownerUserId||!Number.isFinite(maximumApprovedCostUsd)||maximumApprovedCostUsd<0)throw Error('MULTIFILE_PERSISTENCE_CONFIG_INVALID');
 const requireOwner=actor=>{if(actor!==ownerUserId)throw Error('MULTIFILE_OWNER_AUTH_REQUIRED');};
 return {
  async stage({actor,jobId,plan,instruction,branch}={}){
   requireOwner(actor);
   if(!validId.test(jobId||'')||!validBranch.test(branch||'')||branch!=='sep01/jobs/'+jobId||plan?.execution_route!=='bounded_multifile_v1'||plan.enabled!==false||plan.read_only!==true||!Array.isArray(plan.manifest)||plan.manifest.length<2||plan.manifest.length>3||typeof instruction!=='string'||!instruction.trim()||instruction.length>1000)throw Error('MULTIFILE_PLAN_NOT_ELIGIBLE');
   const payload={job_id:jobId,idempotency_key:'multifile:'+jobId,owner_user_id:ownerUserId,execution_route:'bounded_multifile_v1',status:'PLANNED',scope:'development',capability:'code',sensitivity_tier:null,branch,base_sha:plan.base_sha,plan_id:plan.plan_id,manifest:plan.manifest,locked_paths:plan.manifest.map(x=>x.path),instruction,single_attempt:true,cost_approved:false,remaining_budget:0};
   // Insert only; the unique job identity and revision are created atomically by the existing CAS RPC.
   return store.save(payload,null);
  },
  async approve({actor,jobId,planId,confirmation,maxProviderRequests,maxCostUsd,externalCapVerified=false}={}){
   requireOwner(actor);
   if(confirmation!=='AUTHORIZE_ONE_MULTIFILE_JOB'||!validId.test(jobId||'')||!/^[a-f0-9]{64}$/.test(planId||'')||!Number.isSafeInteger(maxProviderRequests)||maxProviderRequests<2||maxProviderRequests>3||!Number.isFinite(maxCostUsd)||maxCostUsd<0||maxCostUsd>maximumApprovedCostUsd||externalCapVerified!==true)throw Error('MULTIFILE_EXPLICIT_APPROVAL_REQUIRED');
   const job=await store.get(jobId);
   if(!job||job.status!=='PLANNED'||job.owner_user_id!==ownerUserId||job.plan_id!==planId||!Array.isArray(job.locked_paths)||job.locked_paths.length>maxProviderRequests||!validBranch.test(job.branch))throw Error('MULTIFILE_APPROVAL_STALE');
   const multifile_approval={status:'APPROVED',owner_user_id:ownerUserId,job_id:jobId,plan_id:planId,base_sha:job.base_sha,branch:job.branch,instruction:job.instruction,locked_paths:job.locked_paths,single_attempt:true,cost_approved:true,max_provider_requests:maxProviderRequests,max_cost_usd:maxCostUsd,external_cap_verified:true,approved_at:new Date().toISOString(),revision:job.revision};
   const saved=await store.compareAndSet(jobId,'PLANNED',{status:'APPROVED',cost_approved:true,multifile_approval});
   if(!saved)throw Error('MULTIFILE_APPROVAL_CONCURRENTLY_CHANGED');
   return saved;
  },
  async queueApproved({actor,jobId,confirmation,executionReleased=false}={}){
   requireOwner(actor);
   if(confirmation!=='AUTHORIZE_ONE_MULTIFILE_DISPATCH'||executionReleased!==true)throw Error('MULTIFILE_DISPATCH_APPROVAL_REQUIRED');
   if(!validId.test(jobId||''))throw Error('MULTIFILE_JOB_ID_INVALID');
   const job=await store.get(jobId);
   if(!job||job.status!=='APPROVED'||job.owner_user_id!==ownerUserId||job.multifile_approval?.status!=='APPROVED'||job.multifile_approval?.plan_id!==job.plan_id)throw Error('MULTIFILE_PERSISTED_APPROVAL_REQUIRED');
   // No provider request here. The existing durable worker will atomically transition
   // QUEUED -> CLAIMED through gpir_sep01_cas_job, acquiring path and branch locks.
   const saved=await store.compareAndSet(jobId,'APPROVED',{status:'QUEUED'});
   if(!saved)throw Error('MULTIFILE_CLAIM_CONCURRENTLY_CHANGED');
   return saved;
  }
 };
}
