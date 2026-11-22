import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gateway=readFileSync('supabase/functions/gpir-sep01-owner-command/index.ts','utf8');
const ui=readFileSync('admin/central-command/index.html','utf8');
const workflow=readFileSync('.github/workflows/sep01-cloud-powershell.yml','utf8');
const script=readFileSync('scripts/sep01/cloud-workspace-proof.ps1','utf8');
for(const action of ['cloud_powershell_plan','cloud_powershell_dispatch','cloud_powershell_status'])
 assert.ok(gateway.includes("body.action==='"+action+"'"),action+' must be owner-gated');
assert.ok(gateway.indexOf("if(user.id!==owner")<gateway.indexOf("body.action==='cloud_powershell_plan'"),'owner authorization before dispatch');
assert.ok(gateway.includes("body.confirmation!=='AUTHORIZE_CLOUD_POWERSHELL_PROOF'"));
assert.ok(gateway.includes("ref:'main',inputs:{operation:'workspace-proof',request_id:requestId}"));
assert.ok(!gateway.includes('body.command')&&!gateway.includes('body.script'),'No arbitrary shell command transport');
assert.ok(workflow.includes('shell: pwsh')&&workflow.includes('contents: read'));
assert.ok(workflow.includes('run-name: Cloud PowerShell'));
assert.ok(script.includes('GPIR_PWSH_REQUEST_ID'));
for(const id of ['cloud-pwsh-plan','cloud-pwsh-dispatch','cloud-pwsh-status'])
 assert.ok(ui.includes('id="'+id+'"'));
console.log('Cloud PowerShell Central Command contract: PASS');
