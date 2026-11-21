// SEP-01 owner-only command gateway. All privileged calls remain server-side.
// Explicit owner allowlist and scope guard fail closed; no production release capability.
const allowedOrigin='https://fintechoisis.com';
const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const env=name=>Deno.env.get(name)||'';
async function supa(path,method='GET',body){
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)throw Error('SERVER_CONFIG_UNAVAILABLE');
 const r=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
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
 const auth=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{Authorization:'Bearer '+token,apikey:env('SUPABASE_ANON_KEY')||env('GPIR_SUPABASE_PUBLISHABLE_KEY')}});
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
   return json({job_id:row.job_id,status:row.payload.status,revision:row.revision,updated_at:row.updated_at,checkpoint:row.payload.checkpoint_commit||null,provider:row.payload.provider||null});
  }
  if(body.action!=='submit')return json({error:'UNKNOWN_ACTION'},400);
  // This gate does not claim to support arbitrary repository edits.
  if(body.scope!=='fixture')return json({error:'SCOPE_NOT_YET_AUTHORIZED',message:'Only bounded fixture acceptance is currently approved.'},422);
  const instruction=String(body.instruction||'').trim();
  if(!instruction||instruction.length>1000||/[\x00-\x1f]/.test(instruction))return json({error:'INVALID_INSTRUCTION'},400);
  const jobId='sep01-owner-'+crypto.randomUUID().slice(0,18);
  const branch='sep01/jobs/'+jobId;
  const ref=await github('git/ref/heads/main');
  await github('git/refs','POST',{ref:'refs/heads/'+branch,sha:ref.object.sha});
  const fixture='SEP-01 durable checkpoint acceptance fixture.\\nSTATE: PENDING\\n';
  await github('contents/scripts/sep01/acceptance-fixture.txt','PUT',{message:'SEP-01: seed isolated acceptance fixture',content:btoa(fixture),branch});
  const payload={job_id:jobId,idempotency_key:'owner:'+jobId,branch,locked_paths:['scripts/sep01/acceptance-fixture.txt'],scope:'fixture',instruction,capability:'code',remaining_budget:0,sensitivity_tier:null,status:'QUEUED',owner_user_id:owner};
  await supa('gpir_sep01_jobs?on_conflict=job_id','POST',{job_id:jobId,idempotency_key:payload.idempotency_key,revision:1,payload});
  try{await github('actions/workflows/sep01-durable-dispatch.yml/dispatches','POST',{ref:'main',inputs:{job_id:jobId}})}
  catch(error){return json({job_id:jobId,status:'QUEUED',dispatch:'PENDING',message:'Job queued; dispatcher trigger unavailable. Scheduled dispatcher may pick it up.'},202)}
  return json({job_id:jobId,status:'QUEUED',dispatch:'REQUESTED'},202);
 }catch(error){console.error('SEP01_COMMAND_ERROR',String(error?.message||error));return json({error:'COMMAND_GATEWAY_ERROR',detail:String(error?.message||error).replace(/[^A-Z0-9_]/gi,'_').slice(0,100)},500)}
});
