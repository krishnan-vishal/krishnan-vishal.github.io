import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../../admin/central-command/index.html',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../../supabase/functions/gpir-sep01-owner-command/index.ts',import.meta.url),'utf8');
test('Central Command submits through authenticated gateway, never directly to privileged store',()=>{
 assert.match(page,/Central Command/);
 assert.match(page,/api\.github\.com\/repos\/krishnan-vishal/);
 assert.match(page,/async function ownerSession\(/);
 assert.match(page,/scope:'development',path,instruction/);
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
 assert.match(page,/cross-CLI acceptance pending/);
 assert.match(page,/not a live heartbeat/);
});

test('Original job receipt is owner-authenticated and read-only',()=>{
 assert.match(page,/id="load-original-receipt"/);
 assert.match(page,/commandRequest\(\{action:'status',job_id:originalJobId\}\)/);
 assert.match(page,/originalJobId='sep01-owner-8c8dcf0c-16aa-4c02'/);
 assert.match(page,/id="receipt-checkpoint"/);
 assert.match(page,/details.hidden=true/);
 assert.doesNotMatch(page,/fetch\([^\n]*rest\/v1\/gpir_sep01_jobs/);
});
