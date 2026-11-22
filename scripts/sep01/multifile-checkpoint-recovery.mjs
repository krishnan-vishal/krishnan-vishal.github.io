// Stage 3: independently verify an existing remote checkpoint; NEVER call a model during recovery.
import {execFileSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {validateMultifileManifest,assertMultifileCheckpoint} from './multifile-governance.mjs';

const sha=/^[a-f0-9]{40}$/;
const jobBranch=/^sep01\/jobs\/[a-zA-Z0-9._-]+$/;
const paths=value=>value.split('\n').filter(Boolean);
export function createMultifileCheckpointRecovery({root,validateCheckpoint}={}){
 if(!root||typeof validateCheckpoint!=='function')throw Error('MULTIFILE_CHECKPOINT_VALIDATOR_REQUIRED');
 const cwd=realpathSync(root);
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',timeout:30000}).trim();
 async function verify(commit,job){
  try{
   if(!sha.test(commit||'')||!jobBranch.test(job?.branch||'')||!sha.test(job.base_sha||'')||!Array.isArray(job.manifest)||job.owner_user_id!==job.multifile_approval?.owner_user_id||job.multifile_approval?.status!=='APPROVED'||job.multifile_approval?.plan_id!==job.plan_id||job.multifile_approval?.base_sha!==job.base_sha||job.multifile_approval?.branch!==job.branch||job.multifile_approval?.cost_approved!==true)return false;
   const plan=validateMultifileManifest({files:job.locked_paths,tree:job.manifest.map(file=>({type:'blob',path:file.path,size:file.size,sha:file.blob_sha})),baseSha:job.base_sha,instruction:job.instruction,ownerId:job.owner_user_id});
   if(plan.plan_id!==job.plan_id||JSON.stringify(plan.manifest)!==JSON.stringify(job.manifest))return false;
   git('fetch','--force','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
   if(git('rev-parse','refs/remotes/origin/'+job.branch)!==commit||git('cat-file','-t',commit)!=='commit'||git('rev-parse',commit+'^')!==job.base_sha)return false;
   if(git('log','-1','--format=%s',commit)!=='SEP-01: bounded authorized multi-file checkpoint')return false;
   const changedPaths=paths(git('diff-tree','--no-commit-id','--name-only','-r',commit));
   if(changedPaths.length<2||changedPaths.length>job.manifest.length)return false;
   assertMultifileCheckpoint({plan,changedPaths,baseSha:job.base_sha,planId:job.plan_id});
   for(const file of plan.manifest){
    const baseBlob=git('rev-parse',job.base_sha+':'+file.path);
    if(baseBlob!==file.blob_sha)return false;
   }
   // Separate independent test/CI validator; no test evidence -> no recovery.
   if(await validateCheckpoint({commit,job,changedPaths})!==true)return false;
   return true;
  }catch{return false;}
 }
 return {
  verify,
  async recover(job){
   if(!jobBranch.test(job?.branch||''))return null;
   try{
    git('fetch','--force','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
    const commit=git('rev-parse','refs/remotes/origin/'+job.branch);
    if(!await verify(commit,job))return null;
    return {commit,step:'verified remote multi-file parent, manifest, committed paths and independent tests'};
   }catch{return null;}
  }
 };
}
