import test from 'node:test';
import assert from 'node:assert/strict';
import {selectApiCodingProvider,classifyApiCodingOutcome} from './two-provider-selection.mjs';
const job={job_id:'j1',idempotency_key:'i1',branch:'fixture',locked_paths:['scripts/sep01/fixture.js'],scope:'public',capability:'bounded-text-edit',remaining_budget:10};
const provider=(id,cost=1)=>({id,approved:true,healthy:true,remaining_quota:1,capabilities:['bounded-text-edit'],tier:'PUBLIC',estimated_cost:cost});
test('chooses only approved healthy quota-positive API routes by cost',()=>{
 const result=selectApiCodingProvider({job,providers:[provider('cline',0),provider('aider',0),provider('openrouter',2),provider('gemini',1)]});
 assert.equal(result.provider,'gemini');
 assert.deepEqual(result.candidates,['gemini','openrouter']);
});
test('selects remaining eligible provider when first is unavailable',()=>{
 assert.equal(selectApiCodingProvider({job,providers:[{...provider('gemini'),healthy:false},provider('openrouter')]}).provider,'openrouter');
 assert.equal(selectApiCodingProvider({job,providers:[provider('gemini'),provider('openrouter')],excluded:['gemini']}).provider,'openrouter');
});
test('fails closed on missing quota or approvals',()=>{
 const result=selectApiCodingProvider({job,providers:[{...provider('gemini'),remaining_quota:0},{...provider('openrouter'),approved:false}]});
 assert.equal(result.status,'QUOTA_PAUSED');
});
test('no checkpoint means no automatic continuation after quota failure',()=>{
 assert.deepEqual(classifyApiCodingOutcome({status:'QUOTA_EXHAUSTED'}),{status:'PAUSED_NEEDS_CHECKPOINT',reason:'QUOTA_EXHAUSTED'});
 assert.equal(classifyApiCodingOutcome({status:'EDIT',content:'x'}).status,'BLOCKED');
});
test('accepts only durable checkpoint evidence',()=>{
 assert.equal(classifyApiCodingOutcome({status:'SUCCESS',commit:'a'.repeat(40),step:'tests passed'}).status,'CHECKPOINT_READY');
 assert.equal(classifyApiCodingOutcome({status:'SUCCESS',commit:'invalid',step:'tests passed'}).status,'BLOCKED');
});
