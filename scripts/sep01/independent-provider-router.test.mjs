import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWithIndependentFallback} from './independent-provider-router.mjs';
test('quota exhaustion fails over to independent provider once',async()=>{
 let count=0;
 const out=await requestWithIndependentFallback({geminiModels:['gemini-a','gemini-b'],geminiEdit:async()=>({status:'QUOTA_EXHAUSTED'}),allowOpenRouter:true,openrouterEdit:async()=>{count++;return {status:'EDIT',content:'ok'};}});
 assert.equal(out.result.status,'EDIT');assert.equal(count,1);assert.deepEqual(out.attempts.map(x=>x.provider),['gemini','gemini','openrouter']);
});
test('valid Gemini edit does not call fallback',async()=>{
 const out=await requestWithIndependentFallback({geminiModels:['gemini-a'],geminiEdit:async()=>({status:'EDIT',content:'ok'}),allowOpenRouter:true,openrouterEdit:async()=>{throw Error('unexpected fallback')}});
 assert.equal(out.attempts.length,1);
});
test('invalid edit never switches provider',async()=>{
 const out=await requestWithIndependentFallback({geminiModels:['gemini-a'],geminiEdit:async()=>({status:'INVALID_EDIT'}),allowOpenRouter:true,openrouterEdit:async()=>{throw Error('unexpected fallback')}});
 assert.equal(out.result.status,'INVALID_EDIT');
});
test('disabled independent provider pauses after bounded attempts',async()=>{
 const out=await requestWithIndependentFallback({geminiModels:['gemini-a'],geminiEdit:async()=>({status:'QUOTA_EXHAUSTED'}),allowOpenRouter:false});
 assert.equal(out.result.status,'QUOTA_EXHAUSTED');assert.equal(out.attempts.length,1);
});
test('no Gemini models can use separately authorized OpenRouter route',async()=>{
 const out=await requestWithIndependentFallback({geminiModels:[],geminiEdit:async()=>{throw Error('no Gemini')},allowOpenRouter:true,openrouterEdit:async()=>({status:'EDIT',content:'ok'})});
 assert.equal(out.result.status,'EDIT');
});

test('live failure class invalid Gemini JSON switches to independent route once, not four Gemini retries',async()=>{
 let geminiCalls=0,openrouterCalls=0;
 const out=await requestWithIndependentFallback({
  geminiModels:['gemini-first','gemini-second'],
  geminiEdit:async()=>{geminiCalls++;return {status:'PROVIDER_RESPONSE_INVALID',reason:'NON_JSON_OUTPUT'};},
  allowOpenRouter:true,
  openrouterEdit:async()=>{openrouterCalls++;return {status:'EDIT',content:'fixed'};}
 });
 assert.equal(out.result.status,'EDIT');
 assert.equal(geminiCalls,1);assert.equal(openrouterCalls,1);
 assert.deepEqual(out.attempts.map(x=>x.provider),['gemini','openrouter']);
});

test('Codex runs last and only after safe failures from approved routes',async()=>{
 const out=await requestWithIndependentFallback({
  geminiModels:['gemini-a'],geminiEdit:async()=>({status:'MODEL_UNAVAILABLE'}),
  allowOpenRouter:true,openrouterEdit:async()=>({status:'PROVIDER_BUSY'}),
  allowCodex:true,codexEdit:async()=>({status:'EDIT',content:'ok'})
 });
 assert.equal(out.result.status,'EDIT');
 assert.deepEqual(out.attempts.map(x=>x.provider),['gemini','openrouter','codex']);
});
test('OpenRouter edit or unsafe outcome does not call Codex',async()=>{
 for(const status of ['EDIT','INVALID_EDIT']){
  const out=await requestWithIndependentFallback({
   geminiModels:[],geminiEdit:async()=>{throw Error('unexpected Gemini')},
   allowOpenRouter:true,openrouterEdit:async()=>({status}),
   allowCodex:true,codexEdit:async()=>{throw Error('unexpected Codex')}
  });
  assert.equal(out.result.status,status);
 }
});
