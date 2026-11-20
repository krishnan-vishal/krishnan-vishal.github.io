// SEP-01 GitHub Actions private worker: only existing queued jobs, no deployment.
// Requires pre-authorized Supabase service key and Gemini API key.
import {execFileSync} from 'node:child_process';
import {createDurableJobStore} from './durable-job-store.mjs';
import {createDurableWorker} from './durable-worker.mjs';
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
import {createCodingRunner} from './coding-runner.mjs';
const root=process.cwd(),jobId=process.env.SEP01_JOB_ID;
if(!jobId||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.GEMINI_API_KEY||!process.env.SEP01_GEMINI_MODEL)throw Error('SEP01_PRIVATE_WORKER_CONFIGURATION_REQUIRED');
const store=createDurableJobStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
const verifyCheckpoint=async(commit)=>/^[a-f0-9]{40}$/.test(commit||'')&&git('rev-parse','HEAD')===commit&&git('cat-file','-t',commit)==='commit';
const execute=async(job)=>{
 if(job.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job.scope))throw Error('SENSITIVE_JOB_NOT_ALLOWED');
 if(job.locked_paths.length!==1||!job.instruction)throw Error('JOB_INSTRUCTION_OR_PATH_MISSING');
 const editor=createGeminiCodeEditor({apiKey:process.env.GEMINI_API_KEY,model:process.env.SEP01_GEMINI_MODEL});
 const run=createCodingRunner({root,allowedPaths:job.locked_paths,runTests:async()=>{execFileSync('node',['--test','scripts/sep01/*.test.mjs'],{cwd:root,timeout:120000,shell:true,stdio:'pipe'});},requestEdit:editor});
 return run({job,provider:{id:'gemini/'+process.env.SEP01_GEMINI_MODEL}});
};
const worker=createDurableWorker({store,execute,verifyCheckpoint});
const result=await worker(jobId);
console.log(JSON.stringify({job_id:jobId,status:result.status,checkpoint:result.job?.checkpoint_commit||null}));
if(result.status!=='CHECKPOINTED')process.exitCode=2;
