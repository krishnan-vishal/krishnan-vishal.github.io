// SEP-01: authorized manual command intake. Reuses existing Supabase CAS job store.
// Scope intentionally limited to the existing acceptance fixture until owner-only auth
// and broader allowlist approvals are proven. No code execution occurs here.
import {createDurableJobStore} from './durable-job-store.mjs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function validateOwnerCommand(input){
 const jobId=String(input.job_id||'');
 const instruction=String(input.instruction||'');
 if(!/^sep01-owner-[a-z0-9-]{6,60}$/.test(jobId))throw Error('OWNER_JOB_ID_INVALID');
 if(!instruction.trim()||instruction.length>1000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(instruction))throw Error('OWNER_INSTRUCTION_INVALID');
 if(input.scope!=='fixture')throw Error('OWNER_SCOPE_NOT_AUTHORIZED');
 return {job_id:jobId,idempotency_key:'owner:'+jobId,branch:'sep01/jobs/'+jobId,locked_paths:['scripts/sep01/acceptance-fixture.txt'],scope:'fixture',instruction,capability:'code',sensitivity_tier:null,remaining_budget:0};
}
export async function enqueueOwnerCommand(input,store){
 const job=validateOwnerCommand(input);
 const result=await store.enqueue(job);
 if(!result)throw Error('OWNER_JOB_ALREADY_QUEUED_OR_NOT_RETURNED');
 return {job_id:result.job_id,status:result.status,revision:result.revision,branch:result.branch};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const input={job_id:process.env.SEP01_OWNER_JOB_ID,instruction:process.env.SEP01_OWNER_INSTRUCTION,scope:process.env.SEP01_OWNER_SCOPE};
 const store=createDurableJobStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
 const result=await enqueueOwnerCommand(input,store);
 console.log(JSON.stringify({event:'SEP01_OWNER_JOB_QUEUED',...result}));
}
