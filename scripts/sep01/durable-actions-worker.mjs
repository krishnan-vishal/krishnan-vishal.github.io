// SEP-01 GitHub Actions private worker: only existing queued jobs, no deployment.
// Requires pre-authorized Supabase service key and Gemini API key.
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {readFileSync,readdirSync} from 'node:fs';
import {createDurableJobStore} from './durable-job-store.mjs';
import {createDurableWorker} from './durable-worker.mjs';
import {createGeminiCodeEditor,discoverGeminiTextModels} from './gemini-code-editor.mjs';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
import {requestWithIndependentFallback} from './independent-provider-router.mjs';
import {createCodingRunner} from './coding-runner.mjs';
const root=process.env.SEP01_WORKTREE,jobId=process.env.SEP01_JOB_ID;
if(!root)throw Error('SEP01_ISOLATED_WORKTREE_REQUIRED');
if(!process.env.GITHUB_ACTIONS||!process.env.GITHUB_REPOSITORY)throw Error('GITHUB_ACTIONS_REQUIRED');
const required=['SEP01_JOB_ID','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GEMINI_API_KEY'];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length)throw Error('SEP01_MISSING_CONFIGURATION: '+missing.join(', '));
const store=createDurableJobStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
const gitRaw=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000});
const git=(...args)=>gitRaw(...args).trim();
const sourceRoot=process.cwd();
const expectedFixture='SEP-01 durable checkpoint acceptance fixture.\nSTATE: CHECKPOINT_VERIFIED\n';
function validateJobOutput(job,read=path=>readFileSync(join(root,path),'utf8')){
 if(job.scope==='fixture'&&job.locked_paths[0]==='scripts/sep01/acceptance-fixture.txt'&&read(job.locked_paths[0]).replace(/\r\n/g,'\n')!==expectedFixture)throw Error('ACCEPTANCE_FIXTURE_VALIDATION_FAILED');
}
function runRegressionTests(job){
 validateJobOutput(job);
 const directory=join(sourceRoot,'scripts','sep01');
 const tests=readdirSync(directory).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>join('scripts','sep01',name));
 if(!tests.length)throw Error('SEP01_TESTS_NOT_FOUND');
 execFileSync(process.execPath,['--test',...tests],{cwd:sourceRoot,timeout:120000,stdio:'pipe'});
}
const verifyCheckpoint=async(commit,job)=>{
 if(!/^[a-f0-9]{40}$/.test(commit||'')||!/^sep01\/jobs\/[a-zA-Z0-9._-]+$/.test(job.branch))return false;
 git('fetch','--force','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
 if(git('rev-parse','refs/remotes/origin/'+job.branch)!==commit||git('cat-file','-t',commit)!=='commit')return false;
 const paths=git('diff-tree','--no-commit-id','--name-only','-r',commit).split('\n').filter(Boolean);
 if(paths.length!==1||paths[0]!==job.locked_paths[0])return false;
 if(git('log','-1','--format=%s',commit)!=='SEP-01: bounded authorized coding checkpoint')return false;
 try{
  validateJobOutput(job,path=>gitRaw('show',commit+':'+path));
  return true;
 }catch{return false;}
};
const recoverCheckpoint=async job=>{
 if(!['CLAIMED','CHECKPOINTED','QUOTA_PAUSED'].includes(job.status))return null;
 git('fetch','--force','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
 const commit=git('rev-parse','refs/remotes/origin/'+job.branch);
 if(!await verifyCheckpoint(commit,job))return null;
 runRegressionTests(job);
 return {commit,step:'fresh runner verified remote checkpoint and tests without model execution'};
};
const execute=async(job)=>{
 if(job.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job.scope))throw Error('SENSITIVE_JOB_NOT_ALLOWED');
 if(job.locked_paths.length!==1||!job.instruction)throw Error('JOB_INSTRUCTION_OR_PATH_MISSING');
 if(job.branch!==git('branch','--show-current'))throw Error('JOB_BRANCH_CHECKOUT_REQUIRED');
 const key=process.env.GEMINI_API_KEY;
 const independentModel=(process.env.SEP01_OPENROUTER_MODEL||'').trim();
 const allowOpenRouter=Boolean(process.env.OPENROUTER_API_KEY&&/^[A-Za-z0-9_.:/-]+$/.test(independentModel));
 // Only an explicitly configured independent route may be used; no provider-wide blind retry.
 const discovery=await discoverGeminiTextModels({apiKey:key,preferred:process.env.SEP01_GEMINI_MODEL,maxCandidates:4});
 const selected=discovery.models;
 console.log(JSON.stringify({event:'SEP01_GEMINI_MODEL_CANDIDATES',models:selected,preferred_matched:discovery.preferredMatched,bounded_attempts:selected.length,independent_fallback_enabled:allowOpenRouter}));
 const attempts=[];
 const requestEdit=async args=>{
  const routed=await requestWithIndependentFallback({
   geminiModels:selected,
   geminiEdit:model=>createGeminiCodeEditor({apiKey:key,model})(args),
   allowOpenRouter,
   openrouterEdit:allowOpenRouter?()=>createOpenRouterCodeEditor({apiKey:process.env.OPENROUTER_API_KEY,model:independentModel})(args):undefined,
   onAttempt:item=>{
    attempts.push(item);
    console.log(JSON.stringify({event:'SEP01_PROVIDER_RESULT',provider:item.provider,model:item.model||'approved-openrouter',status:item.status,attempt:attempts.length,max_attempts:selected.length+(allowOpenRouter?1:0)}));
   }
  });
  return routed.result;
 };
 const run=createCodingRunner({root,allowedPaths:job.locked_paths,runTests:async()=>runRegressionTests(job),requestEdit});
 const result=await run({job,provider:{id:'gemini/authorized-text-model'}});
 if(result.status!=='SUCCESS')return result;
 // The commit must be remotely durable before Supabase can mark CHECKPOINTED.
 git('push','--porcelain','origin',result.commit+':refs/heads/'+job.branch);
 if(!await verifyCheckpoint(result.commit,job))throw Error('REMOTE_CHECKPOINT_NOT_DURABLE');
 return {...result,model_attempts:attempts};
};
const worker=createDurableWorker({store,execute,verifyCheckpoint,recoverCheckpoint});
const result=await worker(jobId);
console.log(JSON.stringify({job_id:jobId,status:result.status,checkpoint:result.job?.checkpoint_commit||null,recovered:result.status==='RECOVERED_CHECKPOINT'}));
if(!['CHECKPOINTED','RECOVERED_CHECKPOINT'].includes(result.status))process.exitCode=2;
