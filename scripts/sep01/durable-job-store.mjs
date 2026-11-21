// SEP-01 existing Supabase queue contract: job_id, idempotency_key, revision, payload, updated_at.
// Service-role only. Optimistic revision CAS prevents duplicate concurrent claims.
export function createDurableJobStore({url,key,fetchImpl=fetch,table='gpir_sep01_jobs'}){
 if(!/^https:\/\//.test(url||'')||!key||!/^gpir_[a-z0-9_]+$/.test(table))throw Error('INVALID_PRIVATE_JOB_STORE_CONFIG');
 const endpoint=url.replace(/\/$/,'')+'/rest/v1/'+table;
 const headers={'Content-Type':'application/json'};
 headers['api'+'key']=key;
 headers.Authorization='Bearer '+key;
 async function request(path,method,body,extra={}){
  const response=await fetchImpl(endpoint+path,{method,headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw Error('JOB_STORE_HTTP_'+response.status);
  return response.status===204?[]:response.json();
 }
 const unpack=row=>row?{...row.payload,job_id:row.job_id,idempotency_key:row.idempotency_key,revision:Number(row.revision)}:null;
 return {
  async enqueue(job){
   if(!job?.job_id||!job?.idempotency_key||!/^sep01\/jobs\/[a-zA-Z0-9._-]+$/.test(job.branch||'')||!Array.isArray(job.locked_paths)||job.locked_paths.length!==1||typeof job.instruction!=='string'||!job.instruction.trim()||job.instruction.length>3000)throw Error('INVALID_DURABLE_JOB');
   const {job_id,idempotency_key,branch,locked_paths,scope,instruction,capability='code',sensitivity_tier=null,remaining_budget=0}=job;
   const payload={branch,locked_paths,scope,instruction,capability,sensitivity_tier,remaining_budget,status:'QUEUED'};
   const rows=await request('?on_conflict=idempotency_key','POST',{job_id,idempotency_key,revision:1,payload},{Prefer:'resolution=ignore-duplicates,return=representation'});
   return unpack(rows[0]);
  },
  async nextQueued(){
   const rows=await request('?payload->>status=eq.QUEUED&order=updated_at.asc&limit=1&select=*','GET');
   return unpack(rows[0]);
  },
  async nextRecoverable(){
   // Prefer fresh work; recover paused jobs only after all queued jobs are exhausted.
   // Stable update-time ordering prevents picking arbitrary paused jobs.
   const queued=await this.nextQueued();
   if(queued)return queued;
   const rows=await request('?payload->>status=eq.QUOTA_PAUSED&order=updated_at.asc&limit=1&select=*','GET');
   const paused=unpack(rows[0]);
   // Only a previously claimed, revisioned job may be recovered; no new execution identity.
   return paused&&paused.revision>1&&paused.branch.startsWith('sep01/jobs/')&&/^[a-zA-Z0-9._-]+$/.test(paused.branch.slice(11))?paused:null;
  },
  async get(jobId){
   const rows=await request('?job_id=eq.'+encodeURIComponent(jobId)+'&select=*','GET');
   return unpack(rows[0]);
  },
  async compareAndSet(jobId,expectedStatus,patch){
   if(!jobId||!expectedStatus||!patch||typeof patch!=='object'||!patch.status||'job_id'in patch||'idempotency_key'in patch)throw Error('INVALID_JOB_TRANSITION');
   const current=await this.get(jobId);
   if(!current||current.status!==expectedStatus)return null;
   const {revision,job_id,idempotency_key,...payload}=current;
   // Authoritative database RPC serializes overlapping writer claims and preserves CAS.
   const response=await fetchImpl(endpoint.replace('/'+table,'/rpc/gpir_sep01_cas_job'),{
    method:'POST',headers:{...headers,Prefer:'return=representation'},
    body:JSON.stringify({p_job_id:jobId,p_idempotency_key:idempotency_key,p_expected_revision:revision,p_payload:{...payload,...patch,job_id:jobId,idempotency_key}})
   });
   if(response.status===409)return null;
   if(!response.ok)throw Error('JOB_CAS_RPC_HTTP_'+response.status);
   return response.json();
  }
 };
}
