// SEP-01 Codex CLI adapter: opt-in only, read-only sandbox, no repo writes or model commands.
// Requires an independently verified Codex CLI installation and supported runner authentication.
// Never supplies subscription credentials, environment secrets, or an unbounded workspace.
import {spawnSync} from 'node:child_process';
import {platform} from 'node:os';
const QUOTA=/rate.?limit|usage.?limit|quota|too many requests|429|credits? exhausted/i;
const UNAVAILABLE=/temporarily unavailable|service unavailable|overloaded|503|502|504/i;
const AUTH=/unauthorized|authentication required|not logged in|invalid api key|permission denied|401|403/i;
export function classifyCodexFailure(message=''){
 const safe=String(message).slice(0,4000);
 if(QUOTA.test(safe))return 'QUOTA_EXHAUSTED';
 if(AUTH.test(safe))return 'PROVIDER_UNAVAILABLE';
 if(UNAVAILABLE.test(safe))return 'PROVIDER_BUSY';
 return 'EXECUTION_ERROR';
}
export function createCodexCliEditor({binary='codex',model,spawnImpl=spawnSync,enabled=false,authenticated=false,timeoutMs=90000,platformName=platform()}={}){
 if(!enabled||!authenticated)throw Error('CODEX_EXECUTION_NOT_AUTHORIZED');
 if(binary!=='codex'||typeof model!=='string'||!/^[-A-Za-z0-9_.]+$/.test(model)||typeof spawnImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('INVALID_CODEX_ADAPTER_CONFIG');
 return async({job,path,content})=>{
  if(job?.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job?.scope))throw Error('CODEX_SENSITIVE_JOB_FORBIDDEN');
  if(typeof job?.instruction!=='string'||!job.instruction.trim()||job.instruction.length>3000||typeof path!=='string'||!/^scripts\/sep01\/[a-zA-Z0-9._/-]+$/.test(path)||path.includes('..')||typeof content!=='string'||content.length>50000)throw Error('INVALID_CODEX_EDIT_INPUT');
  const prompt='You are a bounded text editor. Respond ONLY with a JSON object containing one key, content, whose value is the complete replacement file text. Do not run commands or edit files.\\n'+JSON.stringify({task:job.instruction,file:path,content});
  // Windows npm installs a codex.cmd shim. Use a fixed, allowlisted command line;
  // the user-supplied task is passed only over stdin, never interpolated into a shell.
  const windows=platformName==='win32';
  const executable=windows?'cmd.exe':binary;
  const argv=windows?['/d','/s','/c', 'codex exec --sandbox read-only --skip-git-repo-check --model '+model+' -']:['exec','--sandbox','read-only','--skip-git-repo-check','--model',model,'-'];
  // Preserve only platform identity and Codex auth-home locations, not project secrets.
  const environment={PATH:process.env.PATH,Path:process.env.Path,HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,CODEX_HOME:process.env.CODEX_HOME,TERM:'dumb'};
  for(const name of Object.keys(environment))if(environment[name]===undefined)delete environment[name];
  const result=spawnImpl(executable,argv,{input:prompt,encoding:'utf8',timeout:timeoutMs,maxBuffer:150000,env:environment});
  if(result.error){
   if(result.error.code==='ETIMEDOUT')return {status:'PROVIDER_BUSY',provider:'codex'};
   if(result.error.code==='ENOENT')return {status:'PROVIDER_UNAVAILABLE',provider:'codex',reason:'CLI_NOT_INSTALLED'};
   throw Error('CODEX_RUNNER_FAILURE');
  }
  if(result.status!==0)return {status:classifyCodexFailure(result.stderr||result.stdout),provider:'codex'};
  const answer=String(result.stdout||'').trim();
  let parsed;try{parsed=JSON.parse(answer);}catch{return {status:'INVALID_EDIT',provider:'codex'};}
  if(typeof parsed?.content!=='string'||!parsed.content||parsed.content.length>100000)return {status:'INVALID_EDIT',provider:'codex'};
  return {status:'EDIT',content:parsed.content};
 };
}
