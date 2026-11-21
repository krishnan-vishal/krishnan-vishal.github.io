import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiCodeEditor,discoverGeminiTextModels,normalizeGeminiModel} from './gemini-code-editor.mjs';

const job={scope:'fixture',instruction:'Replace the file exactly.'};
const input={job,path:'fixture.txt',content:'STATE: PENDING\n'};
const jsonResponse=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('model discovery ignores placeholder configuration and bounds text-only fallback',async()=>{
 const models=[
  {name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},
  {name:'models/gemini-2.5-flash-lite',supportedGenerationMethods:['generateContent']},
  {name:'models/gemini-flash-latest',supportedGenerationMethods:['generateContent']},
  {name:'models/gemini-tts-latest',supportedGenerationMethods:['generateContent']},
  {name:'models/text-embedding-004',supportedGenerationMethods:['embedContent']}
 ];
 const result=await discoverGeminiTextModels({apiKey:'fixture',preferred:'The exact Gemini text-model ID',maxCandidates:2,fetchImpl:async()=>jsonResponse(200,{models})});
 assert.deepEqual(result.models,['gemini-2.5-flash-lite','gemini-2.5-flash']);
 assert.equal(result.preferred,null);assert.equal(result.preferredMatched,false);
});

test('model discovery honors an available authorized preference once',async()=>{
 const models=['gemini-2.5-flash','gemini-2.5-flash-lite'].map(name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']}));
 const result=await discoverGeminiTextModels({apiKey:'fixture',preferred:'models/gemini-2.5-flash',fetchImpl:async()=>jsonResponse(200,{models})});
 assert.equal(result.models[0],'gemini-2.5-flash');assert.equal(result.preferredMatched,true);
 assert.equal(new Set(result.models).size,result.models.length);
});

test('editor accepts the structured complete replacement and records the model',async()=>{
 const editor=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async(_url,options)=>{
  const request=JSON.parse(options.body);
  assert.equal(request.generationConfig.responseMimeType,'application/json');
  assert.deepEqual(request.generationConfig.responseSchema.required,['content']);
  return jsonResponse(200,{candidates:[{finishReason:'STOP',content:{parts:[{text:'  {"content":"STATE: CHECKPOINT_VERIFIED\\n"}  '}]}}]});
 }});
 assert.deepEqual(await editor(input),{status:'EDIT',content:'STATE: CHECKPOINT_VERIFIED\n'});
});

test('editor maps bounded fallback signals without retrying internally',async()=>{
 let calls=0;
 const unavailable=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash',fetchImpl:async()=>{calls++;return jsonResponse(404,{error:{message:'not found'}});}});
 assert.equal((await unavailable(input)).status,'MODEL_UNAVAILABLE');assert.equal(calls,1);
 const busy=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async()=>jsonResponse(503,{})});
 assert.equal((await busy(input)).status,'PROVIDER_BUSY');
 const quota=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async()=>jsonResponse(429,{})});
 assert.equal((await quota(input)).status,'QUOTA_EXHAUSTED');
});

test('blocked or truncated responses never become edits',async()=>{
 const blocked=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async()=>jsonResponse(200,{candidates:[{finishReason:'SAFETY'}]})});
 assert.equal((await blocked(input)).status,'PROVIDER_UNAVAILABLE');
 const truncated=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async()=>jsonResponse(200,{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[]}}]})});
 assert.equal((await truncated(input)).status,'PROVIDER_BUSY');
 assert.equal(normalizeGeminiModel('not a model'),null);
});

test('malformed or truncated Gemini JSON is a bounded provider failure, never an edit',async()=>{
 const invalid=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async()=>jsonResponse(200,{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"content":'}]}}]})});
 assert.equal((await invalid(input)).status,'PROVIDER_RESPONSE_INVALID');
 const truncated=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async()=>jsonResponse(200,{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"content":"cut off"}'}]}}]})});
 assert.equal((await truncated(input)).reason,'TRUNCATED_OUTPUT');
});
test('Gemini appends compact Markdown instead of requesting a 40KB file regeneration',async()=>{
 let payload;
 const original='# Existing report\n'+'Confirmed baseline. '.repeat(2100);
 const job={scope:'development',instruction:'Append a clearly labelled section titled "SEP-01 Owner Command Acceptance Test" and preserve existing conclusions.'};
 const edit=createGeminiCodeEditor({apiKey:'fixture',model:'gemini-2.5-flash-lite',fetchImpl:async(_url,opts)=>{
  payload=JSON.parse(opts.body);
  return jsonResponse(200,{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({content:'## SEP-01 Owner Command Acceptance Test\n\nNon-production acceptance test.'})}]}}]});
 }});
 const result=await edit({job,path:'docs/M41-FULL-CUTOVER-REPORT.md',content:original});
 assert.equal(result.status,'EDIT');assert.ok(result.content.startsWith(original));
 const supplied=JSON.parse(payload.contents[0].parts[0].text);
 assert.ok(supplied.content.length<=4000);
});
