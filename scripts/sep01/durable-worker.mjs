// SEP-01 durable worker: one queue job per invocation, no production deployment.
// Caller provides authenticated provider execution and isolated Git checkpoint verification.
import {classify} from './controller.mjs';
export function createDurableWorker({store,execute,verifyCheckpoint,recoverCheckpoint=async()=>null}){
 if(!store||typeof execute!=='function'||typeof verifyCheckpoint!=='function')throw Error('INVALID_DURABLE_WORKER');
 return async function process(jobId){
  const initial=await store.get(jobId);
  if(!initial)return {status:'NOT_FOUND'};
  classify(initial);
  if(!['QUEUED','CLAIMED','CHECKPOINTED','QUOTA_PAUSED'].includes(initial.status))return {status:'UNCHANGED',job:initial};
  if(initial.checkpoint_commit){
   if(!await verifyCheckpoint(initial.checkpoint_commit,initial))return {status:'BLOCKED',reason:'CHECKPOINT_NOT_VERIFIED'};
   if(initial.status==='CHECKPOINTED')return {status:'RECOVERED_CHECKPOINT',job:initial};
   const recovered=await store.compareAndSet(jobId,initial.status,{status:'CHECKPOINTED',reason:null});
   return recovered?{status:'RECOVERED_CHECKPOINT',job:recovered}:{status:'CONCURRENTLY_CLAIMED'};
  }
  const remote=await recoverCheckpoint(initial);
  if(remote?.commit&&/^[a-f0-9]{40}$/.test(remote.commit)&&await verifyCheckpoint(remote.commit,initial)){
   const recovered=await store.compareAndSet(jobId,initial.status,{status:'CHECKPOINTED',reason:null,checkpoint_commit:remote.commit,last_safe_step:remote.step||'remote checkpoint recovered'});
   return recovered?{status:'RECOVERED_CHECKPOINT',job:recovered}:{status:'CONCURRENTLY_CLAIMED'};
  }
  // One-shot acceptance jobs may reconcile an existing remote checkpoint, but must never repeat provider execution.
  if(initial.status==='QUOTA_PAUSED'&&initial.scope==='fixture'){
   const stopped=await store.compareAndSet(jobId,'QUOTA_PAUSED',{status:'BLOCKED',reason:'SINGLE_ATTEMPT_ALREADY_USED'});
   return stopped?{status:'BLOCKED',job:stopped}:{status:'CONCURRENTLY_CLAIMED'};
  }
  if(initial.status==='CLAIMED'||initial.status==='CHECKPOINTED')return {status:'BLOCKED',reason:'CLAIM_OR_CHECKPOINT_NOT_RECOVERABLE'};
  const claimed=await store.compareAndSet(jobId,initial.status,{status:'CLAIMED',reason:null});
  if(!claimed)return {status:'CONCURRENTLY_CLAIMED'};
  const singleAttempt=claimed.scope==='fixture';
  try{
   const result=await execute(claimed);
   if(result?.status==='SUCCESS'&&/^[a-f0-9]{40}$/.test(result.commit||'')&&await verifyCheckpoint(result.commit,claimed)){
    const saved=await store.compareAndSet(jobId,'CLAIMED',{status:'CHECKPOINTED',checkpoint_commit:result.commit,last_safe_step:result.step||'verified coding checkpoint',...(result.provider?{provider:result.provider}:{}),...(result.model_attempts?.length?{model_attempts:result.model_attempts}:{})});
    if(!saved)throw Error('CHECKPOINT_PERSIST_CONFLICT');
    return {status:'CHECKPOINTED',job:saved};
   }
   const reason=['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE','PROVIDER_RESPONSE_INVALID'].includes(result?.status)?result.status:'EXECUTION_NOT_VERIFIED';
   // A failed one-shot acceptance becomes terminal, so the 15-minute scheduler cannot spend again.
   const nextStatus=singleAttempt?'BLOCKED':'QUOTA_PAUSED';
   const paused=await store.compareAndSet(jobId,'CLAIMED',{status:nextStatus,reason,...(result?.model_attempts?.length?{model_attempts:result.model_attempts}:{})});
   return {status:nextStatus,job:paused};
  }catch(e){
   await store.compareAndSet(jobId,'CLAIMED',{status:singleAttempt?'BLOCKED':'QUOTA_PAUSED',reason:'EXECUTION_ERROR'});
   throw e;
  }
 };
}
