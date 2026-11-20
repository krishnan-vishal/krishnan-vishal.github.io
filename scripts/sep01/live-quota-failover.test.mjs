import test from 'node:test';import assert from 'node:assert/strict';
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
import {dispatchWithQuotaFailover} from './live-quota-failover.mjs';
const sha='a'.repeat(40),job={job_id:'test',idempotency_key:'key',branch:'fix/test',locked_paths:['src/a.js'],scope:'dashboard',capability:'code',remaining_budget:0,status:'QUEUED',checkpoint_commit:sha};
const providers=[
 {id:'openrouter/model',agent_id:'openrouter',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC'},
 {id:'gemini/model',agent_id:'gemini',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC'}
];
const config=Object.fromEntries(['openrouter','gemini'].map(id=>[id,{approved:true,adapter_verified:true,credential_verified:true,execute:async()=>{}}]));
test('observed HTTP 429 switches to independent Gemini only after verified checkpoint',async()=>{
 const calls=[];
 const result=await dispatchWithQuotaFailover({job,providers,config,verifyCheckpoint:async s=>s===sha,execute:async ({provider})=>{calls.push(provider.agent_id);return provider.agent_id==='openrouter'?{status:'QUOTA_EXHAUSTED'}:{status:'EDIT',content:'ok'};}});
 assert.deepEqual(calls,['openrouter','gemini']);assert.equal(result.quota_event,'OBSERVED_429');assert.equal(result.job.checkpoint_commit,sha);
});
test('missing checkpoint never invokes fallback',async()=>{
 const calls=[];
 const result=await dispatchWithQuotaFailover({job:{...job,checkpoint_commit:null},providers,config,verifyCheckpoint:async()=>true,execute:async ({provider})=>{calls.push(provider.id);return {status:'QUOTA_EXHAUSTED'};}});
 assert.equal(result.job.status,'QUOTA_PAUSED');assert.equal(calls.length,1);
});
test('unverified independent credential never invokes fallback',async()=>{
 const calls=[];
 const result=await dispatchWithQuotaFailover({job,providers,config:{...config,gemini:{...config.gemini,credential_verified:false}},verifyCheckpoint:async()=>true,execute:async ({provider})=>{calls.push(provider.id);return {status:'QUOTA_EXHAUSTED'};}});
 assert.equal(result.job.status,'QUOTA_PAUSED');assert.equal(calls.length,1);
});
test('Gemini HTTP 429 returns explicit quota signal',async()=>{
 const edit=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash',fetchImpl:async()=>({status:429})});
 assert.deepEqual(await edit({job:{scope:'dashboard',instruction:'edit'},path:'src/a.js',content:'x'}),{status:'QUOTA_EXHAUSTED',provider:'gemini'});
});
test('Gemini API edit accepts only JSON bounded replacement',async()=>{
 const edit=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash',fetchImpl:async(url,opts)=>{assert.match(url,/generativelanguage.googleapis.com/);assert.equal(opts.headers['x-goog-api-key'],'fixture');return {status:200,ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({content:'export const x=2;\n'})}]}}]})};}});
 assert.deepEqual(await edit({job:{scope:'dashboard',instruction:'edit'},path:'src/a.js',content:'x'}),{status:'EDIT',content:'export const x=2;\n'});
});

test('real provider 503 capacity signal switches only with verified checkpoint',async()=>{
 const calls=[];
 const result=await dispatchWithQuotaFailover({job,providers,config,verifyCheckpoint:async s=>s===sha,execute:async ({provider})=>{calls.push(provider.agent_id);return provider.agent_id==='openrouter'?{status:'PROVIDER_BUSY',http_status:503}:{status:'EDIT',content:'ok'};}});
 assert.deepEqual(calls,['openrouter','gemini']);assert.equal(result.quota_event,'OBSERVED_PROVIDER_BUSY');
});
test('Gemini HTTP 503 is a capacity signal, not an exception or retry',async()=>{
 let calls=0;
 const edit=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash',fetchImpl:async()=>{calls++;return {status:503,ok:false};}});
 assert.deepEqual(await edit({job:{scope:'dashboard',instruction:'edit'},path:'src/a.js',content:'x'}),{status:'PROVIDER_BUSY',provider:'gemini',http_status:503});
 assert.equal(calls,1);
});
