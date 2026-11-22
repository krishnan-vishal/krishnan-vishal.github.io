// SEP-01 GitHub Actions private worker: only existing queued jobs, no deployment.
// Requires pre-authorized Supabase service key and Gemini API key.
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {readFileSync,readdirSync} from 'node:fs';
import {createDurableJobStore} from './durable-job-store.mjs';
import {createDurableWorker} from './durable-worker.mjs';
import {createGeminiCodeEditor,discoverGeminiTextModels} from './gemini-code-editor.mjs';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
import {createCodexCliEditor} from './codex-cli-editor.mjs';
import {requestWithIndependentFallback} from './independent-provider-router.mjs';
import {rankUsageAwareRoutes,recordQuotaOutcome} from './usage-aware-router.mjs';
import {createCodingRunner} from './coding-runner.mjs';
import {createMultifileProviderBridge} from './multifile-provider-bridge.mjs';
import {createMultifileCheckpointRecovery} from './multifile-checkpoint-recovery.mjs';
const root=process.env.SEP01_WORKTREE,jobId=process.env.SEP01_JOB_ID;
if(!root)throw Error('SEP01_ISOLATED_WORKTREE_REQUIRED');
if(!process.env.GITHUB_ACTIONS||!process.env.GITHUB_REPOSITORY)throw Error('GITHUB_ACTIONS_REQUIRED');
const required=['SEP01_JOB_ID','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length)throw Error('SEP01_MISSING_CONFIGURATION: '+missing.join(', '));
const store=createDurableJobStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
const gitRaw=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000});
const git=(...args)=>gitRaw(...args).trim();
const sourceRoot=process.cwd();
const expectedFixture='SEP-01 durable checkpoint acceptance fixture.\nSTATE: CHECKPOINT_VERIFIED\n';
const expectedSep02Fixture='SEP-02 bounded provider failover acceptance fixture.\nSTATE: CHECKPOINT_VERIFIED\n';
function validateJobOutput(job,read=path=>readFileSync(join(root,path),'utf8')){
 if(job.scope==='fixture'){
  const path=job.locked_paths?.[0];
  const expected=path==='scripts/sep01/acceptance-fixture.txt'?expectedFixture:
   path==='scripts/sep01/sep02-acceptance-fixture.txt'&&job.acceptance_series==='SEP02'&&job.single_attempt===true?expectedSep02Fixture:null;
  if(!expected)throw Error('FIXTURE_PATH_NOT_AUTHORIZED');
  // Permit only line-ending and one terminal-newline variation. Never accept paraphrases or extra text.
  const actual=read(path).replace(/\r\n/g,'\n');
  if(actual.replace(/\n?$/,'\n')!==expected){
   console.error(JSON.stringify({event:'SEP01_FIXTURE_MISMATCH',actual_length:actual.length,expected_length:expected.length,actual_lines:actual.split('\n').length}));
   throw Error('ACCEPTANCE_FIXTURE_VALIDATION_FAILED');
  }
 }
}
function runRegressionTests(job){
 validateJobOutput(job);
 if(job.scope==='development'){
  const path=job.locked_paths?.[0];
  const eligible=typeof path==='string' && /^(?:docs\/[a-zA-Z0-9/_-]+\.md|assets\/css\/[a-zA-Z0-9/_-]+\.css)$/.test(path);
  if(job.locked_paths?.length!==1||!eligible||path.includes('..'))throw Error('DEVELOPMENT_PATH_NOT_AUTHORIZED');
  const file=readFileSync(join(root,path),'utf8');
  if(!file.trim()||Buffer.byteLength(file)>100000)throw Error('DEVELOPMENT_OUTPUT_INVALID');
  if(path.endsWith('.css')&&/\b(?:@import|expression\s*\(|javascript\s*:)/i.test(file))throw Error('UNSAFE_STYLESHEET_OUTPUT');
 }

 const directory=join(sourceRoot,'scripts','sep01');
 const tests=readdirSync(directory).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>join('scripts','sep01',name));
 if(!tests.length)throw Error('SEP01_TESTS_NOT_FOUND');
 execFileSync(process.execPath,['--test',...tests],{cwd:sourceRoot,timeout:120000,stdio:'pipe'});
}
function runMultifileRegressionTests(job){
 if(job.execution_route!=='bounded_multifile_v1'||!Array.isArray(job.locked_paths)||job.locked_paths.length<2||job.locked_paths.length>3)throw Error('MULTIFILE_JOB_SCOPE_INVALID');
 let combinedBytes=0;
 for(const path of job.locked_paths){
  if(typeof path!=='string'||!/^(?:docs\/[a-zA-Z0-9/_-]+\.md|assets\/css\/[a-zA-Z0-9/_-]+\.css)$/.test(path)||path.includes('..')||path.includes('//'))throw Error('MULTIFILE_PATH_NOT_AUTHORIZED');
  const file=readFileSync(join(root,path),'utf8');
  const bytes=Buffer.byteLength(file);
  if(!file.trim()||bytes>100000)throw Error('MULTIFILE_OUTPUT_INVALID');
  combinedBytes+=bytes;
  if(path.endsWith('.css')&&/\b(?:@import|expression\s*\(|javascript\s*:)/i.test(file))throw Error('UNSAFE_STYLESHEET_OUTPUT');
 }
 if(combinedBytes>300000)throw Error('MULTIFILE_TOTAL_BYTES_EXCEEDED');
 const files=readdirSync(join(sourceRoot,'scripts','sep01')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>join('scripts','sep01',name));
 if(!files.length)throw Error('SEP01_TESTS_NOT_FOUND');
 execFileSync(process.execPath,['--test',...files],{cwd:sourceRoot,timeout:120000,stdio:'pipe'});
}
const multifileRecovery=createMultifileCheckpointRecovery({root,validateCheckpoint:async({commit,job})=>{
 if(git('rev-parse','HEAD')!==commit||git('status','--porcelain'))return false;
 runMultifileRegressionTests(job);
 return true;
}});
const verifyCheckpoint=async(commit,job)=>{
 if(job.execution_route==='bounded_multifile_v1')return multifileRecovery.verify(commit,job);
 if(!/^[a-f0-9]{40}$/.test(commit||'')||!/^sep01\/jobs\/[a-zA-Z0-9._-]+$/.test(job.branch))return false;
 git('fetch','--force','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
 if(git('rev-parse','refs/remotes/origin/'+job.branch)!==commit||git('cat-file','-t',commit)!=='commit')return false;
 const paths=git('diff-tree','--no-commit-id','--name-only','-r',commit).split('\n').filter(Boolean);
 if(paths.length!==1||paths[0]!==job.locked_paths[0])return false;
 if(git('log','-1','--format=%s',commit)!=='SEP-01: bounded authorized coding checkpoint')return false;
 try{
  validateJobOutput(job,path=>gitRaw('show',commit+':'+path));
  return true;
 }catch{return false;}
};
const recoverCheckpoint=async job=>{
 if(job.execution_route==='bounded_multifile_v1')return multifileRecovery.recover(job);
 if(!['CLAIMED','CHECKPOINTED','QUOTA_PAUSED'].includes(job.status))return null;
 git('fetch','--force','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
 const commit=git('rev-parse','refs/remotes/origin/'+job.branch);
 if(!await verifyCheckpoint(commit,job))return null;
 runRegressionTests(job);
 return {commit,step:'fresh runner verified remote checkpoint and tests without model execution'};
};
const execute=async(job)=>{
 if(job.execution_route==='bounded_multifile_v1'){
  // Owner release, verified account-side budget and the existing service-role CAS claim are all required.
  // All flags default to false. This PR does not configure them or authorize provider spend.
  const bridge=createMultifileProviderBridge({
   store,root,ownerUserId:process.env.SEP01_OWNER_USER_ID,
   runTests:async()=>runMultifileRegressionTests(job),
   gemini:process.env.GEMINI_API_KEY&&process.env.SEP01_GEMINI_MODEL?{apiKey:process.env.GEMINI_API_KEY,model:process.env.SEP01_GEMINI_MODEL}:null,
   openrouter:process.env.OPENROUTER_API_KEY&&process.env.SEP01_OPENROUTER_MODEL?{apiKey:process.env.OPENROUTER_API_KEY,model:process.env.SEP01_OPENROUTER_MODEL}:null,
   executionEnabled:process.env.SEP01_MULTIFILE_EXECUTION_ENABLED==='true',
   providerSpendCapVerified:process.env.SEP01_MULTIFILE_SPEND_CAP_VERIFIED==='true',
   providerSpendCapUsd:Number(process.env.SEP01_MULTIFILE_MAX_SPEND_USD||0)
  });
  const result=await bridge(job.job_id);
  if(result.status!=='SUCCESS')return result;
  git('push','--porcelain','origin',result.commit+':refs/heads/'+job.branch);
  if(!await verifyCheckpoint(result.commit,job))throw Error('MULTIFILE_REMOTE_CHECKPOINT_NOT_VERIFIED');
  return {...result,step:'remote multi-file checkpoint verified',model_attempts:result.model_attempts};
 }

 if(job.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job.scope))throw Error('SENSITIVE_JOB_NOT_ALLOWED');
 if(job.locked_paths.length!==1||!job.instruction)throw Error('JOB_INSTRUCTION_OR_PATH_MISSING');
 if(job.scope!=='fixture'&&job.scope!=='development')throw Error('JOB_SCOPE_NOT_AUTHORIZED');
 if(job.scope==='fixture'&&job.locked_paths[0]!=='scripts/sep01/acceptance-fixture.txt'&&!(job.locked_paths[0]==='scripts/sep01/sep02-acceptance-fixture.txt'&&job.acceptance_series==='SEP02'&&job.single_attempt===true))throw Error('FIXTURE_PATH_NOT_AUTHORIZED');
 if(job.scope==='development'&&(!/^(?:docs\/[a-zA-Z0-9/_-]+\.md|assets\/css\/[a-zA-Z0-9/_-]+\.css)$/.test(job.locked_paths[0])||job.locked_paths[0].includes('..')))throw Error('DEVELOPMENT_PATH_NOT_AUTHORIZED');
 if(job.branch!==git('branch','--show-current'))throw Error('JOB_BRANCH_CHECKOUT_REQUIRED');
 const key=process.env.GEMINI_API_KEY;
 const independentModel=(process.env.SEP01_OPENROUTER_MODEL||'').trim();
 const allowOpenRouter=Boolean(process.env.OPENROUTER_API_KEY&&/^[A-Za-z0-9_.:/-]+$/.test(independentModel));
 const codexModel=(process.env.SEP01_CODEX_MODEL||'').trim();
 const codexConfigured=process.env.SEP01_CODEX_ENABLED==='true'&&process.env.SEP01_CODEX_AUTH_VERIFIED==='true'&&/^[-A-Za-z0-9_.]+$/.test(codexModel);
 // The existing adapter accepts only SEP fixture paths. Probe runner login without a model request.
 const allowCodex=codexConfigured&&job.scope==='fixture'&&(()=>{
  try{
   execFileSync('codex',['login','status'],{stdio:'ignore',timeout:5000,env:{PATH:process.env.PATH,HOME:process.env.HOME,CODEX_HOME:process.env.CODEX_HOME}});
   return true;
  }catch{return false;}
 })();
 // Only an explicitly configured independent route may be used; no provider-wide blind retry.
 let discovery;
 try{
  discovery=key?.trim()
   ?await discoverGeminiTextModels({apiKey:key,preferred:process.env.SEP01_GEMINI_MODEL,maxCandidates:4})
   :{models:[],preferredMatched:false};
 }catch(error){
  // Only transport availability/quota failures permit independent fallback.
  // Authentication, malformed discovery and configuration failures stay fail-closed.
  const message=String(error?.message||'');
  if(!/^GEMINI_MODEL_DISCOVERY_HTTP_(429|500|502|503|504)$/.test(message))throw error;
  discovery={models:[],preferredMatched:false};
  console.log(JSON.stringify({event:'SEP01_GEMINI_DISCOVERY_UNAVAILABLE',status:message}));
 }
 const selected=discovery.models;
 const routeReadiness={
  gemini:{ready:Boolean(key&&selected.length)},
  openrouter:{ready:allowOpenRouter},
  codex:{ready:allowCodex}
 };
 const routeCandidates=[
  {id:'gemini',agent_id:'gemini',approved:true,healthy:true,capabilities:['code'],tier:'PUBLIC',estimated_cost:0,remaining_quota:null,quota_failure_detection_verified:true},
  {id:'codex',agent_id:'codex',approved:allowCodex,healthy:true,capabilities:['code'],tier:'PUBLIC',estimated_cost:0,remaining_quota:null,quota_failure_detection_verified:true},
  {id:'openrouter',agent_id:'openrouter',approved:allowOpenRouter,healthy:true,capabilities:['code'],tier:'PUBLIC',estimated_cost:0,remaining_quota:null,quota_failure_detection_verified:true}
 ];
 const eligible=rankUsageAwareRoutes(job,routeCandidates,routeReadiness);
 const eligibleIds=new Set(eligible.map(route=>route.id));
 const fallbackAllowed=eligibleIds.has('openrouter');
 const codexAllowed=eligibleIds.has('codex');
 const selectedModels=eligibleIds.has('gemini')?selected.slice(0,fallbackAllowed||codexAllowed||job.scope==='fixture'?1:4):[];
 console.log(JSON.stringify({event:'SEP01_USAGE_AWARE_ROUTES',eligible:[...eligibleIds],gemini_models:selectedModels.length,openrouter_authorized:fallbackAllowed}));
 console.log(JSON.stringify({event:'SEP01_GEMINI_MODEL_CANDIDATES',models:selectedModels,preferred_matched:discovery.preferredMatched,bounded_attempts:selectedModels.length,independent_fallback_enabled:fallbackAllowed}));
 const attempts=[];
 const requestEdit=async args=>{
  if((fallbackAllowed||codexAllowed||job.scope==='fixture')&&attempts.length)return {status:'PROVIDER_RESPONSE_INVALID'};
  const routed=await requestWithIndependentFallback({
   geminiModels:selectedModels,
   geminiEdit:model=>createGeminiCodeEditor({apiKey:key,model})(args),
   allowCodex:codexAllowed,
   codexEdit:codexAllowed?()=>createCodexCliEditor({model:codexModel,enabled:true,authenticated:true})(args):undefined,
   allowOpenRouter:fallbackAllowed,
   openrouterEdit:fallbackAllowed?()=>createOpenRouterCodeEditor({apiKey:process.env.OPENROUTER_API_KEY,model:independentModel})(args):undefined,
   onAttempt:item=>{
    item.model??=item.provider==='openrouter'?independentModel:codexModel;
    attempts.push(item);
    const route=routeCandidates.find(candidate=>candidate.id===item.provider);
    if(route)Object.assign(route,recordQuotaOutcome(route,item.status));
    console.log(JSON.stringify({event:'SEP01_PROVIDER_RESULT',provider:item.provider,model:item.model||'approved-openrouter',status:item.status,attempt:attempts.length,max_attempts:selectedModels.length+(codexAllowed?1:0)+(fallbackAllowed?1:0)}));
   }
  });
  return routed.result;
 };
 const run=createCodingRunner({root,allowedPaths:job.locked_paths,runTests:async()=>runRegressionTests(job),requestEdit});
 const result=await run({job,provider:{id:'gemini/authorized-text-model'}});
 if(result.status!=='SUCCESS')return {...result,model_attempts:attempts};
 // The commit must be remotely durable before Supabase can mark CHECKPOINTED.
 git('push','--porcelain','origin',result.commit+':refs/heads/'+job.branch);
 if(!await verifyCheckpoint(result.commit,job))throw Error('REMOTE_CHECKPOINT_NOT_DURABLE');
 return {...result,provider:attempts.at(-1)?.provider,model_attempts:attempts};
};
const worker=createDurableWorker({store,execute,verifyCheckpoint,recoverCheckpoint});
const result=await worker(jobId);
console.log(JSON.stringify({job_id:jobId,status:result.status,checkpoint:result.job?.checkpoint_commit||null,recovered:result.status==='RECOVERED_CHECKPOINT'}));
if(!['CHECKPOINTED','RECOVERED_CHECKPOINT'].includes(result.status))process.exitCode=2;
