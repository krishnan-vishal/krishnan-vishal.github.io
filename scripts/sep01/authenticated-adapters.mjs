// SEP-01 authenticated execution gateway for explicitly approved provider endpoints.
// An adapter endpoint is NOT a coding-tool API until its operator configures it.
export function createProviderInvoker({adapters,fetchImpl=fetch}) {
 if(!Array.isArray(adapters)||typeof fetchImpl!=='function')throw Error('INVALID_ADAPTER_CONFIG');
 const configured=new Map();
 for(const a of adapters){
  if(!a?.id||!/^https:\/\//.test(a.endpoint||'')||!a.token||a.approved!==true)throw Error('UNAPPROVED_OR_INSECURE_ADAPTER');
  if(configured.has(a.id))throw Error('DUPLICATE_ADAPTER');
  configured.set(a.id,a);
 }
 return async function invoke(provider,job){
  const a=configured.get(provider.id);
  if(!a||provider.approved!==true)throw Error('PROVIDER_NOT_AUTHORIZED');
  // No secrets or unrestricted repository content are sent to provider adapters.
  const response=await fetchImpl(a.endpoint,{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.token,'Idempotency-Key':job.idempotency_key},
   body:JSON.stringify({job_id:job.job_id,idempotency_key:job.idempotency_key,
    branch:job.branch,locked_paths:job.locked_paths,capability:job.capability,
    checkpoint_commit:job.checkpoint_commit??null,last_safe_step:job.last_safe_step??null})
  });
  if(response.status===429)return {status:'QUOTA_EXHAUSTED'};
  if(!response.ok)throw Error('PROVIDER_EXECUTION_FAILED');
  const data=await response.json();
  if(data?.status==='QUOTA_EXHAUSTED')return {status:'QUOTA_EXHAUSTED',commit:data.commit,step:data.step};
  if(data?.status==='SUCCESS'&&/^[a-f0-9]{40}$/.test(data.commit)&&data.step)return {status:'SUCCESS',commit:data.commit,step:data.step};
  throw Error('INVALID_PROVIDER_RESPONSE');
 };
}
