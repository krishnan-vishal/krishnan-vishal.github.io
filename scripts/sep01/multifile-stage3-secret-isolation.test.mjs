// Offline contract tests: never read, log or invoke any provider credential.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/sep01-durable-dispatch.yml',import.meta.url),'utf8');
const worker=readFileSync(new URL('./durable-actions-worker.mjs',import.meta.url),'utf8');
const stage3Start=worker.indexOf("if(job.execution_route==='bounded_multifile_v1')");
const stage3End=worker.indexOf('const result=await bridge(job.job_id)',stage3Start);
const stage3=worker.slice(stage3Start,stage3End);

test('durable worker exposes separate Stage 3 secret without modifying legacy keys',()=>{
 assert.ok(workflow.includes('OPENROUTER_STAGE3_API_KEY: ${{ secrets.OPENROUTER_STAGE3_API_KEY }}'));
 assert.ok(workflow.includes('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}'));
 assert.ok(workflow.includes('GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}'));
 assert.ok(workflow.includes('run: node scripts/sep01/durable-actions-worker.mjs'));
});
test('Stage 3 remains explicitly disabled in GitHub workflow',()=>{
 for(const setting of ["SEP01_MULTIFILE_EXECUTION_ENABLED: 'false'","SEP01_MULTIFILE_SPEND_CAP_VERIFIED: 'false'","SEP01_MULTIFILE_MAX_SPEND_USD: '0'"])
  assert.ok(workflow.includes(setting),setting);
});
test('Stage 3 retains Gemini primary and isolated OpenRouter fallback while dispatch is disabled',()=>{
 assert.ok(stage3Start>=0&&stage3End>stage3Start,'multi-file dispatch branch present');
 assert.ok(stage3.includes('apiKey:process.env.GEMINI_API_KEY'));
 assert.ok(workflow.includes("SEP01_MULTIFILE_EXECUTION_ENABLED: 'false'"));
 assert.ok(stage3.includes('apiKey:process.env.OPENROUTER_STAGE3_API_KEY'));
 assert.ok(!stage3.includes('apiKey:process.env.OPENROUTER_API_KEY'));
 assert.ok(stage3.includes("executionEnabled:process.env.SEP01_MULTIFILE_EXECUTION_ENABLED==='true'"));
 assert.ok(stage3.includes("providerSpendCapVerified:process.env.SEP01_MULTIFILE_SPEND_CAP_VERIFIED==='true'"));
});
test('legacy single-file route is not rewired to Stage 3 key',()=>{
 const legacy=worker.slice(stage3End);
 assert.ok(legacy.includes('process.env.OPENROUTER_API_KEY'));
 assert.ok(legacy.includes('process.env.GEMINI_API_KEY'));
 assert.ok(!legacy.includes('process.env.OPENROUTER_STAGE3_API_KEY'));
});
