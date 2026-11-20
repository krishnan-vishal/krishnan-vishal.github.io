// SEP-01 GitHub Actions private worker: only existing queued jobs, no deployment.
// Requires pre-authorized Supabase service key and Gemini API key.
import {execFileSync} from 'node:child_process';
import {createDurableJobStore} from './durable-job-store.mjs';
import {createDurableWorker} from './durable-worker.mjs';
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
import {createCodingRunner} from './coding-runner.mjs';
const root=process.env.SEP01_WORKTREE,jobId=process.env.SEP01_JOB_ID;
if(!root)throw Error('SEP01_ISOLATED_WORKTREE_REQUIRED');
if(!process.env.GITHUB_ACTIONS||!process.env.GITHUB_REPOSITORY)throw Error('GITHUB_ACTIONS_REQUIRED');
const required=['SEP01_JOB_ID','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GEMINI_API_KEY','SEP01_GEMINI_MODEL'];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length)throw Error('SEP01_MISSING_CONFIGURATION: '+missing.join(', '));
const store=createDurableJobStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
const verifyCheckpoint=async(commit,job)=>{
 if(!/^[a-f0-9]{40}$/.test(commit||'')||!/^sep01\/jobs\/[a-zA-Z0-9._-]+$/.test(job.branch))return false;
 git('fetch','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
 return git('rev-parse','refs/remotes/origin/'+job.branch)===commit&&git('cat-file','-t',commit)==='commit';
};
const execute=async(job)=>{
 if(job.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job.scope))throw Error('SENSITIVE_JOB_NOT_ALLOWED');
 if(job.locked_paths.length!==1||!job.instruction)throw Error('JOB_INSTRUCTION_OR_PATH_MISSING');
 if(job.branch!==git('branch','--show-current'))throw Error('JOB_BRANCH_CHECKOUT_REQUIRED');
 const editor=createGeminiCodeEditor({apiKey:process.env.GEMINI_API_KEY,model:process.env.SEP01_GEMINI_MODEL});
 const run=createCodingRunner({root,allowedPaths:job.locked_paths,runTests:async()=>{execFileSync('node',['--test','scripts/sep01/*.test.mjs'],{cwd:process.cwd(),timeout:120000,shell:true,stdio:'pipe'});},requestEdit:editor});
 const result=await run({job,provider:{id:'gemini/'+process.env.SEP01_GEMINI_MODEL}});
 if(result.status!=='SUCCESS')return result;
 // The commit must be remotely durable before Supabase can mark CHECKPOINTED.
 git('push','origin','HEAD:refs/heads/'+job.branch);
 if(!await verifyCheckpoint(result.commit,job))throw Error('REMOTE_CHECKPOINT_NOT_DURABLE');
 return result;
};
const worker=createDurableWorker({store,execute,verifyCheckpoint});
const result=await worker(jobId);
console.log(JSON.stringify({job_id:jobId,status:result.status,checkpoint:result.job?.checkpoint_commit||null}));
if(result.status!=='CHECKPOINTED')process.exitCode=2;
