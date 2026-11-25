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
const gatewayVersion='sep04a-2';
const maxFileBytes=100000;
const developmentPath=/^(docs\/[a-zA-Z0-9/_-]+\.md|assets\/css\/[a-zA-Z0-9/_-]+\.css)$/;
const sensitiveTerms=/\b(auth(?:entication|orization)?|passwords?|secrets?|tokens?|credentials?|payments?|billing|entitlements?|deploy(?:ment)?|releases?|database|migration|schema|supabase|workflows?|github actions|edge functions?|api keys?|security|permissions?)\b/i;
const constraintStart=/^(?:(?:please\s+)?(?:do not|don't|never|without|avoid|exclude|preserve|retain|leave|keep)\b|no\s+(?:new|changes?|production|deploy|release|provider|paid)\b)/i;
function classifyRequirement(instruction,scope){
 const clauses=instruction.replace(/^\s*\d+\.\s+/gm,'').split(/[\n;!?]+|\.(?=\s|$)|,\s*(?=(?:please\s+)?(?:do not|don't|never|without|preserve|retain|leave|keep|but|then)\b)|\s+(?:and\s+)?(?:but|then|also)\s+|\s+and\s+(?=(?:deploy|publish|release|roll\s*out|promote|push|merge|change|modify|update|remove|implement|disable|enable)\b)|\s+(?=(?:and\s+)?(?:without|do not|don't|never)\s)/i)
  .map(clause=>clause.trim().replace(/^(?:[-*]\s+|\d+\.\s+|(?:constraints?|governance|acceptance criteria|requirements?|objective)\s*:\s*|and\s+|but\s+|then\s+)+/i,''))
  .filter(clause=>clause&&!constraintStart.test(clause)&&!/^[\w /-]+\s+(?:must|should)\s+(?:remain|stay|be)\s+(?:unchanged|preserved|approval.gated|prohibited)$/i.test(clause));
 const requested=clauses.join(' ');
 const documentation=/\b(?:document(?:ation)?|docs|readme|markdown|guide|runbook|handbook|manual)\b|\.md\b/i;
 const stylesheet=/\b(?:stylesheets?|css|layout|fonts?|spacing|visual|typography)\b|\.css\b/i;
 const edit=/\b(?:add|amend|change|clarify|correct|edit|expand|fix|improve|implement|insert|remove|rename|replace|revise|rewrite|update|write)\b/i;
 const research=/^(?:please\s+)?(?:research|analy[sz]e|investigate|compare|explain|find|summarize|assess|review|report on)\b/i;
 const release=/\b(?:deploy|publish|release|roll\s*out|promote|push|merge)\b/i;
 const requestsRelease=clauses.some(clause=>{
  const action=clause.match(release);
  if(!action)return false;
  const prefix=clause.slice(0,action.index);
  if(/\band\s*$/i.test(prefix))return true;
  return !research.test(clause)&&!(edit.test(prefix)&&documentation.test(clause))&&
   (/^(?:please\s+)?(?:deploy|publish|release|roll\s*out|promote|push|merge)\b/i.test(clause)||
    /\b(?:and|to)\s+(?:deploy|publish|release|roll\s*out|promote|push|merge)\b/i.test(clause));
 });
 const isDocumentation=clauses.some(clause=>edit.test(clause)&&documentation.test(clause));
 const isStylesheet=clauses.some(clause=>edit.test(clause)&&stylesheet.test(clause));
 const kind=isDocumentation&&!isStylesheet?'documentation':isStylesheet&&!isDocumentation?'stylesheet':'application_code';
 const inferred=requestsRelease?'release':clauses.length&&clauses.every(clause=>research.test(clause))?'research':'development';
 const category=scope==='release'||inferred==='release'?'release':scope==='research'?'research':inferred;
 const sensitive=sensitiveTerms.test(requested);
 const explicitPaths=[...new Set((requested.match(/[\w/-]+\.(?:md|css|[cm]?[jt]sx?|html|json|ya?ml|sql|toml|txt|py|sh)\b/gi)||[]).map(path=>path.toLowerCase()))];
 const unsupported=explicitPaths.some(path=>!path.endsWith('.md')&&!path.endsWith('.css'))||
  clauses.some(clause=>edit.test(clause)&&!documentation.test(clause)&&!stylesheet.test(clause)&&/\b(?:application code|javascript|typescript|backend|server logic|source code)\b/i.test(clause));
 const multiple=explicitPaths.length>1||(isDocumentation&&isStylesheet)||/\b(?:both|multiple|several|all|two|three)\s+(?:[\w-]+\s+){0,3}(?:files|pages|documents|stylesheets)\b/i.test(requested);
 const reason=category==='release'?'RELEASE_REVIEW_REQUIRED':sensitive?'SENSITIVE_REVIEW_REQUIRED':
  category==='research'?'RESEARCH_OUTSIDE_WORKER':multiple?'SINGLE_FILE_REQUIRED':
  !edit.test(requested)?'REQUESTED_EDIT_REQUIRED':(kind==='application_code'||unsupported)?'APPLICATION_CODE_REVIEW_REQUIRED':null;
 return {requested,category,kind,sensitive,reason,explicitPaths};
}
function rankTargets(tree,{requested,kind,explicitPaths}){
 const normalize=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const stop=new Set('add amend update fix change correct edit expand improve insert remove rename replace revise rewrite write docs document documentation readme markdown guide runbook handbook manual css stylesheet layout font spacing visual typography gpir file page component please should must this that the and for with from into about under section current existing'.split(' '));
 const query=normalize(requested);
 const words=new Set(query.split(' ').filter(word=>word.length>=3&&!stop.has(word)));
 return tree.flatMap(entry=>{
  if(entry.type!=='blob'||typeof entry.path!=='string'||!developmentPath.test(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||
    !entry.path.endsWith(kind==='documentation'?'.md':'.css'))return [];
  const path=entry.path.toLowerCase();
  const basename=path.split('/').at(-1);
  const exact=explicitPaths.some(hint=>hint===path||hint===basename);
  if(explicitPaths.length&&!exact)return [];
  const stem=normalize(basename.replace(/\.[^.]+$/,''));
  const tokens=[...new Set(stem.split(' ').filter(word=>words.has(word)))];
  const phrase=stem.split(' ').length>1&&(' '+query+' ').includes(' '+stem+' ');
  const score=exact?100:phrase?50:tokens.length;
  return score?[{path:entry.path,score,size:entry.size}]:[];
 }).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
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
  // Cloud PowerShell: owner-authenticated, fixed operation only; never accept shell text.
  if(body.action==='cloud_powershell_plan'){
   if(body.operation!=='workspace-proof')return json({error:'PWSH_OPERATION_NOT_ALLOWED'},422);
   return json({operation:'workspace-proof',executor:'github-hosted-ubuntu-pwsh',read_only:true,
    requires_owner_confirmation:true,confirmation:'AUTHORIZE_CLOUD_POWERSHELL_PROOF',
    files:['admin/central-command/index.html','scripts/sep01/durable-actions-worker.mjs','.github/workflows/sep01-durable-dispatch.yml'],
    production_modified:false,local_machine_required:false});
  }
  if(body.action==='cloud_powershell_dispatch'){
   if(body.operation!=='workspace-proof'||body.confirmation!=='AUTHORIZE_CLOUD_POWERSHELL_PROOF')
    return json({error:'PWSH_OWNER_APPROVAL_REQUIRED'},403);
   const requestId='sep01-pwsh-'+crypto.randomUUID();
   await github('actions/workflows/sep01-cloud-powershell.yml/dispatches','POST',{
    ref:'main',inputs:{operation:'workspace-proof',request_id:requestId}});
   return json({request_id:requestId,status:'DISPATCH_REQUESTED',operation:'workspace-proof',
    workflow_url:'https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/workflows/sep01-cloud-powershell.yml',
    execution_verified:false});
  }
  if(body.action==='cloud_powershell_status'){
   const requestId=String(body.request_id||'');
   if(!/^sep01-pwsh-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId))
    return json({error:'INVALID_PWSH_REQUEST_ID'},422);
   const runs=await github('actions/workflows/sep01-cloud-powershell.yml/runs?event=workflow_dispatch&branch=main&per_page=100');
   const run=Array.isArray(runs.workflow_runs)?runs.workflow_runs.find(item=>item.display_title==='Cloud PowerShell · '+requestId):null;
   if(!run)return json({request_id:requestId,status:'PENDING_VISIBILITY',execution_verified:false});
   return json({request_id:requestId,status:run.status,conclusion:run.conclusion||null,
    run_id:run.id,run_url:run.html_url,execution_verified:run.status==='completed'&&run.conclusion==='success',
    artifact_url:run.status==='completed'&&run.conclusion==='success'?
     'https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/'+run.id:null});
  }
  // Stage 3: authenticated read-only preview; execution remains disabled.
  if(body.action==='multifile_plan'||body.action==='multifile_stage'||body.action==='multifile_submit'){
   if(body.action==='multifile_submit')return json({error:'MULTIFILE_EXECUTION_NOT_ENABLED',read_only:true},403);
   const paths=body.paths;
   const instruction=String(body.instruction||'').trim();
   if(!Array.isArray(paths)||paths.length<2||paths.length>3||new Set(paths).size!==paths.length||paths.some(path=>typeof path!=='string'||!developmentPath.test(path)||path.includes('..')||path.includes('//')))
    return json({error:'MULTIFILE_PATH_NOT_AUTHORIZED'},422);
   if(!instruction||instruction.length>1000||/[\x00-\x1f]/.test(instruction))return json({error:'INVALID_INSTRUCTION'},422);
   const intent=classifyRequirement(instruction,'development');
   if(intent.category!=='development'||intent.sensitive||/\b(?:deploy|merge|publish|release|credentials|secrets|token|authentication|payment|entitlement)\b/i.test(instruction))
    return json({error:'MULTIFILE_SENSITIVE_REVIEW_REQUIRED'},422);
   const ref=await github('git/ref/heads/main');
   const tree=await github('git/trees/'+encodeURIComponent(ref.object.sha)+'?recursive=1');
   if(tree.truncated||!Array.isArray(tree.tree))return json({error:'REPOSITORY_DISCOVERY_INCOMPLETE'},409);
   let total=0;
   const entries=[];
   for(const path of paths){
    const entry=tree.tree.find(item=>item.path===path&&item.type==='blob');
    if(!entry||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>maxFileBytes||!/^[a-f0-9]{40}$/.test(String(entry.sha||'')))return json({error:'MULTIFILE_FILE_NOT_ELIGIBLE'},422);
    total+=entry.size;
    if(total>300000)return json({error:'MULTIFILE_TOTAL_BYTES_EXCEEDED'},422);
    entries.push({path,size:entry.size,blob_sha:entry.sha});
   }
   entries.sort((a,b)=>a.path.localeCompare(b.path));
   const planData=[owner,ref.object.sha,instruction,entries];
   const planId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(planData)))),x=>x.toString(16).padStart(2,'0')).join('');
   if(body.action==='multifile_stage'){
    // Recompute the canonical plan from the current main branch before persisting.
    // Stage never queues a worker, calls a provider or records cost approval.
    if(body.plan_id!==planId)return json({error:'MULTIFILE_STALE_PLAN'},409);
    const jobId=String(body.job_id||'');
    if(!/^sep01-owner-[a-z0-9-]{6,60}$/.test(jobId))return json({error:'INVALID_JOB_ID'},422);
    const branch='sep01/jobs/'+jobId;
    const payload={owner_user_id:owner,execution_route:'bounded_multifile_v1',status:'PLANNED',
     scope:'development',capability:'code',sensitivity_tier:null,branch,base_sha:ref.object.sha,
     plan_id:planId,manifest:entries,locked_paths:entries.map(x=>x.path),instruction,
     single_attempt:true,cost_approved:false,remaining_budget:0,provider_attempt_reserved:false};
    try{
     const rows=await supa('gpir_sep01_jobs','POST',{job_id:jobId,idempotency_key:'multifile:'+jobId,revision:1,payload});
     if(!Array.isArray(rows)||rows.length!==1||rows[0].job_id!==jobId)return json({error:'MULTIFILE_STAGE_NOT_PERSISTED'},409);
     return json({execution_route:'bounded_multifile_v1',job_id:jobId,status:'PLANNED',plan_id:planId,
      revision:1,dispatch_enabled:false,provider_api_spend:false,owner_approval_recorded:false});
    }catch(error){
     if(String(error).includes('JOB_STORE_HTTP_409'))return json({error:'MULTIFILE_JOB_ALREADY_EXISTS'},409);
     throw error;
    }
   }
   return json({gateway_version:gatewayVersion,execution_route:'bounded_multifile_v1',enabled:false,read_only:true,
    plan_id:planId,base_sha:ref.object.sha,manifest:entries,total_bytes:total,
    provider_route:'gemini_openrouter',owner_approval_required:true,provider_api_spend:false,
    requires_review:true,production_deployment:false,reason:'MULTIFILE_EXECUTION_NOT_ENABLED'});
  }
  // Stage 3 approvals are owner-authenticated, persisted through the existing
  // service-role CAS RPC, and disabled until verified provider-side cost controls.
  if(body.action==='multifile_approve'||body.action==='multifile_dispatch'){
   const jobId=String(body.job_id||''),planId=String(body.plan_id||'');
   if(!/^sep01-owner-[a-z0-9-]{6,60}$/.test(jobId)||!/^[a-f0-9]{64}$/.test(planId))return json({error:'INVALID_MULTIFILE_IDENTITY'},422);
   const rows=await supa('gpir_sep01_jobs?job_id=eq.'+encodeURIComponent(jobId)+'&select=*');
   const row=rows[0],job=row?.payload;
   if(!row||job?.owner_user_id!==owner||job?.execution_route!=='bounded_multifile_v1'||job?.plan_id!==planId)
    return json({error:'MULTIFILE_PLAN_NOT_FOUND_OR_STALE'},409);
   const ref=await github('git/ref/heads/main');
   if(ref.object?.sha!==job.base_sha)return json({error:'MULTIFILE_BASE_CHANGED_REPLAN_REQUIRED'},409);
   if(body.action==='multifile_approve'){
    if(job.status!=='PLANNED'||body.confirmation!=='AUTHORIZE_ONE_MULTIFILE_JOB')return json({error:'MULTIFILE_APPROVAL_REQUIRED'},403);
    // Never accept account-cap verification or maximum cost from browser claims.
    if(env('SEP01_MULTIFILE_SPEND_CAP_VERIFIED')!=='true'||env('SEP01_MULTIFILE_MAX_SPEND_USD')!=='0.25')
     return json({error:'PROVIDER_ACCOUNT_CAP_NOT_VERIFIED'},403);
    if(!Array.isArray(job.locked_paths)||job.locked_paths.length<2||job.locked_paths.length>3||!Array.isArray(job.manifest)||job.manifest.length!==job.locked_paths.length)
     return json({error:'MULTIFILE_APPROVAL_SCOPE_INVALID'},409);
    const approval={status:'APPROVED',owner_user_id:owner,job_id:jobId,plan_id:planId,
     base_sha:job.base_sha,branch:job.branch,instruction:job.instruction,
     locked_paths:job.locked_paths,single_attempt:true,cost_approved:true,
     max_provider_requests:3,max_cost_usd:0.25,external_cap_verified:true,
     approved_at:new Date().toISOString(),revision:row.revision};
    const result=await supa('rpc/gpir_sep01_cas_job','POST',{
     p_job_id:jobId,p_idempotency_key:row.idempotency_key,p_expected_revision:row.revision,
     p_payload:{...job,job_id:jobId,idempotency_key:row.idempotency_key,status:'APPROVED',
      cost_approved:true,multifile_approval:approval}});
    if(!result)return json({error:'MULTIFILE_APPROVAL_CONCURRENTLY_CHANGED'},409);
    return json({job_id:jobId,status:'APPROVED',plan_id:planId,dispatch_enabled:false,
     provider_api_spend:false});
   }
   // Dispatch requires its own future owner decision and an explicit server release.
   if(job.status!=='APPROVED'||job.multifile_approval?.plan_id!==planId||
      body.confirmation!=='AUTHORIZE_ONE_MULTIFILE_DISPATCH')
    return json({error:'MULTIFILE_DISPATCH_APPROVAL_REQUIRED'},403);
   if(env('SEP01_MULTIFILE_EXECUTION_ENABLED')!=='true'||
      env('SEP01_MULTIFILE_SPEND_CAP_VERIFIED')!=='true'||
      env('SEP01_MULTIFILE_MAX_SPEND_USD')!=='0.25')
    return json({error:'MULTIFILE_EXECUTION_NOT_ENABLED'},403);
   // No GitHub workflow dispatch here: the existing durable worker consumes only
   // an explicitly queued job, using its service-role CAS writer locks.
   const result=await supa('rpc/gpir_sep01_cas_job','POST',{
    p_job_id:jobId,p_idempotency_key:row.idempotency_key,p_expected_revision:row.revision,
    p_payload:{...job,job_id:jobId,idempotency_key:row.idempotency_key,status:'QUEUED'}});
   if(!result)return json({error:'MULTIFILE_DISPATCH_CONCURRENTLY_CHANGED'},409);
   return json({job_id:jobId,status:'QUEUED',plan_id:planId,dispatch_authorized:true,
    provider_request_performed:false});
  }
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
  // Owner-only read-only diagnostic: uses existing GitHub Actions credentials, not Copilot.
  // Fixed public CMS endpoint; owner-only, no credentials forwarded, no redirects.
  if(body.action==='payload_connectivity'){
   const endpoint='https://gpir-payload-cms.krishnanvishal12.workers.dev/admin/login';
   try{
    const response=await fetch(endpoint,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Accept:'text/html'}});
    const reachable=response.status===200&&(response.headers.get('content-type')||'').includes('text/html');
    await response.body?.cancel();
    return json({read_only:true,endpoint,http_status:response.status,reachable,editorial_verified:false,database_verified:false});
   }catch{
    return json({read_only:true,endpoint,http_status:null,reachable:false,editorial_verified:false,database_verified:false});
   }
  }
  if(body.action==='global_alerts_evidence'){
   const checked=new Date(),until=encodeURIComponent(checked.toISOString()),since=encodeURIComponent(new Date(checked.getTime()-43200000).toISOString());
   const base='global_announcements?publication_status=eq.approved';
   async function count(path){
    const key=env('SUPABASE_SERVICE_ROLE_KEY');
    if(!key)throw Error('SERVER_CONFIG_UNAVAILABLE');
    const r=await fetch(env('SUPABASE_URL')+'/rest/v1/'+path+'&select=id&limit=1',{headers:{Authorization:'Bearer '+key,['api'+'key']:key,Prefer:'count=exact'},signal:AbortSignal.timeout(8000)});
    const total=r.headers.get('content-range')?.split('/').pop();
    await r.body?.cancel();
    if(!r.ok||!total||!/^\d+$/.test(total)||!Number.isSafeInteger(Number(total)))throw Error('ALERT_COUNT_UNAVAILABLE');
    return Number(total);
   }
   const [approved,relay,archive,runs]=await Promise.all([
    count(base),count(base+'&ticker_eligible=eq.true&published_at=gte.'+since+'&published_at=lte.'+until),
    count(base+'&published_at=lt.'+since+'&archive_month_year=not.is.null'),
    supa('intelligence_ingestion_runs?select=id,completed_at&run_status=eq.SUCCESS&completed_at=not.is.null&order=completed_at.desc&limit=1')
   ]);
   return json({read_only:true,checked_at:checked.toISOString(),approved,relay_eligible:relay,older_archive_tagged:archive,last_successful_ingestion:runs[0]?.completed_at||null,ingestion_run_id:runs[0]?.id||null,lifecycle_status:'database_metrics_only',live_lifecycle_verified:false});
  }
  if(body.action==='cloudflare_receipt'){
   const workflow='sep01-cloudflare-readonly-health.yml';
   const data=await github('actions/workflows/'+workflow+'/runs?branch=main&event=workflow_dispatch&per_page=1');
   const run=data.workflow_runs?.[0];
   if(!run)return json({read_only:true,workflow,verified:false,status:'no_receipt'});
   if(!Number.isSafeInteger(run.id)||!Number.isSafeInteger(run.run_attempt)||run.head_branch!=='main'||run.event!=='workflow_dispatch'||run.path!=='.github/workflows/'+workflow)throw Error('INVALID_CLOUDFLARE_RECEIPT');
   const jobs=await github('actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
   const job=jobs.jobs?.find(j=>j.name==='verify');
   const step=job?.steps?.find(s=>s.name==='Verify existing Workers through authenticated GET only');
   const verified=run.status==='completed'&&run.conclusion==='success'&&job?.conclusion==='success'&&step?.conclusion==='success'&&Number.isFinite(Date.parse(job.completed_at));
   return json({read_only:true,workflow,verified,status:run.status,conclusion:run.conclusion||null,run_id:run.id,completed_at:job?.completed_at||null});
  }
  if(body.action==='contentful_bcp_receipt'){
   // One bounded repository-artifact lookup covers scheduled, approved release
   // and manual BCP receipts; never traverse dozens of workflow runs.
   const scheduleWorkflow='m40-contentful-editorial-draft-handoff.yml';
   const [scheduleData,artifactData]=await Promise.all([
    github('actions/workflows/'+scheduleWorkflow+'/runs?branch=main&event=schedule&per_page=3'),
    github('actions/artifacts?per_page=100')
   ]);
   const runs=(scheduleData.workflow_runs||[]).filter(run=>
    Number.isSafeInteger(run.id)&&Number.isSafeInteger(run.run_attempt)&&
    run.head_branch==='main'&&run.event==='schedule'&&
    run.path==='.github/workflows/'+scheduleWorkflow);
   const recentJobs=await Promise.all(runs.map(run=>
    github('actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100')));
   let latestSchedule=null,latestFailure=null;
   for(const [i,run] of runs.entries()){
    const job=recentJobs[i].jobs?.find(j=>j.name==='reconcile-bcp');
    if(!latestSchedule)latestSchedule=job?{
     run_id:run.id,status:job.status,conclusion:job.conclusion||null,
     updated_at:run.updated_at}:{
     run_id:run.id,status:'not_executed',conclusion:'not_executed',
     updated_at:run.updated_at};
    if(!latestFailure&&['failure','cancelled','timed_out'].includes(job?.conclusion))
     latestFailure={run_id:run.id,completed_at:job.completed_at,status:job.conclusion};
   }
   const candidates=(artifactData.artifacts||[]).flatMap(artifact=>{
    if(artifact.expired||typeof artifact.name!=='string')return [];
    const match=artifact.name.match(/^bcp-verified-([0-9]+)-([0-9]+)-([0-9]+)-([0-9]{13})$/);
    if(!match)return [];
    const runId=Number(match[1]),attempt=Number(match[2]);
    const count=Number(match[3]),epoch=Number(match[4]);
    if(![runId,attempt,count,epoch].every(Number.isSafeInteger)||
     runId<1||attempt<1||count<1||artifact.workflow_run?.id!==runId||
     !Number.isFinite(Date.parse(artifact.created_at))||
     epoch>Date.parse(artifact.created_at))return [];
    return [{run_id:runId,attempt,records:count,epoch,
     receipt_created_at:artifact.created_at}];
   }).sort((a,b)=>b.epoch-a.epoch).slice(0,1);
   let lastSuccess=null;
   if(candidates.length){
    const candidate=candidates[0];
    const run=await github('actions/runs/'+candidate.run_id);
    if(run.status==='completed'&&run.conclusion==='success'&&run.head_branch==='main'&&
     run.run_attempt===candidate.attempt&&
     (run.event==='schedule'||run.event==='workflow_dispatch')&&
     [scheduleWorkflow,'payload-cms-ci.yml','payload-publication-release.yml'].some(
      workflow=>run.path==='.github/workflows/'+workflow)&&
     candidate.epoch>=Date.parse(run.created_at)){
     lastSuccess={run_id:candidate.run_id,records:candidate.records,
      verified_at:new Date(candidate.epoch).toISOString(),
      receipt_created_at:candidate.receipt_created_at,
      event:run.event,workflow:run.path,status:'BCP_READBACK_VERIFIED'};
    }
   }
   return json({read_only:true,dispatch_performed:false,workflow:scheduleWorkflow,
    schedule_minutes:30,last_success:lastSuccess,latest_failure:latestFailure,
    latest_schedule:latestSchedule,inspected_runs:runs.length,
    artifact_lookup_bounded:true});
  }

  if(body.action==='execution_diagnostic'){
   const workflow='sep01-durable-dispatch.yml';
   const [ref,runs]=await Promise.all([
    github('git/ref/heads/main'),
    github('actions/workflows/'+workflow+'/runs?per_page=5')
   ]);
   return json({gateway_version:gatewayVersion,read_only:true,dispatch_performed:false,
    repository_baseline:ref.object?.sha||null,workflow,
    runs:(Array.isArray(runs.workflow_runs)?runs.workflow_runs:[]).slice(0,5).map(run=>({
     run_id:run.id,status:run.status,conclusion:run.conclusion||null,
     url:typeof run.html_url==='string'&&run.html_url.startsWith('https://github.com/')?run.html_url:null
    })),
    message:'Read-only GitHub workflow inspection; no provider quota, write permission, or dispatch eligibility inferred.'});
  }
  // Narrow natural-language operational intent. Never infer production write approval,
  // a source, or a month from a broad all-source/five-year directive.
  if(body.action==='intelligence_classify'){
   const instruction=String(body.instruction||'').trim();
   if(!instruction||instruction.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(instruction))return json({error:'INVALID_REQUIREMENT'},422);
   if(!/\b(?:ingest(?:ion)?|backfill|historical|global alerts?|intelligence sources?)\b/i.test(instruction))
    return json({category:'not_intelligence',executable:false,reason:'NOT_INTELLIGENCE_OPERATION'});
   const sourceMatches=[
    /\b(?:fintech\s*news\s*singapore|FINTECHNEWS-SG-008)\b/i.test(instruction)?'FINTECHNEWS-SG-008':null,
    /\b(?:atlas\s*(?:technologies|payments|research)|ATLAS-APAC-009)\b/i.test(instruction)?'ATLAS-APAC-009':null
   ].filter(Boolean);
   const monthMatches=[...instruction.matchAll(/\b(202[1-6]-(?:0[1-9]|1[0-2]))\b/g)].map(m=>m[1]);
   const broad=/\b(?:all sources?|every source|five.year|5.year|36 topics?|activate all|entire archive|full backfill)\b/i.test(instruction);
   if(broad||sourceMatches.length!==1||monthMatches.length!==1)
    return json({category:'intelligence_operations',executable:false,reason:'OPERATION_SCOPE_REQUIRES_REVIEW',
      message:'Broad intelligence directives need a governed source-by-source coverage plan. No production job was queued.',
      supported_sources:['FINTECHNEWS-SG-008','ATLAS-APAC-009'],max_sources:1,max_months:1});
   const source_id=sourceMatches[0],month=monthMatches[0],mode='plan';
   const main=await github('git/ref/heads/main');
   const workflow='gpir-governed-intelligence-operations.yml';
   const planData=[owner,main.object.sha,workflow,source_id,month,mode];
   const plan_id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(planData)))),x=>x.toString(16).padStart(2,'0')).join('');
   return json({category:'intelligence_operations',executable:true,source_id,month,mode,plan_id,
     requires_owner_approval:true,production_mutation:false,
     message:'One approved source-month plan only. No production ingestion or provider charge.'});
  }
  // Governed GPIR intelligence operations use the existing historical acquisition
  // script through a dedicated, allowlisted GitHub workflow. No arbitrary commands.
  if(['intelligence_plan','intelligence_submit','intelligence_status'].includes(body.action)){
   const workflow='gpir-governed-intelligence-operations.yml';
   if(body.action==='intelligence_status'){
    const runs=await github('actions/workflows/'+workflow+'/runs?per_page=30');
    const entries=(Array.isArray(runs.workflow_runs)?runs.workflow_runs:[]).slice(0,30).map(run=>({
     run_id:run.id, title:String(run.display_title||'').slice(0,160),
     status:run.status,conclusion:run.conclusion||null,
     url:typeof run.html_url==='string'&&run.html_url.startsWith('https://github.com/')?run.html_url:null,
     created_at:run.created_at
    }));
    return json({gateway_version:gatewayVersion,operations:entries,read_only:true});
   }
   const source=String(body.source_id||'');
   const month=String(body.month||'');
   const mode=String(body.mode||'plan');
   if(!['FINTECHNEWS-SG-008','ATLAS-APAC-009'].includes(source))return json({error:'SOURCE_NOT_APPROVED'},422);
   if(!/^202[1-6]-(0[1-9]|1[0-2])$/.test(month)||month<'2021-11'||month>'2026-11')return json({error:'MONTH_NOT_APPROVED'},422);
   if(!['plan','apply'].includes(mode))return json({error:'MODE_NOT_APPROVED'},422);
   const main=await github('git/ref/heads/main');
   const planData=[owner,main.object.sha,workflow,source,month,mode];
   const planId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(planData)))),x=>x.toString(16).padStart(2,'0')).join('');
   if(body.action==='intelligence_plan')return json({
    gateway_version:gatewayVersion,plan_id:planId,source_id:source,month,mode,
    execution:'EXISTING_GOVERNED_SOURCE_MONTH_BACKFILL',max_sources:1,max_months:1,
    production_mutation:mode==='apply',provider_api_spend:false,
    requires_owner_approval:true,review_required:mode==='apply',
    scope_limit:'Only two previously verified historical sources; this is not all-source activation or five-year acceptance.'
   });
   if(body.plan_id!==planId||body.confirmation!=='AUTHORIZE_ONE_INTELLIGENCE_OPERATION')return json({error:'OPERATION_APPROVAL_REQUIRED_OR_STALE'},403);
   // Check recent workflow runs before dispatch. Existing pipeline dedupe and
   // workflow concurrency are additional safeguards, not an atomic lock.
   const prior=await github('actions/workflows/'+workflow+'/runs?per_page=100');
   const title='GPIR intelligence '+mode+' '+source+' '+month;
   const duplicate=(prior.workflow_runs||[]).find(run=>run.display_title===title);
   if(duplicate)return json({error:'OPERATION_ALREADY_DISPATCHED',run_id:duplicate.id,url:duplicate.html_url||null},409);
   await github('actions/workflows/'+workflow+'/dispatches','POST',{ref:'main',inputs:{mode,source_id:source,month}});
   return json({status:'DISPATCH_REQUESTED',source_id:source,month,mode,workflow,
    receipt_pending:true,message:'GitHub accepted dispatch. Verify actual run and outcome via intelligence_status.'},202);
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
   if(body.execution_route!==undefined&&body.execution_route!=='bounded_sep01')return json({error:'EXECUTION_ROUTE_NOT_AUTHORIZED'},422);
   const intent=classifyRequirement(instruction,requestedScope);
   const {category,kind,sensitive}=intent;
   const preview={gateway_version:gatewayVersion,execution_route:'bounded_sep01',provider_route:'gemini_openrouter_runtime_verified',category,kind,sensitive,executable:false,read_only:true,max_file_bytes:maxFileBytes};
   const block=(reason,candidates=[])=>plannedSubmission?json({error:reason},409):json({...preview,reason,candidates});
   if(intent.reason)return block(intent.reason);
   if(instruction.replace(/\s+/g,' ').length>1000)return block('WORKER_INSTRUCTION_LIMIT');
   const ref=await github('git/ref/heads/main');
   const tree=await github('git/trees/'+encodeURIComponent(ref.object.sha)+'?recursive=1');
   if(tree.truncated||!Array.isArray(tree.tree))return block('REPOSITORY_DISCOVERY_INCOMPLETE');
   const ranked=rankTargets(tree.tree,intent);
   const eligible=ranked.filter(item=>item.size<=maxFileBytes).slice(0,8);
   if(ranked[0]?.size>maxFileBytes&&(!eligible.length||ranked[0].score>=eligible[0].score))return block('MATCH_EXCEEDS_FILE_LIMIT',eligible);
   const target=eligible[0]&&(eligible.length===1||eligible[0].score>eligible[1].score)?eligible[0].path:null;
   const planId=target?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([owner,ref.object.sha,target,instruction])))),byte=>byte.toString(16).padStart(2,'0')).join(''):null;
   if(!plannedSubmission){
    if(!target)return block(eligible.length?'AMBIGUOUS_COMPONENT':'NO_SAFE_TARGET_IDENTIFIED',eligible);
    return json({...preview,reason:'OWNER_APPROVAL_REQUIRED',candidates:eligible,review_required:true,auto_suggested_target:target,plan_id:planId});
   }
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
   const gates={subscription:{status:'OWNER_REPORTED_PRO_PLUS',verified_by_github:false},
    api_eligibility:{status:eligible?'CONFIGURED_NOT_PROVIDER_VERIFIED':'UNVERIFIED',verified:false},
    credential:{status:writeConfigured?'CONFIGURED_NOT_PERMISSION_VERIFIED':'MISSING',verified:false},
    allowance:{status:costApproved?'OWNER_APPROVAL_FLAG_SET_ALLOWANCE_UNVERIFIED':'NOT_AUTHORIZED',verified:false},
    owner_approval:{status:'REQUIRED_PER_TASK',verified:false}};
   return json({read_only_monitoring:true,submission_available:false,submission_gate:'PROVIDER_AND_ALLOWANCE_VERIFICATION_REQUIRED',gates,
    eligibility_verified:false,owner_cost_approved:costApproved,write_credential_configured:writeConfigured,
    reason:'PROVIDER_AND_ALLOWANCE_VERIFICATION_REQUIRED'});
  }
  // Repository-wide coding-agent delegation. The existing bounded SEP worker is
  // unchanged. Multi-file work is PR-only and never grants production release.
  if(body.action==='agent_multifile_plan'||body.action==='agent_multifile_submit'){
   const instruction=String(body.instruction||'').trim();
   if(!instruction||instruction.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(instruction))return json({error:'INVALID_REQUIREMENT'},422);
   const ref=await github('git/ref/heads/main');
   const baseSha=String(ref?.object?.sha||'');
   if(!/^[a-f0-9]{40}$/.test(baseSha))return json({error:'INVALID_BASE_REF'},502);
   const planData=[owner,baseSha,'github_copilot','multifile_pr_only',instruction];
   const planId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(planData)))),b=>b.toString(16).padStart(2,'0')).join('');
   const enabled=env('SEP03_AGENT_TASK_SUBMISSION_ENABLED')==='true';
   const eligible=env('SEP03_AGENT_PLAN_ELIGIBLE')==='true';
   const costApproved=env('SEP03_AGENT_COST_APPROVED')==='true';
   const token=env('SEP03_GITHUB_AGENT_WRITE_TOKEN').trim();
   const configured=/^(github_pat_|ghp_)[\x21-\x7e]{10,500}$/.test(token);
   const available=false; // Fail closed: configuration flags do not prove provider entitlement, token permission or remaining allowance.
   const reason='PROVIDER_AND_ALLOWANCE_VERIFICATION_REQUIRED';
   if(body.action==='agent_multifile_plan')return json({gateway_version:gatewayVersion,
    category:'repository_wide_development',executor:'github_copilot',plan_id:planId,
    base_sha:baseSha,executable:available,reason,requires_owner_approval:true,
    scope:'MULTI_FILE_PR_ONLY',production_deployment:false,
    cost_policy:'Existing owner-approved GitHub agent entitlement only; no API provider fallback',
    review_required:true,message:'Coding agent may inspect repository and propose coordinated changes on a PR. No merge, production release, secrets, or unrestricted operational execution.'});
   if(!available)return json({error:reason||'AGENT_NOT_AVAILABLE'},403);
   if(body.confirmation!=='AUTHORIZE_ONE_GITHUB_MULTIFILE_TASK'||body.plan_id!==planId)
    return json({error:'MULTIFILE_APPROVAL_REQUIRED_OR_STALE'},403);
   const prompt='GPIR owner-authorized multi-file repository development task. Inspect the complete repository and existing architecture. Implement only the approved requirement using the smallest coherent set of files. Preserve Supabase identity and source governance, Payload primary and Contentful BCP, 95% intelligence publication threshold, historical/live separation, security, and existing routes. Run relevant tests and provide a detailed PR with evidence. Do not access or print secrets, alter credentials, merge, deploy, execute production mutations, activate sources, or initiate paid external provider calls. Reuse existing open PRs where appropriate rather than duplicate work. Requirement: '+instruction;
   const response=await fetch('https://api.github.com/agents/repos/krishnan-vishal/krishnan-vishal.github.io/tasks',{
    method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
     'X-GitHub-Api-Version':'2026-03-10','User-Agent':'GPIR-SEP04-Owner-Multifile','Content-Type':'application/json'},
    body:JSON.stringify({prompt,base_ref:'main',create_pull_request:true})
   });
   if(response.status!==201){console.error('SEP04_MULTIFILE_AGENT_HTTP',response.status);
    return json({error:'AGENT_TASK_CREATION_FAILED',upstream_status:response.status},502)}
   const task=await response.json();
   const id=String(task?.id||'');
   const url=String(task?.html_url||'');
   if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id))return json({error:'AGENT_TASK_RESPONSE_INVALID'},502);
   return json({task_id:id,state:String(task?.state||'queued'),url:url.startsWith('https://github.com/')?url:null,
    provider:'github_copilot',scope:'MULTI_FILE_PR_ONLY',requires_review:true,production_deployment:false,
    receipt_status:'AGENT_ACCEPTED_NOT_COMPLETED'},201);
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
   if(file.type!=='file'||file.size>maxFileBytes)return json({error:'FILE_NOT_ELIGIBLE'},422);
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
