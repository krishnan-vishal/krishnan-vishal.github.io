// SEP-01 durable Supabase REST job store. Service-role only; never expose in browser.
// Table installation is a separate database migration gate.
export function createDurableJobStore({url,key,fetchImpl=fetch,table='gpir_sep01_jobs'}){
 if(!/^https:\/\//.test(url||'')||!key||!/^gpir_[a-z0-9_]+$/.test(table))throw Error('INVALID_PRIVATE_JOB_STORE_CONFIG');
 const endpoint=url.replace(/\/$/,'')+'/rest/v1/'+table;
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 async function request(path,method,body,extra={}){
  const response=await fetchImpl(endpoint+path,{method,headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw Error('JOB_STORE_HTTP_'+response.status);
  return response.status===204?[]:response.json();
 }
 return {
  async enqueue(job){
   if(!job?.job_id||!job?.idempotency_key||!job?.branch||!Array.isArray(job.locked_paths)||!job.locked_paths.length)throw Error('INVALID_DURABLE_JOB');
   const {job_id,idempotency_key,branch,locked_paths,scope,capability='code',sensitivity_tier=null,remaining_budget=0}=job;
   const rows=await request('','POST',{job_id,idempotency_key,branch,locked_paths,scope,capability,sensitivity_tier,remaining_budget,status:'QUEUED'}, {'Prefer':'resolution=ignore-duplicates,return=representation'});
   return rows[0]||null;
  },
  async get(jobId){
   const rows=await request('?job_id=eq.'+encodeURIComponent(jobId)+'&select=*','GET');
   return rows[0]||null;
  },
  async compareAndSet(jobId,expectedStatus,patch){
   if(!jobId||!expectedStatus||!patch||typeof patch!=='object'||!patch.status||'job_id'in patch||'idempotency_key'in patch)throw Error('INVALID_JOB_TRANSITION');
   const rows=await request('?job_id=eq.'+encodeURIComponent(jobId)+'&status=eq.'+encodeURIComponent(expectedStatus),'PATCH',{...patch,updated_at:new Date().toISOString()},{Prefer:'return=representation'});
   return rows.length===1?rows[0]:null;
  }
 };
}
