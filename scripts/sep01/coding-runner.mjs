// SEP-01 bounded coding runner: explicit file allowlist, tests, verified git commit.
// Intended for an isolated checkout/branch. Never runs model-supplied commands.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
function git(args,cwd){return execFileSync('git',args,{cwd,encoding:'utf8',timeout:30000}).trim();}
export function createCodingRunner({root,allowedPaths,runTests,requestEdit}) {
 if(typeof runTests!=='function'||typeof requestEdit!=='function'||!Array.isArray(allowedPaths)||!allowedPaths.length)throw Error('INVALID_RUNNER_CONFIG');
 const base=realpathSync(root);
 function safePath(path){
  if(!allowedPaths.includes(path)||isAbsolute(path)||path.split(/[\\/]/).includes('..'))throw Error('PATH_NOT_ALLOWED');
  const abs=resolve(base,path),rel=relative(base,abs);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('PATH_ESCAPE');
  if(!statSync(abs).isFile()||realpathSync(abs)!==abs)throw Error('UNSAFE_FILE');
  return abs;
 }
 return async function run({job,provider}) {
  if(!job||!provider||!Array.isArray(job.locked_paths)||job.locked_paths.length!==1)throw Error('INVALID_CODING_JOB');
  const path=job.locked_paths[0],abs=safePath(path);
  if(job.branch!==git(['branch','--show-current'],base))throw Error('WRONG_BRANCH');
  if(git(['status','--porcelain'],base))throw Error('DIRTY_WORKTREE');
  const before=readFileSync(abs,'utf8');
  let edit=await requestEdit({provider,job,path,content:before});
  if(['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE'].includes(edit?.status))return {status:edit.status};
  if(edit?.status==='EDIT'&&edit.content===before){
   // One bounded clarification for a model no-op, never a blind retry loop.
   edit=await requestEdit({provider,job:{...job,instruction:job.instruction+'\\nIMPORTANT: The previous response was identical to the original file. Return a changed complete file implementing the instruction exactly.'},path,content:before});
   if(['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE'].includes(edit?.status))return {status:edit.status};
  }
  if(edit?.status!=='EDIT')throw Error('MODEL_EDIT_UNEXPECTED_STATUS_'+String(edit?.status||'MISSING'));
  if(typeof edit.content!=='string'||!edit.content)throw Error('MODEL_EDIT_EMPTY');
  if(edit.content===before)throw Error('MODEL_EDIT_UNCHANGED');
  if(Buffer.byteLength(edit.content)>100000)throw Error('EDIT_TOO_LARGE');
  writeFileSync(abs,edit.content,{encoding:'utf8',flag:'w'});
  try {
   await runTests({job,root:base});
   const changed=git(['diff','--name-only'],base).split('\n').filter(Boolean);
   if(changed.length!==1||changed[0]!==path)throw Error('UNEXPECTED_CHANGES');
   git(['add','--',path],base);
   git(['-c','user.name=GPIR SEP-01','-c','user.email=sep01@users.noreply.github.com','commit','-m','SEP-01: bounded authorized coding checkpoint'],base);
   const commit=git(['rev-parse','HEAD'],base);
   if(!/^[a-f0-9]{40}$/.test(commit))throw Error('INVALID_COMMIT');
   return {status:'SUCCESS',commit,step:'tests passed; bounded commit verified'};
  } catch(error) {
   // Reset only the owned file; never discard unrelated work.
   git(['restore','--staged','--worktree','--',path],base);
   throw error;
  }
 };
}
