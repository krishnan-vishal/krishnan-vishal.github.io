import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnerCommand,enqueueOwnerCommand} from './owner-command-intake.mjs';
const sample={job_id:'sep01-owner-fixture-20261121',scope:'fixture',instruction:'Return the exact acceptance fixture content unchanged.'};
test('owner intake allows only bounded zero-budget fixture jobs',()=>{
 const job=validateOwnerCommand(sample);
 assert.equal(job.locked_paths[0],'scripts/sep01/acceptance-fixture.txt');
 assert.equal(job.remaining_budget,0);
 assert.equal(job.branch,'sep01/jobs/'+sample.job_id);
 assert.equal(job.idempotency_key,'owner:'+sample.job_id);
});
test('owner intake rejects arbitrary scopes, oversized commands and invalid ids',()=>{
 for(const changed of [{scope:'security'},{scope:'public-ui'},{instruction:'x'.repeat(1001)},{job_id:'../../evil'},{instruction:''}])assert.throws(()=>validateOwnerCommand({...sample,...changed}));
});
test('owner intake delegates once to existing store and returns checkpoint-safe identifier',async()=>{
 let calls=0;
 const result=await enqueueOwnerCommand(sample,{enqueue:async job=>{calls++;return {...job,status:'QUEUED',revision:1}}});
 assert.equal(calls,1);
 assert.deepEqual(result,{job_id:sample.job_id,status:'QUEUED',revision:1,branch:'sep01/jobs/'+sample.job_id});
});
