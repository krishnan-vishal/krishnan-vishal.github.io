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
 const aiderOutput=run('aider',['--yes','--no-auto-commits','--no-gitignore','--no-show-model-warnings','--edit-format','whole','--model','openrouter/'+model,'--file','src/checkpoint.js','--message','Edit the supplied file src/checkpoint.js. Replace the zero with one in the exported checkpoint constant. The entire final file must be exactly: export const checkpoint = 1; followed by a newline. Apply the edit to disk. Do not modify any other file.']);
 // The fixture contains no private content. Emit only known Aider operational lines,
 // never arbitrary model text, raw headers, tokens, or full provider transcripts.
 const safeSignals=[];
 for(const line of aiderOutput.split(/\\r?\\n/)){
  const trimmed=line.trim();
  if(/^(?:Aider v|Main model:|Editor model:|Edit format:|Git repo:|Repo-map:|Added .* to the chat\\.|No files to edit\\.|No changes made\\.|Applied edit to .*|Failed to apply edit to .*|Unable to apply edit to .*|Unknown model .*|Model .* not found)/i.test(trimmed))
   safeSignals.push(trimmed.replace(/(?:sk-|key-|Bearer\\s+)[A-Za-z0-9._-]{8,}/gi,'[REDACTED]').slice(0,160));
 }
 console.log(JSON.stringify({event:'SEP01_AIDER_CLI_FILE_BINDING',file_explicitly_attached:true,signals:safeSignals.slice(0,12)}));
 // Classify the captured CLI output without printing any raw provider text or secrets.
 // These are diagnostic signals, not proof of authentication or a successful edit.
 const diagnosticPatterns={
  provider_http_error:/\\b(?:HTTP|status|error code)\\s*[:=]?\\s*(?:400|401|402|403|404|408|409|422|429|500|502|503|504)\\b/i,
  rate_limited:/\\b(?:rate.limit|quota.exceed|too many requests|429)\\b/i,
  auth_rejected:/\\b(?:unauthorized|invalid.api.key|authentication.failed|permission.denied|401|403)\\b/i,
  model_unavailable:/\\b(?:model.not.found|unsupported.model|no endpoints found|404)\\b/i,
  edit_format_problem:/\\b(?:failed.to.apply|couldn't.apply|unable.to.apply|malformed.edit|invalid.edit.format|no.files.to.edit|no.matches.found)\\b/i,
  completion_without_edit:/\\b(?:no.changes.made|no.edits.made|nothing.to.change|already.correct)\\b/i
 };
 const diagnostic=Object.fromEntries(Object.entries(diagnosticPatterns).map(([name,pattern])=>[name,pattern.test(aiderOutput)]));
 console.log(JSON.stringify({event:'SEP01_AIDER_SANITIZED_DIAGNOSTIC',...diagnostic,output_chars:aiderOutput.length}));
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
