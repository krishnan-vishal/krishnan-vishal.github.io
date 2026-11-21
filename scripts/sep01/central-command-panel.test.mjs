import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../../admin/central-command/index.html',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../../supabase/functions/gpir-sep01-owner-command/index.ts',import.meta.url),'utf8');
test('Central Command submits through authenticated gateway, never directly to privileged store',()=>{
 assert.match(page,/Central Command/);
 assert.match(page,/api\.github\.com\/repos\/krishnan-vishal/);
 assert.match(page,/async function ownerSession\(/);
 assert.match(page,/commandRequest\(\{action:'submit_planned'/);
 assert.match(page,/startReceiptPolling\(\)/);
 assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|GEMINI_API_KEY/);
 assert.doesNotMatch(page,/rest\/v1\/gpir_sep01_jobs/);
 assert.match(gateway,/SEP01_OWNER_USER_ID/);
 assert.match(gateway,/OWNER_NOT_AUTHORIZED/);
 assert.match(gateway,/gpir_sep01_cas_job/);
 assert.match(gateway,/WRITER_LOCK_CONFLICT/);
});
test('Every registered provider is represented without claiming unverified readiness',()=>{
 for(const id of ['Codex','Gemini','OpenRouter','Copilot','Cline','Aider'])assert.ok(page.includes(id));
 assert.match(page,/Runtime availability checked during execution/);
 assert.match(page,/Provider Status/);
});

test('Original job receipt is owner-authenticated and read-only',()=>{
 assert.match(page,/id="load-original-receipt"/);
 assert.match(page,/commandRequest\(\{action:'status',job_id:jobId\}\)/);
 assert.match(page,/originalJobId='sep01-owner-8c8dcf0c-16aa-4c02'/);
 assert.match(page,/id="receipt-checkpoint"/);
 assert.match(page,/id="load-sep02-receipt"/);
 assert.match(page,/id="receipt-attempts"/);
 assert.match(gateway,/model_attempts:modelAttempts/);
 assert.match(page,/details.hidden=true/);
 assert.doesNotMatch(page,/fetch\([^\n]*rest\/v1\/gpir_sep01_jobs/);
});

test('one-shot SEP-02 fixture intake is explicitly non-retryable while development remains standard',()=>{
 assert.match(gateway,/single_attempt:scope==='fixture'/);
 assert.match(page,/commandRequest\(\{action:'status',job_id:jobId\}\)/);
});

test('SEP-02 fixture intake uses isolated owned path and one-time idempotency',()=>{
 assert.doesNotMatch(page,/<option value="fixture">/);
 assert.match(page,/commandRequest\(\{action:'submit_planned'/);
 assert.match(page,/id="load-sep02-receipt"/);
 assert.match(page,/window\.confirm\(/);
 assert.match(gateway,/const sep02FixturePath='scripts\/sep01\/sep02-acceptance-fixture\.txt'/);
 assert.match(gateway,/acceptance_series==='SEP02'/);
 assert.match(gateway,/ACCEPTANCE_ALREADY_SUBMITTED/);
 assert.match(gateway,/owner:sep02-once:/);
 assert.match(gateway,/queued\?\.job_id!==jobId/);
 assert.doesNotMatch(gateway,/github\('contents\/scripts\/sep01\/acceptance-fixture\.txt'/);
});
test('SEP-02 fixture instruction is fixed and remains non-production only',()=>{
 assert.match(gateway,/FIXTURE_INSTRUCTION_NOT_AUTHORIZED/);
 assert.doesNotMatch(page,/id="directive-path"/);
 assert.match(gateway,/single_attempt:scope==='fixture'/);
 assert.match(gateway,/PLAN_STALE_OR_AMBIGUOUS/);
});

test('owner preview classifies actions and discovers one eligible target without writing',async()=>{
 const {runInNewContext}=await import('node:vm');
 let handler;
 const owner='test-owner';
 const tree=[
  {path:'docs/PUBLISHER_RUNBOOK.md',size:100000,type:'blob'},
  {path:'docs/FX_ARCHIVE_GUIDE.md',size:100001,type:'blob'},
  {path:'docs/OTHER_GUIDE.md',size:100,type:'blob'},
  {path:'assets/css/research-layout.css',size:200,type:'blob'}
 ];
 runInNewContext(gateway,{
  Deno:{serve:callback=>{handler=callback},env:{get:name=>name==='SEP01_OWNER_USER_ID'?owner:'test-config'}},
  Response,TextEncoder,crypto,
  fetch:async(url,options)=>{
   assert.ok(!options?.method||options.method==='GET','preview must never write');
   if(url.endsWith('/auth/v1/user'))return Response.json({id:owner});
   if(url.endsWith('git/ref/heads/main'))return Response.json({object:{sha:'test-head'}});
   if(url.endsWith('git/trees/test-head?recursive=1'))return Response.json({tree});
   throw Error('Unexpected upstream call: '+url);
  }
 });
 async function preview(instruction){
  const response=await handler(new Request('https://example.com',{
   method:'POST',
   headers:{Origin:'https://fintechoisis.com',Authorization:'Bearer test-session'},
   body:JSON.stringify({action:'classify_requirement',instruction,scope:'development'})
  }));
  assert.equal(response.status,200);
  return response.json();
 }
 const plan=await preview('Clarify the introduction in the Publisher Runbook without changing authentication or deploying. Keep production releases approval-gated.');
 assert.equal(plan.kind,'documentation');
 assert.equal(plan.reason,'OWNER_APPROVAL_REQUIRED');
 assert.equal(plan.auto_suggested_target,'docs/PUBLISHER_RUNBOOK.md');
 assert.deepEqual(plan.candidates.map(candidate=>candidate.path),['docs/PUBLISHER_RUNBOOK.md']);
 assert.match(plan.plan_id,/^[a-f0-9]{64}$/);
 assert.equal((await preview('Clarify the FX Archive Guide.')).reason,'MATCH_EXCEEDS_FILE_LIMIT');
 assert.equal((await preview('Clarify the documentation.')).reason,'NO_SAFE_TARGET_IDENTIFIED');
 assert.equal((await preview('Update the Publisher Runbook and deploy it.')).reason,'RELEASE_REVIEW_REQUIRED');
 assert.equal((await preview('Deploy the latest change.')).category,'release');
 assert.equal((await preview('Change authentication in application code.')).reason,'SENSITIVE_REVIEW_REQUIRED');
 assert.equal((await preview('Research the FX archive.')).category,'research');
 assert.equal((await preview('Implement dashboard validation.')).reason,'APPLICATION_CODE_REVIEW_REQUIRED');
 assert.equal((await preview('Update docs/PUBLISHER_RUNBOOK.md and docs/OTHER_GUIDE.md.')).reason,'SINGLE_FILE_REQUIRED');
});
