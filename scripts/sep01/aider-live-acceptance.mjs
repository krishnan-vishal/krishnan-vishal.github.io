// SEP-01 isolated Aider CLI acceptance. Never touches GPIR files, pushes or deploys.
// Requires an approved OpenRouter model and an existing OPENROUTER_API_KEY.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const model=process.env.SEP01_AIDER_MODEL;
if(!model||!/^[-\w./:]+$/.test(model)||!process.env.OPENROUTER_API_KEY)throw Error('APPROVED_AIDER_MODEL_AND_KEY_REQUIRED');
const root=mkdtempSync(join(tmpdir(),'sep01-aider-'));
const run=(bin,args)=>execFileSync(bin,args,{cwd:root,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
try{
 mkdirSync(join(root,'src'));writeFileSync(join(root,'src','checkpoint.js'),'export const checkpoint = 0;\n');
 run('git',['init','-q','-b','sep01-aider-acceptance']);
 run('git',['add','.']);
 run('git',['-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','fixture']);
 const before=run('git',['rev-parse','HEAD']);
 const original=readFileSync(join(root,'src','checkpoint.js'),'utf8');
 // Aider receives a single fixture file and fixed task; it may not choose commands.
 const aiderOutput=run('aider',['--yes','--no-auto-commits','--no-gitignore','--no-show-model-warnings','--edit-format','whole','--model','openrouter/'+model,'--message','Edit the supplied file src/checkpoint.js. Replace the zero with one in the exported checkpoint constant. The entire final file must be exactly: export const checkpoint = 1; followed by a newline. Apply the edit to disk. Do not modify any other file.','src/checkpoint.js']);
 // Report only bounded outcome signals; never emit model transcripts or API credentials.
 console.log(JSON.stringify({event:'SEP01_AIDER_INVOCATION',model,output_chars:aiderOutput.length,reported_no_changes:/no (changes|files) (made|to edit)|did not (change|edit)|no edits/i.test(aiderOutput),reported_edit:/applied edit|applied.*change|wrote.*file|edited.*checkpoint/i.test(aiderOutput)}));
 const actual=readFileSync(join(root,'src','checkpoint.js'),'utf8');
 if(actual!=='export const checkpoint = 1;\n'){
  const reason=actual===original?'UNCHANGED':'INCORRECT_CONTENT';
  console.error(JSON.stringify({event:'SEP01_AIDER_EDIT_REJECTED',reason,actual_length:actual.length,expected_length:29}));
  throw Error('AIDER_EDIT_MISMATCH:'+reason);
 }
 // Only tracked changes are eligible for the checkpoint. Aider metadata remains
 // untracked in the disposable workspace and is never staged or pushed.
 const changed=run('git',['diff','--name-only','HEAD']).split('\n').filter(Boolean);
 if(changed.length!==1||changed[0]!=='src/checkpoint.js')throw Error('UNEXPECTED_TRACKED_CHANGE:'+changed.join(','));
 run('git',['add','--','src/checkpoint.js']);
 run('git',['-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','SEP-01 Aider bounded checkpoint']);
 const after=run('git',['rev-parse','HEAD']);
 const committed=run('git',['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n').filter(Boolean);
 if(committed.length!==1||committed[0]!=='src/checkpoint.js')throw Error('UNEXPECTED_COMMITTED_FILE');
 if(after===before||run('git',['diff','--name-only','HEAD'])||run('git',['diff','--cached','--name-only']))throw Error('AIDER_CHECKPOINT_INVALID');
 console.log(JSON.stringify({result:'SEP01_AIDER_CHECKPOINT_PASS',checkpoint:after,workspace:'DISPOSABLE_NO_PUSH'}));
}finally{rmSync(root,{recursive:true,force:true});}
