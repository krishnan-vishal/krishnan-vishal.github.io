// SEP-01 end-to-end acceptance in a disposable Git checkout.
// Real file edits, real tests and real Git commits; simulated provider 429.
// Never pushes, deploys or modifies the GPIR checkout.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createCodingRunner} from './coding-runner.mjs';
import {quotaFailure} from './controller.mjs';
const root=mkdtempSync(join(tmpdir(),'gpir-sep01-e2e-'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
try {
 git('init','-q','-b','sep01-acceptance');
 mkdirSync(join(root,'src'));
 const file=join(root,'src','acceptance.js');
 writeFileSync(file,'export const checkpoint = 0;\n');
 git('add','.');git('-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','initial fixture');
 const job={job_id:'sep01-acceptance',idempotency_key:'sep01-once',branch:'sep01-acceptance',
  locked_paths:['src/acceptance.js'],capability:'code',status:'CLAIMED',provider:'provider-a'};
 const runTests=async()=>assert.match(readFileSync(file,'utf8'),/^export const checkpoint = [12];\n$/);
 const first=createCodingRunner({root,allowedPaths:job.locked_paths,runTests,
  requestEdit:async()=>({status:'EDIT',content:'export const checkpoint = 1;\n'})});
 const a=await first({job,provider:{id:'provider-a'}});
 assert.equal(a.status,'SUCCESS');
 assert.equal(git('rev-parse','HEAD'),a.commit);
 const checkpointed={...job,status:'CHECKPOINTED',checkpoint_commit:a.commit,last_safe_step:a.step};
 // Provider A exhausts its quota after the durable commit; the next owner
 // may only start after the recorded checkpoint is verified in git.
 const resumed=quotaFailure(checkpointed,[{id:'provider-b',approved:true,healthy:true,remaining_quota:1,
  capabilities:['code'],tier:'PUBLIC',estimated_cost:0}]);
 assert.equal(resumed.status,'CLAIMED');
 assert.equal(resumed.provider,'provider-b');
 assert.equal(resumed.checkpoint_commit,git('rev-parse','HEAD'));
 const second=createCodingRunner({root,allowedPaths:job.locked_paths,runTests,
  requestEdit:async()=>({status:'EDIT',content:'export const checkpoint = 2;\n'})});
 const z=await second({job:resumed,provider:{id:'provider-b'}});
 assert.equal(z.status,'SUCCESS');
 assert.notEqual(z.commit,a.commit);
 assert.equal(git('rev-parse','HEAD'),z.commit);
 assert.equal(git('status','--porcelain'),'');
 assert.equal(git('rev-list','--count','HEAD'),'3');
 console.log('SEP01_REAL_GIT_CHECKPOINT_AND_SIMULATED_429_HANDOFF_PASS');
} finally {rmSync(root,{recursive:true,force:true});}
