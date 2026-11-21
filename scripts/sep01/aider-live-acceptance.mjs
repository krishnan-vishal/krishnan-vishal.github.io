// SEP-01 isolated Aider CLI acceptance. Never touches GPIR files, pushes or deploys.
// Requires an approved OpenRouter model and an existing OPENROUTER_API_KEY.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
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
 const invocation=spawnSync('aider',['--yes','--no-auto-commits','--model','openrouter/'+model,'--message','Edit src/checkpoint.js: change export const checkpoint = 0; to export const checkpoint = 1; and preserve the final newline.','src/checkpoint.js'],{cwd:root,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
 const stdout=invocation.stdout||'';
 const stderr=invocation.stderr||'';
 // Aider writes operational and model diagnostics to stderr on some versions.
 // Classify both streams without printing transcripts, paths, headers or secrets.
 const combined=stdout+'\n'+stderr;
 const has=(pattern)=>pattern.test(combined);
 const flags={
  usage_or_help:has(/(?:^|\n)\s*(?:usage:|options:|optional arguments:|error: (?:unrecognized|unknown) arguments?)/im),
  api_or_model_error:has(/\b(?:litellm|badrequesterror|authenticationerror|ratelimiterror|apierror|connectionerror|model not found|unknown model|no endpoints found)\b/i),
  auth_or_quota:has(/\b(?:unauthorized|authentication failed|invalid api key|rate limit|quota exceeded|insufficient credits|payment required)\b/i),
  editor_error:has(/\b(?:failed to apply|unable to apply|could not apply|malformed edit|no files to edit|no changes made)\b/i),
  model_response_seen:has(/\b(?:tokens|cost|model|assistant|response)\b/i)
 };
 console.log(JSON.stringify({event:'SEP01_AIDER_STDIO_EVIDENCE',exit_code:invocation.status,signal:invocation.signal||null,spawn_error:invocation.error?.code||null,stdout_chars:stdout.length,stderr_chars:stderr.length,...flags}));
 if(invocation.error||invocation.status!==0)throw Error('SEP01_AIDER_CLI_EXECUTION_FAILED');
 if(flags.usage_or_help)throw Error('SEP01_AIDER_CLI_USAGE_INSTEAD_OF_EXECUTION');
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
