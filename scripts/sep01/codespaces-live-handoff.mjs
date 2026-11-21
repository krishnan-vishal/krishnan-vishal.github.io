// SEP-01 Codespaces execution entrypoint. Opt-in, isolated fixture only.
// Never pushes, deploys, or modifies existing GPIR project paths.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createCodingRunner} from './coding-runner.mjs';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
import {checkpoint,quotaFailure} from './controller.mjs';
const key=process.env.OPENROUTER_API_KEY;
const firstModel=process.env.SEP01_PRIMARY_MODEL;
const fallbackModel=process.env.SEP01_FALLBACK_MODEL;
if(!key||!firstModel||!fallbackModel||firstModel===fallbackModel)throw Error('TWO_DISTINCT_APPROVED_MODELS_REQUIRED');
const root=mkdtempSync(join(tmpdir(),'sep01-codespaces-'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
try {
 git('init','-q','-b','sep01-codespaces-acceptance');
 mkdirSync(join(root,'src'));
 const path='src/checkpoint.js',abs=join(root,path);
 writeFileSync(abs,'export const checkpoint = 0;\n');
 git('add','.');git('-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','isolated fixture');
 const job={job_id:'sep01-live',idempotency_key:'sep01-live',branch:'sep01-codespaces-acceptance',locked_paths:[path],capability:'code',status:'CLAIMED',provider:'primary',remaining_budget:0};
 async function execute(model,value,currentJob) {
  const editor=createOpenRouterCodeEditor({apiKey:key,model});
  const runner=createCodingRunner({root,allowedPaths:[path],
   runTests:async()=>assert.equal(readFileSync(abs,'utf8'),`export const checkpoint = ${value};\n`),
   requestEdit:async args=>editor({...args,job:{...args.job,instruction:`Replace the entire file with exactly: export const checkpoint = ${value}; followed by one newline. Return JSON only.`}})});
  return runner({job:currentJob,provider:{id:model}});
 }
 const first=await execute(firstModel,1,job);
 if(first.status!=='SUCCESS')throw Error('PRIMARY_CHECKPOINT_NOT_CREATED');
 const saved=checkpoint(job,first.commit,first.step);
 if(saved.checkpoint_commit!==git('rev-parse','HEAD'))throw Error('CHECKPOINT_MISMATCH');
 // Controlled simulated 429 after real primary commit; no additional primary request.
 const next=quotaFailure(saved,[{id:'fallback',approved:true,healthy:true,remaining_quota:1,
  capabilities:['code'],tier:'PUBLIC',estimated_cost:0}]);
 if(next.status!=='CLAIMED'||next.provider!=='fallback')throw Error('FAILOVER_NOT_CLAIMED');
 const second=await execute(fallbackModel,2,next);
 if(second.status!=='SUCCESS'||second.commit===first.commit||second.commit!==git('rev-parse','HEAD'))throw Error('FALLBACK_COMMIT_FAILED');
 assert.equal(git('rev-list','--count','HEAD'),'3');
 assert.equal(git('status','--porcelain'),'');
 console.log(JSON.stringify({result:'SEP01_LIVE_TWO_MODEL_HANDOFF_PASS',primary_checkpoint:first.commit,fallback_checkpoint:second.commit,quota_event:'SIMULATED_429',workspace:'DISPOSABLE_NO_PUSH'}));
} finally {rmSync(root,{recursive:true,force:true});}
