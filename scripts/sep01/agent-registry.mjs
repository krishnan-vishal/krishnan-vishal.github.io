// SEP-01 explicit agent inventory. Discovery is not authentication or activation.
// External CLI agents must be connected through separately authorized runner adapters.
export const AGENTS=Object.freeze([
 {id:'openrouter',kind:'model-api',credential:'OPENROUTER_API_KEY',supportsAutomaticExecution:true},
 {id:'codex',kind:'coding-agent',credential:'CODEX_AGENT_AUTH',supportsAutomaticExecution:false},
 {id:'copilot',kind:'coding-agent',credential:'COPILOT_AGENT_AUTH',supportsAutomaticExecution:false},
 {id:'cline',kind:'coding-agent',credential:'CLINE_AGENT_AUTH',supportsAutomaticExecution:false},
 {id:'aider',kind:'coding-agent',credential:'OPENROUTER_API_KEY',supportsAutomaticExecution:true}
]);
export function agentReadiness(config={}){
 return AGENTS.map(a=>{
  const entry=config[a.id];
  const authorized=entry?.approved===true&&entry?.adapter_verified===true&&entry?.credential_verified===true;
  const executable=authorized&&a.supportsAutomaticExecution===true&&typeof entry?.execute==='function';
  return {id:a.id,kind:a.kind,ready:executable,reason:executable?'READY':!authorized?'NOT_AUTHORIZED_OR_VERIFIED':'NO_EXECUTION_ADAPTER'};
 });
}
export function selectAuthorizedAgent(job,providers,config){
 const ready=new Set(agentReadiness(config).filter(a=>a.ready).map(a=>a.id));
 const eligible=providers.filter(p=>ready.has(p.agent_id)&&p.approved===true&&p.healthy===true&&p.remaining_quota>0&&p.capabilities?.includes(job.capability)&&Number.isFinite(p.estimated_cost)&&p.estimated_cost>=0&&p.estimated_cost<=(job.remaining_budget??0)&&((job.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job.scope))?(p.tier==='TIER_1'&&p.private_environment===true):(p.tier==='PUBLIC'||p.tier==='TIER_1')));
 return eligible.length?eligible.sort((a,b)=>a.estimated_cost-b.estimated_cost)[0]:null;
}
