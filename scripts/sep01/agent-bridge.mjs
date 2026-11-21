// SEP-01 local agent bridge: fail-closed contract for Cline, Copilot and Aider.
// This module does not assume a VS Codium extension is a headless executable.
// The host must provide a separately authenticated, isolated runner and a
// verified transport implementation. No shell or model command is generated here.
export const BRIDGE_PROVIDERS=Object.freeze(['cline','copilot','aider']);
const FORBIDDEN=new Set(['auth','payments','entitlements','security','secrets','pii']);
const FAILURES=new Set(['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE']);
export function validateAgentBridge({provider,enabled=false,authenticated=false,capabilities=[],invoke}={}){
 if(!BRIDGE_PROVIDERS.includes(provider))throw Error('SEP01_UNKNOWN_AGENT');
 if(!enabled||!authenticated||!capabilities.includes('bounded-text-edit')||typeof invoke!=='function')throw Error('SEP01_AGENT_NOT_READY');
 return true;
}
export function createAgentBridge({provider,enabled=false,authenticated=false,capabilities=[],invoke}={}){
 validateAgentBridge({provider,enabled,authenticated,capabilities,invoke});
 return async({job,path,content})=>{
  if(job?.sensitivity_tier==='TIER_1'||FORBIDDEN.has(job?.scope))throw Error('SEP01_SENSITIVE_JOB_FORBIDDEN');
  if(typeof job?.instruction!=='string'||!job.instruction.trim()||job.instruction.length>3000||
     !Array.isArray(job?.locked_paths)||job.locked_paths.length!==1||job.locked_paths[0]!==path||
     !/^scripts\\/sep01\\/[a-zA-Z0-9._/-]+$/.test(path)||path.includes('..')||
     typeof content!=='string'||content.length>50000)throw Error('SEP01_AGENT_INPUT_REJECTED');
  // invoke must be an authenticated host adapter with its own command allowlist.
  const response=await invoke({provider,task:job.instruction,path,content});
  if(FAILURES.has(response?.status))return {status:response.status,provider};
  if(response?.status!=='EDIT'||typeof response.content!=='string'||!response.content||response.content.length>100000)
   return {status:'INVALID_EDIT',provider};
  return {status:'EDIT',content:response.content};
 };
}
