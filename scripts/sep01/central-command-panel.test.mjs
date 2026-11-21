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
