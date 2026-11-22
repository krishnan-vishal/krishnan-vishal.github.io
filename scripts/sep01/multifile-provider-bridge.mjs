// Stage 3 bounded Gemini/OpenRouter bridge. Deliberately dormant until a separate owner release.
import {validateMultifileManifest} from './multifile-governance.mjs';
import {createMultifileRunner} from './multifile-runner.mjs';
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
import {requestWithIndependentFallback} from './independent-provider-router.mjs';

const failureStatuses=new Set(['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE','PROVIDER_RESPONSE_INVALID']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createMultifileProviderBridge({store,root,runTests,ownerUserId,gemini,openrouter,executionEnabled=false,providerSpendCapVerified=false,providerSpendCapUsd=0}={}){
 if(!store||typeof store.get!=='function'||typeof store.compareAndSet!=='function'||typeof runTests!=='function'||typeof ownerUserId!=='string'||!ownerUserId||!root)throw Error('MULTIFILE_BRIDGE_CONFIGURATION_INVALID');
 // Configured provider credentials never authorize a job. Persisted, revisioned owner approval is mandatory.
 const geminiEdit=gemini?.apiKey&&gemini?.model?createGeminiCodeEditor(gemini):null;
 const openrouterEdit=openrouter?.apiKey&&openrouter?.model?createOpenRouterCodeEditor(openrouter):null;
 return async function execute(jobId){
  if(!executionEnabled)throw Error('MULTIFILE_EXECUTION_NOT_ENABLED');
  if(providerSpendCapVerified!==true||!Number.isFinite(providerSpendCapUsd)||providerSpendCapUsd<0)throw Error('MULTIFILE_EXTERNAL_SPEND_CAP_REQUIRED');
  if(typeof jobId!=='string'||!/^sep01-owner-[a-z0-9-]{6,60}$/.test(jobId))throw Error('MULTIFILE_JOB_ID_INVALID');
  // Service-role-only Supabase CAS store; NEVER use a browser/client-supplied approval object.
  const job=await store.get(jobId);
  const approval=job?.multifile_approval;
  if(!job||job.job_id!==jobId||job.owner_user_id!==ownerUserId||job.execution_route!=='bounded_multifile_v1'||job.status!=='CLAIMED'||!Number.isSafeInteger(job.revision)||job.revision<2||!job.single_attempt||!job.cost_approved||!approval)throw Error('MULTIFILE_PERSISTED_APPROVAL_REQUIRED');
  if(approval.external_cap_verified!==true||!Number.isFinite(approval.max_cost_usd)||approval.max_cost_usd<0||approval.max_cost_usd>providerSpendCapUsd)throw Error('MULTIFILE_SPEND_APPROVAL_REQUIRED');
  if(approval.status!=='APPROVED'||approval.owner_user_id!==ownerUserId||approval.job_id!==jobId||approval.branch!==job.branch||approval.plan_id!==job.plan_id||approval.base_sha!==job.base_sha||approval.instruction!==job.instruction||approval.cost_approved!==true||approval.single_attempt!==true||!Number.isSafeInteger(approval.revision)||approval.revision<1||!Number.isSafeInteger(approval.max_provider_requests)||approval.max_provider_requests<2||approval.max_provider_requests>3||typeof approval.approved_at!=='string'||!/^202\d-\d\d-\d\dT/.test(approval.approved_at))throw Error('MULTIFILE_PERSISTED_APPROVAL_REQUIRED');
  if(!Array.isArray(job.manifest)||job.manifest.length<2||job.manifest.length>3||!same(job.locked_paths,job.manifest.map(x=>x.path))||!same(approval.locked_paths,job.locked_paths))throw Error('MULTIFILE_PERSISTED_LOCKS_INVALID');
  if(!geminiEdit&&!openrouterEdit)throw Error('MULTIFILE_PROVIDER_NOT_CONFIGURED');
  // Atomically consume the single provider-execution opportunity before any API request.
  // A worker crash or recovery must NEVER spend again for the same job identity.
  if(job.provider_attempt_reserved===true)throw Error('MULTIFILE_PROVIDER_ATTEMPT_ALREADY_CONSUMED');
  const reserved=await store.compareAndSet(jobId,'CLAIMED',{
   status:'CLAIMED',provider_attempt_reserved:true,
   provider_attempt_reserved_at:new Date().toISOString(),
   provider_attempt_limit:approval.max_provider_requests
  });
  if(!reserved||reserved.provider_attempt_reserved!==true||reserved.status!=='CLAIMED')throw Error('MULTIFILE_PROVIDER_ATTEMPT_RESERVATION_FAILED');
  const plan=validateMultifileManifest({files:job.locked_paths,tree:job.manifest.map(item=>({type:'blob',path:item.path,size:item.size,sha:item.blob_sha})),baseSha:job.base_sha,instruction:job.instruction,ownerId:ownerUserId});
  if(plan.plan_id!==job.plan_id||!same(plan.manifest,job.manifest))throw Error('MULTIFILE_PERSISTED_PLAN_STALE');
  // Existing adapters accept at most 50k characters; reject before charging any provider.
  if(plan.manifest.some(file=>file.size>50000))throw Error('MULTIFILE_PROVIDER_INPUT_TOO_LARGE');
  let apiRequests=0;
  const modelAttempts=[];
  const requestEdit=async args=>{
   if(apiRequests>=approval.max_provider_requests)return {status:'QUOTA_EXHAUSTED'};
   const remaining=approval.max_provider_requests-apiRequests;
   const outcome=await requestWithIndependentFallback({
    geminiModels:geminiEdit?[gemini.model]:[],
    geminiEdit:async()=>geminiEdit(args),
    allowOpenRouter:!!openrouterEdit&&(remaining>1||!geminiEdit),
    openrouterEdit:openrouterEdit?()=>openrouterEdit(args):undefined,
    onAttempt:item=>{
     apiRequests++;
     modelAttempts.push({provider:item.provider,model:item.model||null,status:item.status});
     if(apiRequests>approval.max_provider_requests)throw Error('MULTIFILE_PROVIDER_BUDGET_EXHAUSTED');
    }
   });
   const result=outcome.result;
   return result?.status==='EDIT'||failureStatuses.has(result?.status)?result:{status:'PROVIDER_RESPONSE_INVALID'};
  };
  const runner=createMultifileRunner({root,plan,requestEdit,runTests,maxProviderRequests:3});
  const result=await runner({job,approvedPlanId:job.plan_id,approvedBaseSha:job.base_sha,branch:job.branch,providerBudgetApproved:true,verifiedApproval:approval});
  return {...result,provider_requests:apiRequests,model_attempts:modelAttempts};
 };
}
