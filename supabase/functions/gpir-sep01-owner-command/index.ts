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
   return json({job_id:row.job_id,status:row.payload.status,revision:row.revision,updated_at:row.updated_at,checkpoint:row.payload.checkpoint_commit||null,provider:row.payload.provider||null,model_attempts:modelAttempts});
  }
  if(body.action!=='submit')return json({error:'UNKNOWN_ACTION'},400);
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
  const jobId='sep01-owner-'+crypto.randomUUID().slice(0,18);
  const branch='sep01/jobs/'+jobId;
  const ref=await github('git/ref/heads/main');
  await github('git/refs','POST',{ref:'refs/heads/'+branch,sha:ref.object.sha});
  if(scope==='fixture'){
   const fixture='SEP-02 bounded provider failover acceptance fixture.\nSTATE: PENDING\n';
   await github('contents/'+sep02FixturePath,'PUT',{message:'SEP-02: seed isolated non-production acceptance fixture',content:btoa(fixture),branch});
  }
  const payload={job_id:jobId,idempotency_key:scope==='fixture'?'owner:sep02-once:'+owner:'owner:'+jobId,branch,locked_paths:[target],scope,instruction,capability:'code',remaining_budget:0,sensitivity_tier:null,single_attempt:scope==='fixture',acceptance_series:scope==='fixture'?'SEP02':null,status:'QUEUED',owner_user_id:owner};
  const queued=await supa('rpc/gpir_sep01_cas_job','POST',{p_job_id:jobId,p_idempotency_key:payload.idempotency_key,p_expected_revision:null,p_payload:payload});
  if(queued?.job_id!==jobId||queued?.status!=='QUEUED')throw Error('ACCEPTANCE_QUEUE_NOT_CONFIRMED');
  try{await github('actions/workflows/sep01-durable-dispatch.yml/dispatches','POST',{ref:'main',inputs:{job_id:jobId}})}
  catch(error){return json({job_id:jobId,status:'QUEUED',dispatch:'PENDING',message:'Job queued; dispatcher trigger unavailable. Scheduled dispatcher may pick it up.'},202)}
  return json({job_id:jobId,status:'QUEUED',dispatch:'REQUESTED'},202);
 }catch(error){console.error('SEP01_COMMAND_ERROR',String(error?.message||error));return json({error:'COMMAND_GATEWAY_ERROR',detail:String(error?.message||error).replace(/[^A-Z0-9_]/gi,'_').slice(0,100)},500)}
});
