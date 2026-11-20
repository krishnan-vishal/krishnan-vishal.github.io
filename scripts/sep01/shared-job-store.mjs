// SEP-01 shared CAS persistence via protected Supabase RPC.
// Server-side only. Never import from browser or log credentials.
export class SharedJobStore {
  constructor({url,key,fetchImpl=fetch}) {
    if(!/^https:\/\//.test(url||'')||!key||typeof fetchImpl!=='function')throw Error('MISSING_SECURE_STORE_CONFIGURATION');
    this.url=url.replace(/\/$/,'');this.key=key;this.fetch=fetchImpl;
  }
  async save(job,expectedRevision=null) {
    if(!job?.job_id||!job?.idempotency_key)throw Error('INVALID_JOB_CONTRACT');
    const {revision,...payload}=job;
    const response=await this.fetch(this.url+'/rest/v1/rpc/gpir_sep01_cas_job',{
      method:'POST',
      headers:{'Content-Type':'application/json',['apikey']:this.key,Authorization:'Bearer '+this.key},
      body:JSON.stringify({p_job_id:job.job_id,p_idempotency_key:job.idempotency_key,
        p_expected_revision:expectedRevision,p_payload:payload})
    });
    if(!response.ok) {
      if(response.status===401||response.status===403)throw Error('SHARED_STORE_AUTH_FAILED');
      if(response.status===409||response.status===400)throw Error('SHARED_STORE_CAS_REJECTED');
      throw Error('SHARED_STORE_UNAVAILABLE');
    }
    const saved=await response.json();
    if(saved.job_id!==job.job_id||!Number.isSafeInteger(saved.revision))throw Error('INVALID_STORE_RESPONSE');
    return saved;
  }
}
