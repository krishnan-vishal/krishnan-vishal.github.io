import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,checkpoint,quotaFailure,advance} from './controller.mjs';
const job = {job_id:'SEP01-1',idempotency_key:'stable-key',branch:'feature/a',locked_paths:['src/a.js'],scope:'ui',capability:'code',remaining_budget:10,status:'QUEUED'};
const providers = [
{id:'codex',approved:true,healthy:true,tier:'TIER_1',private_environment:true,remaining_quota:5,capabilities:['code'],estimated_cost:2},
{id:'public',approved:true,healthy:true,tier:'PUBLIC',remaining_quota:5,capabilities:['code'],estimated_cost:1}
];
test('safe failover after durable checkpoint',()=>{
  const claimed=claim(job,providers); assert.equal(claimed.provider,'public');
  assert.throws(()=>quotaFailure(claimed,providers),/NO_DURABLE_CHECKPOINT/);
  const saved=checkpoint(claimed,'a'.repeat(40),'lint passed');
  const resumed=quotaFailure(saved,providers);
  assert.equal(resumed.provider,'codex');
  assert.equal(resumed.checkpoint_commit,'a'.repeat(40));
  assert.equal(resumed.last_safe_step,'lint passed');
});
test('sensitive jobs never route to public provider',()=>{
  const privateJob={...job,scope:'payments',sensitivity_tier:'TIER_1'};
  assert.equal(claim(privateJob,providers).provider,'codex');
  assert.equal(claim(privateJob,[providers[1]]).status,'QUOTA_PAUSED');
});
test('one writer per path or branch',()=>{
  assert.equal(claim(job,providers,[{...job,job_id:'other',status:'CLAIMED'}]).reason,'WRITER_LOCK_CONFLICT');
  assert.equal(claim({...job,branch:'other',locked_paths:['src/a.js']},providers,[{...job,job_id:'other',status:'CLAIMED'}]).reason,'WRITER_LOCK_CONFLICT');
});
test('production cannot be marked complete from tests alone',()=>{
  const s=checkpoint(claim(job,providers),'b'.repeat(40),'ready');
  const p=advance(s,'PR_READY',{pr:123});
  const ci=advance(p,'CI_VERIFIED',{run:'ci'});
  const ready=advance(ci,'RELEASE_ELIGIBLE',{approval:'reviewed'});
  assert.throws(()=>advance(ready,'DEPLOYED_VERIFIED',{tests:'pass'}),/PRODUCTION_EVIDENCE_REQUIRED/);
  assert.equal(advance(ready,'DEPLOYED_VERIFIED',{production_url:'https://example.org',deployment_id:'run1',rollback_ref:'commit1'}).status,'DEPLOYED_VERIFIED');
});
