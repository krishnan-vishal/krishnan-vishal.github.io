import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileJobStore} from './file-job-store.mjs';
import {claim,checkpoint,quotaFailure} from './controller.mjs';
test('durable checkpoint survives store recreation and rejects duplicate writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gpir-sep01-'));
 try{
  const s=new FileJobStore(dir),job={job_id:'job1',idempotency_key:'unique',branch:'branch',locked_paths:['a'],scope:'ui',capability:'code',remaining_budget:5,status:'QUEUED'};
  const p=[{id:'providerA',approved:true,healthy:true,tier:'PUBLIC',remaining_quota:1,capabilities:['code'],estimated_cost:1},{id:'providerB',approved:true,healthy:true,tier:'TIER_1',private_environment:true,remaining_quota:1,capabilities:['code'],estimated_cost:2}];
  const first=await s.save(job);
  assert.equal(first.revision,1);
  await assert.rejects(s.save(job),/STALE_REVISION/);
  const active=claim(first,p);
  const saved=await s.save(checkpoint(active,'a'.repeat(40),'completed step'),1);
  const recovered=await new FileJobStore(dir).read('job1');
  assert.equal(recovered.checkpoint_commit,'a'.repeat(40));
  const resumed=quotaFailure(recovered,p);
  assert.equal(resumed.provider,'providerB');
  await s.save(resumed,2);
  await assert.rejects(s.save({...resumed,idempotency_key:'changed'},3),/IDEMPOTENCY_CONFLICT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('job ids cannot escape the store',()=>assert.throws(()=>new FileJobStore('/tmp').file('../escape'),/INVALID_JOB_ID/));
