// SEP-01 routed Aider execution in a disposable Git fixture.
// No GPIR production files, branch push, or deployment. Requires explicit verified
// provider approval and a live OpenRouter credential.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {createAiderAdapter} from './aider-adapter.mjs';
import {agentReadiness,selectAuthorizedAgent} from './agent-registry.mjs';
import {claim,checkpoint} from './controller.mjs';
const model=process.env.SEP01_AIDER_MODEL,key=process.env.OPENROUTER_API_KEY;
if(!model||!/^[-\w./:]+$/.test(model)||!key||process.env.SEP01_AIDER_APPROVED!=='true')throw Error('APPROVED_AIDER_CREDENTIALS_REQUIRED');
const root=mkdtempSync(join(tmpdir(),'sep01-routed-aider-'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
try{
 mkdirSync(join(root,'src'));writeFileSync(join(root,'src','checkpoint.js'),'export const checkpoint = 0;\n');
 git('init','-q','-b','sep01-routed');git('add','--','src/checkpoint.js');
 git('-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','baseline');
 const adapter=createAiderAdapter({cwd:root,model,apiKey:key});
 const config={aider:{approved:true,adapter_verified:true,credential_verified:true,execute:adapter}};
 if(!agentReadiness(config).find(x=>x.id==='aider').ready)throw Error('AIDER_NOT_READY');
 // This single-run fixture has explicit, short-lived verified capacity; it does
 // not assert a global daily or monthly quota balance.
 const providers=[{id:'aider/'+model,agent_id:'aider',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC',private_environment:false}];
 const job={job_id:'sep01-routed-aider-fixture',idempotency_key:'fixture-once',branch:'sep01-routed',locked_paths:['src/checkpoint.js'],scope:'dashboard',capability:'code',remaining_budget:0,status:'QUEUED',instruction:'Change only src/checkpoint.js to exactly: export const checkpoint = 1; followed by a newline.'};
 const chosen=selectAuthorizedAgent(job,providers,config);
 if(!chosen)throw Error('NO_ELIGIBLE_AIDER_PROVIDER');
 const assigned=claim(job,[chosen]);if(assigned.status!=='CLAIMED')throw Error('CLAIM_FAILED');
 const before=git('rev-parse','HEAD');
 await adapter(job);
 if(readFileSync(join(root,'src','checkpoint.js'),'utf8')!=='export const checkpoint = 1;\n')throw Error('AIDER_OUTPUT_NOT_VERIFIED');
 const changed=git('diff','--name-only','HEAD').split('\n').filter(Boolean);
 if(changed.length!==1||changed[0]!=='src/checkpoint.js')throw Error('UNEXPECTED_TRACKED_CHANGE');
 git('add','--','src/checkpoint.js');
 git('-c','user.name=SEP01','-c','user.email=sep01@example.invalid','commit','-qm','SEP-01 routed Aider checkpoint');
 const after=git('rev-parse','HEAD');
 const committed=git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n').filter(Boolean);
 if(before===after||committed.length!==1||committed[0]!=='src/checkpoint.js')throw Error('INVALID_CHECKPOINT');
 const saved=checkpoint(assigned,after,'Aider edit verified and committed');
 console.log(JSON.stringify({result:'SEP01_AIDER_ROUTED_CHECKPOINT_PASS',agent:'aider',model,checkpoint:saved.checkpoint_commit,workspace:'DISPOSABLE_NO_PUSH',quota_source:'SINGLE_RUN_APPROVAL_ONLY'}));
}finally{rmSync(root,{recursive:true,force:true});}
