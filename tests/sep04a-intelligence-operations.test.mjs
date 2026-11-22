import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gateway = readFileSync('supabase/functions/gpir-sep01-owner-command/index.ts','utf8');
const ui = readFileSync('admin/central-command/index.html','utf8');
const workflow = readFileSync('.github/workflows/gpir-governed-intelligence-operations.yml','utf8');

test('operational dispatch requires authenticated owner and explicit one-job approval',()=>{
 assert.ok(gateway.indexOf("user.id!==owner")<gateway.indexOf("body.action==='intelligence_submit'"));
 assert.match(gateway,/AUTHORIZE_ONE_INTELLIGENCE_OPERATION/);
 assert.match(gateway,/OPERATION_APPROVAL_REQUIRED_OR_STALE/);
 assert.match(gateway,/OPERATION_ALREADY_DISPATCHED/);
});
test('bounded operations cannot expand to arbitrary source or month',()=>{
 assert.match(gateway,/FINTECHNEWS-SG-008/);
 assert.match(gateway,/ATLAS-APAC-009/);
 assert.match(gateway,/SOURCE_NOT_APPROVED/);
 assert.match(gateway,/MONTH_NOT_APPROVED/);
 assert.match(workflow,/SOURCE_NOT_APPROVED/);
 assert.match(workflow,/MONTH_NOT_APPROVED/);
 assert.match(workflow,/cancel-in-progress: false/);
});
test('workflow reuses existing governed backfill and does not write in plan mode',()=>{
 assert.match(workflow,/scripts\/intelligence\/run-research-source-backfill\.mjs/);
 assert.match(workflow,/if \[ "\$MODE" = "apply" \]/);
 assert.match(workflow,/--apply/);
 assert.match(workflow,/contents: read/);
});
test('owner interface exposes separate production confirmation and real run status',()=>{
 assert.match(ui,/id="intelligence-plan"/);
 assert.match(ui,/id="intelligence-submit" disabled/);
 assert.match(ui,/AUTHORIZE PRODUCTION WRITES/);
 assert.match(ui,/action:'intelligence_status'/);
});

test('natural-language operational commands route to a governed plan without implied production writes',()=>{
 assert.match(gateway,/action==='intelligence_classify'/);
 assert.match(gateway,/OPERATION_SCOPE_REQUIRES_REVIEW/);
 assert.match(gateway,/mode='plan'/);
 assert.match(gateway,/production_mutation:false/);
 assert.match(ui,/action:'intelligence_classify'/);
 assert.match(ui,/approvedDiscovery\?\.operational/);
 assert.match(ui,/PLAN-ONLY intelligence operation/);
});
