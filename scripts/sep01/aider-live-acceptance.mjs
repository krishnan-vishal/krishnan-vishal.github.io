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
 // Use the documented positional file argument. Avoid optional CLI switches that
 // can cause a help/usage response without executing an edit.
 const aiderOutput=run('aider',['--yes','--no-auto-commits','--model','openrouter/'+model,'--message','Edit src/checkpoint.js: change export const checkpoint = 0; to export const checkpoint = 1; and preserve the final newline.','src/checkpoint.js']);
 // Detect CLI usage/help or argument parsing output before accepting a successful
 // exit code. Report fixed booleans only; never log raw model/provider responses.
 const lines=aiderOutput.split(/\\r?\\n/);
 const usage=lines.some(line=>/^\\s*(?:usage:|options:|optional arguments:|error: (?:unrecognized|unknown) arguments?)/i.test(line));
 const diagnostics={
  usage_or_help:usage,
  http_error:/\\b(?:HTTP|status|error code)\\s*[:=]?\\s*(?:400|401|402|403|404|408|409|422|429|500|502|503|504)\\b/i.test(aiderOutput),
  provider_error:/\\b(?:litellm\\.|badrequesterror|authenticationerror|ratelimiterror|apierror|connectionerror|traceback \\(most recent call last\\))/i.test(aiderOutput),
  no_edit:/\\b(?:no changes made|no edits made|nothing to change|no files to edit)\\b/i.test(aiderOutput),
  edit_application_error:/\\b(?:failed to apply|unable to apply|could not apply|malformed edit)\\b/i.test(aiderOutput),
  output_chars:aiderOutput.length
 };
 console.log(JSON.stringify({event:'SEP01_AIDER_CLI_DIAGNOSIS',...diagnostics}));
 if(usage)throw Error('SEP01_AIDER_CLI_USAGE_INSTEAD_OF_EXECUTION');
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
