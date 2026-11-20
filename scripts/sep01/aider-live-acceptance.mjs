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
 // Aider receives a single fixture file and fixed task; it may not choose commands.
 run('aider',['--yes','--no-auto-commits','--no-gitignore','--no-show-model-warnings','--model','openrouter/'+model,'--message','Change only src/checkpoint.js so its exact contents are: export const checkpoint = 1; followed by a newline. Do not modify any other file.','src/checkpoint.js']);
 if(readFileSync(join(root,'src','checkpoint.js'),'utf8')!=='export const checkpoint = 1;\n')throw Error('AIDER_EDIT_MISMATCH');
 // Aider may create its own untracked chat/cache metadata in this disposable fixture.
 // Enforce the single-file allowlist for tracked changes and reject any unexpected untracked files.
 const changed=run('git',['diff','--name-only','HEAD']).split('\\n').filter(Boolean);
 if(changed.length!==1||changed[0]!=='src/checkpoint.js')throw Error('UNEXPECTED_TRACKED_CHANGE:'+changed.join(','));
 const untracked=run('git',['ls-files','--others','--exclude-standard']).split('\\n').filter(Boolean);
 if(untracked.some(path=>!/^\\.aider(?:[./-]|$)/.test(path)))throw Error('UNEXPECTED_UNTRACKED_FILE');
 run('git',['add','--','src/checkpoint.js']);
 run('git',['-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','SEP-01 Aider bounded checkpoint']);
 const after=run('git',['rev-parse','HEAD']);
 if(after===before||run('git',['diff','--name-only','HEAD'])||run('git',['diff','--cached','--name-only']))throw Error('AIDER_CHECKPOINT_INVALID');
 console.log(JSON.stringify({result:'SEP01_AIDER_CHECKPOINT_PASS',checkpoint:after,workspace:'DISPOSABLE_NO_PUSH'}));
}finally{rmSync(root,{recursive:true,force:true});}
