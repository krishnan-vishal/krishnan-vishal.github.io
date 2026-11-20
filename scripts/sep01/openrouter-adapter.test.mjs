import test from 'node:test';
import assert from 'node:assert/strict';
import {openRouterAdapter} from './openrouter-adapter.mjs';
const job={job_id:'sep01',idempotency_key:'once',branch:'isolated',locked_paths:['a.js'],capability:'code'};
test('real HTTPS adapter uses authenticated API contract and never claims a git commit',async()=>{
 let captured;
 const invoke=openRouterAdapter({apiKey:'fixture-token',model:'owner-approved-model',fetchImpl:async(url,opts)=>{
  captured={url,opts};return {ok:true,status:200,json:async()=>({choices:[{message:{content:'Review code safely'}}]})};
 }});
 const result=await invoke(job);
 assert.equal(result.status,'ADVISORY_ONLY');assert.equal(result.commit,undefined);
 assert.equal(captured.url,'https://openrouter.ai/api/v1/chat/completions');
 assert.equal(captured.opts.headers.Authorization,'Bearer fixture-token');
 assert.ok(!captured.opts.body.includes('fixture-token'));
});
test('quota error is propagated without false checkpoint',async()=>{
 const invoke=openRouterAdapter({apiKey:'fixture-token',model:'owner-approved-model',fetchImpl:async()=>({ok:false,status:429})});
 assert.deepEqual(await invoke(job),{status:'QUOTA_EXHAUSTED'});
});
