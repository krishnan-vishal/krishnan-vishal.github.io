import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderInvoker} from './authenticated-adapters.mjs';
const provider={id:'codex',approved:true};
const job={job_id:'test',idempotency_key:'key-1',branch:'safe',locked_paths:['a.js'],capability:'code',checkpoint_commit:'a'.repeat(40),last_safe_step:'done'};
test('authenticated adapter passes idempotency and checkpoint, never credential in payload',async()=>{
 let request;
 const invoke=createProviderInvoker({adapters:[{id:'codex',endpoint:'https://adapter.example/execute',token:'fixture-value',approved:true}],
  fetchImpl:async(_url,options)=>{request=options;return {ok:true,status:200,json:async()=>({status:'SUCCESS',commit:'b'.repeat(40),step:'finished'})};}});
 assert.equal((await invoke(provider,job)).status,'SUCCESS');
 assert.equal(request.headers.Authorization,'Bearer fixture-value');
 assert.equal(request.headers['Idempotency-Key'],'key-1');
 assert.equal(JSON.parse(request.body).checkpoint_commit,'a'.repeat(40));
 assert.ok(!request.body.includes('fixture-value'));
});
test('HTTP 429 maps to quota signal; unauthorized endpoints fail closed',async()=>{
 assert.throws(()=>createProviderInvoker({adapters:[{id:'codex',endpoint:'http://insecure',token:'x',approved:true}]}),/UNAPPROVED_OR_INSECURE_ADAPTER/);
 const invoke=createProviderInvoker({adapters:[{id:'codex',endpoint:'https://adapter.example/execute',token:'fixture-value',approved:true}],fetchImpl:async()=>({ok:false,status:429})});
 assert.equal((await invoke(provider,job)).status,'QUOTA_EXHAUSTED');
 await assert.rejects(invoke({id:'unknown',approved:true},job),/PROVIDER_NOT_AUTHORIZED/);
});
