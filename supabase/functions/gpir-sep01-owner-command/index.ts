// SEP-01 owner-only command gateway. All privileged calls remain server-side.
// Explicit owner allowlist and scope guard fail closed; no production release capability.
const allowedOrigin='https://fintechoisis.com';
const sep02FixturePath='scripts/sep01/sep02-acceptance-fixture.txt';
const sep02FixtureInstruction='Replace the entire isolated SEP-02 fixture with exactly two lines: SEP-02 bounded provider failover acceptance fixture. then STATE: CHECKPOINT_VERIFIED. End both lines with a newline. Do not modify any other file or deploy.';
const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const env=name=>Deno.env.get(name)||'';
async function supa(path,method='GET',body){
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)throw Error('SERVER_CONFIG_UNAVAILABLE');
 const r=await fetch(url+'/rest/v1/'+path,{method,headers:{['api'+'key']:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!r.ok)throw Error('JOB_STORE_HTTP_'+r.status);
 return r.json();
}
async function github(path,method='GET',body){
 const token=env('SEP01_GITHUB_TOKEN');
 if(!token)throw Error('GITHUB_EXECUTION_TOKEN_UNAVAILABLE');
 const r=await fetch('https://api.github.com/repos/krishnan-vishal/krishnan-vishal.github.io/'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'GPIR-SEP01-Owner-Intake'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!r.ok)throw Error('GITHUB_HTTP_'+r.status);
 return r.status===204?{}:r.json();
}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.headers.get('Origin')!==allowedOrigin)return json({error:'ORIGIN_NOT_AUTHORIZED'},403);
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const token=(request.headers.get('Authorization')||'').match(/^Bearer (.+)$/)?.[1];
 if(!token)return json({error:'SIGN_IN_REQUIRED'},401);
 const owner=env('SEP01_OWNER_USER_ID');
 if(!owner)return json({error:'OWNER_ALLOWLIST_NOT_CONFIGURED'},503);
 const auth=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{Authorization:'Bearer '+token,['api'+'key']:env('SUPABASE_ANON_KEY')||env('GPIR_SUPABASE_PUBLISHABLE_KEY')}});
 if(!auth.ok)return json({error:'INVALID_SESSION'},401);
 const user=await auth.json();
 if(user.id!==owner||user.is_anonymous===true)return json({error:'OWNER_NOT_AUTHORIZED'},403);
 try{
  const body=await request.json();
  if(body.action==='status'){
   const jobId=String(body.job_id||'');
   if(!/^sep01-owner-[a-z0-9-]{6,60}$/.test(jobId))return json({error:'INVALID_JOB_ID'},400);
   const rows=await supa('gpir_sep01_jobs?job_id=eq.'+encodeURIComponent(jobId)+'&select=job_id,revision,updated_at,payload');
   const row=rows[0];
   if(!row||row.payload?.owner_user_id!==owner)return json({error:'JOB_NOT_FOUND'},404);
   const modelAttempts=Array.isArray(row.payload.model_attempts)?row.payload.model_attempts.slice(0,6).flatMap(attempt=>{
    if(!['gemini','openrouter','codex'].includes(attempt?.provider)||!/^[-A-Z_]{1,40}$/.test(attempt.status||''))return [];
    const model=/^[-A-Za-z0-9_.:/]{1,120}$/.test(attempt.model||'')?attempt.model:null;
    return [{provider:attempt.provider,model,status:attempt.status}];
   }):[];
   return json({job_id:row.job_id,status:row.payload.status,revision:row.revision,updated_at:row.updated_at,checkpoint:row.payload.checkpoint_commit||null,provider:row.payload.provider||null,model_attempts:modelAttempts,pr_url:row.payload.pr_url||null});
  }
  const plannedSubmission=body.action==='submit_planned';
  let plannedBase;
  if(body.action==='classify_requirement'||plannedSubmission){
   // Read-only classification and bounded repository discovery. No jobs, paid calls or mutations.
   const instruction=String(body.instruction||'').trim();
   const requestedScope=String(body.scope||'development');
   if(plannedSubmission&&(requestedScope!=='development'||body.confirmation!=='AUTHORIZE_ONE_SEP_JOB'))return json({error:'PLAN_APPROVAL_REQUIRED'},403);
   if(!instruction||instruction.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(instruction))return json({error:'INVALID_REQUIREMENT'},422);
   if(!['development','research','release'].includes(requestedScope))return json({error:'SCOPE_NOT_AUTHORIZED'},422);
   const lowered=instruction.toLowerCase();
   // Classify requested operations, not explicit prohibitions or acceptance constraints.
   // Preserve fail-closed review for ambiguous or sensitive requested actions.
   const operative=instruction.split(/[.!?\n]+/).map(part=>part.trim()).filter(Boolean).filter(part=>!/^((?:do not|don't|never|without|no|avoid|prohibit|exclude|must not|should not)\b)/i.test(part)&&!/\b(?:are|remain|must be|should be)\s+(?:approval.gated|prohibited|unchanged|preserved)\b/i.test(part));
   const requested=operative.join(' ');
   const sensitive=/\b(auth(?:entication|orization)?|password|secret|token|credential|payment|billing|entitlement|deploy(?:ment)?|release|database|migration|schema|supabase|workflow|github actions|edge function|api key|security|permission)\b/i.test(requested);
   const inferred=/\b(research|analysis|investigat|report|study)\b/i.test(requested)?'research':/\b(deploy|release|publish|production|rollout)\b/i.test(requested)?'release':'development';
   const category=requestedScope==='development'?inferred:requestedScope;
   if(category!=='development'||sensitive)return json({category,sensitive,executable:false,reason:sensitive?'SENSITIVE_REVIEW_REQUIRED':'SCOPE_REQUIRES_SEPARATE_AUTHORIZATION',candidates:[],read_only:true});
   const ref=await github('git/ref/heads/main');
   const tree=await github('git/trees/'+encodeURIComponent(ref.object.sha)+'?recursive=1');
   if(tree.truncated||!Array.isArray(tree.tree))return json({category,sensitive:false,executable:false,reason:'REPOSITORY_DISCOVERY_INCOMPLETE',candidates:[],read_only:true});
   const words=new Set(requested.toLowerCase().match(/[a-z0-9]{3,}/g)||[]);
   const eligible=tree.tree.filter(entry=>entry.type==='blob'&&entry.size<=100000&&typeof entry.path==='string'&&/^(docs\/[a-zA-Z0-9/_-]+\.md|assets\/css\/[a-zA-Z0-9/_-]+\.css)$/.test(entry.path)&&!entry.path.includes('..'));
   const ranked=eligible.map(entry=>{
    const tokens=new Set(entry.path.toLowerCase().match(/[a-z0-9]{3,}/g)||[]);
    let score=0;for(const word of words)if(tokens.has(word))score++;
    if(/\b(style|css|layout|font|spacing|visual)\b/.test(lowered)&&entry.path.endsWith('.css'))score+=2;
    if(/\b(document|docs|readme|chapter|text)\b/.test(lowered)&&entry.path.endsWith('.md'))score+=2;
    return {path:entry.path,score};
   }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,8);
   const target=ranked.length===1||ranked[0]?.score>ranked[1]?.score?ranked[0]?.path:null;
   const planId=target?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([owner,ref.object.sha,target,instruction])))),byte=>byte.toString(16).padStart(2,'0')).join(''):null;
   if(!plannedSubmission)return json({category,sensitive:false,executable:false,reason:target?'OWNER_APPROVAL_REQUIRED':ranked.length?'AMBIGUOUS_COMPONENT':'NO_SAFE_TARGET_IDENTIFIED',candidates:ranked,read_only:true,review_required:true,auto_suggested_target:target,plan_id:planId});
   if(!planId||body.plan_id!==planId)return json({error:'PLAN_STALE_OR_AMBIGUOUS'},409);
   plannedBase=ref.object.sha;
   body.path=target;
   body.instruction=instruction.replace(/\s+/g,' ').trim();
  }
  if(body.action==='agent_tasks_list'){
   // Read-only SEP-03 monitoring. Never reuse the SEP-01 execution credential.
   const agentToken=env('SEP03_GITHUB_AGENT_READ_TOKEN');
   if(!agentToken)return json({error:'AGENT_MONITOR_CREDENTIAL_NOT_CONFIGURED'},503);
   // Reject malformed secret values before constructing a privileged outbound header.
   // Never log or return the credential; GitHub PATs must be single-line ASCII.
   const normalizedAgentToken=agentToken.trim();
   if(!/^(github_pat_|ghp_)[\x21-\x7e]{10,500}$/.test(normalizedAgentToken))return json({error:'AGENT_MONITOR_CREDENTIAL_INVALID_FORMAT'},503);
   const response=await fetch('https://api.github.com/agents/repos/krishnan-vishal/krishnan-vishal.github.io/tasks?per_page=20',{
    method:'GET',headers:{Authorization:'Bearer '+normalizedAgentToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'GPIR-SEP03-Owner-Monitor'}
   });
   if(!response.ok){
    console.error('SEP03_AGENT_TASKS_HTTP',response.status);
    return json({error:'AGENT_TASKS_UPSTREAM_UNAVAILABLE',upstream_status:response.status},502);
   }
   const data=await response.json();
   const source=Array.isArray(data)?data:Array.isArray(data?.tasks)?data.tasks:[];
   const tasks=source.slice(0,20).map(task=>{
    const id=String(task?.id??task?.task_id??'');
    const state=String(task?.status??task?.state??'unknown');
    const url=String(task?.html_url??task?.url??'');
    return {
     id:/^[a-zA-Z0-9_-]{1,120}$/.test(id)?id:null,
     state:/^[a-zA-Z0-9_ -]{1,80}$/.test(state)?state:'unknown',
     url:url.startsWith('https://github.com/')?url:null
    };
   });
   return json({tasks,read_only:true,source_count:source.length});
  }
  if(body.action==='agent_delegation_eligibility'){
   // GitHub's Agent tasks creation API requires Copilot Business/Enterprise.
   // A Pro+ subscription or read-only PAT is not sufficient evidence.
   const enabled=env('SEP03_AGENT_TASK_SUBMISSION_ENABLED')==='true';
   const eligible=env('SEP03_AGENT_PLAN_ELIGIBLE')==='true';
   const costApproved=env('SEP03_AGENT_COST_APPROVED')==='true';
   const writeConfigured=Boolean(env('SEP03_GITHUB_AGENT_WRITE_TOKEN'));
   return json({read_only_monitoring:true,submission_available:enabled&&eligible&&costApproved&&writeConfigured,
    eligibility_verified:eligible,owner_cost_approved:costApproved,write_credential_configured:writeConfigured,
    reason:!eligible?'PLAN_ELIGIBILITY_NOT_VERIFIED':!costApproved?'COST_APPROVAL_REQUIRED':!writeConfigured?'WRITE_CREDENTIAL_REQUIRED':!enabled?'SUBMISSION_DISABLED':'ELIGIBLE'});
  }
  if(body.action==='agent_task_submit'){
   // No side effects until every independent authorization gate passes.
   if(env('SEP03_AGENT_TASK_SUBMISSION_ENABLED')!=='true')return json({error:'AGENT_TASK_SUBMISSION_DISABLED'},403);
   if(env('SEP03_AGENT_PLAN_ELIGIBLE')!=='true')return json({error:'AGENT_PLAN_NOT_VERIFIED'},403);
   if(env('SEP03_AGENT_COST_APPROVED')!=='true')return json({error:'AGENT_COST_APPROVAL_REQUIRED'},403);
   if(body.confirmation!=='AUTHORIZE_ONE_GITHUB_AGENT_TASK')return json({error:'EXPLICIT_TASK_CONFIRMATION_REQUIRED'},422);
   const path=String(body.path||'');
   if(!/^(docs\/[a-zA-Z0-9/_-]+\.md|assets\/css\/[a-zA-Z0-9/_-]+\.css)$/.test(path)||path.includes('..'))return json({error:'PATH_NOT_AUTHORIZED'},422);
   const instruction=String(body.instruction||'').trim();
   if(!instruction||instruction.length>1000||/[\x00-\x1f]/.test(instruction))return json({error:'INVALID_INSTRUCTION'},422);
   const writeToken=env('SEP03_GITHUB_AGENT_WRITE_TOKEN').trim();
   if(!/^(github_pat_|ghp_)[\x21-\x7e]{10,500}$/.test(writeToken))return json({error:'AGENT_WRITE_CREDENTIAL_UNAVAILABLE'},503);
   // Restrict the task's instructions and require PR-only review; never authorize deployment.
   const prompt='GPIR owner-authorized bounded documentation/stylesheet proposal. Modify ONLY '+path+
    '. Do not change workflows, authentication, secrets, payments, dependencies, or production deployment. Open a PR for review; do not merge. Requirement: '+instruction;
   const response=await fetch('https://api.github.com/agents/repos/krishnan-vishal/krishnan-vishal.github.io/tasks',{
    method:'POST',headers:{Authorization:'Bearer '+writeToken,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2026-03-10','User-Agent':'GPIR-SEP03-Owner-Delegation','Content-Type':'application/json'},
    body:JSON.stringify({prompt,base_ref:'main',create_pull_request:true})
   });
   if(response.status!==201){console.error('SEP03_AGENT_SUBMISSION_HTTP',response.status);return json({error:'AGENT_TASK_CREATION_FAILED',upstream_status:response.status},502)}
   const task=await response.json();
   const id=String(task?.id||'');
   const url=String(task?.html_url||'');
   if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id))return json({error:'AGENT_TASK_RESPONSE_INVALID'},502);
   return json({task_id:id,state:String(task?.state||'queued'),url:url.startsWith('https://github.com/')?url:null,provider:'github_copilot',requires_review:true},201);
  }
  if(body.action!=='submit'&&!plannedSubmission)return json({error:'UNKNOWN_ACTION'},400);
  const scope=String(body.scope||'');
  if(!['fixture','development'].includes(scope))return json({error:'SCOPE_NOT_AUTHORIZED'},422);
  // Explicit non-sensitive file boundary. No arbitrary code, workflow, auth, payment, secret or deployment edits.
  const path=String(body.path||'');
  if(scope==='development'&&(!/^(docs\/[a-zA-Z0-9/_-]+\.md|assets\/css\/[a-zA-Z0-9/_-]+\.css)$/.test(path)||path.includes('..')))return json({error:'PATH_NOT_AUTHORIZED'},422);
  const instruction=String(body.instruction||'').trim();
  if(!instruction||instruction.length>1000||/[\x00-\x1f]/.test(instruction))return json({error:'INVALID_INSTRUCTION'},400);
  if(scope==='fixture'&&instruction!==sep02FixtureInstruction)return json({error:'FIXTURE_INSTRUCTION_NOT_AUTHORIZED'},422);
  const target=scope==='fixture'?sep02FixturePath:path;
  const existing=await supa('gpir_sep01_jobs?select=job_id,payload&limit=1000');
  if(scope==='fixture'){
   const previous=existing.find(row=>row.payload?.acceptance_series==='SEP02'&&row.payload?.owner_user_id===owner);
   if(previous)return json({error:'ACCEPTANCE_ALREADY_SUBMITTED',job_id:previous.job_id,message:'SEP-02 is one-shot. Check the existing acceptance receipt; do not submit again.'},409);
  }
  const lockHolder=existing.find(row=>['CLAIMED','CHECKPOINTED','PR_READY','CI_VERIFIED','RELEASE_ELIGIBLE'].includes(row.payload?.status)&&row.payload?.locked_paths?.includes(target));
  if(lockHolder)return json({error:'WRITER_LOCK_CONFLICT',message:'A verified checkpoint already owns this file. Preserve its state and complete governed review before submitting another edit.'},409);
  if(scope==='development'){
   const file=await github('contents/'+path);
   if(file.type!=='file'||file.size>100000)return json({error:'FILE_NOT_ELIGIBLE'},422);
  }
  const jobId='sep01-owner-'+(plannedSubmission?body.plan_id.slice(0,40):crypto.randomUUID().slice(0,18));
  const branch='sep01/jobs/'+jobId;
  const ref=await github('git/ref/heads/main');
  if(plannedBase&&plannedBase!==ref.object.sha)return json({error:'PLAN_STALE_OR_AMBIGUOUS'},409);
  await github('git/refs','POST',{ref:'refs/heads/'+branch,sha:ref.object.sha});
  if(scope==='fixture'){
   const fixture='SEP-02 bounded provider failover acceptance fixture.\nSTATE: PENDING\n';
   await github('contents/'+sep02FixturePath,'PUT',{message:'SEP-02: seed isolated non-production acceptance fixture',content:btoa(fixture),branch});
  }
  const payload={job_id:jobId,idempotency_key:scope==='fixture'?'owner:sep02-once:'+owner:'owner:'+jobId,branch,locked_paths:[target],scope,instruction,capability:'code',remaining_budget:0,sensitivity_tier:null,single_attempt:scope==='fixture'||plannedSubmission,acceptance_series:scope==='fixture'?'SEP02':null,status:'QUEUED',owner_user_id:owner};
  const queued=await supa('rpc/gpir_sep01_cas_job','POST',{p_job_id:jobId,p_idempotency_key:payload.idempotency_key,p_expected_revision:null,p_payload:payload});
  if(queued?.job_id!==jobId||queued?.status!=='QUEUED')throw Error('ACCEPTANCE_QUEUE_NOT_CONFIRMED');
  try{await github('actions/workflows/sep01-durable-dispatch.yml/dispatches','POST',{ref:'main',inputs:{job_id:jobId}})}
  catch(error){return json({job_id:jobId,status:'QUEUED',dispatch:'PENDING',message:'Job queued; dispatcher trigger unavailable. Scheduled dispatcher may pick it up.'},202)}
  return json({job_id:jobId,status:'QUEUED',dispatch:'REQUESTED'},202);
 }catch(error){console.error('SEP01_COMMAND_ERROR',String(error?.message||error));return json({error:'COMMAND_GATEWAY_ERROR',detail:String(error?.message||error).replace(/[^A-Z0-9_]/gi,'_').slice(0,100)},500)}
});
