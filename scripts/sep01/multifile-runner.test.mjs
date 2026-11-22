import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createMultifileRunner} from './multifile-runner.mjs';
import {validateMultifileManifest} from './multifile-governance.mjs';

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'gpir-stage3-'));
 const run=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 mkdirSync(join(root,'docs'));
 writeFileSync(join(root,'docs/a.md'),'first\n');
 writeFileSync(join(root,'docs/b.md'),'second\n');
 run('init','-q');run('add','.');run('-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','baseline');
 const sha=run('rev-parse','HEAD');
 const branch='sep01/jobs/test-multifile';
 run('checkout','-qb',branch);
 const blob=p=>createHash('sha1').update('blob '+Buffer.byteLength(readFileSync(join(root,p)))+'\0').update(readFileSync(join(root,p))).digest('hex');
 const tree=['docs/a.md','docs/b.md'].map(path=>({type:'blob',path,size:Buffer.byteLength(readFileSync(join(root,path))),sha:blob(path)}));
 const instruction='Improve both documents';
 const plan=validateMultifileManifest({files:['docs/a.md','docs/b.md'],tree,baseSha:sha,ownerId:'owner',instruction});
 const job={job_id:'sep01-owner-test',instruction,sensitivity_tier:null,scope:'development',owner_user_id:'owner',single_attempt:true,cost_approved:true,plan_id:plan.plan_id,execution_route:'bounded_multifile_v1',locked_paths:plan.manifest.map(x=>x.path),branch};
 const verifiedApproval={status:'APPROVED',owner_user_id:'owner',job_id:job.job_id,plan_id:plan.plan_id,base_sha:sha,branch,locked_paths:plan.manifest.map(x=>x.path),instruction,single_attempt:true,cost_approved:true,max_provider_requests:2,revision:1};
 const params={job,approvedPlanId:plan.plan_id,approvedBaseSha:sha,branch,providerBudgetApproved:true,verifiedApproval};
 return {root,run,plan,params,close:()=>rmSync(root,{recursive:true,force:true})};
}
test('owner approval is mandatory before any provider request',async()=>{
 const f=fixture();let requests=0;
 try{
  const runner=createMultifileRunner({root:f.root,plan:f.plan,requestEdit:async()=>{requests++;return {status:'EDIT',content:'changed'}},runTests:async()=>{}});
  await assert.rejects(runner({...f.params,providerBudgetApproved:false}),/OWNER_APPROVAL_REQUIRED/);
  await assert.rejects(runner({...f.params,approvedPlanId:'invalid'}),/OWNER_APPROVAL_REQUIRED/);
  await assert.rejects(runner({...f.params,verifiedApproval:null}),/OWNER_APPROVAL_REQUIRED/);
  assert.equal(requests,0);
 }finally{f.close()}
});
test('two-file transaction commits only manifest paths and preserves parent',async()=>{
 const f=fixture();
 try{
  const runner=createMultifileRunner({root:f.root,plan:f.plan,requestEdit:async({path})=>({status:'EDIT',content:path+' improved\n'}),runTests:async()=>{}});
  const result=await runner(f.params);
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.provider_requests,2);
  assert.deepEqual(result.changed_paths,['docs/a.md','docs/b.md']);
  assert.equal(f.run('rev-parse','HEAD^'),f.plan.base_sha);
  assert.equal(f.run('status','--porcelain'),'');
 }finally{f.close()}
});
test('provider failure and test failure restore both files without committing',async()=>{
 for(const fail of ['provider','tests']){
  const f=fixture();
  try{
   const runner=createMultifileRunner({root:f.root,plan:f.plan,requestEdit:async({path})=>fail==='provider'&&path==='docs/b.md'?{status:'QUOTA_EXHAUSTED'}:{status:'EDIT',content:'updated\n'},runTests:async()=>{if(fail==='tests')throw Error('TEST_FAILED')}});
   if(fail==='provider')assert.equal((await runner(f.params)).status,'QUOTA_EXHAUSTED');
   else await assert.rejects(runner(f.params),/TEST_FAILED/);
   assert.equal(readFileSync(join(f.root,'docs/a.md'),'utf8'),'first\n');
   assert.equal(readFileSync(join(f.root,'docs/b.md'),'utf8'),'second\n');
   assert.equal(f.run('status','--porcelain'),'');
   assert.equal(f.run('rev-parse','HEAD'),f.plan.base_sha);
  }finally{f.close()}
 }
});
test('unapproved extra changed file fails closed',async()=>{
 const f=fixture();
 try{
  const runner=createMultifileRunner({root:f.root,plan:f.plan,requestEdit:async()=>({status:'EDIT',content:'updated\n'}),runTests:async()=>{writeFileSync(join(f.root,'docs/extra.md'),'not allowed')}});
  await assert.rejects(runner(f.params),/UNEXPECTED_CHANGES/);
  assert.equal(f.run('rev-parse','HEAD'),f.plan.base_sha);
 }finally{f.close()}
});

test('forged approval and stale plan instruction fail before provider calls',async()=>{
 const f=fixture();let requests=0;
 try{
  const runner=createMultifileRunner({root:f.root,plan:f.plan,requestEdit:async()=>{requests++;return {status:'EDIT',content:'new'}},runTests:async()=>{}});
  await assert.rejects(runner({...f.params,verifiedApproval:{...f.params.verifiedApproval,instruction:'forged instruction'}}),/MULTIFILE_APPROVAL_STALE/);
  await assert.rejects(runner({...f.params,job:{...f.params.job,instruction:'different instruction'}}),/MULTIFILE_APPROVAL_STALE/);
  assert.equal(requests,0);
 }finally{f.close()}
});
