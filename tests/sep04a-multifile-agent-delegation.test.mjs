import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gateway=readFileSync('supabase/functions/gpir-sep01-owner-command/index.ts','utf8');
const ui=readFileSync('admin/central-command/index.html','utf8');
test('multi-file delegation uses existing owner-verified gateway',()=>{
 const owner=gateway.indexOf("if(user.id!==owner||user.is_anonymous===true)");
 const plan=gateway.indexOf("if(body.action==='agent_multifile_plan'");
 assert.ok(owner>=0&&plan>owner);
 assert.match(gateway,/AUTHORIZE_ONE_GITHUB_MULTIFILE_TASK/);
 assert.match(gateway,/MULTIFILE_APPROVAL_REQUIRED_OR_STALE/);
 assert.match(gateway,/github\('git\/ref\/heads\/main'\)/);
});
test('multi-file agent fails closed on missing entitlement and cost approval',()=>{
 assert.match(gateway,/SEP03_AGENT_TASK_SUBMISSION_ENABLED/);
 assert.match(gateway,/SEP03_AGENT_PLAN_ELIGIBLE/);
 assert.match(gateway,/SEP03_AGENT_COST_APPROVED/);
 assert.match(gateway,/SEP03_GITHUB_AGENT_WRITE_TOKEN/);
 assert.match(gateway,/if\(!available\)return json/);
});
test('agent receives PR-only task and no production deployment authority',()=>{
 assert.match(gateway,/create_pull_request:true/);
 assert.match(gateway,/Do not access or print secrets/);
 assert.match(gateway,/production_deployment:false/);
 assert.match(gateway,/AGENT_ACCEPTED_NOT_COMPLETED/);
});
test('one command box routes unsupported broad and multi-file work to governed agent plan',()=>{
 assert.match(ui,/showRepositoryWidePlan\(instruction,state\)/);
 assert.match(ui,/action:'agent_multifile_plan'/);
 assert.match(ui,/action:'agent_multifile_submit'/);
 assert.match(ui,/id="directive-text"/);
 assert.match(ui,/Refresh agent tasks/);
});
