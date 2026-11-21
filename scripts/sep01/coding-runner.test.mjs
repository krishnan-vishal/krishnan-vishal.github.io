import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createCodingRunner} from './coding-runner.mjs';
function git(dir,...args){return execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();}
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'sep01-'));
 git(root,'init','-q','-b','sep01-test');
 mkdirSync(join(root,'src'));writeFileSync(join(root,'src','file.js'),'export const value = 1;\n');
 git(root,'add','.');git(root,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','baseline');
 return root;
}
test('authorized edit runs tests and creates real verified git checkpoint',async()=>{
 const root=fixture();
 try {
  const run=createCodingRunner({root,allowedPaths:['src/file.js'],
   requestEdit:async()=>({status:'EDIT',content:'export const value = 2;\n'}),
   runTests:async()=>assert.match(readFileSync(join(root,'src/file.js'),'utf8'),/value = 2/)});
  const result=await run({job:{branch:'sep01-test',locked_paths:['src/file.js']},provider:{id:'approved'}});
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.commit,git(root,'rev-parse','HEAD'));
  assert.equal(git(root,'status','--porcelain'),'');
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('failed tests roll back owned file and never commit',async()=>{
 const root=fixture();
 try {
  const head=git(root,'rev-parse','HEAD');
  const run=createCodingRunner({root,allowedPaths:['src/file.js'],
   requestEdit:async()=>({status:'EDIT',content:'invalid code'}),
   runTests:async()=>{throw Error('TESTS_FAILED');}});
  await assert.rejects(run({job:{branch:'sep01-test',locked_paths:['src/file.js']},provider:{id:'approved'}}),/TESTS_FAILED/);
  assert.equal(git(root,'rev-parse','HEAD'),head);
  assert.equal(readFileSync(join(root,'src/file.js'),'utf8'),'export const value = 1;\n');
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('quota exhaustion returns without changing git state',async()=>{
 const root=fixture();
 try {
  const run=createCodingRunner({root,allowedPaths:['src/file.js'],
   requestEdit:async()=>({status:'QUOTA_EXHAUSTED'}),runTests:async()=>{throw Error('NOT_EXPECTED');}});
  assert.deepEqual(await run({job:{branch:'sep01-test',locked_paths:['src/file.js']},provider:{id:'approved'}}),{status:'QUOTA_EXHAUSTED'});
  assert.equal(git(root,'status','--porcelain'),'');
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('one model no-op is clarified once before committing',async()=>{
 const root=fixture();let calls=0;
 try{
  const run=createCodingRunner({root,allowedPaths:['src/file.js'],
   requestEdit:async()=>++calls===1?{status:'EDIT',content:'export const value = 1;\n'}:{status:'EDIT',content:'export const value = 2;\n'},
   runTests:async()=>{}});
  const result=await run({job:{branch:'sep01-test',locked_paths:['src/file.js'],instruction:'Change value to 2'},provider:{id:'approved'}});
  assert.equal(result.status,'SUCCESS');assert.equal(calls,2);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('provider busy is reported without treating it as an invalid edit',async()=>{
 const root=fixture();
 try{
  const run=createCodingRunner({root,allowedPaths:['src/file.js'],requestEdit:async()=>({status:'PROVIDER_BUSY'}),runTests:async()=>{}});
  assert.deepEqual(await run({job:{branch:'sep01-test',locked_paths:['src/file.js']},provider:{id:'approved'}}),{status:'PROVIDER_BUSY'});
  assert.equal(git(root,'status','--porcelain'),'');
 }finally{rmSync(root,{recursive:true,force:true});}
});
