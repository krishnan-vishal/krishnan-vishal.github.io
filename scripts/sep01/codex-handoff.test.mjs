import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWithIndependentFallback} from './independent-provider-router.mjs';
test('Gemini quota can hand off to verified Codex without calling OpenRouter',async()=>{
 let calls=0;
 const out=await requestWithIndependentFallback({geminiModels:['gemini-test'],geminiEdit:async()=>({status:'QUOTA_EXHAUSTED'}),allowCodex:true,codexEdit:async()=>{calls++;return {status:'EDIT',content:'ok'}},allowOpenRouter:true,openrouterEdit:async()=>{throw Error('unwanted route')}});
 assert.equal(out.result.status,'EDIT');assert.equal(calls,1);
 assert.deepEqual(out.attempts.map(x=>x.provider),['gemini','codex']);
});
test('Codex quota safely falls through to separately authorized OpenRouter',async()=>{
 const out=await requestWithIndependentFallback({geminiModels:[],geminiEdit:async()=>{throw Error('no gemini')},allowCodex:true,codexEdit:async()=>({status:'QUOTA_EXHAUSTED'}),allowOpenRouter:true,openrouterEdit:async()=>({status:'EDIT',content:'ok'})});
 assert.equal(out.result.status,'EDIT');assert.deepEqual(out.attempts.map(x=>x.provider),['codex','openrouter']);
});
test('Codex invalid output blocks provider switching',async()=>{
 const out=await requestWithIndependentFallback({geminiModels:[],geminiEdit:async()=>{throw Error('no gemini')},allowCodex:true,codexEdit:async()=>({status:'INVALID_EDIT'}),allowOpenRouter:true,openrouterEdit:async()=>{throw Error('must not switch')}});
 assert.equal(out.result.status,'INVALID_EDIT');
});
