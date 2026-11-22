import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateMultifileManifest} from './multifile-governance.mjs';
import {createMultifileCheckpointRecovery} from './multifile-checkpoint-recovery.mjs';
function fixture(){
 const parent=mkdtempSync(join(tmpdir(),'gpir-checkpoint-')),root=join(parent,'work'),remote=join(parent,'remote.git');
 mkdirSync(root);
 const run=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
 run(parent,'init','--bare','-q',remote);
 run(root,'init','-q');mkdirSync(join(root,'docs'));
 for(const path of ['a','b'])writeFileSync(join(root,'docs',path+'.md'),'original '+path+'\n');
 run(root,'add','.');run(root,'-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','baseline');
 const base_sha=run(root,'rev-parse','HEAD');
 const branch='sep01/jobs/sep01-owner-checkpoint-test';
 run(root,'checkout','-qb',branch);run(root,'remote','add','origin',remote);
 const sha=p=>{const data=readFileSync(join(root,p));return createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');};
 const tree=['docs/a.md','docs/b.md'].map(path=>({type:'blob',path,size:readFileSync(join(root,path)).length,sha:sha(path)}));
 const instruction='Improve both documents',owner_user_id='owner';
 const plan=validateMultifileManifest({files:tree.map(x=>x.path),tree,baseSha:base_sha,instruction,ownerId:owner_user_id});
 const job={branch,base_sha,instruction,owner_user_id,plan_id:plan.plan_id,manifest:plan.manifest,locked_paths:plan.manifest.map(x=>x.path),multifile_approval:{status:'APPROVED',owner_user_id:'owner',plan_id:plan.plan_id,base_sha,branch,cost_approved:true}};
 for(const path of ['a','b'])writeFileSync(join(root,'docs',path+'.md'),'improved '+path+'\n');
 run(root,'add','.');run(root,'-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','SEP-01: bounded authorized multi-file checkpoint');
 const commit=run(root,'rev-parse','HEAD');
 run(root,'push','-q','origin',branch);
 return {root,job,commit,run,close:()=>rmSync(parent,{recursive:true,force:true})};
}
test('remote recovery verifies the exact approved two-file checkpoint and independent validation',async()=>{
 const f=fixture();let validated=0;
 try{
  const recovery=createMultifileCheckpointRecovery({root:f.root,validateCheckpoint:async({commit,changedPaths})=>{validated++;assert.equal(commit,f.commit);assert.deepEqual(changedPaths,['docs/a.md','docs/b.md']);return true}});
  assert.equal(await recovery.verify(f.commit,f.job),true);
  assert.equal((await recovery.recover(f.job)).commit,f.commit);
  assert.equal(validated,2);
 }finally{f.close()}
});
test('wrong commit, forged manifest approval and missing independent evidence fail closed',async()=>{
 const f=fixture();
 try{
  const withoutEvidence=createMultifileCheckpointRecovery({root:f.root,validateCheckpoint:async()=>false});
  assert.equal(await withoutEvidence.verify(f.commit,f.job),false);
  assert.equal(await withoutEvidence.recover(f.job),null);
  const valid=createMultifileCheckpointRecovery({root:f.root,validateCheckpoint:async()=>true});
  assert.equal(await valid.verify(f.job.base_sha,f.job),false);
  assert.equal(await valid.verify(f.commit,{...f.job,multifile_approval:{...f.job.multifile_approval,plan_id:'f'.repeat(64)}}),false);
 }finally{f.close()}
});
