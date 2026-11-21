// One-shot SEP-01 gate: independent Gemini generation, then checkpoint-gated dispatch.
// No GPIR production edits, paid coding agents, or repeated manual acceptance loops.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
import {dispatchWithQuotaFailover} from './live-quota-failover.mjs';
const key=process.env.GEMINI_API_KEY;
if(!key)throw Error('GEMINI_KEY_MISSING');
// Bound every external request so a provider stall cannot consume the whole Actions job.
// Timeout is reported distinctly from quota, authentication and model failures.
const timedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(25000)});
console.log(JSON.stringify({gate:'GEMINI_DISCOVERY_STARTED',request_timeout_ms:25000}));
let response;
try{response=await timedFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key}});}
catch(error){throw Error(error?.name==='TimeoutError'?'GEMINI_DISCOVERY_TIMEOUT_25S':'GEMINI_DISCOVERY_NETWORK_ERROR_'+String(error?.name||'UNKNOWN'));}
if(!response.ok)throw Error('MODEL_DISCOVERY_HTTP_'+response.status);
const listing=await response.json();
const eligible=(listing.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[a-z0-9._-]+$/i.test(m.name)&&!/tts|audio|speech|image|video|live|embedding/i.test(m.name)).map(m=>m.name.slice(7));
const preferred=process.env.SEP01_GEMINI_MODEL||'gemini-2.5-flash';
const models=[...(eligible.includes(preferred)?[preferred]:[]),...eligible.filter(m=>m!==preferred&&/flash/i.test(m)),...eligible.filter(m=>m!==preferred&&!/flash/i.test(m))].slice(0,4);
const task={scope:'dashboard',capability:'code',instruction:'Replace the complete file with exactly: export const ready = true; followed by a newline.'};
const original='export const ready = false;\n',expected='export const ready = true;\n';
let accepted=null;
const failures=[];
for(const model of models){
 console.log(JSON.stringify({gate:'GEMINI_MODEL_ATTEMPT',model,request_timeout_ms:25000}));
 const edit=createGeminiCodeEditor({apiKey:key,model,fetchImpl:timedFetch});
 let result;
 try{result=await edit({job:task,path:'fixture.js',content:original});}
 catch(error){
  if(error?.name==='TimeoutError')result={status:'PROVIDER_BUSY',reason:'REQUEST_TIMEOUT_25S'};
  else throw error;
 }
 if(result.status==='EDIT'){
  if(result.content!==expected)throw Error('GEMINI_EDIT_NOT_EXACT');
  accepted=model;break;
 }
 failures.push({model,status:result.status});
 if(result.status==='QUOTA_EXHAUSTED'||result.status==='PROVIDER_UNAVAILABLE')break;
 if(!['MODEL_UNAVAILABLE','PROVIDER_BUSY'].includes(result.status))break;
}
if(!accepted){
 console.log(JSON.stringify({gate:'GEMINI_PENDING',failures,reason:'NO_VERIFIED_TEXT_EDIT'}));
 process.exitCode=2;
}else{
 console.log(JSON.stringify({gate:'SEP01_INDEPENDENT_GEMINI_ACCEPTANCE_PASS',model:accepted}));
 const dir=mkdtempSync(join(tmpdir(),'sep01-final-'));
 try{
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
  git('init','-q');git('config','user.email','sep01@localhost');git('config','user.name','SEP01 Acceptance');
  writeFileSync(join(dir,'fixture.js'),original);
  git('add','fixture.js');git('commit','-qm','verified initial fixture');
  const sha=git('rev-parse','HEAD');
  const job={job_id:'sep01-final',idempotency_key:'sep01-final-once',branch:'fixture/sep01',locked_paths:['fixture.js'],scope:'dashboard',capability:'code',remaining_budget:0,status:'QUEUED',checkpoint_commit:sha,last_safe_step:'fixture committed'};
  const providers=[{id:'openrouter/primary',agent_id:'openrouter',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC'},{id:'gemini/'+accepted,agent_id:'gemini',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC'}];
  const config=Object.fromEntries(['openrouter','gemini'].map(id=>[id,{approved:true,adapter_verified:true,credential_verified:true,execute:async()=>{}}]));
  const result=await dispatchWithQuotaFailover({job,providers,config,verifyCheckpoint:async commit=>git('rev-parse','HEAD')===commit&&git('cat-file','-t',commit)==='commit',execute:async({provider})=>provider.agent_id==='openrouter'?{status:'PROVIDER_BUSY',http_status:503,injected:true}:{status:'EDIT',content:expected,model:accepted}});
  if(result.switched_to!=='gemini/'+accepted||result.result?.content!==expected||result.quota_event!=='OBSERVED_PROVIDER_BUSY')throw Error('CHECKPOINT_HANDOFF_NOT_VERIFIED');
  console.log(JSON.stringify({gate:'SEP01_CHECKPOINTED_DISPATCH_PASS',checkpoint:sha,primary_failure:'INJECTED_503_NOT_LIVE_PROVIDER_FAILURE',fallback:'gemini/'+accepted,gemini_live_verified:true,production_writes:false}));
 }finally{rmSync(dir,{recursive:true,force:true});}
}
