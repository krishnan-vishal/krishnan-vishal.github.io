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
