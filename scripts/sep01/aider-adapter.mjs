// SEP-01 Aider execution adapter. Caller owns disposable checkout and safe Git checkpoint.
// This adapter never commits, pushes, deploys, or receives Tier-1 tasks.
import {execFileSync} from 'node:child_process';
import {resolve,relative,isAbsolute} from 'node:path';
import {statSync} from 'node:fs';
export function createAiderAdapter({cwd,model,apiKey,timeoutMs=120000}){
 if(!cwd||!model||!/^[-\w./:]+$/.test(model)||!apiKey||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>180000)throw Error('AIDER_ADAPTER_CONFIG_REQUIRED');
 const base=resolve(cwd);if(!statSync(base).isDirectory())throw Error('AIDER_WORKTREE_REQUIRED');
 return async function execute(job){
  if(!job||job.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job.scope))throw Error('AIDER_TIER1_FORBIDDEN');
  if(!Array.isArray(job.locked_paths)||job.locked_paths.length!==1||typeof job.instruction!=='string'||!job.instruction.trim()||job.instruction.length>3000)throw Error('AIDER_BOUNDED_JOB_REQUIRED');
  const file=job.locked_paths[0],abs=resolve(base,file),rel=relative(base,abs);
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||file.startsWith('-')||!statSync(abs).isFile())throw Error('AIDER_UNSAFE_PATH');
  const env={...process.env,OPENROUTER_API_KEY:apiKey,AIDER_ANALYTICS:'false',AIDER_CHECK_UPDATE:'false'};
  try{
   execFileSync('aider',['--yes','--no-auto-commits','--no-gitignore','--no-show-model-warnings','--model','openrouter/'+model,'--message',job.instruction,'--',rel],{cwd:base,env,timeout:timeoutMs,stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
   return {status:'EDIT_COMPLETE_REQUIRES_GIT_VERIFICATION',model,allowed_path:rel};
  }catch(e){
   // No implicit retry or failover: the caller must first verify a durable checkpoint.
   if(e.signal==='SIGTERM'||e.code==='ETIMEDOUT')throw Error('AIDER_TIMEOUT_REQUIRES_CHECKPOINT');
   throw Error('AIDER_EXECUTION_FAILED_REQUIRES_CHECKPOINT');
  }
 };
}
