// Stage 3 multi-file transaction runner. Not wired to the production dispatcher.
// Every provider request is separately bounded by the caller's explicit approved budget.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,realpathSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {assertMultifileCheckpoint} from './multifile-governance.mjs';

const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
const lines=value=>value.split('\n').filter(Boolean);
const hash=value=>createHash('sha256').update(value).digest('hex');
const transient=new Set(['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE','PROVIDER_RESPONSE_INVALID']);
export function createMultifileRunner({root,plan,requestEdit,runTests,maxProviderRequests=3}){
 if(typeof requestEdit!=='function'||typeof runTests!=='function'||!Number.isSafeInteger(maxProviderRequests)||maxProviderRequests<1||maxProviderRequests>3)throw Error('MULTIFILE_RUNNER_CONFIG_INVALID');
 if(!plan||plan.enabled!==false||plan.execution_route!=='bounded_multifile_v1'||plan.manifest?.length<2||plan.manifest?.length>3)throw Error('MULTIFILE_PLAN_REQUIRED');
 const base=realpathSync(root);
 const allowed=plan.manifest.map(item=>item.path);
 function safeFile(path){
  if(!allowed.includes(path)||isAbsolute(path)||path.split(/[\\/]/).includes('..'))throw Error('MULTIFILE_PATH_NOT_AUTHORIZED');
  const absolute=resolve(base,path),rel=relative(base,absolute);
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||realpathSync(absolute)!==absolute||!statSync(absolute).isFile())throw Error('MULTIFILE_UNSAFE_FILE');
  return absolute;
 }
 return async function execute({job,approvedPlanId,approvedBaseSha,branch,providerBudgetApproved=false,verifiedApproval=null}){
  // No call to any model is permitted unless the owner-approved plan and budget are explicit.
  if(!providerBudgetApproved||!verifiedApproval||verifiedApproval.status!=='APPROVED'||verifiedApproval.owner_user_id!==job?.owner_user_id||verifiedApproval.job_id!==job?.job_id||verifiedApproval.plan_id!==approvedPlanId||verifiedApproval.base_sha!==approvedBaseSha||verifiedApproval.branch!==branch||verifiedApproval.single_attempt!==true||verifiedApproval.cost_approved!==true||!Number.isSafeInteger(verifiedApproval.max_provider_requests)||verifiedApproval.max_provider_requests<allowed.length||verifiedApproval.max_provider_requests>maxProviderRequests||!job?.owner_user_id||!job?.single_attempt||!job?.cost_approved||!job?.plan_id||job.plan_id!==approvedPlanId||approvedPlanId!==plan.plan_id||approvedBaseSha!==plan.base_sha)throw Error('MULTIFILE_OWNER_APPROVAL_REQUIRED');
  if(job.execution_route!=='bounded_multifile_v1'||job.locked_paths?.length!==allowed.length||job.locked_paths.some(path=>!allowed.includes(path))||job.branch!==branch||!/^sep01\/jobs\/[a-zA-Z0-9._-]+$/.test(branch))throw Error('MULTIFILE_JOB_SCOPE_INVALID');
  if(git(base,['branch','--show-current'])!==branch||git(base,['rev-parse','HEAD'])!==approvedBaseSha||git(base,['status','--porcelain']))throw Error('MULTIFILE_WORKTREE_NOT_CLEAN');
  const before=new Map(allowed.map(path=>[path,readFileSync(safeFile(path),'utf8')]));
  for(const item of plan.manifest){const raw=readFileSync(safeFile(item.path));if(raw.length!==item.size||git(base,['hash-object','--',item.path])!==item.blob_sha)throw Error('MULTIFILE_SOURCE_BLOB_STALE');}
  const expectedPlanHash=hash(JSON.stringify([job.owner_user_id,approvedBaseSha,job.instruction,plan.manifest]));
  if(job.instruction!==verifiedApproval.instruction||expectedPlanHash!==approvedPlanId||JSON.stringify(verifiedApproval.locked_paths)!==JSON.stringify(allowed)||!Number.isSafeInteger(verifiedApproval.revision)||verifiedApproval.revision<1)throw Error('MULTIFILE_APPROVAL_STALE');
  const totalInput=[...before.values()].reduce((sum,value)=>sum+Buffer.byteLength(value),0);
  if(totalInput>300000||[...before.values()].some(value=>Buffer.byteLength(value)>100000))throw Error('MULTIFILE_INPUT_LIMIT');
  const changed=[];
  let attempts=0,committed=false;
  try{
   for(const path of allowed){
    if(attempts>=verifiedApproval.max_provider_requests)throw Error('MULTIFILE_PROVIDER_BUDGET_EXHAUSTED');
    attempts++;
    const edit=await requestEdit({job,path,content:before.get(path),attempt:attempts,maxProviderRequests});
    if(transient.has(edit?.status))return {status:edit.status,provider_requests:attempts};
    if(edit?.status!=='EDIT'||typeof edit.content!=='string'||!edit.content.trim()||Buffer.byteLength(edit.content)>100000)throw Error('MULTIFILE_EDIT_INVALID');
    if(edit.content!==before.get(path)){
     writeFileSync(safeFile(path),edit.content,'utf8');
     changed.push(path);
    }
   }
   if(changed.length<2)throw Error('MULTIFILE_INSUFFICIENT_CHANGES');
   const totalOutput=allowed.reduce((sum,path)=>sum+Buffer.byteLength(readFileSync(safeFile(path))),0);
   if(totalOutput>300000)throw Error('MULTIFILE_OUTPUT_LIMIT');
   await runTests({job,root:base,changedPaths:changed});
   const tracked=lines(git(base,['diff','--name-only']));
   const untracked=lines(git(base,['ls-files','--others','--exclude-standard']));
   const staged=lines(git(base,['diff','--cached','--name-only']));
   if(untracked.length||staged.length||tracked.length!==changed.length||tracked.some(path=>!changed.includes(path)))throw Error('MULTIFILE_UNEXPECTED_CHANGES');
   assertMultifileCheckpoint({plan,changedPaths:tracked,baseSha:approvedBaseSha,planId:approvedPlanId});
   git(base,['add','--',...changed]);
   git(base,['-c','user.name=GPIR SEP-01','-c','user.email=sep01@users.noreply.github.com','commit','-m','SEP-01: bounded authorized multi-file checkpoint']);
   const commit=git(base,['rev-parse','HEAD']);
   if(git(base,['rev-parse','HEAD^'])!==approvedBaseSha||git(base,['status','--porcelain']))throw Error('MULTIFILE_COMMIT_INVALID');
   const committedPaths=lines(git(base,['diff-tree','--no-commit-id','--name-only','-r',commit]));
   assertMultifileCheckpoint({plan,changedPaths:committedPaths,baseSha:approvedBaseSha,planId:approvedPlanId});
   if(committedPaths.length!==changed.length)throw Error('MULTIFILE_COMMIT_SCOPE_INVALID');
   committed=true;
   return {status:'SUCCESS',commit,changed_paths:committedPaths,provider_requests:attempts};
  } finally {
   if(!committed){
    if(git(base,['rev-parse','HEAD'])===approvedBaseSha){
     git(base,['restore','--staged','--',...allowed]);
     for(const [path,value] of before)writeFileSync(safeFile(path),value,'utf8');
    }
   }
  }
 };
}
