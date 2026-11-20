// SEP-01 genuine provider quota failover. Caller supplies durable checkpoint
// verification and bounded execution adapters; no provider commands are executed.
import {claim,quotaFailure} from './controller.mjs';
import {selectAuthorizedAgent} from './agent-registry.mjs';
export async function dispatchWithQuotaFailover({job,providers,config,verifyCheckpoint,execute}){
 if(typeof verifyCheckpoint!=='function'||typeof execute!=='function'||!job?.job_id)throw Error('INVALID_DISPATCH_CONTRACT');
 const first=selectAuthorizedAgent(job,providers,config);
 if(!first)return {...job,status:'QUOTA_PAUSED',reason:'NO_AUTHORIZED_PROVIDER'};
 let active=claim(job,[first]);
 if(active.status!=='CLAIMED')return active;
 const firstResult=await execute({job:active,provider:first});
 if(firstResult?.status!=='QUOTA_EXHAUSTED')return {job:active,result:firstResult};
 // Never switch on a real 429 without a durable, independently verified commit.
 if(!job.checkpoint_commit||!/^[a-f0-9]{40}$/.test(job.checkpoint_commit)||!await verifyCheckpoint(job.checkpoint_commit,job)){
  return {job:{...active,status:'QUOTA_PAUSED',reason:'NO_VERIFIED_CHECKPOINT'},result:firstResult};
 }
 const saved={...active,status:'CHECKPOINTED',checkpoint_commit:job.checkpoint_commit,last_safe_step:job.last_safe_step||'verified checkpoint'};
 const remaining=providers.filter(p=>p.id!==first.id&&p.agent_id!==first.agent_id);
 const allowed=remaining.filter(p=>selectAuthorizedAgent(job,[p],config)?.id===p.id);
 const next=quotaFailure(saved,allowed);
 if(next.status!=='CLAIMED')return {job:next,result:firstResult};
 const fallback=allowed.find(p=>p.id===next.provider);
 if(!fallback||!await verifyCheckpoint(next.checkpoint_commit,job))throw Error('CHECKPOINT_CHANGED_BEFORE_FAILOVER');
 const result=await execute({job:next,provider:fallback});
 return {job:next,result,switched_from:first.id,switched_to:fallback.id,quota_event:'OBSERVED_429'};
}
