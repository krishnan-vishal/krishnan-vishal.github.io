import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

// Stage 3 UI integration is strictly preview-only. Live execution is separately gated.
const html=readFileSync(new URL('../../admin/central-command/index.html',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../../supabase/functions/gpir-sep01-owner-command/index.ts',import.meta.url),'utf8');
const moduleScript=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

test('Central Command module remains syntactically valid',()=>{
 assert.ok(moduleScript,'Central Command inline module is present');
 assert.doesNotThrow(()=>new Script(moduleScript));
});
test('separate Stage 3 route displays the two approved documentation candidates',()=>{
 assert.match(html,/<option value="bounded_multifile_v1">Gemini \/ OpenRouter — governed 2–3-file plan/);
 assert.match(html,/id="multifile-paths"[\s\S]*?docs\/SEP01-COPILOT-CLINE-EXECUTION-GATE\.md\s+docs\/ARCHITECTURE\.md/);
 assert.match(html,/document\.querySelector\('#directive-route'\)\.addEventListener\('change',refreshDirectiveMode\)/);
 assert.match(html,/document\.querySelector\('#multifile-paths'\)\.addEventListener\('input',refreshDirectiveMode\)/);
});
test('Stage 3 plan uses owner-authenticated read-only gateway and never enables submit',()=>{
 assert.match(html,/const plan=await commandRequest\(\{action:'multifile_plan',paths,instruction\}\)/);
 assert.match(html,/plan\.enabled!==false\|\|plan\.read_only!==true/);
 assert.match(html,/if\(executionRoute==='bounded_multifile_v1'\)throw Error\('Stage 3 is read-only; no owner dispatch is enabled\.'\)/);
 assert.match(html,/document\.querySelector\('#submit-directive'\)\.disabled=true;/);
 assert.doesNotMatch(html,/commandRequest\(\{action:'multifile_submit'/);
});
test('server keeps multi-file dispatch blocked independently of the client',()=>{
 assert.match(gateway,/if\(body\.action==='multifile_submit'\)return json\(\{error:'MULTIFILE_EXECUTION_NOT_ENABLED',read_only:true\},403\)/);
 assert.match(gateway,/read_only:true,[\s\S]*?provider_api_spend:false/);
});

test('owner staging rechecks canonical plan and persists PLANNED without queueing',()=>{
 assert.match(gateway,/body\.action==='multifile_stage'/);
 assert.match(gateway,/if\(body\.plan_id!==planId\)return json\(\{error:'MULTIFILE_STALE_PLAN'\},409\)/);
 assert.match(gateway,/status:'PLANNED'/);
 assert.match(gateway,/cost_approved:false,remaining_budget:0,provider_attempt_reserved:false/);
 assert.match(html,/commandRequest\(\{action:'multifile_stage',job_id:jobId,plan_id:plan\.plan_id,paths,instruction\}\)/);
 assert.match(html,/Record this read-only plan \(no execution\)/);
});
test('owner approval and dispatch are separately confirmed and server gated',()=>{
 assert.match(gateway,/body\.action==='multifile_approve'\|\|body\.action==='multifile_dispatch'/);
 assert.match(gateway,/body\.confirmation!=='AUTHORIZE_ONE_MULTIFILE_JOB'/);
 assert.match(gateway,/body\.confirmation!=='AUTHORIZE_ONE_MULTIFILE_DISPATCH'/);
 assert.match(gateway,/env\('SEP01_MULTIFILE_SPEND_CAP_VERIFIED'\)!=='true'/);
 assert.match(gateway,/env\('SEP01_MULTIFILE_EXECUTION_ENABLED'\)!=='true'/);
 assert.match(gateway,/p_expected_revision:row\.revision/);
 assert.match(html,/commandRequest\(\{action:'multifile_approve'/);
 assert.match(html,/commandRequest\(\{action:'multifile_dispatch'/);
 assert.match(html,/approvalInput.value!=='AUTHORIZE_ONE_MULTIFILE_JOB'/);
 assert.match(html,/dispatchInput.value!=='AUTHORIZE_ONE_MULTIFILE_DISPATCH'/);
});
