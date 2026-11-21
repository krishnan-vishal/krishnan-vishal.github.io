import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
import {requestWithIndependentFallback} from './independent-provider-router.mjs';
import {rankUsageAwareRoutes,recordQuotaOutcome} from './usage-aware-router.mjs';
const job={instruction:'Replace fixture',scope:'fixture',capability:'code',remaining_budget:0};
const args={job,path:'scripts/sep01/acceptance-fixture.txt',content:'before'};
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
test('real HTTP 429 classification routes from Gemini to independent OpenRouter exactly once',async()=>{
 let geminiCalls=0,openrouterCalls=0;
 const gemini=createGeminiCodeEditor({apiKey:'fixture-key',model:'gemini-2.5-flash',fetchImpl:async()=>{geminiCalls++;return response(429,{})}});
 const openrouter=createOpenRouterCodeEditor({apiKey:'fixture-key',model:'approved/test',fetchImpl:async()=>{openrouterCalls++;return response(200,{choices:[{message:{content:JSON.stringify({content:'after'})}}]})}});
 const routes=rankUsageAwareRoutes(job,[
  {id:'gemini',agent_id:'gemini',approved:true,healthy:true,capabilities:['code'],tier:'PUBLIC',estimated_cost:0,remaining_quota:null,quota_failure_detection_verified:true},
  {id:'openrouter',agent_id:'openrouter',approved:true,healthy:true,capabilities:['code'],tier:'PUBLIC',estimated_cost:0,remaining_quota:null,quota_failure_detection_verified:true}
 ],{gemini:{ready:true},openrouter:{ready:true}});
 assert.equal(routes.length,2);
 const out=await requestWithIndependentFallback({geminiModels:['gemini-2.5-flash'],geminiEdit:()=>gemini(args),allowOpenRouter:true,openrouterEdit:()=>openrouter(args)});
 assert.equal(out.result.status,'EDIT');assert.equal(out.result.content,'after');
 assert.equal(geminiCalls,1);assert.equal(openrouterCalls,1);
 assert.deepEqual(out.attempts.map(x=>x.status),['QUOTA_EXHAUSTED','EDIT']);
 const exhausted=recordQuotaOutcome(routes.find(x=>x.id==='gemini'),'QUOTA_EXHAUSTED');
 assert.equal(exhausted.remaining_quota,0);
 assert.equal(rankUsageAwareRoutes(job,[exhausted,routes.find(x=>x.id==='openrouter')],{gemini:{ready:true},openrouter:{ready:true}})[0].id,'openrouter');
});
test('Gemini 403 permission failure does not silently become an unauthorized edit',async()=>{
 const gemini=createGeminiCodeEditor({apiKey:'fixture-key',model:'gemini-2.5-flash',fetchImpl:async()=>response(403,{})});
 const out=await requestWithIndependentFallback({geminiModels:['gemini-2.5-flash'],geminiEdit:()=>gemini(args),allowOpenRouter:false});
 assert.equal(out.result.status,'MODEL_UNAVAILABLE');
 assert.equal(out.attempts[0].status,'PROVIDER_UNAVAILABLE');
});
