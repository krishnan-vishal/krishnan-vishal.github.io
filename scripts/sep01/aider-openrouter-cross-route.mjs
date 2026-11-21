// SEP-01 authenticated cross-route handoff: Aider CLI -> OpenRouter code editor.
// Uses an explicitly simulated quota signal AFTER a verified Git checkpoint.
// Both routes share an OpenRouter account; this is not independent-provider resilience.
// All edits and commits are confined to a disposable local Git repository.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {createAiderAdapter} from './aider-adapter.mjs';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
import {agentReadiness,selectAuthorizedAgent} from './agent-registry.mjs';
import {claim,checkpoint,quotaFailure} from './controller.mjs';
const key=process.env.OPENROUTER_API_KEY,primary=process.env.SEP01_AIDER_MODEL,fallback=process.env.SEP01_FALLBACK_MODEL||primary;
if(!key||!primary||!fallback||![primary,fallback].every(m=>/^[-\w./:]+$/.test(m))||process.env.SEP01_ROUTE_APPROVED!=='true')throw Error('EXPLICIT_APPROVAL_AND_MODELS_REQUIRED');
const root=mkdtempSync(join(tmpdir(),'sep01-cross-route-'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
const file=join(root,'src','checkpoint.js');
function verifyAndCommit(expected,label){
 if(readFileSync(file,'utf8')!==expected)throw Error('UNVERIFIED_MODEL_EDIT');
 const changed=git('diff','--name-only','HEAD').split('\n').filter(Boolean);
 if(changed.length!==1||changed[0]!=='src/checkpoint.js')throw Error('UNEXPECTED_TRACKED_EDIT');
 git('add','--','src/checkpoint.js');
 git('-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm',label);
 const sha=git('rev-parse','HEAD');
 const committed=git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n').filter(Boolean);
 if(committed.length!==1||committed[0]!=='src/checkpoint.js'||git('diff','--name-only','HEAD'))throw Error('INVALID_GIT_CHECKPOINT');
 return sha;
}
try{
 mkdirSync(join(root,'src'));writeFileSync(file,'export const checkpoint = 0;\n');
 git('init','-q','-b','sep01-cross-route');git('add','--','src/checkpoint.js');
 git('-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','baseline');
 const aider=createAiderAdapter({cwd:root,model:primary,apiKey:key});
 const editor=createOpenRouterCodeEditor({apiKey:key,model:fallback});
 const config={
  aider:{approved:true,adapter_verified:true,credential_verified:true,execute:aider},
  openrouter:{approved:true,adapter_verified:true,credential_verified:true,execute:editor}
 };
 if(agentReadiness(config).filter(a=>a.ready).length!==2)throw Error('ROUTES_NOT_READY');
 const providers=[
  {id:'aider/'+primary,agent_id:'aider',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC'},
  {id:'openrouter/'+fallback,agent_id:'openrouter',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC'}
 ];
 const job={job_id:'sep01-cross-route',idempotency_key:'fixture-once',branch:'sep01-cross-route',locked_paths:['src/checkpoint.js'],scope:'dashboard',capability:'code',remaining_budget:0,status:'QUEUED',instruction:'Replace the file with exactly: export const checkpoint = 1; followed by a newline.'};
 const first=selectAuthorizedAgent(job,[providers[0]],config);
 if(first?.agent_id!=='aider')throw Error('AIDER_NOT_SELECTED');
 const assigned=claim(job,[first]);if(assigned.status!=='CLAIMED')throw Error('FIRST_ROUTE_NOT_CLAIMED');
 await aider(job);
 const firstSha=verifyAndCommit('export const checkpoint = 1;\n','SEP-01 Aider checkpoint');
 const saved=checkpoint(assigned,firstSha,'Aider bounded edit verified');
 // Controlled simulated quota failure, not an observed provider HTTP 429.
 const next=quotaFailure(saved,providers);
 if(next.status!=='CLAIMED'||next.provider!==providers[1].id||next.checkpoint_commit!==firstSha)throw Error('CHECKPOINT_FAILOVER_NOT_SAFE');
 if(git('rev-parse','HEAD')!==firstSha)throw Error('CHECKPOINT_NOT_PRESENT');
 const followup={...job,instruction:'Replace the file with exactly: export const checkpoint = 2; followed by a newline.'};
 const response=await editor({job:followup,path:'src/checkpoint.js',content:readFileSync(file,'utf8')});
 if(response.status!=='EDIT'||response.content!=='export const checkpoint = 2;\n')throw Error('OPENROUTER_EDIT_NOT_VERIFIED');
 writeFileSync(file,response.content);
 const secondSha=verifyAndCommit('export const checkpoint = 2;\n','SEP-01 OpenRouter fallback checkpoint');
 if(firstSha===secondSha)throw Error('DUPLICATE_CHECKPOINT');
 const final=checkpoint(next,secondSha,'OpenRouter fallback verified');
 console.log(JSON.stringify({result:'SEP01_AUTHENTICATED_CROSS_ROUTE_HANDOFF_PASS',first_route:'aider',second_route:'openrouter',first_checkpoint:firstSha,second_checkpoint:final.checkpoint_commit,quota_event:'SIMULATED_AFTER_DURABLE_CHECKPOINT',provider_independence:false,workspace:'DISPOSABLE_NO_PUSH'}));
}finally{rmSync(root,{recursive:true,force:true});}
