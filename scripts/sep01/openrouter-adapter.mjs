// SEP-01 real HTTPS OpenRouter execution adapter, server-side only.
// Delivers a bounded advisory result; never grants filesystem or repository write access.
export function openRouterAdapter({apiKey,model,fetchImpl=fetch,endpoint='https://openrouter.ai/api/v1/chat/completions'}) {
 if(!apiKey||!model||!/^https:\/\//.test(endpoint))throw Error('PROVIDER_CONFIGURATION_REQUIRED');
 return async function invoke(job) {
  if(!job?.job_id||!job?.idempotency_key||!job?.branch||!Array.isArray(job.locked_paths))throw Error('INVALID_JOB');
  const response=await fetchImpl(endpoint,{
   method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({model,stream:false,max_tokens:700,temperature:0,
    messages:[{role:'system',content:'You are a coding task analyst. Return concise implementation guidance only. Do not claim code was executed, tests passed, or commits created.'},
    {role:'user',content:JSON.stringify({job_id:job.job_id,capability:job.capability,branch:job.branch,locked_paths:job.locked_paths,checkpoint_commit:job.checkpoint_commit??null,last_safe_step:job.last_safe_step??null})}]})
  });
  if(response.status===429)return {status:'QUOTA_EXHAUSTED'};
  if(!response.ok)throw Error('PROVIDER_EXECUTION_FAILED');
  const data=await response.json();
  const guidance=data?.choices?.[0]?.message?.content;
  if(typeof guidance!=='string'||!guidance.trim())throw Error('INVALID_PROVIDER_RESPONSE');
  // Guidance is not a verified git checkpoint and cannot trigger automatic handoff.
  return {status:'ADVISORY_ONLY',guidance};
 };
}
